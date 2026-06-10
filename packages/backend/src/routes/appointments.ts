import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { createNotification } from './notifications'
import { fireWebhooks } from '../lib/webhook'

const router = Router()
router.use(authenticate)

const appointmentSchema = z.object({
  patientId: z.string(),
  doctorId: z.string(),
  title: z.string().min(2),
  date: z.string(),
  duration: z.number().default(30),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  notes: z.string().optional(),
  type: z.string().optional(),
  value: z.number().optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { doctorId, startDate, endDate, status } = req.query

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
      if (doctorId && linkedIds.includes(doctorId as string)) {
        where.doctorId = doctorId as string
      } else {
        where.doctorId = { in: linkedIds }
      }
    } else if (doctorId) {
      where.doctorId = doctorId as string
    }

    if (status) where.status = status

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true, crm: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    })

    res.json(appointments)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = appointmentSchema.parse(req.body)

    // DOCTOR cannot create an appointment assigned to another professional.
    // Override doctorId to enforce tenant isolation regardless of body payload.
    if (req.user!.role === 'DOCTOR') {
      data.doctorId = req.user!.userId
    }

    // SECRETARY can only create for a linked doctor.
    if (req.user!.role === 'SECRETARY') {
      const link = await prisma.doctorSecretary.findFirst({
        where: { secretaryId: req.user!.userId, doctorId: data.doctorId, active: true },
      })
      if (!link) {
        res.status(403).json({ message: 'Acesso negado: profissional não vinculado a esta secretária' })
        return
      }
    }

    const appointment = await prisma.appointment.create({
      data: {
        ...data,
        date: new Date(data.date),
        createdById: req.user!.userId,
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    await createNotification(
      appointment.doctorId,
      'Novo agendamento',
      `${appointment.patient.name} agendou ${appointment.type || 'consulta'} para ${appointment.date.toLocaleDateString('pt-BR')}`,
      'INFO',
    )

    fireWebhooks(appointment.doctorId, 'appointment.created', {
      id: appointment.id,
      patientName: appointment.patient.name,
      patientPhone: appointment.patient.phone,
      doctorName: appointment.doctor.name,
      date: appointment.date,
      type: appointment.type,
      status: appointment.status,
      value: appointment.value,
    }).catch(() => {})

    res.status(201).json(appointment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[appointments] POST /', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const data = { ...req.body }

    if (data.date) data.date = new Date(data.date)

    const existing = await prisma.appointment.findUnique({ where: { id }, select: { doctorId: true } })
    if (!existing) {
      res.status(404).json({ message: 'Agendamento não encontrado' })
      return
    }
    if (req.user!.role !== 'ADMIN' && existing.doctorId !== req.user!.userId) {
      if (req.user!.role === 'SECRETARY') {
        const link = await prisma.doctorSecretary.findFirst({
          where: { secretaryId: req.user!.userId, doctorId: existing.doctorId, active: true }
        })
        if (!link) { res.status(403).json({ message: 'Acesso negado' }); return }
      } else {
        res.status(403).json({ message: 'Acesso negado' })
        return
      }
    }

    const current = await prisma.appointment.findUnique({
      where: { id },
      include: { transaction: true },
    })

    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    })

    const completingNow =
      data.status === 'COMPLETED' &&
      current?.status !== 'COMPLETED' &&
      !current?.transaction &&
      appointment.value &&
      appointment.value > 0

    if (completingNow) {
      await prisma.transaction.create({
        data: {
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          type: 'INCOME',
          amount: appointment.value!,
          description: `${appointment.type || 'Consulta'} - ${appointment.patient.name}`,
          date: appointment.date,
          status: 'PAID',
          category: appointment.type || 'Consulta',
        },
      })
      await createNotification(
        appointment.doctorId,
        'Atendimento concluído',
        `${appointment.type || 'Consulta'} de ${appointment.patient.name} — R$ ${appointment.value!.toFixed(2)} lançado no financeiro`,
        'SUCCESS',
        '/financeiro',
      )
      fireWebhooks(appointment.doctorId, 'appointment.completed', {
        id: appointment.id,
        patientName: appointment.patient.name,
        patientPhone: appointment.patient.phone,
        date: appointment.date,
        type: appointment.type,
        value: appointment.value,
      }).catch(() => {})
    }

    if (data.status === 'CANCELLED' && current?.status !== 'CANCELLED') {
      fireWebhooks(appointment.doctorId, 'appointment.cancelled', {
        id: appointment.id,
        patientName: appointment.patient.name,
        date: appointment.date,
        type: appointment.type,
      }).catch(() => {})
    }

    if (data.status && !completingNow && data.status !== 'CANCELLED') {
      fireWebhooks(appointment.doctorId, 'appointment.updated', {
        id: appointment.id,
        patientName: appointment.patient.name,
        date: appointment.date,
        status: appointment.status,
      }).catch(() => {})
    }

    res.json(appointment)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.appointment.findUnique({ where: { id }, select: { doctorId: true } })
    if (!existing) {
      res.status(404).json({ message: 'Agendamento não encontrado' })
      return
    }
    if (req.user!.role !== 'ADMIN' && existing.doctorId !== req.user!.userId) {
      if (req.user!.role === 'SECRETARY') {
        const link = await prisma.doctorSecretary.findFirst({
          where: { secretaryId: req.user!.userId, doctorId: existing.doctorId, active: true }
        })
        if (!link) { res.status(403).json({ message: 'Acesso negado' }); return }
      } else {
        res.status(403).json({ message: 'Acesso negado' })
        return
      }
    }

    await prisma.appointment.delete({ where: { id } })
    res.json({ message: 'Agendamento removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/today', async (req: AuthRequest, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const where: Record<string, unknown> = {
      date: { gte: today, lt: tomorrow },
    }

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
      where.doctorId = { in: linkedIds }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
      orderBy: { date: 'asc' },
    })

    res.json(appointments)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // null = ADMIN (sem filtro), [] = secretaria sem médico (retorna 0)
    let doctorIds: string[] | null = null
    if (req.user!.role === 'DOCTOR') {
      doctorIds = [req.user!.userId]
    } else if (req.user!.role === 'SECRETARY') {
      const links = await prisma.doctorSecretary.findMany({
        where: { secretaryId: req.user!.userId, active: true },
        select: { doctorId: true },
      })
      doctorIds = links.map(l => l.doctorId)
    }

    const apptWhere =
      doctorIds === null ? {} :
      doctorIds.length === 0 ? { doctorId: '__none__' } :
      doctorIds.length === 1 ? { doctorId: doctorIds[0] } :
      { doctorId: { in: doctorIds } }

    const patientWhere: Record<string, unknown> = { active: true }
    if (doctorIds !== null) {
      patientWhere.doctorId =
        doctorIds.length === 0 ? '__none__' :
        doctorIds.length === 1 ? doctorIds[0] :
        { in: doctorIds }
    }

    const [todayTotal, todayCompleted, todayScheduled, totalPatients] = await Promise.all([
      prisma.appointment.count({ where: { ...apptWhere, date: { gte: today, lt: tomorrow } } }),
      prisma.appointment.count({ where: { ...apptWhere, date: { gte: today, lt: tomorrow }, status: 'COMPLETED' } }),
      prisma.appointment.count({ where: { ...apptWhere, date: { gte: today, lt: tomorrow }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
      prisma.patient.count({ where: patientWhere }),
    ])

    res.json({ todayTotal, todayCompleted, todayScheduled, totalPatients })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
