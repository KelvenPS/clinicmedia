import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { prisma } from '../lib/prisma'
import { PLAN_FEATURES } from '../lib/plans'

export interface AuthRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
    name: string
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token não fornecido' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido ou expirado' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: 'Não autenticado' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Acesso negado. Permissão insuficiente.' })
      return
    }

    next()
  }
}

// requireFeature('prontuario') — gates a route behind plan feature check
export function requireFeature(feature: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === 'ADMIN') return next()
    if (req.user?.role === 'SECRETARY') return next() // secretaries inherit doctor's plan

    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ message: 'Não autenticado' })
      return
    }

    try {
      const sub = await prisma.doctorSubscription.findUnique({
        where: { doctorId: userId },
      })

      const plan = sub?.plan ?? 'TRIAL'
      const now = new Date()
      const isTrialExpired = plan === 'TRIAL' && sub?.trialEndsAt != null && now > sub.trialEndsAt
      const isPaidExpired  = plan !== 'TRIAL' && sub?.currentPeriodEnd != null && now > sub.currentPeriodEnd

      if (isTrialExpired || isPaidExpired) {
        res.status(402).json({
          message: 'Plano expirado. Assine um plano para continuar.',
          code: isTrialExpired ? 'TRIAL_EXPIRED' : 'SUBSCRIPTION_EXPIRED',
          requiredFeature: feature,
        })
        return
      }

      const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.TRIAL
      if (!features.includes(feature)) {
        res.status(403).json({
          message: `Funcionalidade não disponível no plano ${plan}`,
          code: 'FEATURE_NOT_AVAILABLE',
          requiredFeature: feature,
          currentPlan: plan,
        })
        return
      }

      next()
    } catch {
      next() // DB failure must not kill the request
    }
  }
}

export async function checkSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'ADMIN') return next()
  if (req.user?.role !== 'DOCTOR') return next()

  try {
    const sub = await prisma.doctorSubscription.findUnique({
      where: { doctorId: req.user.userId },
    })

    if (!sub) return next()

    const now = new Date()

    if (sub.plan === 'TRIAL' && sub.trialEndsAt && now > sub.trialEndsAt) {
      res.status(402).json({
        message: 'Período de teste encerrado',
        code: 'TRIAL_EXPIRED',
        trialEndsAt: sub.trialEndsAt,
      })
      return
    }

    if (sub.plan !== 'TRIAL' && sub.status === 'EXPIRED') {
      res.status(402).json({
        message: 'Assinatura expirada',
        code: 'SUBSCRIPTION_EXPIRED',
      })
      return
    }

    next()
  } catch {
    // DB failure on subscription check must not kill the request
    next()
  }
}
