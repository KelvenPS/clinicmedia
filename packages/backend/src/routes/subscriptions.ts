import { Router } from 'express'
import { z } from 'zod'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { ensureTrialSubscription } from '../lib/subscription'
import { PLAN_PRICES, PLAN_DISPLAY, PLAN_FEATURES, PLAN_LIMITS } from '../lib/plans'
export type { PlanKey } from '../lib/plans'

export { ensureTrialSubscription, PLAN_PRICES, PLAN_DISPLAY, PLAN_FEATURES, PLAN_LIMITS }

const router = Router()

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
})

const preference = new Preference(mp)
const payment = new Payment(mp)

// ─── Webhook (public) ─────────────────────────────────────────────────────────

router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body as { type?: string; data?: { id?: string } }

    if (type !== 'payment' || !data?.id) {
      res.status(200).json({ received: true })
      return
    }

    const paymentData = await payment.get({ id: String(data.id) })

    const ref = paymentData.external_reference
    if (!ref) {
      res.status(200).json({ received: true })
      return
    }

    const [userId, plan, billingCycle] = ref.split(':')
    if (!userId || !plan || !billingCycle) {
      res.status(200).json({ received: true })
      return
    }

    // Always record the payment attempt
    const existingSub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: userId },
    })

    if (existingSub) {
      await prisma.subscriptionPayment.upsert({
        where: { mpPaymentId: String(data.id) },
        create: {
          doctorId: userId,
          subscriptionId: existingSub.id,
          plan,
          billingCycle,
          amount: PLAN_PRICES[plan]?.[billingCycle as 'MONTHLY' | 'ANNUAL'] ?? 0,
          status: paymentData.status === 'approved' ? 'PAID' : paymentData.status?.toUpperCase() ?? 'PENDING',
          mpPaymentId: String(data.id),
          mpStatus: paymentData.status,
          paidAt: paymentData.status === 'approved' ? new Date() : null,
        },
        update: {
          status: paymentData.status === 'approved' ? 'PAID' : paymentData.status?.toUpperCase() ?? 'PENDING',
          mpStatus: paymentData.status,
          paidAt: paymentData.status === 'approved' ? new Date() : undefined,
        },
      })
    }

    if (paymentData.status !== 'approved') {
      res.status(200).json({ received: true })
      return
    }

    const now = new Date()
    const periodEnd = new Date(now)
    if (billingCycle === 'MONTHLY') {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    }

    await prisma.doctorSubscription.upsert({
      where: { doctorId: userId },
      create: {
        doctorId: userId,
        plan,
        billingCycle,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        mpPaymentId: String(data.id),
        cancelledAt: null,
      },
      update: {
        plan,
        billingCycle,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        mpPaymentId: String(data.id),
        cancelledAt: null,
      },
    })

    // Send activation notification
    await prisma.notification.create({
      data: {
        userId,
        title: `Plano ${PLAN_DISPLAY[plan] ?? plan} ativado!`,
        message: `Seu pagamento foi aprovado. Plano ${PLAN_DISPLAY[plan] ?? plan} ativo até ${periodEnd.toLocaleDateString('pt-BR')}.`,
        type: 'SUCCESS',
        link: '/configuracoes/planos',
      },
    })

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Authenticated routes ─────────────────────────────────────────────────────

router.use(authenticate)

