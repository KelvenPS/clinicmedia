/**
 * my-rooms.ts — Endpoints para Secretária
 * GET  /api/my/rooms                        → listar salas vinculadas
 * GET  /api/my/rooms/:id                    → detalhes da sala + minhas permissões
 * GET  /api/my/rooms/:roomId/whatsapp/status → status do WhatsApp da sala
 * POST /api/my/rooms/:roomId/whatsapp/connect   → conectar (requer canConnectWhatsapp)
 * POST /api/my/rooms/:roomId/whatsapp/reconnect → reconectar (requer canReconnectWhatsapp)
 * POST /api/my/rooms/:roomId/whatsapp/disconnect → desconectar (requer canDisconnectWhatsapp)
 * GET  /api/my/rooms/:roomId/templates       → templates liberados para a sala
 * GET  /api/my/rooms/:roomId/history         → histórico (requer canViewHistory)
 */
import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { getRoomSecretaryAccess, logAudit, getEffectiveDoctorId } from '../lib/secretaryAccess'
import { startRoomSession, stopRoomSession, resetRoomSessionFiles, isRoomSessionActive } from '../lib/room-whatsapp'

const router = Router()
router.use(authenticate)
router.use(requireRole('SECRETARY', 'DOCTOR', 'ADMIN'))

// ─── Helper: validar acesso da secretária à sala ──────────────────────────────

async function assertRoomAccess(req: AuthRequest, res: { status: (n: number) => { json: (d: unknown) => void } }, roomId: string) {
  if (req.user!.role === 'SECRETARY') {
    const access = await getRoomSecretaryAccess(req.user!.userId, roomId)
    if (!access) {
      res.status(403).json({ message: 'Você não tem acesso a esta sala', code: 'ROOM_ACCESS_DENIED' })
      return false
    }
    return access
  }

  if (req.user!.role === 'DOCTOR') {
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    if (effectiveDoctorId) {
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { doctorId: true } })
      if (!room || room.doctorId !== effectiveDoctorId) {
        res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.', code: 'ROOM_ACCESS_DENIED' })
        return false
      }
    }
  }

  return true // ADMIN passa direto
}

// ─── GET /my/rooms — lista salas vinculadas ───────────────────────────────────

router.get('/', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'SECRETARY') {
      const assignments = await prisma.roomSecretary.findMany({
        where: { secretaryId: req.user!.userId, active: true, room: { active: true } },
        include: {
          room: {
            include: {
              doctor: { select: { id: true, name: true, specialty: true } },
              whatsappConnection: {
                select: { id: true, status: true, phoneNumber: true, displayName: true, connectedAt: true },
              },
            },
          },
        },
      })

      const result = assignments.map(a => ({
        ...a.room,
        myPermissions: {
          canViewSchedule: a.canViewSchedule,
          canManageWhatsapp: a.canManageWhatsapp,
          canConnectWhatsapp: a.canConnectWhatsapp,
          canReconnectWhatsapp: a.canReconnectWhatsapp,
          canDisconnectWhatsapp: a.canDisconnectWhatsapp,
          canSendMessages: a.canSendMessages,
          canUseTemplates: a.canUseTemplates,
          canUseAutomaticMessages: a.canUseAutomaticMessages,
          canViewHistory: a.canViewHistory,
        },
      }))

      return res.json(result)
    }

    // DOCTOR / ADMIN: retornar as próprias salas com conexão WhatsApp
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const where = effectiveDoctorId ? { doctorId: effectiveDoctorId } : {}

    const rooms = await prisma.room.findMany({
      where,
      include: {
        secretaries: {
          include: { secretary: { select: { id: true, name: true, email: true } } },
        },
        whatsappConnection: {
          select: { id: true, status: true, phoneNumber: true, displayName: true, connectedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return res.json(rooms)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /my/rooms/:id — detalhes da sala ────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const access = await assertRoomAccess(req, res, id)
    if (!access) return

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, name: true, specialty: true } },
        whatsappConnection: true,
        secretaries: {
          where: req.user!.role === 'SECRETARY' ? { secretaryId: req.user!.userId } : undefined,
          include: { secretary: { select: { id: true, name: true, email: true } } },
        },
      },
    })

    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })

    const myPerms = req.user!.role === 'SECRETARY' && typeof access === 'object' ? {
      canViewSchedule: (access as { canViewSchedule: boolean }).canViewSchedule,
      canManageWhatsapp: (access as { canManageWhatsapp: boolean }).canManageWhatsapp,
      canConnectWhatsapp: (access as { canConnectWhatsapp: boolean }).canConnectWhatsapp,
      canReconnectWhatsapp: (access as { canReconnectWhatsapp: boolean }).canReconnectWhatsapp,
      canDisconnectWhatsapp: (access as { canDisconnectWhatsapp: boolean }).canDisconnectWhatsapp,
      canSendMessages: (access as { canSendMessages: boolean }).canSendMessages,
      canUseTemplates: (access as { canUseTemplates: boolean }).canUseTemplates,
      canUseAutomaticMessages: (access as { canUseAutomaticMessages: boolean }).canUseAutomaticMessages,
      canViewHistory: (access as { canViewHistory: boolean }).canViewHistory,
    } : null

    res.json({ ...room, myPermissions: myPerms })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /my/rooms/:roomId/whatsapp/status ────────────────────────────────────

