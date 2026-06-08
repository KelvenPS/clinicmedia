import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN'))

// GET /api/admin/overview
router.get('/overview', async (_req, res) => {
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
router.get('/doctors', async (_req, res) => {
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
router.get('/patients', async (req: AuthRequest, res) => {
  try {
    const { doctorId, orphans, search } = req.query

    const where: Record<string, unknown> = { active: true }

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

    const patients = await prisma.patient.findMany({
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
    })

    res.json(patients)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// PATCH /api/admin/patients/:id/doctor - reassign patient to doctor
router.patch('/patients/:id/doctor', async (req, res) => {
  try {
    const { id } = req.params
    const { doctorId } = z.object({ doctorId: z.string().nullable() }).parse(req.body)

    const patient = await prisma.patient.update({
      where: { id },
      data: { doctorId },
      select: {
        id: true,
        name: true,
        doctorId: true,
        doctor: { select: { id: true, name: true } },
      },
    })

    res.json(patient)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos' })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/admin/migrate-patients - auto-assign orphan patients via appointment history
router.post('/migrate-patients', async (_req, res) => {
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

    let assigned = 0
    let unassigned = 0
    const results: { patientId: string; name: string; doctorId: string | null }[] = []

    for (const patient of orphans) {
      const doctorId = patient.appointments[0]?.doctorId ?? null
      if (doctorId) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { doctorId },
        })
        assigned++
        results.push({ patientId: patient.id, name: patient.name, doctorId })
      } else {
        unassigned++
        results.push({ patientId: patient.id, name: patient.name, doctorId: null })
      }
    }

    res.json({
      total: orphans.length,
      assigned,
      unassigned,
      results,
      message: `${assigned} pacientes atribuídos automaticamente. ${unassigned} sem histórico de agendamento (atribuição manual necessária).`,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/team - doctor with their secretaries
router.get('/team', async (_req, res) => {
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
