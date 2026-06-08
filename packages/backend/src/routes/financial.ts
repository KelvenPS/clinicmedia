import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR'))

const transactionSchema = z.object({
  doctorId: z.string(),
  appointmentId: z.string().optional(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().min(2, 'Descrição muito curta'),
  date: z.string(),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional().default('PENDING'),
  category: z.string().optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, doctorId, type, status } = req.query

    const where: Record<string, unknown> = {}

    if (req.user!.role === 'DOCTOR') {
      where.doctorId = req.user!.userId
    } else if (doctorId) {
      where.doctorId = doctorId as string
    }

    if (type) where.type = type
    if (status) where.status = status

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        doctor: { select: { id: true, name: true } },
        appointment: {
          include: {
            patient: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    })

    const income = transactions
      .filter(t => t.type === 'INCOME' && t.status === 'PAID')
      .reduce((acc, t) => acc + t.amount, 0)

    const expense = transactions
      .filter(t => t.type === 'EXPENSE' && t.status === 'PAID')
      .reduce((acc, t) => acc + t.amount, 0)

    const pending = transactions
      .filter(t => t.status === 'PENDING')
      .reduce((acc, t) => acc + t.amount, 0)

    res.json({
      transactions,
      summary: {
        income,
        expense,
        balance: income - expense,
        pending,
      },
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/monthly', async (req: AuthRequest, res) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string)

    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year, 11, 31, 23, 59, 59)

    const where: Record<string, unknown> = {
      date: { gte: startOfYear, lte: endOfYear },
      status: 'PAID',
    }

    if (doctorId) where.doctorId = doctorId

    const transactions = await prisma.transaction.findMany({ where })

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const monthTransactions = transactions.filter(t => new Date(t.date).getMonth() === i)
      return {
        month: i + 1,
        income: monthTransactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0),
        expense: monthTransactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0),
      }
    })

    res.json(monthly)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req, res) => {
  try {
    const data = transactionSchema.parse(req.body)

    const transaction = await prisma.transaction.create({
      data: { ...data, date: new Date(data.date) },
      include: {
        doctor: { select: { id: true, name: true } },
        appointment: {
          include: {
            patient: { select: { id: true, name: true } },
          },
        },
      },
    })

    res.status(201).json(transaction)
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
    const data = { ...req.body }
    if (data.date) data.date = new Date(data.date)

    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: {
        doctor: { select: { id: true, name: true } },
      },
    })

    res.json(transaction)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await prisma.transaction.delete({ where: { id } })
    res.json({ message: 'Transação removida com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
