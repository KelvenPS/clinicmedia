import type { IntegrationType } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logAudit } from '../../lib/secretaryAccess'
import { isValidTransition, calculateClinicAccess, type SubscriptionStatusValue } from '../../lib/subscription-access'
import { CLINIC_PRO_SUBSCRIPTION } from '../../lib/billing-config'
import type { NormalizedBillingEvent } from './kiwify.types'

export async function processIntegrationAddonWebhookEvent(
  event: NormalizedBillingEvent,
  addonType: string,
  eventKey: string
): Promise<ProcessWebhookResult> {
  const existing = await prisma.kiwifyWebhookEvent.findUnique({ where: { eventKey } })
  if (existing?.processingStatus === 'PROCESSED') {
    return { received: true, duplicated: true }
  }

  const webhookRecord = existing
    ? await prisma.kiwifyWebhookEvent.update({
        where: { eventKey },
        data: { attempts: { increment: 1 } },
      })
    : await prisma.kiwifyWebhookEvent.create({
        data: {
          eventKey,
          eventType: event.eventType,
          kiwifyOrderId: event.providerOrderId || null,
          payload: event.rawPayload as object,
        },
      })

  if (event.eventType === 'UNKNOWN' || !event.providerOrderId) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: 'Evento não mapeado ou sem order_id' },
    })
    return { received: true, ignored: 'unmapped_event' }
  }

  const doctorId = event.doctorId
  if (!doctorId) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: 'Sem doctorId (TrackingParameters.s1) no payload' },
    })
    return { received: true, ignored: 'missing_doctor_id' }
  }

  const addon = await prisma.integrationAddon.findUnique({ where: { doctorId_type: { doctorId, type: addonType as IntegrationType } } })
  if (!addon) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: `Add-on não encontrado para doctorId=${doctorId} type=${addonType}` },
    })
    return { received: true, ignored: 'addon_not_found' }
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    switch (event.eventType) {
      case 'PAYMENT_APPROVED':
      case 'SUBSCRIPTION_RENEWED': {
        await tx.integrationAddon.update({
          where: { id: addon.id },
          data: {
            status: 'ACTIVE',
            lastPaymentAt: now,
            currentPeriodEndsAt: addOneMonth(now),
            lastKiwifyOrderId: event.providerOrderId,
            kiwifySubscriptionId: event.providerSubscriptionId ?? addon.kiwifySubscriptionId,
            canceledAt: null,
          },
        })
        await logAudit({ userId: doctorId, action: 'INTEGRATION_ADDON_ACTIVATED', description: `${addonType} — pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_LATE': {
        await tx.integrationAddon.update({ where: { id: addon.id }, data: { status: 'PAST_DUE' } })
        await logAudit({ userId: doctorId, action: 'INTEGRATION_ADDON_PAST_DUE', description: `${addonType} — pedido ${event.providerOrderId}` })
        break
      }

      case 'SUBSCRIPTION_CANCELED': {
        await tx.integrationAddon.update({ where: { id: addon.id }, data: { status: 'CANCELED', canceledAt: now } })
        await logAudit({ userId: doctorId, action: 'INTEGRATION_ADDON_CANCELED', description: `${addonType} — pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_REFUNDED':
      case 'CHARGEBACK': {
        await tx.integrationAddon.update({ where: { id: addon.id }, data: { status: 'BLOCKED' } })
        await logAudit({ userId: doctorId, action: 'INTEGRATION_ADDON_BLOCKED', description: `${addonType} — pedido ${event.providerOrderId}` })
        break
      }

      // PAYMENT_REFUSED / PAYMENT_PENDING: mantém PENDING_PAYMENT já setado no
      // checkout, nada a atualizar além de marcar o webhook como processado.
    }

    await tx.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'PROCESSED', processedAt: now },
    })
  })

  return { received: true }
}

function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

export interface ProcessWebhookResult {
  received: true
  duplicated?: boolean
  ignored?: string
}