router.get('/:roomId/whatsapp/status', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    const connection = await prisma.roomWhatsAppConnection.findUnique({ where: { roomId } })
    if (!connection) {
      return res.json({ status: 'DISCONNECTED', roomId, connected: false })
    }

    const activeInMemory = isRoomSessionActive(connection.instanceKey)

    res.json({
      id: connection.id,
      roomId,
      status: activeInMemory ? connection.status : 'DISCONNECTED',
      phoneNumber: connection.phoneNumber,
      displayName: connection.displayName,
      connectedAt: connection.connectedAt,
      disconnectedAt: connection.disconnectedAt,
      lastSyncAt: connection.lastSyncAt,
      qrCode: connection.status === 'CONNECTING' ? connection.qrCode : null,
      qrCodeExpiresAt: connection.qrCodeExpiresAt,
      connected: activeInMemory && connection.status === 'CONNECTED',
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /my/rooms/:roomId/whatsapp/connect ──────────────────────────────────

router.post('/:roomId/whatsapp/connect', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    // Checar permissão canConnectWhatsapp para secretária
    if (req.user!.role === 'SECRETARY' && typeof access === 'object') {
      if (!access.canConnectWhatsapp) {
        return res.status(403).json({
          message: 'Você não tem permissão para conectar WhatsApp nesta sala',
          code: 'ROOM_PERMISSION_DENIED',
          requiredPermission: 'canConnectWhatsapp',
        })
      }
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { whatsappConnection: true },
    })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })

    // Criar ou reutilizar conexão existente
    let connection = room.whatsappConnection
    if (!connection) {
      connection = await prisma.roomWhatsAppConnection.create({
        data: {
          roomId,
          doctorId: room.doctorId,
          connectedByUserId: req.user!.userId,
        },
      })
    } else if (connection.status === 'CONNECTED' || connection.status === 'CONNECTING') {
      return res.status(409).json({ message: 'WhatsApp já está conectado ou em processo de conexão nesta sala' })
    } else {
      // Atualizar quem está conectando
      await prisma.roomWhatsAppConnection.update({
        where: { id: connection.id },
        data: { connectedByUserId: req.user!.userId },
      })
    }

    // Resetar arquivos de sessão para forçar novo QR
    resetRoomSessionFiles(connection.instanceKey)

    // Iniciar sessão em background
    startRoomSession(connection.id, connection.instanceKey).catch(err =>
      console.error('[ROOM_WA] connect failed:', err)
    )

    await logAudit({
      clinicId: room.doctorId,
      roomId,
      userId: req.user!.userId,
      action: 'WHATSAPP_CONNECT',
      description: `Solicitação de conexão WhatsApp para sala ${room.name}`,
    })

    res.json({ message: 'Iniciando conexão WhatsApp. Aguarde o QR Code.', connectionId: connection.id })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /my/rooms/:roomId/whatsapp/reconnect ───────────────────────────────

router.post('/:roomId/whatsapp/reconnect', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    if (req.user!.role === 'SECRETARY' && typeof access === 'object') {
      if (!access.canReconnectWhatsapp) {
        return res.status(403).json({
          message: 'Você não tem permissão para reconectar WhatsApp nesta sala',
          code: 'ROOM_PERMISSION_DENIED',
          requiredPermission: 'canReconnectWhatsapp',
        })
      }
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { whatsappConnection: true },
    })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (!room.whatsappConnection) {
      return res.status(404).json({ message: 'Nenhuma conexão WhatsApp encontrada para esta sala' })
    }

    const { instanceKey, id: connectionId } = room.whatsappConnection

    // Parar sessão existente e reconectar
    await stopRoomSession(instanceKey, false)
    await prisma.roomWhatsAppConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date(), connectedByUserId: req.user!.userId },
    })

    startRoomSession(connectionId, instanceKey).catch(err =>
      console.error('[ROOM_WA] reconnect failed:', err)
    )

    await logAudit({
      clinicId: room.doctorId,
      roomId,
      userId: req.user!.userId,
      action: 'WHATSAPP_RECONNECT',
      description: `Reconexão WhatsApp para sala ${room.name}`,
    })

    res.json({ message: 'Reconectando WhatsApp da sala...' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /my/rooms/:roomId/whatsapp/disconnect ──────────────────────────────

router.post('/:roomId/whatsapp/disconnect', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    if (req.user!.role === 'SECRETARY' && typeof access === 'object') {
      if (!access.canDisconnectWhatsapp) {
        return res.status(403).json({
          message: 'Você não tem permissão para desconectar WhatsApp nesta sala',
          code: 'ROOM_PERMISSION_DENIED',
          requiredPermission: 'canDisconnectWhatsapp',
        })
      }
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { whatsappConnection: true },
    })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (!room.whatsappConnection) {
      return res.status(404).json({ message: 'Nenhuma conexão WhatsApp encontrada para esta sala' })
    }

    const { instanceKey, id: connectionId } = room.whatsappConnection

    await stopRoomSession(instanceKey, true)
    resetRoomSessionFiles(instanceKey)

    await prisma.roomWhatsAppConnection.update({
      where: { id: connectionId },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        disconnectedAt: new Date(),
        reconnectAttempts: 0,
      },
    })

    await logAudit({
      clinicId: room.doctorId,
      roomId,
      userId: req.user!.userId,
      action: 'WHATSAPP_DISCONNECT',
      description: `Desconexão WhatsApp para sala ${room.name}`,
    })

    res.json({ message: 'WhatsApp da sala desconectado com sucesso.' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /my/rooms/:roomId/templates ─────────────────────────────────────────

router.get('/:roomId/templates', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    if (req.user!.role === 'SECRETARY' && typeof access === 'object') {
      if (!access.canUseTemplates) {
        return res.status(403).json({ message: 'Sem permissão para acessar templates desta sala', code: 'ROOM_PERMISSION_DENIED' })
      }
    }

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { doctorId: true } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })

    const templates = await prisma.lightTemplate.findMany({
      where: { doctorId: room.doctorId, active: true },
      orderBy: { name: 'asc' },
    })

    res.json(templates)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /my/rooms/:roomId/history ───────────────────────────────────────────

router.get('/:roomId/history', async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const access = await assertRoomAccess(req, res, roomId)
    if (!access) return

    if (req.user!.role === 'SECRETARY' && typeof access === 'object') {
      if (!access.canViewHistory) {
        return res.status(403).json({ message: 'Sem permissão para ver histórico desta sala', code: 'ROOM_PERMISSION_DENIED' })
      }
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')))
    const skip = (page - 1) * limit

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: { roomId } }),
    ])

    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
