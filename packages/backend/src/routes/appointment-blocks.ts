import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const blockSchema = z.object({
  date: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
  doctorId: z.string().optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, doctorId } = req.query as Record<string, string>

    const where: Record<string, unknown> = {}

    if (req.user!.role === 'DOCTOR') {
      where.doctorId = req.user!.userId
    } else if (req.user!.role === 'SECRETARY') {
      const links = await prisma.doctorSecretary.findMany({
        where: { secretaryId: req.user!.userId, active: true },
        select: { doctorId: true },
      })
      const linkedIds = links.map(l => l.doctorId)
      if (linkedIds.length === 0) {
        res.json([])
        return
      }
      if (doctorId && linkedIds.includes(doctorId)) {
        where.doctorId = doctorId
      } else {
        where.doctorId = { in: linkedIds }
      }
    } else if (doctorId) {
      where.doctorId = doctorId
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const blocks = await prisma.appointmentBlock.findMany({
      where,
      include: {
        doctor: { select: { id: true, name: true, specialty: true } },
      },
      orderBy: { date: 'asc' },
    })

    res.json(blocks)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { date, endDate, reason, doctorId } = blockSchema.parse(req.body)

    const resolvedDoctorId =
      req.user!.role === 'ADMIN' && doctorId ? doctorId : req.user!.userId

    const block = await prisma.appointmentBlock.create({
      data: {
        doctorId: resolvedDoctorId,
        date: new Date(date),
        endDate: new Date(endDate),
        reason,
      },
      include: {
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    })

    res.status(201).json(block)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const block = await prisma.appointmentBlock.findUnique({ where: { id } })
    if (!block) {
      res.status(404).json({ message: 'Bloqueio não encontrado' })
      return
    }

    if (req.user!.role !== 'ADMIN' && block.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Sem permissão para remover este bloqueio' })
      return
    }

    await prisma.appointmentBlock.delete({ where: { id } })
    res.json({ message: 'Bloqueio removido' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
