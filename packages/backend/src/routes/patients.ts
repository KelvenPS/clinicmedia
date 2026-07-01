import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { fireWebhooks } from '../lib/webhook'
import { logAudit } from '../lib/secretaryAccess'

import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

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
  responsibleName: z.string().optional(),
  responsiblePhone: z.string().optional(),
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
    const { search, status } = req.query
    const { doctorIds } = await resolveScope(req)

    if (doctorIds !== null && doctorIds.length === 0) {
      res.json([])
      return
    }

    const where: Record<string, unknown> = { active: true }

    if (doctorIds !== null) {
      where.doctorId = doctorIds.length === 1 ? doctorIds[0] : { in: doctorIds }
    }

    // Filter by status — default excludes no status (shows all active)
    if (status && status !== 'TODOS') {
      where.status = status
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
  } catch (error) {
    console.error('[patients] GET /', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /patients/pre-registrations ─────────────────────────────────────────

// ─── GET /patients/check-duplicate ───────────────────────────────────────────

router.get('/check-duplicate', async (req: AuthRequest, res) => {
  try {
    const { phone, cpf } = req.query as { phone?: string; cpf?: string }
    if (!phone && !cpf) {
      return res.status(400).json({ message: 'Informe phone ou cpf' })
    }
    const doctorId = await resolvePrimaryDoctorId(req)
    const duplicate = await findDuplicatePatient({ phone: phone ?? '', cpf, doctorId })
    if (duplicate) {
      return res.json({
        found: true,
        reason: duplicate.reason,
        patient: {
          id: duplicate.patient.id,
          name: duplicate.patient.name,
          phone: duplicate.patient.phone,
          cpf: duplicate.patient.cpf,
          status: duplicate.patient.status,
        },
      })
    }
    return res.json({ found: false })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /patients/pre-registrations ─────────────────────────────────────────

router.get('/pre-registrations', async (req: AuthRequest, res) => {
  try {
    const { doctorIds } = await resolveScope(req)
    if (doctorIds !== null && doctorIds.length === 0) return res.json([])

    const where: Record<string, unknown> = {
      status: { in: ['PRE_CADASTRO', 'INCOMPLETO'] },
    }
    if (doctorIds !== null) {
      where.doctorId = doctorIds.length === 1 ? doctorIds[0] : { in: doctorIds }
    }

    const patients = await prisma.patient.findMany({
      where,
      include: {
        appointments: {
          where: { date: { gte: new Date() } },
          orderBy: { date: 'asc' },
          take: 1,
          select: { id: true, date: true, title: true, status: true },
        },
        createdByUser: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json(patients)
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
        cpf: rest.cpf || null,
        rg: rest.rg || null,
        address: rest.address || null,
        notes: rest.notes || null,
        responsibleName: rest.responsibleName || null,
        responsiblePhone: rest.responsiblePhone || null,
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

    if (doctorId && patient.phone) {
      triggerLightAutomatedMessage(doctorId, 'NEW_PATIENT_WELCOME', {
        patientName: patient.name,
        patientPhone: patient.phone,
      }).catch(err => console.error('[triggerLightAutomatedMessage WELCOME error]', err))
    }

    res.status(201).json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[patients] POST /', error)
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

    const { plans, birthDate: rawBirthDate, ...rest } = patientSchema.partial().parse(req.body)

    const updateData: Record<string, unknown> = { ...rest }
    // Converte birthDate: string vazia ou undefined → null, string válida → Date
    if (rawBirthDate !== undefined) {
      updateData.birthDate = rawBirthDate ? new Date(rawBirthDate) : null
    }
    // Normalize empty strings to null for nullable optional fields
    if (rest.email !== undefined) updateData.email = rest.email || null
    if (rest.cpf !== undefined) updateData.cpf = rest.cpf || null
    if (rest.rg !== undefined) updateData.rg = rest.rg || null
    if (rest.address !== undefined) updateData.address = rest.address || null
    if (rest.notes !== undefined) updateData.notes = rest.notes || null
    if (rest.responsibleName !== undefined) updateData.responsibleName = rest.responsibleName || null
    if (rest.responsiblePhone !== undefined) updateData.responsiblePhone = rest.responsiblePhone || null

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
  } catch (error) {
    console.error('[patients] PUT /:id', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Schemas de validação ────────────────────────────────────────────────────

const preRegisterSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  phone: z.string().min(10, 'Telefone inválido'),
  cpf: z.string().optional(),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
  roomId: z.string().optional(),
  origin: z.enum(['AGENDA', 'CHATBOT', 'MANUAL', 'IMPORTACAO']).default('AGENDA'),
})

const completeRegistrationSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(10).optional(),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  responsibleName: z.string().optional(),
  responsiblePhone: z.string().optional(),
  plans: z.array(z.object({
    healthPlanId: z.string(),
    value: z.number().optional(),
    walletNumber: z.string().optional(),
    validUntil: z.string().optional(),
  })).optional(),
})

// ─── Helper: detectar paciente duplicado ────────────────────────────────────

async function findDuplicatePatient(params: {
  phone: string
  cpf?: string
  name?: string
  doctorId: string | null
}) {
  const { phone, cpf, doctorId } = params
  const where: Record<string, unknown> = {}
  if (doctorId) where.doctorId = doctorId

  if (cpf) {
    const byCpf = await prisma.patient.findFirst({ where: { ...where, cpf } })
    if (byCpf) return { patient: byCpf, reason: 'cpf' as const }
  }

  const byPhone = await prisma.patient.findFirst({ where: { ...where, phone } })
  if (byPhone) return { patient: byPhone, reason: 'phone' as const }

  return null
}

// ─── POST /patients/pre-register ─────────────────────────────────────────────

router.post('/pre-register', async (req: AuthRequest, res) => {
  try {
    const data = preRegisterSchema.parse(req.body)
    const doctorId = await resolvePrimaryDoctorId(req)

    // Detectar duplicidade
    const duplicate = await findDuplicatePatient({
      phone: data.phone,
      cpf: data.cpf,
      doctorId,
    })

    if (duplicate) {
      await logAudit({
        clinicId: doctorId,
        userId: req.user!.userId,
        action: 'PATIENT_DUPLICATE_FOUND',
        description: `Duplicata detectada por ${duplicate.reason} ao pré-cadastrar ${data.name}`,
        metadata: { existingPatientId: duplicate.patient.id, reason: duplicate.reason },
      })
      return res.status(409).json({
        message: 'Já existe um paciente cadastrado com este ' + (duplicate.reason === 'cpf' ? 'CPF' : 'telefone'),
        code: 'PATIENT_DUPLICATE',
        existingPatient: {
          id: duplicate.patient.id,
          name: duplicate.patient.name,
          phone: duplicate.patient.phone,
          cpf: duplicate.patient.cpf,
          status: duplicate.patient.status,
        },
      })
    }

    const patient = await prisma.patient.create({
      data: {
        name: data.name,
        phone: data.phone,
        cpf: data.cpf || null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        notes: data.notes || null,
        doctorId,
        roomId: data.roomId || null,
        status: 'PRE_CADASTRO',
        origin: data.origin,
        createdByUserId: req.user!.userId,
      },
    })

    await logAudit({
      clinicId: doctorId,
      roomId: data.roomId,
      userId: req.user!.userId,
      action: 'PATIENT_PRE_REGISTER',
      description: `Pré-cadastro criado para ${patient.name}`,
      metadata: { patientId: patient.id, origin: data.origin },
    })

    return res.status(201).json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    }
    console.error('[patients] POST /pre-register', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST /patients/:id/complete-registration ────────────────────────────────

router.post('/:id/complete-registration', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { doctorIds } = await resolveScope(req)

    const existing = await prisma.patient.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Paciente não encontrado' })
    if (doctorIds !== null && (!existing.doctorId || !doctorIds.includes(existing.doctorId))) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const { plans, ...rest } = completeRegistrationSchema.parse(req.body)

    const updateData: Record<string, unknown> = { ...rest }
    if (rest.birthDate) updateData.birthDate = new Date(rest.birthDate)
    if (rest.email !== undefined) updateData.email = rest.email || null
    if (rest.cpf !== undefined) updateData.cpf = rest.cpf || null

    updateData.status = 'ATIVO'
    updateData.completedAt = new Date()
    updateData.completedByUserId = req.user!.userId

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
      include: { patientPlans: { include: { healthPlan: true } } },
    })

    await logAudit({
      clinicId: existing.doctorId,
      userId: req.user!.userId,
      action: 'PATIENT_COMPLETED',
      description: `Cadastro finalizado para ${patient.name}`,
      metadata: { patientId: id, previousStatus: existing.status },
    })

    return res.json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    }
    console.error('[patients] POST /:id/complete-registration', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PATCH /patients/:id/status ───────────────────────────────────────────────

router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { status } = z.object({
      status: z.enum(['PRE_CADASTRO', 'ATIVO', 'INCOMPLETO', 'INATIVO']),
    }).parse(req.body)

    const { doctorIds } = await resolveScope(req)
    const existing = await prisma.patient.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Paciente não encontrado' })
    if (doctorIds !== null && (!existing.doctorId || !doctorIds.includes(existing.doctorId))) {
      return res.status(403).json({ message: 'Acesso negado' })
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: { status },
    })

    await logAudit({
      clinicId: existing.doctorId,
      userId: req.user!.userId,
      action: 'PATIENT_STATUS_CHANGED',
      description: `Status do paciente ${existing.name} alterado de ${existing.status} para ${status}`,
      metadata: { patientId: id, from: existing.status, to: status },
    })

    return res.json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
