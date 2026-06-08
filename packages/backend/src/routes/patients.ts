import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { fireWebhooks } from '../lib/webhook'

const router = Router()
router.use(authenticate)

const patientSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().min(10, 'Telefone inválido'),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  plans: z.array(z.object({
    healthPlanId: z.string(),
    value: z.number().optional(),
    walletNumber: z.string().optional(),
    validUntil: z.string().optional(),
  })).optional(),
})

router.get('/', async (req, res) => {
  try {
    const { search } = req.query
    const where: Record<string, unknown> = { active: true }

    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { phone: { contains: search as string } },
        { cpf: { contains: search as string } },
        { email: { contains: search as string } },
        { rg: { contains: search as string } },
      ]
    }

    const patients = await prisma.patient.findMany({
      where,
      include: {
        _count: { select: { appointments: true } },
        patientPlans: {
          include: {
            healthPlan: { select: { id: true, name: true, type: true, discountPercent: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    res.json(patients)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            doctor: { select: { id: true, name: true, specialty: true } },
          },
          orderBy: { date: 'desc' },
          take: 20,
        },
        patientPlans: {
          include: {
            healthPlan: true,
          },
        },
        medicalRecords: {
          include: {
            doctor: { select: { id: true, name: true, specialty: true } },
          },
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    })

    if (!patient) {
      res.status(404).json({ message: 'Paciente não encontrado' })
      return
    }

    res.json(patient)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { plans, ...rest } = patientSchema.parse(req.body)

    if (rest.cpf) {
      const existing = await prisma.patient.findUnique({ where: { cpf: rest.cpf } })
      if (existing) {
        res.status(400).json({ message: 'CPF já cadastrado' })
        return
      }
    }

    const patient = await prisma.patient.create({
      data: {
        ...rest,
        email: rest.email || null,
        birthDate: rest.birthDate ? new Date(rest.birthDate) : null,
        patientPlans: plans?.length
          ? {
              create: plans.map(p => ({
                healthPlanId: p.healthPlanId,
                value: p.value,
                walletNumber: p.walletNumber || null,
                validUntil: p.validUntil ? new Date(p.validUntil) : null,
              })),
            }
          : undefined,
      },
      include: {
        patientPlans: { include: { healthPlan: true } },
      },
    })

    if (req.user && (req.user.role === 'DOCTOR' || req.user.role === 'ADMIN')) {
      fireWebhooks(req.user.userId, 'patient.created', {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
      }).catch(() => {})
    }

    res.status(201).json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { plans, ...rest } = patientSchema.partial().parse(req.body)

    const updateData: Record<string, unknown> = { ...rest }
    if (rest.birthDate) updateData.birthDate = new Date(rest.birthDate)
    if (rest.email === '') updateData.email = null

    if (plans !== undefined) {
      // Replace all plans
      await prisma.patientPlan.deleteMany({ where: { patientId: id } })

      if (plans.length > 0) {
        await prisma.patientPlan.createMany({
          data: plans.map(p => ({
            patientId: id,
            healthPlanId: p.healthPlanId,
            value: p.value,
            walletNumber: p.walletNumber || null,
            validUntil: p.validUntil ? new Date(p.validUntil) : null,
          })),
        })
      }
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: updateData,
      include: {
        patientPlans: { include: { healthPlan: true } },
      },
    })

    res.json(patient)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
