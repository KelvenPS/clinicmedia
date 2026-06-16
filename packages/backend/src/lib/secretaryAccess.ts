import { Response, NextFunction } from 'express'
import { prisma } from './prisma'
import { AuthRequest } from '../middleware/auth'

// Menus/telas que o médico pode liberar individualmente para cada secretária.
// Tudo aqui é desligado por padrão — a secretária só vê se o médico marcar
// o checkbox correspondente em "Gestão de Acessos" (Minha Equipe).
export const SECRETARY_PERMISSION_KEYS = [
  'chatbot',
  'nota_fiscal',
  'teleconsulta',
  'documentos',
  'salas',
  'integracoes',
] as const

export type SecretaryPermissionKey = typeof SECRETARY_PERMISSION_KEYS[number]
export type SecretaryPermissions = Partial<Record<SecretaryPermissionKey, boolean>>

export function normalizeSecretaryPermissions(input: unknown): SecretaryPermissions {
  const result: SecretaryPermissions = {}
  if (!input || typeof input !== 'object') return result
  for (const key of SECRETARY_PERMISSION_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'boolean') result[key] = value
  }
  return result
}

/**
 * Resolve o doctorId efetivo para o usuário autenticado.
 * - DOCTOR    → próprio userId
 * - SECRETARY → doctorId do primeiro vínculo ativo
 * - ADMIN     → null (sem filtro automático)
 */
export async function getEffectiveDoctorId(req: AuthRequest): Promise<string | null> {
  if (!req.user) return null
  if (req.user.role === 'DOCTOR') return req.user.userId

  if (req.user.role === 'SECRETARY') {
    const link = await prisma.doctorSecretary.findFirst({
      where: { secretaryId: req.user.userId, active: true },
      select: { doctorId: true },
    })
    return link?.doctorId ?? null
  }

  return null
}

/**
 * Middleware: bloqueia SECRETARY se o médico não tiver liberado a permissão.
 * DOCTOR e ADMIN passam direto.
 */
export function requireSecretaryPermission(key: SecretaryPermissionKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.role !== 'SECRETARY') {
      next()
      return
    }

    try {
      const link = await prisma.doctorSecretary.findFirst({
        where: { secretaryId: req.user.userId, active: true },
        select: { permissions: true },
      })
      const permissions = normalizeSecretaryPermissions(link?.permissions)

      if (!permissions[key]) {
        res.status(403).json({
          message: 'Acesso não liberado pelo médico para esta funcionalidade',
          code: 'SECRETARY_PERMISSION_DENIED',
          requiredPermission: key,
        })
        return
      }

      next()
    } catch {
      res.status(403).json({ message: 'Acesso não liberado pelo médico para esta funcionalidade' })
    }
  }
}
