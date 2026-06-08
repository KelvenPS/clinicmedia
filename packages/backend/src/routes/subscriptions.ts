import { Router } from 'express'
import { z } from 'zod'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { ensureTrialSubscription } from '../lib/subscription'

export { ensureTrialSubscription }

const router = Router()

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
})

const preference = new Preference(mp)
const payment = new Payment(mp)

const PRICE_MAP: Record<string, Record<string, number>> = {
  PRO:    { MONTHLY: 69.90,  ANNUAL: 713.16 },
  PLUS:   { MONTHLY: 89.90,  ANNUAL: 917.18 },
  CLINIC: { MONTHLY: 109.90, ANNUAL: 1120.98 },
}

const PLANS = {
  PRO:    { monthly: 69.90,  annual: 69.90  * 12 * 0.85 },
  PLUS:   { monthly: 89.90,  annual: 89.90  * 12 * 0.85 },
  CLINIC: { monthly: 109.90, annual: 109.90 * 12 * 0.85 },
}

// Webhook — public, before authenticate middleware
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body as { type?: string; data?: { id?: string } }

    if (type !== 'payment' || !data?.id) {
      res.status(200).json({ received: true })
      return
    }

    const paymentData = await payment.get({ id: String(data.id) })

    if (paymentData.status !== 'approved') {
      res.status(200).json({ received: true })
      return
    }

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
        plan: plan as 'PRO' | 'PLUS' | 'CLINIC',
        billingCycle: billingCycle as 'MONTHLY' | 'ANNUAL',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
      },
      update: {
        plan: plan as 'PRO' | 'PLUS' | 'CLINIC',
        billingCycle: billingCycle as 'MONTHLY' | 'ANNUAL',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
      },
    })

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// All routes below require authentication
router.use(authenticate)

router.get('/me', async (req: AuthRequest, res) => {
  try {
    const sub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user!.userId },
    })
    res.json(sub)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/plans', async (_req, res) => {
  res.json(PLANS)
})

router.post('/select', async (req: AuthRequest, res) => {
  try {
    const { plan, billingCycle } = z.object({
      plan: z.enum(['PRO', 'PLUS', 'CLINIC']),
      billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
    }).parse(req.body)

    const now = new Date()
    const periodEnd = new Date(now)
    if (billingCycle === 'MONTHLY') {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    }

    const sub = await prisma.doctorSubscription.upsert({
      where: { doctorId: req.user!.userId },
      create: {
        doctorId: req.user!.userId,
        plan,
        billingCycle,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
      },
      update: {
        plan,
        billingCycle,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
      },
    })

    res.json(sub)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/checkout', async (req: AuthRequest, res) => {
  try {
    const { plan, billingCycle } = z.object({
      plan: z.enum(['PRO', 'PLUS', 'CLINIC']),
      billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
    }).parse(req.body)

    const amount = PRICE_MAP[plan][billingCycle]
    const cycleName = billingCycle === 'MONTHLY' ? 'Mensal' : 'Anual'
    const title = `ClinIQ Pro ${plan} - ${cycleName}`
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const backendUrl = process.env.BACKEND_URL || 'http://2.25.185.223'

    const pref = await preference.create({
      body: {
        items: [
          {
            id: `${plan}_${billingCycle}`,
            title,
            unit_price: amount,
            quantity: 1,
            currency_id: 'BRL',
          },
        ],
        back_urls: {
          success: `${frontendUrl}/configuracoes/planos?status=success&plan=${plan}&cycle=${billingCycle}`,
          failure: `${frontendUrl}/configuracoes/planos?status=failure`,
          pending: `${frontendUrl}/configuracoes/planos?status=pending`,
        },
        auto_return: 'approved',
        external_reference: `${req.user!.userId}:${plan}:${billingCycle}`,
        notification_url: `${backendUrl}/api/subscriptions/webhook`,
      },
    })

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

export default router
