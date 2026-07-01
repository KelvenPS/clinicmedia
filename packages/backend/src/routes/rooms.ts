import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { getEffectiveDoctorId, requireSecretaryPermission, logAudit } from '../lib/secretaryAccess'
import { startRoomSession, stopRoomSession, resetRoomSessionFiles, isRoomSessionActive } from '../lib/room-whatsapp'

const router = Router()
router.use(authenticate)

const roomSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  cep: z.string().optional(),
  numero: z.string().optional(),
  cidade: z.string().optional(),
  daysOfWeek: z.array(z.number().min(1).max(7)).default([]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  color: z.string().optional(),
  secretaryIds: z.array(z.string()).optional(),
})

const roomPermissionsSchema = z.object({
  canViewSchedule: z.boolean().optional(),
  canManageWhatsapp: z.boolean().optional(),
  canConnectWhatsapp: z.boolean().optional(),
  canReconnectWhatsapp: z.boolean().optional(),
  canDisconnectWhatsapp: z.boolean().optional(),
  canSendMessages: z.boolean().optional(),
  canUseTemplates: z.boolean().optional(),
  canUseAutomaticMessages: z.boolean().optional(),
  canViewHistory: z.boolean().optional(),
  active: z.boolean().optional(),
})

// ─── GET /api/rooms — my rooms ───────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'DOCTOR') {
      const rooms = await prisma.room.findMany({
        where: { doctorId: req.user!.userId, active: true },
        include: {
          secretaries: {
            where: {
              secretary: {
                secretaryOf: { some: { doctorId: req.user!.userId, active: true } }
              }
            },
            include: { secretary: { select: { id: true, name: true, email: true } } },
          },
          whatsappConnection: {
            select: { id: true, status: true, phoneNumber: true, displayName: true, connectedAt: true },
          },
        },
        orderBy: { name: 'asc' },
      })
      return res.json(rooms)
    }

    if (req.user!.role === 'SECRETARY') {
      const assignments = await prisma.roomSecretary.findMany({
        where: { secretaryId: req.user!.userId, active: true },
        include: {
          room: {
            include: {
              doctor: { select: { id: true, name: true, specialty: true } },
              whatsappConnection: {
                select: { id: true, status: true, phoneNumber: true, displayName: true },
              },
            },
          },
        },
      })
      return res.json(assignments.map(a => a.room))
    }

    // ADMIN
    const rooms = await prisma.room.findMany({
      include: {
        doctor: { select: { id: true, name: true } },
        secretaries: { include: { secretary: { select: { id: true, name: true } } } },
        whatsappConnection: { select: { id: true, status: true, phoneNumber: true } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(rooms)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

router.post('/', requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), requireSecretaryPermission('salas'), async (req: AuthRequest, res) => {
  try {
    const { secretaryIds, ...data } = roomSchema.parse(req.body)
    const doctorId = req.user!.role === 'ADMIN' ? req.body.doctorId : await getEffectiveDoctorId(req)

    const room = await prisma.room.create({
      data: {
        ...data,
        doctorId,
        secretaries: secretaryIds?.length
          ? { create: secretaryIds.map(sid => ({ secretaryId: sid })) }
          : undefined,
      },
      include: {
        secretaries: { include: { secretary: { select: { id: true, name: true, email: true } } } },
      },
    })

    await logAudit({
      clinicId: doctorId,
      roomId: room.id,
      userId: req.user!.userId,
      action: 'ROOM_CREATE',
      description: `Sala "${room.name}" criada`,
    })

    res.status(201).json(room)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PUT /api/rooms/:id ───────────────────────────────────────────────────────

router.put('/:id', requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), requireSecretaryPermission('salas'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { secretaryIds, ...data } = roomSchema.partial().parse(req.body)

    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Sala não encontrada' })

    if (effectiveDoctorId && existing.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
    }

    if (secretaryIds !== undefined && effectiveDoctorId) {
      const teamLinks = await prisma.doctorSecretary.findMany({
        where: { doctorId: effectiveDoctorId, active: true },
        select: { secretaryId: true },
      })
      const validIds = new Set(teamLinks.map(l => l.secretaryId))
      const invalid = secretaryIds.filter(sid => !validIds.has(sid))
      if (invalid.length > 0) {
        return res.status(400).json({ message: 'Secretária não pertence à sua equipe' })
      }
    }

    await prisma.room.update({ where: { id }, data })

    if (secretaryIds !== undefined) {
      // Soft merge: preserve permissions for existing secretaries, remove those not in list
      const currentLinks = await prisma.roomSecretary.findMany({ where: { roomId: id }, select: { secretaryId: true } })
      const currentIds = new Set(currentLinks.map(l => l.secretaryId))
      const newIds = new Set(secretaryIds)

      // Deactivate removed ones
      const toRemove = [...currentIds].filter(sid => !newIds.has(sid))
      if (toRemove.length > 0) {
        await prisma.roomSecretary.updateMany({
          where: { roomId: id, secretaryId: { in: toRemove } },
          data: { active: false },
        })
      }

      // Add new ones (skip duplicates)
      const toAdd = [...newIds].filter(sid => !currentIds.has(sid))
      if (toAdd.length > 0) {
        await prisma.roomSecretary.createMany({
          data: toAdd.map(sid => ({ roomId: id, secretaryId: sid })),
          skipDuplicates: true,
        })
      }

      // Reactivate if exists but was inactive
      await prisma.roomSecretary.updateMany({
        where: { roomId: id, secretaryId: { in: secretaryIds }, active: false },
        data: { active: true },
      })
    }

    const updated = await prisma.room.findUnique({
      where: { id },
      include: {
        secretaries: { include: { secretary: { select: { id: true, name: true, email: true } } } },
        whatsappConnection: { select: { id: true, status: true, phoneNumber: true, displayName: true } },
      },
    })

    await logAudit({
      clinicId: effectiveDoctorId,
      roomId: id,
      userId: req.user!.userId,
      action: 'ROOM_UPDATE',
      description: `Sala "${existing.name}" atualizada`,
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PATCH /api/rooms/:id/toggle ─────────────────────────────────────────────

router.patch('/:id/toggle', requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), requireSecretaryPermission('salas'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const current = await prisma.room.findUnique({ where: { id } })
    if (!current) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && current.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
    }
    const room = await prisma.room.update({ where: { id }, data: { active: !current.active } })
    res.json(room)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── DELETE /api/rooms/:id ────────────────────────────────────────────────────

router.delete('/:id', requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), requireSecretaryPermission('salas'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const existing = await prisma.room.findUnique({ where: { id }, include: { whatsappConnection: true } })
    if (!existing) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && existing.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
    }

    // Desconectar WhatsApp da sala antes de deletar
    if (existing.whatsappConnection) {
      await stopRoomSession(existing.whatsappConnection.instanceKey, true)
      resetRoomSessionFiles(existing.whatsappConnection.instanceKey)
    }

    await prisma.room.delete({ where: { id } })
    res.json({ message: 'Sala removida com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /api/rooms/:id/users — secretárias vinculadas com permissões ─────────

router.get('/:id/users', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const secretaries = await prisma.roomSecretary.findMany({
      where: { roomId: id },
      include: { secretary: { select: { id: true, name: true, email: true, phone: true, active: true } } },
    })

    res.json(secretaries)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PUT /api/rooms/:id/users/:userId/permissions ─────────────────────────────

router.put('/:id/users/:userId/permissions', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id: roomId, userId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)

    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const perms = roomPermissionsSchema.parse(req.body)

    const updated = await prisma.roomSecretary.update({
      where: { roomId_secretaryId: { roomId, secretaryId: userId } },
      data: perms,
      include: { secretary: { select: { id: true, name: true, email: true } } },
    })

    await logAudit({
      clinicId: effectiveDoctorId,
      roomId,
      userId: req.user!.userId,
      action: 'ROOM_PERMISSIONS_UPDATE',
      description: `Permissões da secretária ${updated.secretary.name} atualizadas na sala ${room.name}`,
      metadata: { targetUserId: userId, permissions: perms },
    })

    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── DELETE /api/rooms/:id/users/:userId — remover secretária da sala ─────────

router.delete('/:id/users/:userId', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id: roomId, userId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    await prisma.roomSecretary.update({
      where: { roomId_secretaryId: { roomId, secretaryId: userId } },
      data: { active: false },
    })

    res.json({ message: 'Secretária desvinculada da sala' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /api/rooms/:roomId/whatsapp/status ───────────────────────────────────

router.get('/:roomId/whatsapp/status', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { whatsappConnection: true } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const connection = room.whatsappConnection
    if (!connection) return res.json({ status: 'DISCONNECTED', roomId, connected: false })

    const activeInMemory = isRoomSessionActive(connection.instanceKey)

    const effectiveStatus =
      connection.status === 'CONNECTING' ? 'CONNECTING' :
      connection.status === 'CONNECTED' && activeInMemory ? 'CONNECTED' :
      connection.status === 'CONNECTED' && !activeInMemory ? 'RECONNECTING' :
      'DISCONNECTED'

    res.json({
      id: connection.id,
      roomId,
      status: effectiveStatus,
      phoneNumber: connection.phoneNumber,
      displayName: connection.displayName,
      connectedAt: connection.connectedAt,
      disconnectedAt: connection.disconnectedAt,
      lastSyncAt: connection.lastSyncAt,
      qrCode: connection.status === 'CONNECTING' ? connection.qrCode : null,
      qrCodeExpiresAt: connection.qrCodeExpiresAt,
      connected: activeInMemory && connection.status === 'CONNECTED',
      connectedByUserId: connection.connectedByUserId,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /api/rooms/:roomId/whatsapp/connect ─────────────────────────────────

router.post('/:roomId/whatsapp/connect', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { whatsappConnection: true } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    let connection = room.whatsappConnection
    if (!connection) {
      connection = await prisma.roomWhatsAppConnection.create({
        data: { roomId, doctorId: room.doctorId, connectedByUserId: req.user!.userId },
      })
    } else if (connection.status === 'CONNECTED' || connection.status === 'CONNECTING') {
      return res.status(409).json({ message: 'WhatsApp já está conectado ou em processo de conexão nesta sala' })
    }

    resetRoomSessionFiles(connection.instanceKey)
    startRoomSession(connection.id, connection.instanceKey).catch(err =>
      console.error('[ROOM_WA] connect failed:', err)
    )

    await logAudit({
      clinicId: room.doctorId,
      roomId,
      userId: req.user!.userId,
      action: 'WHATSAPP_CONNECT',
      description: `Conexão WhatsApp iniciada pelo médico para sala ${room.name}`,
    })

    res.json({ message: 'Conexão iniciada. Aguarde o QR Code.', connectionId: connection.id })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /api/rooms/:roomId/whatsapp/reconnect ───────────────────────────────

router.post('/:roomId/whatsapp/reconnect', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { whatsappConnection: true } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }
    if (!room.whatsappConnection) {
      return res.status(404).json({ message: 'Nenhuma conexão WhatsApp para esta sala' })
    }

    const { instanceKey, id: connectionId } = room.whatsappConnection
    await stopRoomSession(instanceKey, false)
    startRoomSession(connectionId, instanceKey).catch(console.error)

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

// ─── POST /api/rooms/:roomId/whatsapp/disconnect ──────────────────────────────

router.post('/:roomId/whatsapp/disconnect', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { whatsappConnection: true } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }
    if (!room.whatsappConnection) {
      return res.status(404).json({ message: 'Nenhuma conexão WhatsApp para esta sala' })
    }

    const { instanceKey, id: connectionId } = room.whatsappConnection
    await stopRoomSession(instanceKey, true)
    resetRoomSessionFiles(instanceKey)

    await prisma.roomWhatsAppConnection.update({
      where: { id: connectionId },
      data: { status: 'DISCONNECTED', qrCode: null, disconnectedAt: new Date(), reconnectAttempts: 0 },
    })

    await logAudit({
      clinicId: room.doctorId,
      roomId,
      userId: req.user!.userId,
      action: 'WHATSAPP_DISCONNECT',
      description: `WhatsApp desconectado pelo médico para sala ${room.name}`,
    })

    res.json({ message: 'WhatsApp da sala desconectado.' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /api/rooms/:roomId/audit — histórico de ações da sala ─────────────

router.get('/:roomId/audit', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { roomId } = req.params
    const effectiveDoctorId = await getEffectiveDoctorId(req)
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room) return res.status(404).json({ message: 'Sala não encontrada' })
    if (effectiveDoctorId && room.doctorId !== effectiveDoctorId) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1')))
    const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')))

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { roomId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
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