// Processa um evento normalizado da Kiwify com idempotência (chave única na
// tabela TBLWEBHOOKKIWIFY) e transição de estado validada. Retorna sempre
// "received: true" mesmo em duplicidade/ignorado — o endpoint HTTP responde
// 200 nesses casos pra Kiwify não ficar reenviando o mesmo evento.
export async function processKiwifyWebhookEvent(
  event: NormalizedBillingEvent,
  eventKey: string
): Promise<ProcessWebhookResult> {
  const existing = await prisma.kiwifyWebhookEvent.findUnique({ where: { eventKey } })
  if (existing?.processingStatus === 'PROCESSED') {
    return { received: true, duplicated: true }
  }

  const webhookRecord = existing
    ? await prisma.kiwifyWebhookEvent.update({
        where: { eventKey },
        data: { attempts: { increment: 1 } },
      })
    : await prisma.kiwifyWebhookEvent.create({
        data: {
          eventKey,
          eventType: event.eventType,
          kiwifyOrderId: event.providerOrderId || null,
          payload: event.rawPayload as object,
        },
      })

  if (event.eventType === 'UNKNOWN' || !event.providerOrderId) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: 'Evento não mapeado ou sem order_id' },
    })
    return { received: true, ignored: 'unmapped_event' }
  }

  const doctorId = event.doctorId
  if (!doctorId) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: 'Sem doctorId (TrackingParameters.s1) no payload' },
    })
    return { received: true, ignored: 'missing_doctor_id' }
  }

  const subscription = await prisma.doctorSubscription.findUnique({ where: { doctorId } })
  if (!subscription) {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: `Assinatura não encontrada para doctorId=${doctorId}` },
    })
    return { received: true, ignored: 'subscription_not_found' }
  }

  // Evento fora de ordem: se o evento for mais antigo que a última atualização
  // registrada, não deixa ele regredir uma assinatura já mais atual.
  if (subscription.lastPaymentAt && event.eventDate < subscription.lastPaymentAt && event.eventType === 'PAYMENT_APPROVED') {
    await prisma.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'IGNORED', processedAt: new Date(), errorMessage: 'Evento mais antigo que o último pagamento registrado' },
    })
    return { received: true, ignored: 'stale_event' }
  }

  const currentStatus = subscription.status as SubscriptionStatusValue
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    switch (event.eventType) {
      case 'PAYMENT_APPROVED':
      case 'SUBSCRIPTION_RENEWED': {
        if (!isValidTransition(currentStatus, 'ACTIVE')) break

        await tx.subscriptionPayment.upsert({
          where: { kiwifyOrderId: event.providerOrderId },
          create: {
            doctorId,
            subscriptionId: subscription.id,
            kiwifyOrderId: event.providerOrderId,
            status: 'APPROVED',
            amountCents: event.amountCents ?? CLINIC_PRO_SUBSCRIPTION.monthlyPriceCents,
            approvedAt: now,
          },
          update: { status: 'APPROVED', approvedAt: now },
        })

        await tx.doctorSubscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            lastPaymentAt: now,
            currentPeriodStartedAt: now,
            currentPeriodEndsAt: addOneMonth(now),
            lastKiwifyOrderId: event.providerOrderId,
            kiwifySubscriptionId: event.providerSubscriptionId ?? subscription.kiwifySubscriptionId,
            blockedAt: null,
            canceledAt: null,
          },
        })

        await logAudit({ userId: doctorId, action: event.eventType === 'PAYMENT_APPROVED' ? 'SUBSCRIPTION_ACTIVATED' : 'SUBSCRIPTION_RENEWED', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_LATE': {
        if (!isValidTransition(currentStatus, 'PAST_DUE')) break
        await tx.doctorSubscription.update({ where: { id: subscription.id }, data: { status: 'PAST_DUE' } })
        await logAudit({ userId: doctorId, action: 'SUBSCRIPTION_PAST_DUE', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'SUBSCRIPTION_CANCELED': {
        if (!isValidTransition(currentStatus, 'CANCELED')) break
        await tx.doctorSubscription.update({ where: { id: subscription.id }, data: { status: 'CANCELED', canceledAt: now } })
        await logAudit({ userId: doctorId, action: 'SUBSCRIPTION_CANCELED', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_REFUNDED': {
        if (!isValidTransition(currentStatus, 'BLOCKED')) break
        await tx.subscriptionPayment.updateMany({ where: { kiwifyOrderId: event.providerOrderId }, data: { status: 'REFUNDED', refundedAt: now } })
        await tx.doctorSubscription.update({ where: { id: subscription.id }, data: { status: 'BLOCKED', blockedAt: now } })
        await logAudit({ userId: doctorId, action: 'PAYMENT_REFUNDED', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'CHARGEBACK': {
        if (!isValidTransition(currentStatus, 'BLOCKED')) break
        await tx.subscriptionPayment.updateMany({ where: { kiwifyOrderId: event.providerOrderId }, data: { status: 'CHARGEBACK' } })
        await tx.doctorSubscription.update({ where: { id: subscription.id }, data: { status: 'BLOCKED', blockedAt: now } })
        await logAudit({ userId: doctorId, action: 'PAYMENT_CHARGEBACK', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_REFUSED': {
        await tx.subscriptionPayment.upsert({
          where: { kiwifyOrderId: event.providerOrderId },
          create: { doctorId, subscriptionId: subscription.id, kiwifyOrderId: event.providerOrderId, status: 'REFUSED', amountCents: event.amountCents ?? CLINIC_PRO_SUBSCRIPTION.monthlyPriceCents },
          update: { status: 'REFUSED' },
        })
        await logAudit({ userId: doctorId, action: 'PAYMENT_REFUSED', description: `Pedido ${event.providerOrderId}` })
        break
      }

      case 'PAYMENT_PENDING': {
        await tx.subscriptionPayment.upsert({
          where: { kiwifyOrderId: event.providerOrderId },
          create: { doctorId, subscriptionId: subscription.id, kiwifyOrderId: event.providerOrderId, status: 'PENDING', amountCents: event.amountCents ?? CLINIC_PRO_SUBSCRIPTION.monthlyPriceCents },
          update: { status: 'PENDING' },
        })

        // Pix/boleto gerado mas ainda não confirmado. Só rebaixa o status pra
        // PENDING_PAYMENT se o tenant já não tiver acesso garantido por outro
        // motivo agora mesmo (trial ou período pago ainda vigentes) — usa o
        // cálculo em tempo real, não o rótulo (possivelmente desatualizado)
        // gravado no banco.
        const currentlyAllowed = calculateClinicAccess(subscription, now).allowed
        if (!currentlyAllowed && isValidTransition(currentStatus, 'PENDING_PAYMENT')) {
          await tx.doctorSubscription.update({ where: { id: subscription.id }, data: { status: 'PENDING_PAYMENT' } })
        }
        break
      }
    }

    if (event.checkoutAttemptId) {
      await tx.subscriptionCheckoutAttempt.updateMany({
        where: { id: event.checkoutAttemptId, status: { not: 'COMPLETED' } },
        data: { status: 'COMPLETED', completedAt: now },
      }).catch(() => undefined)
    }

    await tx.kiwifyWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: { processingStatus: 'PROCESSED', processedAt: now },
    })
  })

  return { received: true }
}
