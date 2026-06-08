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

async function resolveScope(req: AuthRequest): Promise<{ doctorIds: string[] | null }> {
  const role = req.user!.role
  if (role === 'ADMIN') return { doctorIds: null } // null = sem filtro
  if (role === 'DOCTOR') return { doctorIds: [req.user!.userId] }

  // SECRETARY — busca todos os médicos vinculados
  const links = await prisma.doctorSecretary.findMany({
    where: { secretaryId: req.user!.userId, active: true },
    select: { doctorId: true },
  })
  return { doctorIds: links.map(l => l.doctorId) }
}

async function resolvePrimaryDoctorId(req: AuthRequest): Promise<string | null> {
  const role = req.user!.role
  if (role === 'DOCTOR') return req.user!.userId
  if (role === 'SECRETARY') {
    const link = await prisma.doctorSecretary.findFirst({
      where: { secretaryId: req.user!.userId, active: true },
      select: { doctorId: true },
    })
    return link?.doctorId ?? null
  }
  return null // ADMIN não associa a um médico específico
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { search } = req.query
    const { doctorIds } = await resolveScope(req)

    if (doctorIds !== null && doctorIds.length === 0) {
      res.json([])
      return
    }

    const where: Record<string, unknown> = { active: true }

    if (doctorIds !== null) {
      where.doctorId = doctorIds.length === 1 ? doctorIds[0] : { in: doctorIds }
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { cpf: { contains: search as string } },
        { email: { contains: search as string, mode: 'insensitive' } },
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

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { doctorIds } = await resolveScope(req)

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

    // Verifica se o paciente pertence ao tenant do usuário autenticado
    if (doctorIds !== null && (!patient.doctorId || !doctorIds.includes(patient.doctorId))) {
      res.status(403).json({ message: 'Acesso negado' })
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

    const doctorId = await resolvePrimaryDoctorId(req)

    const patient = await prisma.patient.create({
      data: {
        ...rest,
        doctorId,
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

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { doctorIds } = await resolveScope(req)

    // Verifica propriedade antes de editar
    const existing = await prisma.patient.findUnique({ where: { id }, select: { doctorId: true } })
    if (!existing) {
      res.status(404).json({ message: 'Paciente não encontrado' })
      return
    }
    if (doctorIds !== null && (!existing.doctorId || !doctorIds.includes(existing.doctorId))) {
      res.status(403).json({ message: 'Acesso negado' })
      return
    }

    const { plans, ...rest } = patientSchema.partial().parse(req.body)

    const updateData: Record<string, unknown> = { ...rest }
    if (rest.birthDate) updateData.birthDate = new Date(rest.birthDate)
    if (rest.email === '') updateData.email = null

    if (plans !== undefined) {
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
