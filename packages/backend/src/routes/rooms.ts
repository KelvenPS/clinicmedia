import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const roomSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  daysOfWeek: z.array(z.number().min(1).max(7)).default([]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  color: z.string().optional(),
  secretaryIds: z.array(z.string()).optional(),
})

// GET /api/rooms — my rooms (doctor: own; secretary: assigned)
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'DOCTOR') {
      const rooms = await prisma.room.findMany({
        where: { doctorId: req.user!.userId, active: true },
        include: {
          secretaries: {
            where: {
              secretary: {
                secretaryOf: {
                  some: { doctorId: req.user!.userId, active: true }
                }
              }
            },
            include: { secretary: { select: { id: true, name: true, email: true } } }
          },
        },
        orderBy: { name: 'asc' },
      })
      res.json(rooms)
    } else if (req.user!.role === 'SECRETARY') {
      const assignments = await prisma.roomSecretary.findMany({
        where: { secretaryId: req.user!.userId },
        include: {
          room: {
            include: {
              doctor: { select: { id: true, name: true, specialty: true } },
            },
          },
        },
      })
      res.json(assignments.map(a => a.room))
    } else {
      const rooms = await prisma.room.findMany({
        include: {
          doctor: { select: { id: true, name: true } },
          secretaries: { include: { secretary: { select: { id: true, name: true } } } },
        },
        orderBy: { name: 'asc' },
      })
      res.json(rooms)
    }
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { secretaryIds, ...data } = roomSchema.parse(req.body)
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : req.body.doctorId

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

    res.status(201).json(room)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { secretaryIds, ...data } = roomSchema.partial().parse(req.body)

    // Ownership check: DOCTOR can only edit their own rooms
    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Sala não encontrada' })
      return
    }
    if (req.user!.role === 'DOCTOR' && existing.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
      return
    }

    if (secretaryIds !== undefined && req.user!.role === 'DOCTOR') {
      const teamLinks = await prisma.doctorSecretary.findMany({
        where: { doctorId: req.user!.userId, active: true },
        select: { secretaryId: true }
      })
      const validIds = new Set(teamLinks.map(l => l.secretaryId))
      const invalid = secretaryIds.filter(id => !validIds.has(id))
      if (invalid.length > 0) {
        res.status(400).json({ message: 'Secretária não pertence à sua equipe' })
        return
      }
    }

    const room = await prisma.room.update({
      where: { id },
      data,
    })

    if (secretaryIds !== undefined) {
      await prisma.roomSecretary.deleteMany({ where: { roomId: id } })
      if (secretaryIds.length > 0) {
        await prisma.roomSecretary.createMany({
          data: secretaryIds.map(sid => ({ roomId: id, secretaryId: sid })),
          skipDuplicates: true,
        })
      }
    }

    const updated = await prisma.room.findUnique({
      where: { id },
      include: {
        secretaries: { include: { secretary: { select: { id: true, name: true, email: true } } } },
      },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const current = await prisma.room.findUnique({ where: { id } })
    if (!current) { res.status(404).json({ message: 'Sala não encontrada' }); return }
    if (req.user!.role === 'DOCTOR' && current.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
      return
    }
    const room = await prisma.room.update({ where: { id }, data: { active: !current.active } })
    res.json(room)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Sala não encontrada' })
      return
    }
    if (req.user!.role === 'DOCTOR' && existing.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Acesso negado. Esta sala pertence a outro médico.' })
      return
    }
    await prisma.room.delete({ where: { id } })
    res.json({ message: 'Sala removida com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
