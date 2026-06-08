import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN'))

// GET /api/admin/overview
router.get('/overview', async (_req: AuthRequest, res) => {
  try {
    const [totalPatients, assignedPatients, totalDoctors, totalSecretaries] = await Promise.all([
      prisma.patient.count({ where: { active: true } }),
      prisma.patient.count({ where: { active: true, doctorId: { not: null } } }),
      prisma.user.count({ where: { role: 'DOCTOR', active: true } }),
      prisma.user.count({ where: { role: 'SECRETARY', active: true } }),
    ])

    res.json({
      totalPatients,
      assignedPatients,
      orphanPatients: totalPatients - assignedPatients,
      totalDoctors,
      totalSecretaries,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/doctors
router.get('/doctors', async (_req: AuthRequest, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR', active: true },
      select: {
        id: true,
        name: true,
        email: true,
        specialty: true,
        _count: {
          select: {
            patients: true,
            doctorAppointments: true,
            doctorTeam: { where: { active: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })
    res.json(doctors)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/patients
// TODO: Frontend currently expects a plain array. After this pagination change,
// the frontend must be updated to consume { data, total, page, totalPages } instead.
router.get('/patients', async (req: AuthRequest, res) => {
  try {
    const { doctorId, orphans, search } = req.query

    // --- Pagination params ---
    const pageRaw = parseInt(req.query.page as string, 10)
    const limitRaw = parseInt(req.query.limit as string, 10)
    const page = !isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const limit = !isNaN(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
    const skip = (page - 1) * limit

    const where: Prisma.PatientWhereInput = { active: true }

    if (orphans === 'true') {
      where.doctorId = null
    } else if (doctorId) {
      where.doctorId = doctorId as string
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { cpf: { contains: search as string } },
      ]
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          cpf: true,
          doctorId: true,
          createdAt: true,
          doctor: { select: { id: true, name: true, specialty: true } },
          _count: { select: { appointments: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.patient.count({ where }),
    ])

    const totalPages = Math.ceil(total / limit)

    res.json({ data: patients, total, page, totalPages })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// PATCH /api/admin/patients/:id/doctor - reassign patient to doctor
router.patch('/patients/:id/doctor', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { doctorId } = z
      .object({ doctorId: z.string().uuid().nullable() })
      .parse(req.body)

    // Validate patient existence
    const existingPatient = await prisma.patient.findUnique({ where: { id } })
    if (!existingPatient) {
      res.status(404).json({ message: 'Paciente não encontrado' })
      return
    }

    // Validate doctorId belongs to a user with role DOCTOR
    if (doctorId !== null) {
      const doctor = await prisma.user.findUnique({
        where: { id: doctorId },
        select: { id: true, role: true, active: true },
      })
      if (!doctor || doctor.role !== 'DOCTOR') {
        res.status(400).json({ message: 'O usuário informado não é um médico válido' })
        return
      }
    }

    const patient = await prisma.$transaction(async (tx) => {
      return tx.patient.update({
        where: { id },
        data: { doctorId },
        select: {
          id: true,
          name: true,
          doctorId: true,
          doctor: { select: { id: true, name: true } },
        },
      })
    })

    res.json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ message: 'Paciente não encontrado' })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/admin/migrate-patients - auto-assign orphan patients via appointment history
router.post('/migrate-patients', async (_req: AuthRequest, res) => {
  try {
    const orphans = await prisma.patient.findMany({
      where: { doctorId: null, active: true },
      select: {
        id: true,
        name: true,
        appointments: {
          select: { doctorId: true },
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    })

    // Group patient IDs by their most recent doctorId
    const groupedByDoctor = new Map<string, string[]>()
    const unassignedResults: { patientId: string; name: string; doctorId: null }[] = []

    for (const patient of orphans) {
      const doctorId = patient.appointments[0]?.doctorId ?? null
      if (doctorId) {
        const ids = groupedByDoctor.get(doctorId) ?? []
        ids.push(patient.id)
        groupedByDoctor.set(doctorId, ids)
      } else {
        unassignedResults.push({ patientId: patient.id, name: patient.name, doctorId: null })
      }
    }

    // Build patient lookup for result reporting
    const patientMap = new Map(orphans.map((p) => [p.id, p.name]))

    // Execute all updateMany calls atomically inside a single transaction
    const assignedResults: { patientId: string; name: string; doctorId: string }[] = []

    await prisma.$transaction(async (tx) => {
      for (const [doctorId, ids] of groupedByDoctor.entries()) {
        await tx.patient.updateMany({
          where: { id: { in: ids } },
          data: { doctorId },
        })
        for (const patientId of ids) {
          assignedResults.push({
            patientId,
            name: patientMap.get(patientId) ?? '',
            doctorId,
          })
        }
      }
    })

    const assigned = assignedResults.length
    const unassigned = unassignedResults.length

    res.json({
      total: orphans.length,
      assigned,
      unassigned,
      results: [...assignedResults, ...unassignedResults],
      message: `${assigned} pacientes atribuídos automaticamente. ${unassigned} sem histórico de agendamento (atribuição manual necessária).`,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ message: 'Um ou mais pacientes não foram encontrados durante a migração' })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/team - doctor with their secretaries
router.get('/team', async (_req: AuthRequest, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR', active: true },
      select: {
        id: true,
        name: true,
        email: true,
        specialty: true,
        doctorTeam: {
          where: { active: true },
          include: {
            secretary: { select: { id: true, name: true, email: true, active: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })
    res.json(doctors)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
