import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const planSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  type: z.enum(['PARTICULAR', 'CONVENIO', 'OUTROS']).default('PARTICULAR'),
  customTypeName: z.string().optional(),
  description: z.string().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  defaultValue: z.coerce.number().min(0).optional(),
})

router.get('/', async (_req, res) => {
  try {
    const plans = await prisma.healthPlan.findMany({
      where: { active: true },
      include: {
        _count: { select: { patientPlans: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.json(plans)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/all', async (_req, res) => {
  try {
    const plans = await prisma.healthPlan.findMany({
      include: {
        _count: { select: { patientPlans: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.json(plans)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('ADMIN', 'SECRETARY', 'DOCTOR'), async (req, res) => {
  try {
    const data = planSchema.parse(req.body)

    const existing = await prisma.healthPlan.findFirst({
      where: { name: { equals: data.name } },
    })
    if (existing) {
      res.status(400).json({ message: 'Plano com este nome já existe' })
      return
    }

    const plan = await prisma.healthPlan.create({ data })
    res.status(201).json(plan)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', requireRole('ADMIN', 'SECRETARY', 'DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params
    const data = planSchema.partial().parse(req.body)
    const plan = await prisma.healthPlan.update({ where: { id }, data })
    res.json(plan)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params
    const plan = await prisma.healthPlan.findUnique({ where: { id } })
    if (!plan) { res.status(404).json({ message: 'Plano não encontrado' }); return }

    const updated = await prisma.healthPlan.update({
      where: { id },
      data: { active: !plan.active },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params
    await prisma.healthPlan.update({ where: { id }, data: { active: false } })
    res.json({ message: 'Plano desativado' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
