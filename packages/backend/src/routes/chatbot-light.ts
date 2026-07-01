import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireFeature, AuthRequest } from '../middleware/auth'
import { resolveDeliveryJid } from '../lib/whatsapp'
import { resolveChatbotLightSendTarget, sendRoomWhatsAppMessage, isRoomSessionActive } from '../lib/room-whatsapp'
import { requireSecretaryPermission, getEffectiveDoctorId } from '../lib/secretaryAccess'
import { simulateLightMessage, resetSimulation } from '../lib/chatbot-light-simulator'
import { TEMPLATE_VARIABLE_REGISTRY, resolveContextFromAppointment, TemplateContext } from '../lib/chatbot-light-variables'
import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

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
  const middleware = requireSecretaryPermission('chatbot_light')
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

    const target = await resolveChatbotLightSendTarget(doctorId)
    if (!target) {
      res.status(400).json({ message: 'WhatsApp não conectado. Vincule uma Sala na aba Conexão.' })
      return
    }

    const log = await prisma.lightMessageLog.create({
      data: { doctorId, phone, content, module: 'teste', status: 'PENDING' },
    })

    try {
      const jid = resolveDeliveryJid(phone)
      const result = await sendRoomWhatsAppMessage(target.instanceKey, jid, content)
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
    actionType:   z.enum(['SEND_MESSAGE', 'TRANSFER_QUEUE', 'OPEN_MENU', 'SYSTEM_ACTION', 'END_CHAT', 'START_PLAN_SCHEDULING', 'START_LEAD_CAPTURE']),
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
  {
    key: 'LEAD_CAPTURE',
    name: 'Capturar Interesse (Pré-Agendamento)',
    label: 'Capturar Interesse (Pré-Agendamento)',
    implemented: true,
    description: 'Coleta nome e telefone do paciente e registra interesse para contato posterior',
    configurable: false,
  },
  {
    key: 'CONFIRM_APPOINTMENT',
    label: 'Confirmar consulta',
    implemented: true,
    description: 'Quando a secretária agenda uma consulta, envia template SIM/NÃO ao paciente. SIM confirma; NÃO notifica a secretária para reagendar.',
    configurable: true,
  },
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


// ─── Pre-schedulings (Lead Capture results) ───────────────────────────────────

router.get('/pre-schedulings', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const patients = await prisma.patient.findMany({
      where: {
        doctorId,
        origin: 'CHATBOT',
        status: { in: ['PRE_CADASTRO', 'ATIVO'] }
      },
      include: {
        chatbotSession: {
          select: {
            id: true,
            completedAt: true,
            contactPhone: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const result = patients.map(p => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      notes: p.notes,
      status: p.status,
      createdAt: p.createdAt,
      chatbotSession: p.chatbotSession ?? null,
    }))

    res.json(result)
  } catch (err) {
    console.error('[/chatbot-light/pre-schedulings]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── WhatsApp Instance Management (Chatbot Light) ──────────────────────────
//
// O Chatbot Light não possui mais conexão própria (QR code/Baileys). Ele usa
// exclusivamente a conexão WhatsApp já estabelecida em uma Sala, evitando
// duplicidade. O médico vincula uma Sala em LightSettings.boundRoomId, e o
// status/telefone exibidos aqui refletem a RoomWhatsAppConnection daquela sala.

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

async function resolveBoundConnectionStatus(doctorId: string) {
  const settings = await prisma.lightSettings.findUnique({
    where: { doctorId },
    select: { boundRoomId: true },
  })

  if (!settings?.boundRoomId) {
    return { status: 'NONE' as const, roomId: null, roomName: null, phoneNumber: null, displayName: null, connectedAt: null }
  }

  const room = await prisma.room.findUnique({
    where: { id: settings.boundRoomId },
    select: {
      id: true,
      name: true,
      whatsappConnection: { select: { instanceKey: true, status: true, phoneNumber: true, displayName: true, connectedAt: true } },
    },
  })

  if (!room) {
    return { status: 'NONE' as const, roomId: null, roomName: null, phoneNumber: null, displayName: null, connectedAt: null }
  }

  const conn = room.whatsappConnection

  // Reflect real socket state: if DB says CONNECTED but socket not in memory, report RECONNECTING
  let effectiveStatus: string = conn?.status ?? 'DISCONNECTED'
  if (effectiveStatus === 'CONNECTED' && conn?.instanceKey && !isRoomSessionActive(conn.instanceKey)) {
    effectiveStatus = 'RECONNECTING'
  }

  return {
    status: effectiveStatus,
    roomId: room.id,
    roomName: room.name,
    phoneNumber: conn?.phoneNumber ?? null,
    displayName: conn?.displayName ?? null,
    connectedAt: conn?.connectedAt ?? null,
  }
}

router.get('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const merged = await resolveBoundConnectionStatus(doctorId)
    res.json(merged)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/instance/status', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const merged = await resolveBoundConnectionStatus(doctorId)
    res.json(merged)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Lista as Salas do médico com o status de conexão WhatsApp de cada uma,
// para o médico escolher qual Sala fornecerá a conexão do Chatbot Light.
router.get('/instance/available-rooms', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const rooms = await prisma.room.findMany({
      where: { doctorId, active: true },
      select: {
        id: true,
        name: true,
        whatsappConnection: { select: { status: true, phoneNumber: true, displayName: true } },
      },
      orderBy: { name: 'asc' },
    })
    res.json(rooms)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance/bind-room', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { roomId } = z.object({ roomId: z.string().min(1) }).parse(req.body)

    const room = await prisma.room.findFirst({ where: { id: roomId, doctorId } })
    if (!room) {
      res.status(404).json({ message: 'Sala não encontrada' })
      return
    }

    await resolveOrCreateInstance(doctorId)
    await prisma.lightSettings.upsert({
      where: { doctorId },
      create: { doctorId, boundRoomId: roomId },
      update: { boundRoomId: roomId },
    })

    const merged = await resolveBoundConnectionStatus(doctorId)
    res.json(merged)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: err.errors })
      return
    }
    console.error('[/chatbot-light/instance/bind-room]', err)
    res.status(500).json({ message: 'Erro ao vincular sala' })
  }
})

router.post('/instance/unbind-room', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    await prisma.lightSettings.upsert({
      where: { doctorId },
      create: { doctorId, boundRoomId: null },
      update: { boundRoomId: null },
    })
    res.json({ status: 'NONE', roomId: null, roomName: null, phoneNumber: null, displayName: null, connectedAt: null })
  } catch (err) {
    console.error('[/chatbot-light/instance/unbind-room]', err)
    res.status(500).json({ message: 'Erro ao desvincular sala' })
  }
})

