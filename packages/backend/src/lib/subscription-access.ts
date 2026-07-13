import { prisma } from './prisma'
import { CLINIC_PRO_SUBSCRIPTION } from './billing-config'
import { logAudit } from './secretaryAccess'
import type { DoctorSubscription } from '@prisma/client'

export type SubscriptionStatusValue = 'TRIAL' | 'ACTIVE' | 'PENDING_PAYMENT' | 'PAST_DUE' | 'CANCELED' | 'BLOCKED'
export type SubscriptionPaymentStatusValue = 'PENDING' | 'APPROVED' | 'REFUSED' | 'REFUNDED' | 'CHARGEBACK'

export type ClinicAccessReason =
  | 'TRIAL_ACTIVE'
  | 'SUBSCRIPTION_ACTIVE'
  | 'TRIAL_EXPIRED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_LATE'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_BLOCKED'

export interface ClinicAccessResult {
  allowed: boolean
  reason: ClinicAccessReason
  trialDaysRemaining?: number
  currentPeriodEndsAt?: Date | null
  redirectTo?: string
}

// Transições de status válidas — usado pelo webhook para ignorar eventos que
// tentariam regredir uma assinatura de forma inconsistente.
export const VALID_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatusValue, SubscriptionStatusValue[]> = {
  TRIAL: ['ACTIVE', 'PENDING_PAYMENT', 'BLOCKED'],
  ACTIVE: ['ACTIVE', 'PENDING_PAYMENT', 'PAST_DUE', 'CANCELED', 'BLOCKED'],
  PENDING_PAYMENT: ['ACTIVE', 'PENDING_PAYMENT', 'PAST_DUE', 'BLOCKED'],
  PAST_DUE: ['ACTIVE', 'PENDING_PAYMENT', 'CANCELED', 'BLOCKED'],
  CANCELED: ['ACTIVE', 'PENDING_PAYMENT', 'BLOCKED'],
  BLOCKED: ['ACTIVE', 'PENDING_PAYMENT'],
}

export function isValidTransition(from: SubscriptionStatusValue, to: SubscriptionStatusValue): boolean {
  return VALID_SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false
}

export function calculateClinicAccess(
  subscription: Pick<DoctorSubscription, 'status' | 'trialEndsAt' | 'currentPeriodEndsAt'> | null,
  now: Date = new Date()
): ClinicAccessResult {
  if (!subscription) {
    return { allowed: false, reason: 'TRIAL_EXPIRED', redirectTo: '/configuracoes/assinatura' }
  }

  const status = subscription.status as SubscriptionStatusValue

  if (status === 'TRIAL' && subscription.trialEndsAt > now) {
    const msRemaining = subscription.trialEndsAt.getTime() - now.getTime()
    return {
      allowed: true,
      reason: 'TRIAL_ACTIVE',
      trialDaysRemaining: Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000))),
    }
  }

  if (status === 'ACTIVE' && subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > now) {
    return { allowed: true, reason: 'SUBSCRIPTION_ACTIVE', currentPeriodEndsAt: subscription.currentPeriodEndsAt }
  }

  // Grandfathering: contas migradas manualmente para ACTIVE sem data de período
  // (ver scripts/backfill-subscriptions.ts) mantêm acesso liberado indefinidamente.
  if (status === 'ACTIVE' && !subscription.currentPeriodEndsAt) {
    return { allowed: true, reason: 'SUBSCRIPTION_ACTIVE' }
  }

  if (status === 'CANCELED' && subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > now) {
    return { allowed: true, reason: 'SUBSCRIPTION_ACTIVE', currentPeriodEndsAt: subscription.currentPeriodEndsAt }
  }

  if (status === 'PENDING_PAYMENT') {
    return { allowed: false, reason: 'PAYMENT_PENDING', redirectTo: '/configuracoes/assinatura' }
  }

  if (status === 'PAST_DUE') {
    return { allowed: false, reason: 'PAYMENT_LATE', redirectTo: '/configuracoes/assinatura' }
  }

  if (status === 'BLOCKED') {
    return { allowed: false, reason: 'SUBSCRIPTION_BLOCKED', redirectTo: '/configuracoes/assinatura' }
  }

  if (status === 'CANCELED') {
    return { allowed: false, reason: 'SUBSCRIPTION_CANCELED', redirectTo: '/configuracoes/assinatura' }
  }

  return { allowed: false, reason: 'TRIAL_EXPIRED', redirectTo: '/configuracoes/assinatura' }
}

// Cria a assinatura TRIAL de 7 dias — chamado dentro da mesma transação do
// cadastro (auth.ts) e como backfill defensivo no login para contas antigas.
export async function ensureTrialSubscription(
  doctorId: string,
  tx: Pick<typeof prisma, 'doctorSubscription'> = prisma
): Promise<void> {
  const existing = await tx.doctorSubscription.findUnique({ where: { doctorId } })
  if (existing) return

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + CLINIC_PRO_SUBSCRIPTION.trialDays)

  await tx.doctorSubscription.create({
    data: { doctorId, status: 'TRIAL', trialStartedAt: new Date(), trialEndsAt },
  })

  await logAudit({ userId: doctorId, action: 'TRIAL_CREATED', description: `Trial de ${CLINIC_PRO_SUBSCRIPTION.trialDays} dias iniciado` })
}

// Job periódico: marca trials vencidos como BLOCKED. calculateClinicAccess já
// bloqueia em tempo real por conta própria — isso é só para manter o status
// persistido coerente (ex.: exibido em telas administrativas).
let expiryWatchdogInterval: NodeJS.Timeout | null = null

export function startSubscriptionExpiryWatchdog(): void {
  if (expiryWatchdogInterval) return

  const INTERVAL_MS = 60 * 60 * 1000 // 1 hora

  const run = async () => {
    try {
      const expired = await prisma.doctorSubscription.findMany({
        where: { status: 'TRIAL', trialEndsAt: { lt: new Date() } },
        select: { id: true, doctorId: true },
      })

      for (const sub of expired) {
        await prisma.doctorSubscription.update({
          where: { id: sub.id },
          data: { status: 'BLOCKED', blockedAt: new Date() },
        })
        await logAudit({ userId: sub.doctorId, action: 'TRIAL_EXPIRED', description: 'Período gratuito de 7 dias encerrado' })
      }
    } catch (err) {
      console.error('[SUBSCRIPTION_WATCHDOG] Erro ao verificar trials expirados:', err)
    }
  }

  expiryWatchdogInterval = setInterval(run, INTERVAL_MS)
  run().catch(err => console.error('[SUBSCRIPTION_WATCHDOG] Erro no check inicial:', err))

  console.log('[SUBSCRIPTION_WATCHDOG] Verificação de trials expirados iniciada')
}
