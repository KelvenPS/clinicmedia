import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { createNotification } from './notifications'
import { fireWebhooks } from '../lib/webhook'

import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

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
  isBlocked: z.boolean().optional(),
  roomId: z.string().optional().nullable(),
  repeatCount: z.number().int().min(1).max(50).optional(),
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

      // Secretaries assigned to specific rooms only see appointments from those rooms.
      const roomAssignments = await prisma.roomSecretary.findMany({
        where: { secretaryId: req.user!.userId },
        select: { roomId: true },
      })
      if (roomAssignments.length > 0) {
        where.roomId = { in: roomAssignments.map(r => r.roomId) }
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
        room: { select: { id: true, name: true, logradouro: true, cidade: true } },
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
    const { repeatCount, ...apptData } = data

    // When blocked, disallow replication — force single occurrence
    const effectiveRepeatCount = apptData.isBlocked ? 1 : (repeatCount && repeatCount > 1 ? repeatCount : 1)

    // Empty string roomId from the frontend form (hidden selector) must be null, not ''.
    // An empty string fails the FK constraint since no Room has id=''.
    if (apptData.roomId === '') apptData.roomId = null

    // DOCTOR cannot create an appointment assigned to another professional.
    if (req.user!.role === 'DOCTOR') {
      apptData.doctorId = req.user!.userId
    }

    // SECRETARY can only create for a linked doctor.
    if (req.user!.role === 'SECRETARY') {
      const link = await prisma.doctorSecretary.findFirst({
        where: { secretaryId: req.user!.userId, doctorId: apptData.doctorId, active: true },
      })
      if (!link) {
        res.status(403).json({ message: 'Acesso negado: profissional não vinculado a esta secretária' })
        return
      }

      const roomAssignments = await prisma.roomSecretary.findMany({
        where: { secretaryId: req.user!.userId },
        select: { roomId: true },
      })
      if (roomAssignments.length > 0) {
        const allowedRoomIds = new Set(roomAssignments.map(r => r.roomId))
        if (!apptData.roomId || !allowedRoomIds.has(apptData.roomId)) {
          res.status(403).json({ message: 'Acesso negado: você não está vinculada a esta sala' })
          return
        }
      }
    }

    const baseDate = new Date(apptData.date)
    const totalOccurrences = effectiveRepeatCount

    // Build all dates: base + weekly repeats
    const dates: Date[] = []
    for (let i = 0; i < totalOccurrences; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + i * 7)
      dates.push(d)
    }

    // Secretaries cannot book over time slots the doctor has explicitly blocked.
    if (req.user!.role === 'SECRETARY' && !apptData.isBlocked) {
      const blocks = await prisma.appointmentBlock.findMany({ where: { doctorId: apptData.doctorId } })
      const durationMs = (apptData.duration ?? 30) * 60000
      const hasConflict = dates.some(d => {
        const occEnd = new Date(d.getTime() + durationMs)
        return blocks.some(b => b.date < occEnd && b.endDate > d)
      })
      if (hasConflict) {
        res.status(409).json({ message: 'Este horário está bloqueado pelo médico.' })
        return
      }
    }

    // Create all appointments in a transaction
    const created = await prisma.$transaction(
      dates.map((occDate, idx) =>
        prisma.appointment.create({
          data: {
            ...apptData,
            date: occDate,
            title: totalOccurrences > 1 && idx > 0
              ? `${apptData.title} (Retorno ${idx}/${totalOccurrences - 1})`
              : apptData.title,
            createdById: req.user!.userId,
          },
          include: {
            patient: { select: { id: true, name: true, phone: true } },
            doctor: { select: { id: true, name: true, specialty: true } },
            createdBy: { select: { id: true, name: true } },
            room: { select: { id: true, name: true, logradouro: true, cidade: true } },
          },
        })
      )
    )

    const appointment = created[0]

    if (appointment.patient?.phone) {
      const apptDateStr = appointment.date.toLocaleDateString('pt-BR')
      const apptTimeStr = appointment.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      triggerLightAutomatedMessage(appointment.doctorId, 'APPOINTMENT_CONFIRMATION', {
        patientName: appointment.patient.name,
        patientPhone: appointment.patient.phone,
        appointmentDate: apptDateStr,
        appointmentTime: apptTimeStr,
        doctorName: appointment.doctor.name,
      }).catch(err => console.error('[triggerLightAutomatedMessage CONFIRMATION error]', err))
    }

    await createNotification(
      appointment.doctorId,
      totalOccurrences > 1 ? `${totalOccurrences} agendamentos criados` : 'Novo agendamento',
      totalOccurrences > 1
        ? `${appointment.patient.name} – ${totalOccurrences} sessões semanais a partir de ${appointment.date.toLocaleDateString('pt-BR')}`
        : `${appointment.patient.name} agendou ${appointment.type || 'consulta'} para ${appointment.date.toLocaleDateString('pt-BR')}`,
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
      repeatCount: totalOccurrences,
    }).catch(() => {})

    res.status(201).json(totalOccurrences > 1 ? created : appointment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[appointments] POST /', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const appointmentUpdateSchema = z.object({
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  title: z.string().min(2).optional(),
  date: z.string().optional(),
  duration: z.number().optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  notes: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  isBlocked: z.boolean().optional(),
  roomId: z.string().optional().nullable(),
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const parsed = appointmentUpdateSchema.parse(req.body)
    const data: Record<string, unknown> = { ...parsed }

    if (data.date) data.date = new Date(data.date as string)
    if (data.roomId === '') data.roomId = null

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

    // Secretaries cannot reschedule into a time slot the doctor has explicitly blocked.
    if (req.user!.role === 'SECRETARY' && data.date && !(data.isBlocked ?? current?.isBlocked)) {
      const blocks = await prisma.appointmentBlock.findMany({ where: { doctorId: existing.doctorId } })
      const durationMs = ((data.duration as number | undefined) ?? current?.duration ?? 30) * 60000
      const newDate = data.date as Date
      const newEnd = new Date(newDate.getTime() + durationMs)
      const hasConflict = blocks.some(b => b.date < newEnd && b.endDate > newDate)
      if (hasConflict) {
        res.status(409).json({ message: 'Este horário está bloqueado pelo médico.' })
        return
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: {
          select: {
            id: true, name: true, phone: true,
            patientPlans: {
              take: 1,
              include: { healthPlan: { select: { discountPercent: true } } },
            },
          },
        },
        doctor: { select: { id: true, name: true, specialty: true } },
        room: { select: { id: true, name: true, logradouro: true, cidade: true } },
      },
    })

    const beingCompleted =
      data.status === 'COMPLETED' &&
      current?.status !== 'COMPLETED' &&
      !current?.transaction

    let transactionAmount: number | null = appointment.value ?? null

    // Fallback: se o agendamento não tem valor, busca do tipo de atendimento com repasse do plano
    if (beingCompleted && (!transactionAmount || transactionAmount <= 0) && appointment.type) {
      const appType = await prisma.appointmentType.findFirst({
        where: { name: appointment.type, doctorId: appointment.doctorId },
      })
      if (appType?.baseValue && appType.baseValue > 0) {
        const discount = appointment.patient.patientPlans?.[0]?.healthPlan?.discountPercent ?? 0
        transactionAmount = Math.round(appType.baseValue * (1 - discount / 100) * 100) / 100
      }
    }

    const completingNow = beingCompleted && transactionAmount && transactionAmount > 0

    if (completingNow) {
      await prisma.transaction.create({
        data: {
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          type: 'INCOME',
          amount: transactionAmount!,
          description: `${appointment.type || 'Consulta'} - ${appointment.patient.name}`,
          date: appointment.date,
          status: 'PAID',
          category: appointment.type || 'Consulta',
        },
      })
      await createNotification(
        appointment.doctorId,
        'Atendimento concluído',
        `${appointment.type || 'Consulta'} de ${appointment.patient.name} — R$ ${transactionAmount!.toFixed(2)} lançado no financeiro`,
        'SUCCESS',
        '/financeiro',
      )
      fireWebhooks(appointment.doctorId, 'appointment.completed', {
        id: appointment.id,
        patientName: appointment.patient.name,
        patientPhone: appointment.patient.phone,
        date: appointment.date,
        type: appointment.type,
        value: transactionAmount,
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
        room: { select: { id: true, name: true, logradouro: true, cidade: true } },
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
