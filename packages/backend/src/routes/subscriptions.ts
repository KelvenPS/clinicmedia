import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const PLANS = {
  PRO:    { monthly: 69.90, annual: 69.90 * 12 * 0.85 },
  PLUS:   { monthly: 89.90, annual: 89.90 * 12 * 0.85 },
  CLINIC: { monthly: 109.90, annual: 109.90 * 12 * 0.85 },
}

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

export const ensureTrialSubscription = async (doctorId: string) => {
  const existing = await prisma.doctorSubscription.findUnique({ where: { doctorId } })
  if (!existing) {
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)
    await prisma.doctorSubscription.create({
      data: { doctorId, plan: 'TRIAL', status: 'ACTIVE', trialEndsAt },
    })
  }
}

export default router
