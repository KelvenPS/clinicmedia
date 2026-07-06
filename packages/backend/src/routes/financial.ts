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
  amount: z.number().nonnegative('Valor deve ser positivo ou zero'),
  description: z.string().min(2, 'Descrição muito curta'),
  date: z.string(),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional().default('PENDING'),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  costCenterId: z.string().optional(),
  bankAccountId: z.string().optional(),
  paymentMethod: z.string().optional(),
})

const categorySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['INCOME', 'EXPENSE']),
  color: z.string().optional(),
  active: z.boolean().optional().default(true),
})

const costCenterSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  active: z.boolean().optional().default(true),
})

const bankAccountSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  bank: z.string().optional(),
  agency: z.string().optional(),
  account: z.string().optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CASH']).optional().default('CHECKING'),
  balance: z.number().optional().default(0),
  active: z.boolean().optional().default(true),
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
        financialCategory: { select: { id: true, name: true, color: true } },
        costCenter: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
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

// ─── Advanced Analytics ───────────────────────────────────────────────────────

router.get('/analytics/by-payment-method', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, doctorId: qDoctorId } = req.query
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (qDoctorId as string | undefined)
    if (!doctorId) { res.status(400).json({ message: 'doctorId obrigatório para ADMIN' }); return }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1))
    const end   = endDate   ? new Date(endDate as string)   : new Date()

    const results = await prisma.$queryRaw<Array<{ method: string; total: unknown; count: bigint }>>`
      SELECT
        COALESCE("payment_method", 'Não informado') AS "method",
        SUM(amount)   AS "total",
        COUNT(*)      AS "count"
      FROM "TBLTRANSACAO"
      WHERE "doctorId" = ${doctorId}
        AND type = 'INCOME'
        AND status = 'PAID'
        AND date >= ${start}
        AND date <= ${end}
      GROUP BY "payment_method"
      ORDER BY "total" DESC
    `

    const rows = results.map(r => ({
      method: String(r.method),
      total:  Number(r.total),
      count:  Number(r.count),
    }))
    const grandTotal = rows.reduce((s, r) => s + r.total, 0)
    const data = rows.map(r => ({
      ...r,
      percent: grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0,
    }))

    res.json(data)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/analytics/by-hour', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string | undefined)
    if (!doctorId) { res.status(400).json({ message: 'doctorId obrigatório para ADMIN' }); return }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1))
    const end   = endDate   ? new Date(endDate as string)   : new Date()

    const results = await prisma.$queryRaw<Array<{ hour: unknown; total: unknown; count: bigint }>>`
      SELECT
        EXTRACT(HOUR FROM date) AS "hour",
        SUM(amount)             AS "total",
        COUNT(*)                AS "count"
      FROM "TBLTRANSACAO"
      WHERE "doctorId" = ${doctorId}
        AND type = 'INCOME'
        AND status = 'PAID'
        AND date >= ${start}
        AND date <= ${end}
      GROUP BY EXTRACT(HOUR FROM date)
      ORDER BY "hour"
    `

    const data = results.map(r => {
      const h = Number(r.hour)
      return {
        hour:  h,
        label: `${String(h).padStart(2, '0')}h`,
        total: Number(r.total),
        count: Number(r.count),
      }
    })

    res.json(data)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/analytics/by-day-of-week', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string | undefined)
    if (!doctorId) { res.status(400).json({ message: 'doctorId obrigatório para ADMIN' }); return }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1))
    const end   = endDate   ? new Date(endDate as string)   : new Date()

    const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

    const results = await prisma.$queryRaw<Array<{ dayOfWeek: unknown; total: unknown; count: bigint }>>`
      SELECT
        EXTRACT(DOW FROM date) AS "dayOfWeek",
        SUM(amount)            AS "total",
        COUNT(*)               AS "count"
      FROM "TBLTRANSACAO"
      WHERE "doctorId" = ${doctorId}
        AND type = 'INCOME'
        AND status = 'PAID'
        AND date >= ${start}
        AND date <= ${end}
      GROUP BY EXTRACT(DOW FROM date)
      ORDER BY "dayOfWeek"
    `

    const data = results.map(r => {
      const dow = Number(r.dayOfWeek)
      return {
        dayOfWeek: dow,
        label:     DOW_LABELS[dow] ?? String(dow),
        total:     Number(r.total),
        count:     Number(r.count),
      }
    })

    res.json(data)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/analytics/by-convenio', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string | undefined)
    if (!doctorId) { res.status(400).json({ message: 'doctorId obrigatório para ADMIN' }); return }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1))
    const end   = endDate   ? new Date(endDate as string)   : new Date()

    const where: Record<string, unknown> = {
      doctorId,
      type: 'INCOME',
      status: 'PAID',
      date: { gte: start, lte: end },
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        appointment: {
          include: {
            patient: {
              include: {
                patientPlans: {
                  take: 1,
                  include: { healthPlan: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    })

    const convenioMap = new Map<string, { total: number; count: number }>()
    for (const tx of transactions) {
      const planName = tx.appointment?.patient?.patientPlans?.[0]?.healthPlan?.name ?? 'Particular'
      const prev = convenioMap.get(planName) ?? { total: 0, count: 0 }
      convenioMap.set(planName, { total: prev.total + tx.amount, count: prev.count + 1 })
    }

    const data = Array.from(convenioMap.entries())
      .map(([convenio, v]) => ({ convenio, ...v }))
      .sort((a, b) => b.total - a.total)

    res.json(data)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/analytics/by-procedure', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string | undefined)
    if (!doctorId) { res.status(400).json({ message: 'doctorId obrigatório para ADMIN' }); return }

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1))
    const end   = endDate   ? new Date(endDate as string)   : new Date()

    const result = await prisma.transaction.groupBy({
      by: ['category'],
      where: {
        doctorId,
        type: 'INCOME',
        status: 'PAID',
        date: { gte: start, lte: end },
      },
      _sum:   { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    })

    const data = result.map(r => ({
      procedure: r.category ?? 'Sem categoria',
      total:     r._sum.amount ?? 0,
      count:     r._count.id,
    }))

    res.json(data)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Payment Methods (proxy for CobrancaModal) ────────────────────────────────

router.get('/payment-methods', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string)
    const methods = await prisma.paymentMethod.findMany({
      where: { doctorId, active: true },
      orderBy: { name: 'asc' },
    })
    res.json(methods)
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

// ─── Cash Flow ────────────────────────────────────────────────────────────────

router.get('/cash-flow', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, doctorId, period } = req.query
    const resolvedDoctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (doctorId as string)

    const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1)) // Start of current month
    const end = endDate ? new Date(endDate as string) : new Date()

    const where: Record<string, unknown> = {
      status: 'PAID',
      date: { gte: start, lte: end },
    }
    if (resolvedDoctorId) where.doctorId = resolvedDoctorId

    const transactions = await prisma.transaction.findMany({
      where,
      select: { date: true, type: true, amount: true },
      orderBy: { date: 'asc' },
    })

    // Group by day or month based on period param
    const byDay = new Map<string, { income: number; expense: number; balance: number }>()
    for (const tx of transactions) {
      const key = period === 'monthly'
        ? `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
        : tx.date.toISOString().split('T')[0]
      const prev = byDay.get(key) ?? { income: 0, expense: 0, balance: 0 }
      if (tx.type === 'INCOME') {
        byDay.set(key, { ...prev, income: prev.income + tx.amount, balance: prev.balance + tx.amount })
      } else {
        byDay.set(key, { ...prev, expense: prev.expense + tx.amount, balance: prev.balance - tx.amount })
      }
    }

    let runningBalance = 0
    const entries = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        runningBalance += v.income - v.expense
        return { date, ...v, cumulativeBalance: runningBalance }
      })

    const totals = {
      income: entries.reduce((acc, e) => acc + e.income, 0),
      expense: entries.reduce((acc, e) => acc + e.expense, 0),
      net: entries.reduce((acc, e) => acc + e.income - e.expense, 0),
    }

    res.json({ entries, totals })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Financial Categories CRUD ────────────────────────────────────────────────

router.get('/categories', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string)
    const categories = await prisma.financialCategory.findMany({
      where: { doctorId, active: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.json(categories)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/categories', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : req.body.doctorId
    const data = categorySchema.parse(req.body)
    const category = await prisma.financialCategory.create({ data: { ...data, doctorId } })
    res.status(201).json(category)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/categories/:id', async (req: AuthRequest, res) => {
  try {
    const data = categorySchema.partial().parse(req.body)
    const category = await prisma.financialCategory.update({ where: { id: req.params.id }, data })
    res.json(category)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/categories/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.financialCategory.update({ where: { id: req.params.id }, data: { active: false } })
    res.json({ message: 'Categoria desativada' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Cost Centers CRUD ────────────────────────────────────────────────────────

router.get('/cost-centers', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string)
    const centers = await prisma.costCenter.findMany({
      where: { doctorId, active: true },
      orderBy: { name: 'asc' },
    })
    res.json(centers)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/cost-centers', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : req.body.doctorId
    const data = costCenterSchema.parse(req.body)
    const center = await prisma.costCenter.create({ data: { ...data, doctorId } })
    res.status(201).json(center)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/cost-centers/:id', async (req: AuthRequest, res) => {
  try {
    const data = costCenterSchema.partial().parse(req.body)
    const center = await prisma.costCenter.update({ where: { id: req.params.id }, data })
    res.json(center)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/cost-centers/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.costCenter.update({ where: { id: req.params.id }, data: { active: false } })
    res.json({ message: 'Centro de custo desativado' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Bank Accounts CRUD ───────────────────────────────────────────────────────

router.get('/bank-accounts', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : (req.query.doctorId as string)
    const accounts = await prisma.bankAccount.findMany({
      where: { doctorId, active: true },
      orderBy: { name: 'asc' },
    })
    res.json(accounts)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/bank-accounts', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.role === 'DOCTOR' ? req.user!.userId : req.body.doctorId
    const data = bankAccountSchema.parse(req.body)
    const account = await prisma.bankAccount.create({ data: { ...data, doctorId } })
    res.status(201).json(account)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/bank-accounts/:id', async (req: AuthRequest, res) => {
  try {
    const data = bankAccountSchema.partial().parse(req.body)
    const account = await prisma.bankAccount.update({ where: { id: req.params.id }, data })
    res.json(account)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/bank-accounts/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.bankAccount.update({ where: { id: req.params.id }, data: { active: false } })
    res.json({ message: 'Conta bancária desativada' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
