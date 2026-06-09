import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res) => {
  try {
    const where: Record<string, unknown> = { role: 'DOCTOR', active: true }

    if (req.user!.role === 'DOCTOR') {
      // A doctor only sees themselves — prevents cross-tenant professional listing
      // in forms like AppointmentForm where the dropdown is populated from this endpoint.
      where.id = req.user!.userId
    } else if (req.user!.role === 'SECRETARY') {
      const links = await prisma.doctorSecretary.findMany({
        where: { secretaryId: req.user!.userId, active: true },
        select: { doctorId: true },
      })
      const linkedIds = links.map(l => l.doctorId)
      where.id = linkedIds.length > 0 ? { in: linkedIds } : { in: [] }
    }

    const doctors = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        specialty: true,
        crm: true,
        phone: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json(doctors)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
