import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, requireFeature, AuthRequest } from '../middleware/auth'

import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR'))
router.use(requireFeature('avaliacoes'))

const assessmentSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum(['WISC_IV', 'WASI', 'WAIS_III', 'COGNITIVA', 'RAVLT']),
  assessDate: z.string().optional(),
  patientAge: z.coerce.number().optional(),
  subtestScores: z.record(z.union([z.number(), z.null()])).optional(),
  compositeScores: z.record(z.union([z.number(), z.null()])).optional(),
  interpretation: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'COMPLETED']).optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { patientId, doctorId } = req.query as Record<string, string>

    const where: Record<string, unknown> = {}
    if (req.user!.role === 'DOCTOR') {
      where.doctorId = req.user!.userId
    } else if (doctorId) {
      where.doctorId = doctorId
    }
    if (patientId) where.patientId = patientId

    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, birthDate: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
      orderBy: { assessDate: 'desc' },
    })

    res.json(assessments)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, name: true, birthDate: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true, certType: true, certNumber: true, crm: true } },
      },
    })

    if (!assessment) {
      res.status(404).json({ message: 'Avaliação não encontrada' })
      return
    }

    if (req.user!.role === 'DOCTOR' && assessment.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    res.json(assessment)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = assessmentSchema.parse(req.body)

    const assessment = await prisma.assessment.create({
      data: {
        patientId: data.patientId,
        doctorId: req.user!.userId,
        type: data.type,
        assessDate: data.assessDate ? new Date(data.assessDate) : new Date(),
        patientAge: data.patientAge ?? null,
        subtestScores: data.subtestScores ?? {},
        compositeScores: data.compositeScores ?? {},
        interpretation: data.interpretation,
        notes: data.notes,
        status: data.status ?? 'DRAFT',
      },
      include: {
        patient: { select: { id: true, name: true, birthDate: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    })

    if (assessment.status === 'COMPLETED' && assessment.patient?.phone) {
      triggerLightAutomatedMessage(assessment.doctorId, 'ASSESSMENT_COMPLETE', {
        patientName: assessment.patient.name,
        patientPhone: assessment.patient.phone,
        doctorName: assessment.doctor.name,
        link: `${process.env.FRONTEND_URL || 'http://2.25.185.223'}/assessment/${assessment.id}`
      }).catch(err => console.error('[triggerLightAutomatedMessage ASSESSMENT error]', err))
    }

    res.status(201).json(assessment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const data = assessmentSchema.partial().parse(req.body)

    const existing = await prisma.assessment.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Avaliação não encontrada' })
      return
    }

    if (req.user!.role === 'DOCTOR' && existing.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    const updated = await prisma.assessment.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.assessDate && { assessDate: new Date(data.assessDate) }),
        ...(data.patientAge !== undefined && { patientAge: data.patientAge }),
        ...(data.subtestScores && { subtestScores: data.subtestScores }),
        ...(data.compositeScores && { compositeScores: data.compositeScores }),
        ...(data.interpretation !== undefined && { interpretation: data.interpretation }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status && { status: data.status }),
      },
      include: {
        patient: { select: { id: true, name: true, birthDate: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    })

    if (updated.status === 'COMPLETED' && updated.patient?.phone) {
      triggerLightAutomatedMessage(updated.doctorId, 'ASSESSMENT_COMPLETE', {
        patientName: updated.patient.name,
        patientPhone: updated.patient.phone,
        doctorName: updated.doctor.name,
        link: `${process.env.FRONTEND_URL || 'http://2.25.185.223'}/assessment/${updated.id}`
      }).catch(err => console.error('[triggerLightAutomatedMessage ASSESSMENT error]', err))
    }

    res.json(updated)
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

    const existing = await prisma.assessment.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Avaliação não encontrada' })
      return
    }

    if (req.user!.role === 'DOCTOR' && existing.doctorId !== req.user!.userId) {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    await prisma.assessment.delete({ where: { id } })
    res.json({ message: 'Avaliação removida' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
