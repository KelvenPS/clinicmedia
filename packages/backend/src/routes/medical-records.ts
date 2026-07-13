import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

const router = Router()
router.use(authenticate)

const recordSchema = z.object({
  patientId:     z.string().min(1, 'Paciente obrigatório'),
  doctorId:      z.string().min(1, 'Médico obrigatório'),
  title:         z.string().min(2, 'Título muito curto'),
  content:       z.string().min(5, 'Conteúdo muito curto'),
  type:          z.enum(['ANAMNESE', 'EVOLUCAO', 'PRESCRICAO', 'EXAME', 'ATESTADO', 'OUTROS']).default('EVOLUCAO'),
  date:          z.string().optional(),
  specialtyType: z.string().optional(),
  specialtyData: z.record(z.unknown()).optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { patientId, doctorId } = req.query
    const where: Record<string, unknown> = {}

    if (patientId) where.patientId = patientId as string
    if (req.user!.role === 'DOCTOR') {
      where.doctorId = req.user!.userId
    } else if (doctorId) {
      where.doctorId = doctorId as string
    }

    const records = await prisma.medicalRecord.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true, specialty: true, crm: true } },
      },
      orderBy: { date: 'desc' },
    })

    res.json(records)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/by-patient/:patientId', async (req: AuthRequest, res) => {
  try {
    const { patientId } = req.params

    const records = await prisma.medicalRecord.findMany({
      where: { patientId },
      include: {
        doctor: { select: { id: true, name: true, specialty: true, crm: true } },
      },
      orderBy: { date: 'desc' },
    })

    // Group by doctor
    const grouped: Record<string, {
      doctor: { id: string; name: string; specialty: string | null; crm: string | null }
      records: typeof records
    }> = {}

    for (const record of records) {
      if (!grouped[record.doctorId]) {
        grouped[record.doctorId] = {
          doctor: record.doctor,
          records: [],
        }
      }
      grouped[record.doctorId].records.push(record)
    }

    res.json(Object.values(grouped))
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('ADMIN', 'DOCTOR', 'SECRETARY'), async (req: AuthRequest, res) => {
  try {
    const data = recordSchema.parse(req.body)

    const { specialtyData, ...rest } = data
    const record = await prisma.medicalRecord.create({
      data: {
        ...rest,
        date: rest.date ? new Date(rest.date) : new Date(),
        specialtyData: specialtyData as Prisma.InputJsonValue | undefined,
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    })

    if (record.patient?.phone) {
      triggerLightAutomatedMessage(record.doctorId, 'POST_CONSULTATION_SUMMARY', {
        patientName: record.patient.name,
        patientPhone: record.patient.phone,
        doctorName: record.doctor.name,
      }).catch(err => console.error('[triggerLightAutomatedMessage SUMMARY error]', err))
    }

    res.status(201).json(record)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', requireRole('ADMIN', 'DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params
    const data = { ...req.body }
    if (data.date) data.date = new Date(data.date)

    const record = await prisma.medicalRecord.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
      },
    })

    res.json(record)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', requireRole('ADMIN', 'DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params
    await prisma.medicalRecord.delete({ where: { id } })
    res.json({ message: 'Prontuário removido' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