// ─── Variable Registry (para o frontend construir UI dinâmica) ────────────────

router.get('/variable-registry', (_req, res) => {
  res.json(TEMPLATE_VARIABLE_REGISTRY)
})

// ─── Trigger manual de template para uma consulta específica ─────────────────

const VALID_TRIGGER_EVENTS = [
  'APPOINTMENT_REMINDER_24H',
  'APPOINTMENT_REMINDER_2H',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'NEW_APPOINTMENT',
  'NF_AVAILABLE',
  'PAYMENT_OVERDUE',
] as const

const triggerAppointmentSchema = z.object({
  appointmentId: z.string().min(1, 'appointmentId obrigatório'),
  event: z.enum(VALID_TRIGGER_EVENTS),
  extras: z.record(z.any()).optional(),
})

router.post('/trigger-appointment', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const parsed = triggerAppointmentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Dados inválidos', errors: parsed.error.errors })
      return
    }

    const { appointmentId, event, extras } = parsed.data

    // Verificar que a consulta pertence ao médico
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, doctorId },
      select: { id: true },
    })
    if (!appt) {
      res.status(404).json({ message: 'Consulta não encontrada' })
      return
    }

    // Verificar config de integração ativa para o evento
    const config = await prisma.lightIntegrationConfig.findFirst({
      where: { doctorId, triggerEvent: event, enabled: true },
      include: { template: { select: { id: true, active: true } } },
    })
    if (!config || !config.template?.active) {
      res.status(404).json({ message: `Nenhuma integração ativa para o evento ${event}` })
      return
    }

    // Resolver contexto completo
    const context = await resolveContextFromAppointment(
      appointmentId,
      prisma,
      (extras as Partial<TemplateContext>) ?? {}
    )

    if (!context.patientPhone) {
      res.status(400).json({ message: 'Paciente sem telefone cadastrado' })
      return
    }

    await triggerLightAutomatedMessage(doctorId, event, {
      ...context,
      patientPhone: context.patientPhone,
    })

    res.json({ sent: true, to: context.patientPhone })
  } catch (err) {
    console.error('[/chatbot-light/trigger-appointment]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Simulator ───────────────────────────────────────────────────────────────

const simulateSchema = z.object({
  sessionToken: z.string().min(1).max(64),
  message: z.string().min(1).max(500),
})

router.post('/simulate', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const parsed = simulateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Dados inválidos', errors: parsed.error.errors })
      return
    }
    const { sessionToken, message } = parsed.data
    const result = await simulateLightMessage({ doctorId, sessionToken, messageText: message })
    res.json(result)
  } catch (err) {
    console.error('[/chatbot-light/simulate]', err)
    res.status(500).json({ message: 'Erro interno no simulador' })
  }
})

router.delete('/simulate/:sessionToken', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { sessionToken } = req.params
    if (!sessionToken || sessionToken.length > 64) {
      res.status(400).json({ message: 'sessionToken inválido' })
      return
    }
    await resetSimulation(doctorId, sessionToken)
    res.json({ ok: true })
  } catch (err) {
    console.error('[/chatbot-light/simulate DELETE]', err)
    res.status(500).json({ message: 'Erro ao resetar simulação' })
  }
})

export default router
