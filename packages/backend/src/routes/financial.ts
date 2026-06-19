import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, requireFeature, AuthRequest } from '../middleware/auth'

import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR'))
router.use(requireFeature('financeiro'))

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

router.get('/analytics', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, doctorId } = req.query

    const where: Record<string, unknown> = {
      type: 'INCOME',
      status: 'PAID',
    }

    if (req.user!.role === 'DOCTOR') {
      where.doctorId = req.user!.userId
    } else if (doctorId) {
      where.doctorId = doctorId as string
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        appointment: {
          include: {
            room: { select: { id: true, name: true, cidade: true } },
            patient: {
              include: {
                patientPlans: {
                  include: {
                    healthPlan: { select: { id: true, name: true, type: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
      },
    })

    // Aggregate by room/location
    const roomMap = new Map<string, { name: string; cidade?: string | null; total: number; count: number }>()
    // Aggregate by appointment type
    const typeMap = new Map<string, { total: number; count: number }>()
    // Aggregate by health plan
    const planMap = new Map<string, { name: string; planType: string; total: number; count: number }>()

    for (const tx of transactions) {
      // By room
      if (tx.appointment?.room) {
        const room = tx.appointment.room
        const prev = roomMap.get(room.id) ?? { name: room.name, cidade: room.cidade, total: 0, count: 0 }
        roomMap.set(room.id, { ...prev, total: prev.total + tx.amount, count: prev.count + 1 })
      }

      // By type
      const typeKey = tx.appointment?.type || tx.category || 'Outros'
      const prevType = typeMap.get(typeKey) ?? { total: 0, count: 0 }
      typeMap.set(typeKey, { total: prevType.total + tx.amount, count: prevType.count + 1 })

      // By health plan
      const plan = tx.appointment?.patient?.patientPlans?.[0]?.healthPlan
      if (plan) {
        const prev = planMap.get(plan.id) ?? { name: plan.name, planType: plan.type, total: 0, count: 0 }
        planMap.set(plan.id, { ...prev, total: prev.total + tx.amount, count: prev.count + 1 })
      } else {
        const prev = planMap.get('particular') ?? { name: 'Particular', planType: 'PARTICULAR', total: 0, count: 0 }
        planMap.set('particular', { ...prev, total: prev.total + tx.amount, count: prev.count + 1 })
      }
    }

    const byRoom = Array.from(roomMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)

    const byType = Array.from(typeMap.entries())
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.total - a.total)

    const byHealthPlan = Array.from(planMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)

    res.json({ byRoom, byType, byHealthPlan })
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
            patient: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    })

    if (transaction.status === 'PENDING' && transaction.appointment?.patient.phone) {
      triggerLightAutomatedMessage(transaction.doctorId, 'PAYMENT_REMINDER', {
        patientName: transaction.appointment.patient.name,
        patientPhone: transaction.appointment.patient.phone,
        doctorName: transaction.doctor.name,
        paymentValue: String(transaction.amount),
        link: `${process.env.FRONTEND_URL || 'http://2.25.185.223'}/pagar/${transaction.id}`
      }).catch(err => console.error('[triggerLightAutomatedMessage PAYMENT error]', err))
    }

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
