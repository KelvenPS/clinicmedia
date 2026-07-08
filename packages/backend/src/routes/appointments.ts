import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { createNotification } from './notifications'
import { fireWebhooks } from '../lib/webhook'

import { triggerLightAutomatedMessage, sendLightMessage } from '../lib/chatbot-light-engine'
import { tryRoomWhatsAppConfirmation } from '../lib/room-whatsapp'
import { resolveContextFromAppointment, resolveTemplateVariables } from '../lib/chatbot-light-variables'

const BR_TZ = 'America/Sao_Paulo'

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
  forceOverlap: z.boolean().optional(),
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
        patient: { select: { id: true, name: true, phone: true, status: true } },
        doctor: { select: { id: true, name: true, specialty: true, crm: true } },
        createdBy: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, logradouro: true, cidade: true } },
        transaction: { select: { id: true } },
      },
      orderBy: { date: 'asc' },
    })

    res.json(appointments)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

async function checkLunchOverlap(doctorId: string, date: Date, duration: number): Promise<boolean> {
  const doctor = await prisma.user.findUnique({
    where: { id: doctorId },
    select: { lunchStart: true, lunchEnd: true }
  })
  if (!doctor || !doctor.lunchStart || !doctor.lunchEnd) {
    return false
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    map[part.type] = part.value
  }
  
  const apptStartMins = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10)
  const apptEndMins = apptStartMins + duration

  const [lStartH, lStartM] = doctor.lunchStart.split(':').map(Number)
  const [lEndH, lEndM] = doctor.lunchEnd.split(':').map(Number)
  const lunchStartMins = lStartH * 60 + lStartM
  const lunchEndMins = lEndH * 60 + lEndM
  
  return apptStartMins < lunchEndMins && apptEndMins > lunchStartMins
}

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = appointmentSchema.parse(req.body)
    const { repeatCount, forceOverlap, ...apptData } = data

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
        if (!apptData.roomId) {
          apptData.roomId = roomAssignments[0].roomId
        } else if (!allowedRoomIds.has(apptData.roomId)) {
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

    if (!apptData.isBlocked) {
      const duration = apptData.duration ?? 30
      for (const d of dates) {
        const isOverlap = await checkLunchOverlap(apptData.doctorId, d, duration)
        if (isOverlap) {
          res.status(409).json({ message: 'Este horário está reservado para o almoço do profissional.' })
          return
        }
      }
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

    // Overlap validation
    if (!apptData.isBlocked && !forceOverlap) {
      const durationMs = (apptData.duration ?? 30) * 60000
      
      const existingAppts = await prisma.appointment.findMany({
        where: {
          doctorId: apptData.doctorId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          date: {
            gte: new Date(dates[0].getTime() - 24 * 60 * 60000),
            lte: new Date(dates[dates.length - 1].getTime() + 24 * 60 * 60000),
          }
        },
        select: { date: true, duration: true }
      })

      let hasOverlap = false
      for (const d of dates) {
        const start1 = d.getTime()
        const end1 = start1 + durationMs
        for (const existing of existingAppts) {
          const start2 = existing.date.getTime()
          const end2 = start2 + (existing.duration * 60000)
          if (start1 < end2 && end1 > start2) {
            hasOverlap = true
            break
          }
        }
        if (hasOverlap) break
      }

      if (hasOverlap) {
        res.status(409).json({ code: 'OVERLAP_WARNING', message: 'O horário de agendamento vai impactar o próximo atendimento. Confirma?' })
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
            patient: { select: { id: true, name: true, phone: true, status: true } },
            doctor: { select: { id: true, name: true, specialty: true } },
            createdBy: { select: { id: true, name: true } },
            room: { select: { id: true, name: true, logradouro: true, bairro: true, numero: true, cidade: true, address: true } },
          },
        })
      )
    )

    const appointment = created[0]

    if (appointment.patient?.phone) {
      // Resolve full template context (all variables: {nome}, {data}, {hora},
      // {medico}, {endereco}, {clinica}, {especialidade}, {valor}, etc.)
      const apptCtx = await resolveContextFromAppointment(appointment.id, prisma)
      const fullCtx = {
        ...apptCtx,
        patientPhone: appointment.patient.phone,
        doctorId: appointment.doctorId,
      }

      // Try room WhatsApp first — only sends if an active config is found
      const roomWaSent = appointment.roomId
        ? await tryRoomWhatsAppConfirmation(appointment.roomId, appointment.id, fullCtx).catch(() => false)
        : false

      // Fall back to chatbot-light engine if room WA didn't send
      if (!roomWaSent) {
        triggerLightAutomatedMessage(appointment.doctorId, 'APPOINTMENT_CONFIRMATION', fullCtx)
          .catch(err => console.error('[triggerLightAutomatedMessage CONFIRMATION error]', err))
      }
    }

    await createNotification(
      appointment.doctorId,
      totalOccurrences > 1 ? `${totalOccurrences} agendamentos criados` : 'Novo agendamento',
      totalOccurrences > 1
        ? `${appointment.patient.name} – ${totalOccurrences} sessões semanais a partir de ${appointment.date.toLocaleDateString('pt-BR', { timeZone: BR_TZ })}`
        : `${appointment.patient.name} agendou ${appointment.type || 'consulta'} para ${appointment.date.toLocaleDateString('pt-BR', { timeZone: BR_TZ })}`,
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
  forceOverlap: z.boolean().optional(),
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const parsed = appointmentUpdateSchema.parse(req.body)
    const { forceOverlap, ...parsedData } = parsed
    const data: Record<string, unknown> = { ...parsedData }

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

        if ('roomId' in data) {
          const roomAssignments = await prisma.roomSecretary.findMany({
            where: { secretaryId: req.user!.userId },
            select: { roomId: true },
          })
          if (roomAssignments.length > 0) {
            const allowedRoomIds = new Set(roomAssignments.map(r => r.roomId))
            if (!data.roomId) {
               data.roomId = roomAssignments[0].roomId
            } else if (!allowedRoomIds.has(data.roomId as string)) {
               res.status(403).json({ message: 'Acesso negado: você não está vinculada a esta sala' })
               return
            }
          }
        }
      } else {
        res.status(403).json({ message: 'Acesso negado' })
        return
      }
    }

    const current = await prisma.appointment.findUnique({
      where: { id },
      include: { transaction: true },
    })

    if (!(data.isBlocked ?? current?.isBlocked)) {
      const newDate = data.date ? (data.date as Date) : (current?.date ?? new Date())
      const duration = ((data.duration as number | undefined) ?? current?.duration ?? 30)
      const isOverlap = await checkLunchOverlap(existing.doctorId, newDate, duration)
      if (isOverlap) {
        res.status(409).json({ message: 'Este horário está reservado para o almoço do profissional.' })
        return
      }
    }

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

    // Overlap validation
    if (!(data.isBlocked ?? current?.isBlocked) && !forceOverlap) {
      const durationMs = ((data.duration as number | undefined) ?? current?.duration ?? 30) * 60000
      const newDate = data.date ? (data.date as Date) : (current?.date ?? new Date())

      const existingAppts = await prisma.appointment.findMany({
        where: {
          doctorId: existing.doctorId,
          id: { not: id },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          date: {
            gte: new Date(newDate.getTime() - 24 * 60 * 60000),
            lte: new Date(newDate.getTime() + 24 * 60 * 60000),
          }
        },
        select: { date: true, duration: true }
      })

      const start1 = newDate.getTime()
      const end1 = start1 + durationMs
      let hasOverlap = false
      for (const ex of existingAppts) {
        const start2 = ex.date.getTime()
        const end2 = start2 + (ex.duration * 60000)
        if (start1 < end2 && end1 > start2) {
          hasOverlap = true
          break
        }
      }

      if (hasOverlap) {
        res.status(409).json({ code: 'OVERLAP_WARNING', message: 'O horário de agendamento vai impactar o próximo atendimento. Confirma?' })
        return
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: {
          select: {
            id: true, name: true, phone: true,
            patientPlans: {
              take: 1,
              select: {
                value: true,
                healthPlan: { select: { discountPercent: true, defaultValue: true } },
              },
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

    let transactionAmount: number | null = updated.value ?? null

    if (beingCompleted && (!transactionAmount || transactionAmount <= 0)) {
      const plan = updated.patient?.patientPlans?.[0]
      if (plan) {
        const discount = plan.healthPlan.discountPercent ?? 0
        const planValue = plan.value ?? plan.healthPlan.defaultValue ?? null
        if (planValue && planValue > 0) {
          transactionAmount = Math.floor(planValue * (1 - discount / 100) * 100) / 100
        }
      }
    }

    if (beingCompleted && (!transactionAmount || transactionAmount <= 0) && updated.type) {
      const appType = await prisma.appointmentType.findFirst({
        where: { name: updated.type, doctorId: updated.doctorId },
      })
      if (appType?.baseValue) {
        const plan = updated.patient?.patientPlans?.[0]
        const discount = plan?.healthPlan.discountPercent ?? 0
        transactionAmount = Math.floor(appType.baseValue * (1 - discount / 100) * 100) / 100
      }
    }

    console.log('[repasse]', {
      appointmentId: id,
      beingCompleted,
      dataStatus: data.status,
      currentStatus: current?.status,
      hasExistingTransaction: !!current?.transaction,
      appointmentValue: updated.value,
      resolvedAmount: transactionAmount,
    })

    if (beingCompleted) {
      fireWebhooks(updated.doctorId, 'appointment.completed', {
        id: updated.id,
        patientName: updated.patient.name,
        patientPhone: updated.patient.phone,
        date: updated.date,
        type: updated.type,
        value: transactionAmount,
      }).catch(() => {})
    }

    if (data.status === 'CANCELLED' && current?.status !== 'CANCELLED') {
      if (updated.patient?.phone) {
        const apptDateStr = updated.date.toLocaleDateString('pt-BR')
        const apptTimeStr = updated.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        triggerLightAutomatedMessage(updated.doctorId, 'APPOINTMENT_CANCELLATION', {
          patientName: updated.patient.name,
          patientPhone: updated.patient.phone,
          appointmentDate: apptDateStr,
          appointmentTime: apptTimeStr,
          doctorName: updated.doctor.name,
        }).catch(err => console.error('[triggerLightAutomatedMessage CANCELLATION error]', err))
      }
      fireWebhooks(updated.doctorId, 'appointment.cancelled', {
        id: updated.id,
        patientName: updated.patient.name,
        date: updated.date,
        type: updated.type,
      }).catch(() => {})
    }

    if (data.status && !beingCompleted && data.status !== 'CANCELLED') {
      fireWebhooks(updated.doctorId, 'appointment.updated', {
        id: updated.id,
        patientName: updated.patient.name,
        date: updated.date,
        status: updated.status,
      }).catch(() => {})
    }

    res.json(updated)
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
        patient: { select: { id: true, name: true, phone: true, status: true } },
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

// ─── Charge Endpoint ─────────────────────────────────────────────────────────

const chargeSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  paymentMethodId: z.string().optional(),
  paymentMethodName: z.string().optional(),
  repasseValue: z.number().optional(),
  notes: z.string().optional(),
  coveredReturnIds: z.array(z.string()).optional(),
})

router.post('/:id/charge', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    if (!['DOCTOR', 'ADMIN'].includes(req.user!.role)) {
      res.status(403).json({ message: 'Acesso negado' })
      return
    }

    const body = chargeSchema.parse(req.body)

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor:  { select: { id: true, name: true } },
        transaction: { select: { id: true } },
      },
    })

    if (!appointment) {
      res.status(404).json({ message: 'Agendamento não encontrado' })
      return
    }

    if (req.user!.role === 'DOCTOR' && appointment.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Acesso negado' })
      return
    }

    if (appointment.billedAt) {
      res.status(409).json({ message: 'Este agendamento já foi cobrado' })
      return
    }

    if (appointment.transaction) {
      res.status(409).json({ message: 'Este agendamento já possui um lançamento financeiro' })
      return
    }

    const now = new Date()

    // The transaction amount is the repasse (doctor's net income).
    // body.amount is the gross value paid by the patient (kept in description for reference).
    const grossAmount = body.amount
    const netAmount = (body.repasseValue != null && body.repasseValue > 0 && body.repasseValue < grossAmount)
      ? body.repasseValue
      : grossAmount

    const description = netAmount < grossAmount
      ? `${appointment.type || 'Consulta'} - ${appointment.patient.name} (bruto: R$ ${grossAmount.toFixed(2)})`
      : `${appointment.type || 'Consulta'} - ${appointment.patient.name}`

    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          doctorId:        appointment.doctorId,
          appointmentId:   appointment.id,
          type:            'INCOME',
          amount:          netAmount,
          repasseValue:    body.repasseValue ?? null,
          paymentMethodId: body.paymentMethodId ?? null,
          paymentMethod:   body.paymentMethodName ?? null,
          description,
          date:            now,
          paidAt:          now,
          status:          'PAID',
          category:        appointment.type || 'Consulta',
          notes:           body.notes ?? null,
        },
      }),
      prisma.appointment.update({
        where: { id },
        data:  { billedAt: now },
      }),
    ])

    await createNotification(
      appointment.doctorId,
      'Cobrança registrada',
      `${appointment.type || 'Consulta'} de ${appointment.patient.name} — R$ ${netAmount.toFixed(2)} lançado no financeiro`,
      'SUCCESS',
      '/financeiro',
    )

    res.status(201).json({ transaction, appointmentId: appointment.id })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Notify Patient via WhatsApp ──────────────────────────────────────────────
