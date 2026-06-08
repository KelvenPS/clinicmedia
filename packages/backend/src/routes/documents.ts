import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR'))

const docSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['ATESTADO', 'DECLARACAO', 'RECIBO', 'COMPROVANTE', 'OUTROS']),
  content: z.string(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const docs = await prisma.documentTemplate.findMany({
      where: { doctorId: req.user!.userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.json(docs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = docSchema.parse(req.body)
    const doc = await prisma.documentTemplate.create({
      data: { ...data, doctorId: req.user!.userId },
    })
    res.status(201).json(doc)
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
    const data = docSchema.partial().parse(req.body)
    const doc = await prisma.documentTemplate.update({ where: { id }, data })
    res.json(doc)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params
    const current = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!current) { res.status(404).json({ message: 'Documento não encontrado' }); return }
    const doc = await prisma.documentTemplate.update({ where: { id }, data: { active: !current.active } })
    res.json(doc)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await prisma.documentTemplate.delete({ where: { id: req.params.id } })
    res.json({ message: 'Documento removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
