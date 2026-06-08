import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR'))

const methodSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CHEQUE', 'DINHEIRO', 'TRANSFERENCIA', 'OUTROS']),
  instructions: z.string().optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { doctorId: req.user!.userId },
      orderBy: { name: 'asc' },
    })
    res.json(methods)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = methodSchema.parse(req.body)
    const method = await prisma.paymentMethod.create({
      data: { ...data, doctorId: req.user!.userId },
    })
    res.status(201).json(method)
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
    const data = methodSchema.partial().parse(req.body)
    const method = await prisma.paymentMethod.update({ where: { id: req.params.id }, data })
    res.json(method)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', async (req, res) => {
  try {
    const current = await prisma.paymentMethod.findUnique({ where: { id: req.params.id } })
    if (!current) { res.status(404).json({ message: 'Forma de pagamento não encontrada' }); return }
    const method = await prisma.paymentMethod.update({
      where: { id: req.params.id },
      data: { active: !current.active },
    })
    res.json(method)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await prisma.paymentMethod.delete({ where: { id: req.params.id } })
    res.json({ message: 'Forma de pagamento removida' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