router.post('/:id/notify-patient', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { templateId } = req.body as { templateId?: string }
    if (!templateId) {
      res.status(400).json({ message: 'templateId é obrigatório' })
      return
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: true,
        room: { include: { whatsappConnection: true } },
      },
    })
    if (!appointment) {
      res.status(404).json({ message: 'Agendamento não encontrado' })
      return
    }

    const tpl = await prisma.lightNotificationTemplate.findUnique({ where: { id: templateId } })
    if (!tpl || !tpl.active) {
      res.status(404).json({ message: 'Template não encontrado ou inativo' })
      return
    }

    const patient = appointment.patient as any
    const phone: string | undefined = patient?.phone
    if (!phone) {
      res.status(400).json({ message: 'Paciente não possui telefone cadastrado' })
      return
    }

    // Resolve variáveis do template com contexto do agendamento
    const ctx = await resolveContextFromAppointment(id, prisma)
    const message = resolveTemplateVariables(tpl.message, ctx)

    // Envia via WhatsApp (usa a sala vinculada ao agendamento; fallback p/ instância do médico)
    const room = appointment.room as any
    const instance = room?.whatsappConnection?.instanceKey
    if (!instance) {
      res.status(422).json({ message: 'Nenhuma instância WhatsApp vinculada ao consultório' })
      return
    }

    const sent = await sendLightMessage(instance, phone, message, 'notification')
    if (!sent) {
      res.status(502).json({ message: 'Falha ao enviar mensagem no WhatsApp' })
      return
    }

    res.json({ ok: true, phone, message })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
