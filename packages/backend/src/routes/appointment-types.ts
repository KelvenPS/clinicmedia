import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const typeSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  baseValue: z.coerce.number().min(0).optional().or(z.literal('')),
})

router.get('/', async (_req, res) => {
  try {
    const types = await prisma.appointmentType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
    res.json(types)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/all', requireRole('ADMIN', 'DOCTOR'), async (_req, res) => {
  try {
    const types = await prisma.appointmentType.findMany({
      orderBy: { name: 'asc' },
    })
    res.json(types)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('ADMIN', 'DOCTOR'), async (req, res) => {
  try {
    const data = typeSchema.parse(req.body)
    const type = await prisma.appointmentType.create({
      data: {
        name: data.name,
        baseValue: data.baseValue === '' ? null : data.baseValue,
      },
    })
    res.status(201).json(type)
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
    const data = typeSchema.partial().parse(req.body)
    const type = await prisma.appointmentType.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        baseValue: data.baseValue === '' ? null : data.baseValue,
      },
    })
    res.json(type)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const current = await prisma.appointmentType.findUnique({ where: { id } })
    if (!current) { res.status(404).json({ message: 'Tipo não encontrado' }); return }
    const type = await prisma.appointmentType.update({
      where: { id },
      data: { active: !current.active },
    })
    res.json(type)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', requireRole('ADMIN', 'DOCTOR'), async (req, res) => {
  try {
    const { id } = req.params
    await prisma.appointmentType.delete({ where: { id } })
    res.json({ message: 'Tipo removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
