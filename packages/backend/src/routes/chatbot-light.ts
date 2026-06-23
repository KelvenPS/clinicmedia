import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireFeature, AuthRequest } from '../middleware/auth'
import { sendWhatsAppMessage, isSessionActive, startSession, stopSession, resolveDeliveryJid } from '../lib/whatsapp'
import { requireSecretaryPermission, getEffectiveDoctorId } from '../lib/secretaryAccess'

const router = Router()
router.use(authenticate)
router.use(requireFeature('chatbot'))

// Permissão de secretária verificada dinamicamente para permitir que acessem status da conexão (/instance) sem a permissão total
router.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const isStatusRoute = req.method === 'GET' && (req.path === '/instance' || req.path === '/instance/status')
  if (isStatusRoute) {
    next()
    return
  }
  const middleware = requireSecretaryPermission('chatbot')
  await middleware(req, res, next)
})

async function getTargetDoctorId(req: AuthRequest): Promise<string> {
  const effectiveId = await getEffectiveDoctorId(req)
  return effectiveId ?? req.user!.userId
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
    const schema = z.object({
      phone:   z.string().min(8, 'Telefone obrigatório'),
      content: z.string().min(1, 'Mensagem obrigatória'),
    })
    const { phone, content } = schema.parse(req.body)

    const instance = await prisma.whatsAppInstance.findUnique({
      where: {
        doctorId_type: {
          doctorId,
          type: 'CHATBOT_LIGHT',
        },
      },
    })
    if (!instance || instance.status !== 'CONNECTED') {
      res.status(400).json({ message: 'WhatsApp não conectado. Conecte na aba Conexão.' })
      return
    }

    // O status no banco pode estar desatualizado em relação à sessão Baileys real
    // (processo reiniciou, sessão caiu em loop de reconexão, etc).
    if (!isSessionActive(instance.instanceKey)) {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
      }).catch(() => {})
      res.status(400).json({ message: 'A sessão do WhatsApp caiu. Reconecte na aba Conexão e tente novamente.' })
      return
    }

    const log = await prisma.lightMessageLog.create({
      data: { doctorId, phone, content, module: 'teste', status: 'PENDING' },
    })

    try {
      const jid = resolveDeliveryJid(phone)
      const result = await sendWhatsAppMessage(instance.instanceKey, jid, content)
      if (!result) throw new Error('Não foi possível enviar: sessão indisponível ou número inválido')

      const updated = await prisma.lightMessageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      res.json({ success: true, log: updated })
    } catch (sendErr: any) {
      const isRecentlyConnected = sendErr?.code === 'WA_RECENTLY_CONNECTED'
      const isNotConnected = sendErr?.message?.includes('indisponível') || sendErr?.message?.includes('not connected')
      
      const errorCode = isRecentlyConnected 
        ? 'WA_RECENTLY_CONNECTED' 
        : (isNotConnected ? 'WA_NOT_CONNECTED' : 'WA_SEND_FAILED')
        
      const errorMessage = sendErr?.message || String(sendErr)

      const updated = await prisma.lightMessageLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage },
      })
      
      res.status(isRecentlyConnected ? 429 : 502).json({
        success: false,
        code: errorCode,
        message: errorMessage,
        log: updated
      })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Fluxos ───────────────────────────────────────────────────────────────────

const fluxoSchema = z.object({
  name:            z.string().min(2, 'Nome obrigatório'),
  description:     z.string().optional().nullable(),
  keywords:        z.string().min(1, 'Palavras-chave obrigatórias'),
  welcomeMessage:  z.string().min(5, 'Mensagem obrigatória'),
  options:         z.array(z.object({
    id:           z.string(),
    number:       z.number().int().min(1),
    label:        z.string().min(1),
    triggers:     z.string().min(1),
    response:     z.string().min(1),
    actionType:   z.enum(['SEND_MESSAGE', 'TRANSFER_QUEUE', 'OPEN_MENU', 'SYSTEM_ACTION', 'END_CHAT', 'START_PLAN_SCHEDULING']),
    queueId:      z.string().nullable().optional(),
    nextFlowId:   z.string().nullable().optional(),
    systemAction: z.string().nullable().optional(),
    systemActionKey: z.string().nullable().optional(),
    systemActionConfigId: z.string().nullable().optional(),
    transitionMessage: z.string().nullable().optional(),
    planSource:   z.string().nullable().optional(),
    doctorSelect: z.string().nullable().optional(),
    limitSlots:   z.any().optional(),
    searchWindowDays: z.any().optional(),
    durationMinutes: z.any().optional(),
    requireCpf:   z.any().optional(),
    requireConvenio: z.any().optional(),
    useWhatsappPhone: z.any().optional(),
    successMessage: z.string().nullable().optional(),
  })).default([]),
  maxAttempts:     z.number().int().min(1).max(10).default(3),
  fallbackMessage: z.string().default('Não consegui entender. Vou transferir para um atendente.'),
  active:          z.boolean().default(true),
})

