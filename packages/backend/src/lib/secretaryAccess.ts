import { Response, NextFunction } from 'express'
import { prisma } from './prisma'
import { AuthRequest } from '../middleware/auth'

// Menus/telas que o médico pode liberar individualmente para cada secretária.
// Tudo aqui é desligado por padrão — a secretária só vê se o médico marcar
// o checkbox correspondente em "Gestão de Acessos" (Minha Equipe).
export const SECRETARY_PERMISSION_KEYS = [
  'financeiro',
  'chatbot_light',
  'chatbot_agente',
  'nota_fiscal',
  'teleconsulta',
  'documentos',
  'salas',
  'integracoes',
  'canCreatePreRegistration',
  'canCompleteRegistration',
  'canViewPendingPatients',
] as const

export type SecretaryPermissionKey = typeof SECRETARY_PERMISSION_KEYS[number]
export type SecretaryPermissions = Partial<Record<SecretaryPermissionKey, boolean>>

// Permissões granulares dentro de uma sala específica
export type RoomPermissionKey =
  | 'canViewSchedule'
  | 'canManageWhatsapp'
  | 'canConnectWhatsapp'
  | 'canReconnectWhatsapp'
  | 'canDisconnectWhatsapp'
  | 'canSendMessages'
  | 'canUseTemplates'
  | 'canUseAutomaticMessages'
  | 'canViewHistory'

export function normalizeSecretaryPermissions(input: unknown): SecretaryPermissions {
  const result: SecretaryPermissions = {}
  if (!input || typeof input !== 'object') return result
  const raw = input as Record<string, unknown>
  for (const key of SECRETARY_PERMISSION_KEYS) {
    const value = raw[key]
    if (typeof value === 'boolean') result[key] = value
  }
  // Backward compat: old 'chatbot: true' maps to both chatbot_light and chatbot_agente
  if (raw['chatbot'] === true) {
    if (result['chatbot_light'] === undefined) result['chatbot_light'] = true
    if (result['chatbot_agente'] === undefined) result['chatbot_agente'] = true
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

/**
 * Verifica se a secretária tem permissão específica em uma sala.
 * Retorna o registro RoomSecretary ou null se não tiver acesso.
 */
export async function getRoomSecretaryAccess(secretaryId: string, roomId: string) {
  return prisma.roomSecretary.findFirst({
    where: { roomId, secretaryId, active: true },
  })
}

/**
 * Middleware: verifica permissão granular de sala para secretária.
 * O roomId deve estar em req.params.roomId ou req.params.id.
 * DOCTOR e ADMIN passam direto.
 */
export function requireRoomPermission(permissionKey: RoomPermissionKey) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.role !== 'SECRETARY') {
      next()
      return
    }

    const roomId = req.params.roomId || req.params.id
    if (!roomId) {
      res.status(400).json({ message: 'ID da sala não informado' })
      return
    }

    try {
      const roomAccess = await getRoomSecretaryAccess(req.user.userId, roomId)

      if (!roomAccess) {
        res.status(403).json({
          message: 'Você não tem acesso a esta sala',
          code: 'ROOM_ACCESS_DENIED',
        })
        return
      }

      const hasPermission = roomAccess[permissionKey as keyof typeof roomAccess] as boolean
      if (!hasPermission) {
        res.status(403).json({
          message: 'Você não tem permissão para esta ação nesta sala',
          code: 'ROOM_PERMISSION_DENIED',
          requiredPermission: permissionKey,
        })
        return
      }

      next()
    } catch {
      res.status(403).json({ message: 'Erro ao verificar permissão da sala' })
    }
  }
}

/**
 * Registra uma ação de auditoria no banco.
 */
export async function logAudit(params: {
  clinicId?: string | null
  roomId?: string | null
  userId: string
  action: string
  description?: string
  metadata?: Record<string, unknown>
}) {
  try {
    await prisma.auditLog.create({
      data: {
        clinicId: params.clinicId,
        roomId: params.roomId,
        userId: params.userId,
        action: params.action,
        description: params.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: params.metadata as any,
      },
    })
  } catch (err) {
    // Audit log failure must never block the main request
    console.error('[AUDIT] Failed to write audit log:', err)
  }
}
