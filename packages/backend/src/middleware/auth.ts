import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { prisma } from '../lib/prisma'

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

export async function checkSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  // ADMIN and non-DOCTOR roles bypass subscription check
  if (req.user?.role === 'ADMIN') return next()
  if (req.user?.role !== 'DOCTOR') return next()

  const sub = await prisma.doctorSubscription.findUnique({
    where: { doctorId: req.user.userId },
  })

  if (!sub) {
    // No subscription yet — allow through (trial will be created on register)
    return next()
  }

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
}