// GET /api/subscriptions/me
router.get('/me', async (req: AuthRequest, res) => {
  try {
    const sub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user!.userId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
    res.json(sub)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/subscriptions/plans
router.get('/plans', async (_req, res) => {
  res.json(PLAN_PRICES)
})

// GET /api/subscriptions/features
router.get('/features', async (req: AuthRequest, res) => {
  try {
    const sub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user!.userId },
    })

    const plan = sub?.plan ?? 'TRIAL'
    const isTrialExpired = plan === 'TRIAL' && sub?.trialEndsAt != null && new Date() > sub.trialEndsAt
    const isPaidExpired = plan !== 'TRIAL' && sub?.currentPeriodEnd != null && new Date() > sub.currentPeriodEnd

    const features = isTrialExpired || isPaidExpired ? [] : (PLAN_FEATURES[plan] ?? PLAN_FEATURES.TRIAL)
    const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.TRIAL

    res.json({
      plan,
      status: sub?.status ?? 'ACTIVE',
      features,
      limits,
      trialEndsAt: sub?.trialEndsAt,
      currentPeriodEnd: sub?.currentPeriodEnd,
      isTrialExpired,
      isPaidExpired,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/subscriptions/checkout
router.post('/checkout', async (req: AuthRequest, res) => {
  try {
    const { plan, billingCycle } = z.object({
      plan: z.enum(['PRO', 'PLUS', 'CLINIC', 'TELECONSULTA']),
      billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
    }).parse(req.body)

    const amount = PLAN_PRICES[plan][billingCycle]
    const cycleName = billingCycle === 'MONTHLY' ? 'Mensal' : 'Anual'
    const title = `ClinIQ Pro - ${PLAN_DISPLAY[plan]} ${cycleName}`
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const backendUrl  = process.env.BACKEND_URL  || 'http://localhost:3001'

    const pref = await preference.create({
      body: {
        items: [{
          id: `${plan}_${billingCycle}`,
          title,
          unit_price: amount,
          quantity: 1,
          currency_id: 'BRL',
        }],
        back_urls: {
          success: `${frontendUrl}/configuracoes/planos?status=success&plan=${plan}&cycle=${billingCycle}`,
          failure: `${frontendUrl}/configuracoes/planos?status=failure`,
          pending: `${frontendUrl}/configuracoes/planos?status=pending`,
        },
        auto_return: 'approved',
        external_reference: `${req.user!.userId}:${plan}:${billingCycle}`,
        notification_url: `${backendUrl}/api/subscriptions/webhook`,
        payment_methods: {
          excluded_payment_types: [],
          installments: billingCycle === 'ANNUAL' ? 12 : 1,
        },
      },
    })

    // Record preference ID
    const existingSub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user!.userId },
    })
    if (existingSub) {
      await prisma.doctorSubscription.update({
        where: { doctorId: req.user!.userId },
        data: { mpPreferenceId: pref.id },
      })
    }

    res.json({ id: pref.id, init_point: pref.init_point })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('Checkout error:', error)
    res.status(500).json({ message: 'Erro ao criar preferência de pagamento' })
  }
})

// POST /api/subscriptions/cancel — user self-cancel
router.post('/cancel', async (req: AuthRequest, res) => {
  try {
    const sub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user!.userId },
    })
    if (!sub) {
      res.status(404).json({ message: 'Assinatura não encontrada' })
      return
    }

    await prisma.doctorSubscription.update({
      where: { doctorId: req.user!.userId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    await prisma.notification.create({
      data: {
        userId: req.user!.userId,
        title: 'Assinatura cancelada',
        message: 'Sua assinatura foi cancelada. Você pode contratar um plano a qualquer momento.',
        type: 'WARNING',
        link: '/configuracoes/planos',
      },
    })

    res.json({ message: 'Assinatura cancelada com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro ao cancelar assinatura' })
  }
})

// POST /api/subscriptions/send-trial-warnings — cron-friendly endpoint (admin only)
router.post('/send-trial-warnings', requireRole('ADMIN'), async (_req: AuthRequest, res) => {
  try {
    const now = new Date()
    const in5Days = new Date(now)
    in5Days.setDate(in5Days.getDate() + 5)

    // Find doctors whose trial ends in ≤5 days and haven't been warned yet
    const expiringSoon = await prisma.doctorSubscription.findMany({
      where: {
        plan: 'TRIAL',
        status: 'ACTIVE',
        trialWarned: false,
        trialEndsAt: { lte: in5Days, gte: now },
      },
      select: { doctorId: true, trialEndsAt: true, id: true },
    })

    let sent = 0
    for (const sub of expiringSoon) {
      const daysLeft = Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      await prisma.notification.create({
        data: {
          userId: sub.doctorId,
          title: `⚠️ Período gratuito expira em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}`,
          message: `Seu período gratuito de 30 dias encerra em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}. Assine um plano para continuar usando o ClinIQ Pro sem interrupções.`,
          type: 'WARNING',
          link: '/configuracoes/planos',
        },
      })

      await prisma.doctorSubscription.update({
        where: { id: sub.id },
        data: { trialWarned: true },
      })

      sent++
    }

    // Also find already-expired trials to notify
    const expired = await prisma.doctorSubscription.findMany({
      where: {
        plan: 'TRIAL',
        status: 'ACTIVE',
        trialEndsAt: { lt: now },
      },
      select: { doctorId: true, id: true },
    })

    for (const sub of expired) {
      await prisma.doctorSubscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED' },
      })
    }

    res.json({ sent, expired: expired.length })
  } catch (error) {
    console.error('Trial warning error:', error)
    res.status(500).json({ message: 'Erro ao enviar avisos' })
  }
})

