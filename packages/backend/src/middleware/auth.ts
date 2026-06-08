import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'

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
