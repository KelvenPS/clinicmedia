import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireFeature, AuthRequest } from '../middleware/auth'
import { sendWhatsAppMessage } from '../lib/whatsapp'

const router = Router()
router.use(authenticate)
router.use(requireFeature('chatbot'))

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const [total, totalLastMonth, byStatus, byModule, recent] = await Promise.all([
      prisma.lightMessageLog.count({ where: { doctorId, createdAt: { gte: monthStart } } }),
      prisma.lightMessageLog.count({ where: { doctorId, createdAt: { gte: lastMonthStart, lt: monthStart } } }),
      prisma.lightMessageLog.groupBy({
        by: ['status'],
        where: { doctorId, createdAt: { gte: monthStart } },
        _count: { id: true },
      }),
      prisma.lightMessageLog.groupBy({
        by: ['module'],
        where: { doctorId, createdAt: { gte: monthStart } },
        _count: { id: true },
      }),
      prisma.lightMessageLog.findMany({
        where: { doctorId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    const sent    = byStatus.find(s => s.status === 'SENT')?._count.id    ?? 0
    const rejected = byStatus.find(s => s.status === 'REJECTED')?._count.id ?? 0
    const failed   = byStatus.find(s => s.status === 'FAILED')?._count.id   ?? 0
    const deliveryRate = total > 0 ? Math.round((sent / total) * 100) : 0

    res.json({
      total,
      totalLastMonth,
      sent,
      rejected,
      failed,
      deliveryRate,
      byModule,
      recent,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Integration Configs ──────────────────────────────────────────────────────

router.get('/integrations', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const configs = await prisma.lightIntegrationConfig.findMany({
      where: { doctorId },
      include: { template: { select: { id: true, name: true, content: true } } },
    })
    res.json(configs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/integrations', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const schema = z.object({
      module:        z.string().min(1),
      triggerEvent:  z.string().min(1),
      enabled:       z.boolean(),
      templateId:    z.string().nullable().optional(),
      delayMinutes:  z.number().int().min(0).default(0),
    })
    const data = schema.parse(req.body)

    const config = await prisma.lightIntegrationConfig.upsert({
      where: {
        doctorId_module_triggerEvent: { doctorId, module: data.module, triggerEvent: data.triggerEvent },
      },
      update: {
        enabled:      data.enabled,
        templateId:   data.templateId ?? null,
        delayMinutes: data.delayMinutes,
      },
      create: {
        doctorId,
        module:       data.module,
        triggerEvent: data.triggerEvent,
        enabled:      data.enabled,
        templateId:   data.templateId ?? null,
        delayMinutes: data.delayMinutes,
      },
      include: { template: { select: { id: true, name: true } } },
    })

    res.json(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const templates = await prisma.lightTemplate.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(templates)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const templateSchema = z.object({
  name:      z.string().min(2, 'Nome obrigatório'),
  category:  z.string().min(1),
  content:   z.string().min(5, 'Mensagem obrigatória'),
  variables: z.array(z.string()).default([]),
  active:    z.boolean().default(true),
})

router.post('/templates', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const data = templateSchema.parse(req.body)
    const template = await prisma.lightTemplate.create({ data: { doctorId, ...data } })
    res.status(201).json(template)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/templates/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const { id } = req.params
    const data = templateSchema.partial().parse(req.body)

    const template = await prisma.lightTemplate.updateMany({
      where: { id, doctorId },
      data,
    })

    if (template.count === 0) {
      res.status(404).json({ message: 'Template não encontrado' })
      return
    }

    const updated = await prisma.lightTemplate.findUnique({ where: { id } })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/templates/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const { id } = req.params
    await prisma.lightTemplate.deleteMany({ where: { id, doctorId } })
    res.json({ message: 'Template removido' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Message History ──────────────────────────────────────────────────────────

router.get('/history', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const { module, status, page = '1' } = req.query
    const take = 20
    const skip = (parseInt(String(page)) - 1) * take

    const where: Record<string, unknown> = { doctorId }
    if (module && module !== 'todos') where.module = module
    if (status && status !== 'todos') where.status = status

    const [logs, total] = await Promise.all([
      prisma.lightMessageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.lightMessageLog.count({ where }),
    ])

    res.json({
      logs,
      total,
      page: parseInt(String(page)),
      pages: Math.ceil(total / take),
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Test Message ─────────────────────────────────────────────────────────────

router.post('/test', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const schema = z.object({
      phone:   z.string().min(8, 'Telefone obrigatório'),
      content: z.string().min(1, 'Mensagem obrigatória'),
    })
    const { phone, content } = schema.parse(req.body)

    const instance = await prisma.whatsAppInstance.findUnique({ where: { doctorId } })
    if (!instance || instance.status !== 'CONNECTED') {
      res.status(400).json({ message: 'WhatsApp não conectado. Conecte na aba Conexão.' })
      return
    }

    const log = await prisma.lightMessageLog.create({
      data: { doctorId, phone, content, module: 'teste', status: 'PENDING' },
    })

    try {
      const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`
      const result = await sendWhatsAppMessage(instance.instanceKey, jid, content)
      if (!result) throw new Error('Socket indisponível')

      const updated = await prisma.lightMessageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      res.json({ success: true, log: updated })
    } catch (sendErr) {
      const updated = await prisma.lightMessageLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: String(sendErr) },
      })
      res.status(500).json({ message: 'Falha ao enviar', log: updated })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Settings (enabled screens) ───────────────────────────────────────────────

router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const settings = await prisma.lightSettings.findUnique({ where: { doctorId } })
    res.json(settings ?? {
      enabledScreens: ['agenda', 'pacientes', 'prontuario', 'avaliacao', 'financeiro'],
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const doctorId = req.user!.userId
    const schema = z.object({
      enabledScreens: z.array(z.string()),
    })
    const { enabledScreens } = schema.parse(req.body)

    const settings = await prisma.lightSettings.upsert({
      where: { doctorId },
      update: { enabledScreens },
      create: { doctorId, enabledScreens },
    })

    res.json(settings)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