// ─── Admin subscription management ───────────────────────────────────────────

// GET /api/subscriptions/admin/list
router.get('/admin/list', requireRole('ADMIN'), async (_req: AuthRequest, res) => {
  try {
    const subs = await prisma.doctorSubscription.findMany({
      include: {
        doctor: { select: { id: true, name: true, email: true, specialty: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(subs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// PATCH /api/subscriptions/admin/:doctorId — manually override plan
router.patch('/admin/:doctorId', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { doctorId } = req.params
    const body = z.object({
      plan:        z.enum(['TRIAL', 'PRO', 'PLUS', 'CLINIC', 'TELECONSULTA']),
      billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
      status:      z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'EXPIRED']).optional(),
      adminNote:   z.string().optional(),
      extendDays:  z.number().int().positive().optional(),
    }).parse(req.body)

    const now = new Date()
    const updateData: Record<string, unknown> = {
      plan:     body.plan,
      status:   body.status ?? 'ACTIVE',
      adminNote: body.adminNote ?? null,
    }

    if (body.billingCycle) updateData.billingCycle = body.billingCycle

    if (body.plan === 'TRIAL') {
      const trialEnd = new Date(now)
      trialEnd.setDate(trialEnd.getDate() + (body.extendDays ?? 30))
      updateData.trialEndsAt         = trialEnd
      updateData.trialWarned         = false
      updateData.currentPeriodStart  = null
      updateData.currentPeriodEnd    = null
      updateData.cancelledAt         = null
    } else {
      const periodEnd = new Date(now)
      if (body.billingCycle === 'ANNUAL') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + (body.extendDays
          ? Math.ceil(body.extendDays / 30)
          : 1))
      }
      updateData.currentPeriodStart = now
      updateData.currentPeriodEnd   = periodEnd
      updateData.trialEndsAt        = null
      updateData.cancelledAt        = body.status === 'CANCELLED' ? now : null
    }

    const sub = await prisma.doctorSubscription.upsert({
      where:  { doctorId },
      create: { doctorId, ...updateData },
      update: updateData,
    })

    // Notify the doctor
    await prisma.notification.create({
      data: {
        userId: doctorId,
        title:  `Plano atualizado: ${PLAN_DISPLAY[body.plan] ?? body.plan}`,
        message: body.adminNote
          ? `Seu plano foi atualizado pelo administrador. ${body.adminNote}`
          : `Seu plano foi atualizado para ${PLAN_DISPLAY[body.plan] ?? body.plan}.`,
        type:  'INFO',
        link:  '/configuracoes/planos',
      },
    })

    res.json(sub)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro ao atualizar assinatura' })
  }
})

// POST /api/subscriptions/admin/:doctorId/reset-trial
router.post('/admin/:doctorId/reset-trial', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { doctorId } = req.params
    const { days } = z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(req.body)

    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + days)

    await prisma.doctorSubscription.upsert({
      where:  { doctorId },
      create: { doctorId, plan: 'TRIAL', status: 'ACTIVE', trialEndsAt, trialWarned: false },
      update: { plan: 'TRIAL', status: 'ACTIVE', trialEndsAt, trialWarned: false,
                cancelledAt: null, currentPeriodEnd: null, currentPeriodStart: null },
    })

    await prisma.notification.create({
      data: {
        userId:  doctorId,
        title:   `Período gratuito renovado (${days} dias)`,
        message: `Seu período de teste foi renovado por ${days} dias pelo administrador.`,
        type:    'SUCCESS',
        link:    '/configuracoes/planos',
      },
    })

    res.json({ message: `Trial resetado para ${days} dias`, trialEndsAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro ao resetar trial' })
  }
})

export default router