router.get('/fluxos', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const fluxos = await prisma.lightFluxo.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(fluxos)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/fluxos', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const data = fluxoSchema.parse(req.body)
    const fluxo = await prisma.lightFluxo.create({
      data: { doctorId, ...data, options: data.options as object[] },
    })
    res.status(201).json(fluxo)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/fluxos/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const data = fluxoSchema.partial().parse(req.body)

    const result = await prisma.lightFluxo.updateMany({
      where: { id, doctorId },
      data: { ...data, options: data.options as object[] | undefined },
    })

    if (result.count === 0) {
      res.status(404).json({ message: 'Fluxo não encontrado' })
      return
    }

    const updated = await prisma.lightFluxo.findUnique({ where: { id } })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/fluxos/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    await prisma.lightFluxo.deleteMany({ where: { id, doctorId } })
    res.json({ message: 'Fluxo removido' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Quick Replies ────────────────────────────────────────────────────────────

const quickReplySchema = z.object({
  keyword:  z.string().min(1, 'Palavra-chave obrigatória'),
  response: z.string().min(1, 'Resposta obrigatória'),
  active:   z.boolean().default(true),
})

router.get('/quick-replies', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const replies = await prisma.lightQuickReply.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(replies)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/quick-replies', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const data = quickReplySchema.parse(req.body)
    const reply = await prisma.lightQuickReply.create({ data: { doctorId, ...data } })
    res.status(201).json(reply)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/quick-replies/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const data = quickReplySchema.partial().parse(req.body)

    const result = await prisma.lightQuickReply.updateMany({
      where: { id, doctorId },
      data,
    })

    if (result.count === 0) {
      res.status(404).json({ message: 'Resposta rápida não encontrada' })
      return
    }

    const updated = await prisma.lightQuickReply.findUnique({ where: { id } })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/quick-replies/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    await prisma.lightQuickReply.deleteMany({ where: { id, doctorId } })
    res.json({ message: 'Resposta rápida removida' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Settings (enabled screens) ───────────────────────────────────────────────

router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
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
    const doctorId = await getTargetDoctorId(req)
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

// ─── System Action Configurations ─────────────────────────────────────────────

const SYSTEM_ACTION_CATALOG = [
  {
    key: 'SCHEDULE_APPOINTMENT',
    label: 'Agendar consulta',
    implemented: true,
    description: 'Coleta dados do paciente, consulta agenda real e cria o agendamento.',
  },
  { key: 'CONFIRM_APPOINTMENT', label: 'Confirmar consulta', implemented: false },
  { key: 'CANCEL_APPOINTMENT', label: 'Cancelar consulta', implemented: false },
  { key: 'SEND_PAYMENT_LINK', label: 'Enviar link de pagamento', implemented: false },
  { key: 'SEND_EVALUATION_FORM', label: 'Enviar formulário de avaliação', implemented: false },
  { key: 'UPDATE_PATIENT', label: 'Atualizar cadastro do paciente', implemented: false },
]

router.get('/system-actions/catalog', async (req: AuthRequest, res) => {
  res.json(SYSTEM_ACTION_CATALOG)
})

router.get('/system-actions', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await prisma.whatsAppInstance.findUnique({
      where: {
        doctorId_type: {
          doctorId,
          type: 'CHATBOT_LIGHT',
        },
      },
    })
    if (!instance) {
      res.json([])
      return
    }
    const configs = await prisma.lightSystemActionConfig.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(configs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/system-actions', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await prisma.whatsAppInstance.findUnique({
      where: {
        doctorId_type: {
          doctorId,
          type: 'CHATBOT_LIGHT',
        },
      },
    })
    if (!instance) {
      res.status(400).json({ message: 'WhatsApp não configurado' })
      return
    }

    const schema = z.object({
      actionKey: z.string().min(1),
      name: z.string().min(2, 'Nome obrigatório'),
      description: z.string().optional().nullable(),
      config: z.any(),
    })
    const data = schema.parse(req.body)

    if (data.actionKey === 'SCHEDULE_APPOINTMENT') {
      const cfg = data.config
      if (!cfg || !cfg.planSource || !cfg.doctorSelect || !cfg.limitSlots || !cfg.searchWindowDays || !cfg.durationMinutes) {
        res.status(400).json({ message: 'Configurações de agendamento incompletas' })
        return
      }
    }

    const config = await prisma.lightSystemActionConfig.create({
      data: {
        instanceId: instance.id,
        actionKey: data.actionKey,
        name: data.name,
        description: data.description,
        config: data.config,
      },
    })
    res.status(201).json(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/system-actions/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const schema = z.object({
      name: z.string().min(2, 'Nome obrigatório'),
      description: z.string().optional().nullable(),
      config: z.any(),
    })
    const data = schema.parse(req.body)

    const updated = await prisma.lightSystemActionConfig.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        config: data.config,
      },
    })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/system-actions/:id/active', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const schema = z.object({ active: z.boolean() })
    const { active } = schema.parse(req.body)

    const updated = await prisma.lightSystemActionConfig.update({
      where: { id },
      data: { active },
    })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/system-actions/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getTargetDoctorId(req)

    // Exclusão segura: verificar se a config está vinculada a algum fluxo ativo
    const fluxos = await prisma.lightFluxo.findMany({
      where: { doctorId },
    })

    const isInUse = fluxos.some(f => {
      let opts: any[] = []
      try {
        opts = typeof f.options === 'string' ? JSON.parse(f.options) : (f.options as any[])
      } catch {
        opts = []
      }
      return opts.some(o => o.actionType === 'SYSTEM_ACTION' && o.systemActionConfigId === id)
    })

    if (isInUse) {
      res.status(400).json({ message: 'Esta configuração está sendo usada em um de seus fluxos e não pode ser excluída.' })
      return
    }

    await prisma.lightSystemActionConfig.delete({
      where: { id },
    })
    res.json({ message: 'Configuração excluída com sucesso.' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/system-actions/:id/test', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getTargetDoctorId(req)
    const config = await prisma.lightSystemActionConfig.findUnique({
      where: { id },
    })
    if (!config) {
      res.status(404).json({ message: 'Configuração não encontrada' })
      return
    }

    // Validações básicas de consistência para "Agendar Consulta"
    const activeRooms = await prisma.room.count({
      where: { doctorId, active: true },
    })
    if (activeRooms === 0) {
      res.status(400).json({ message: 'O médico não possui salas de atendimento ativas.' })
      return
    }

    const cfg = config.config as any
    if (cfg?.planSource === 'DOCTOR_SERVICES') {
      const activeServices = await prisma.appointmentType.count({
        where: { doctorId, active: true },
      })
      if (activeServices === 0) {
        res.status(400).json({ message: 'O médico não possui serviços cadastrados.' })
        return
      }
    } else if (cfg?.planSource === 'DOCTOR_CONVENIOS') {
      const activeConvenios = await prisma.healthPlan.count({
        where: { doctorId, active: true },
      })
      if (activeConvenios === 0) {
        res.status(400).json({ message: 'O médico não possui convênios cadastrados.' })
        return
      }
    }

    res.json({ success: true, message: 'Configuração validada com sucesso e pronta para uso.' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})


// ─── WhatsApp Instance Management (Chatbot Light) ──────────────────────────

async function resolveInstance(userId: string) {
  const instance = await prisma.whatsAppInstance.findUnique({
    where: {
      doctorId_type: {
        doctorId: userId,
        type: 'CHATBOT_LIGHT',
      },
    },
  })
  if (!instance) return instance

  if (instance.status === 'CONNECTED' && !isSessionActive(instance.instanceKey)) {
    return prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
    }).catch(() => instance)
  }

  return instance
}

async function resolveOrCreateInstance(userId: string) {
  const existing = await prisma.whatsAppInstance.findUnique({
    where: {
      doctorId_type: {
        doctorId: userId,
        type: 'CHATBOT_LIGHT',
      },
    },
  })
  if (existing) return existing
  return prisma.whatsAppInstance.create({
    data: { doctorId: userId, type: 'CHATBOT_LIGHT', status: 'DISCONNECTED' },
  })
}

router.get('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await resolveInstance(doctorId)
    res.json(instance ?? null)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance/connect', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await resolveOrCreateInstance(doctorId)

    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'CONNECTING', qrCode: null, qrCodeExpiresAt: null },
    })

    startSession(instance.instanceKey, instance.id).catch(err =>
      console.error('[/chatbot-light/instance/connect] Erro Baileys:', err)
    )

    res.json({ status: 'CONNECTING', instanceKey: instance.instanceKey })
  } catch (err) {
    console.error('[/chatbot-light/instance/connect]', err)
    res.status(500).json({ message: 'Erro ao iniciar conexão com WhatsApp' })
  }
})

router.get('/instance/status', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await resolveInstance(doctorId)
    if (!instance) {
      res.json({ status: 'NONE' })
      return
    }

    const now = new Date()
    const qrExpired = instance.qrCodeExpiresAt ? instance.qrCodeExpiresAt < now : false

    res.json({
      status: instance.status,
      qrCode: qrExpired ? null : instance.qrCode,
      qrCodeExpired: qrExpired,
      phoneNumber: instance.phoneNumber,
      displayName: instance.displayName,
      connectedAt: instance.connectedAt,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await resolveInstance(doctorId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    await stopSession(instance.instanceKey)

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: 'DISCONNECTED',
        qrCode: null,
        qrCodeExpiresAt: null,
        phoneNumber: null,
        displayName: null,
        disconnectedAt: new Date(),
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('[/chatbot-light/instance/disconnect]', err)
    res.status(500).json({ message: 'Erro ao desconectar WhatsApp' })
  }
})

export default router
