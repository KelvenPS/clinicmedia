import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireFeature, AuthRequest } from '../middleware/auth'
import { resolveChatbotLightSendTarget, sendRoomWhatsAppMessage, checkPhoneOnWhatsApp, normalizeToWhatsAppJid, isRoomSessionActive } from '../lib/room-whatsapp'
import { requireSecretaryPermission, getEffectiveDoctorId, logAudit } from '../lib/secretaryAccess'
import { simulateLightMessage, resetSimulation } from '../lib/chatbot-light-simulator'
import { TEMPLATE_VARIABLE_REGISTRY, resolveContextFromAppointment, TemplateContext } from '../lib/chatbot-light-variables'
import { triggerLightAutomatedMessage, sendLightMessage } from '../lib/chatbot-light-engine'
import { getChatbotLightTasks } from '../lib/chatbot-light-tasks'
import { getChatbotLightReport } from '../lib/chatbot-light-reports'
import { DEFAULT_BUSINESS_HOURS } from '../lib/chatbot-light-business-hours'
import { getUnifiedHistory, HistoryEventType, HistoryStatus } from '../lib/chatbot-light-history'

const router = Router()
router.use(authenticate)
router.use(requireFeature('chatbot'))

// Rotas de "uso do dia a dia" (chatbot_light_operar) — tudo o resto exige
// "configurar" (chatbot_light_configurar). Ver Fase 3 do plano de refatoração.
const OPERATE_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'GET',   path: /^\/dashboard$/ },
  { method: 'GET',   path: /^\/reports$/ },
  { method: 'GET',   path: /^\/chatbots$/ },
  { method: 'GET',   path: /^\/history$/ },
  { method: 'GET',   path: /^\/history\/unified$/ },
  { method: 'POST',  path: /^\/history\/[^/]+\/resend$/ },
  { method: 'POST',  path: /^\/test$/ },
  { method: 'GET',   path: /^\/quick-replies$/ },
  { method: 'GET',   path: /^\/pre-schedulings$/ },
  { method: 'PATCH', path: /^\/pre-schedulings\/[^/]+\/lead-status$/ },
  { method: 'POST',  path: /^\/trigger-appointment$/ },
  { method: 'GET',   path: /^\/tasks$/ },
  { method: 'PATCH', path: /^\/sessions\/[^/]+\/resolve$/ },
  { method: 'PATCH', path: /^\/sessions\/[^/]+\/status$/ },
  { method: 'POST',  path: /^\/transactions\/[^/]+\/send-reminder$/ },
]

// Permissão de secretária verificada dinamicamente: rotas de status da conexão
// (/instance) não exigem permissão, rotas de uso diário exigem "operar", e as
// demais (configuração) exigem "configurar".
router.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const isStatusRoute = req.method === 'GET' && (req.path === '/instance' || req.path === '/instance/status')
  if (isStatusRoute) {
    next()
    return
  }
  const isOperateRoute = OPERATE_ROUTES.some(r => r.method === req.method && r.path.test(req.path))
  const middleware = requireSecretaryPermission(isOperateRoute ? 'chatbot_light_operar' : 'chatbot_light_configurar')
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

// ─── Relatório gerencial ────────────────────────────────────────────────────────

const reportQuerySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  module: z.string().optional(),
  status: z.string().optional(),
  flowId: z.string().optional(),
})

router.get('/reports', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const q = reportQuerySchema.parse(req.query)
    const report = await getChatbotLightReport(doctorId, {
      startDate: new Date(q.startDate),
      endDate: new Date(q.endDate),
      module: q.module,
      status: q.status,
      flowId: q.flowId,
    })
    res.json(report)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Parâmetros de filtro inválidos' })
      return
    }
    console.error('[/chatbot-light/reports]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Central de Tarefas ────────────────────────────────────────────────────────

router.get('/tasks', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const tasks = await getChatbotLightTasks(doctorId)
    res.json(tasks)
  } catch (err) {
    console.error('[/chatbot-light/tasks]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Sessões pertencem a uma instância (que pertence a um chatbot) — a
// verificação de propriedade é feita pelo doctorId da instância dona da
// sessão, não mais "a" instância única do médico (multi-chatbot, jul/2026).
async function findOwnedSessionInstance(sessionId: string, doctorId: string) {
  const session = await prisma.lightFlowSession.findUnique({ where: { id: sessionId } })
  if (!session) return null
  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: session.instanceId } })
  if (!instance || instance.doctorId !== doctorId) return null
  return { session, instance }
}

router.patch('/sessions/:id/resolve', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params

    const owned = await findOwnedSessionInstance(id, doctorId)
    if (!owned) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const result = await prisma.lightFlowSession.updateMany({
      where: { id, instanceId: owned.instance.id },
      data: { status: 'COMPLETED' },
    })
    if (result.count === 0) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SESSION_RESOLVED',
      description: 'Conversa transferida marcada como atendida',
      metadata: { doctorId, sessionId: id },
    })

    res.json({ message: 'Conversa marcada como atendida' })
  } catch (err) {
    console.error('[/chatbot-light/sessions/:id/resolve]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const sessionStatusSchema = z.object({
  status: z.enum(['CANCELLED', 'TRANSFER']),
})

router.patch('/sessions/:id/status', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const { status } = sessionStatusSchema.parse(req.body)

    const owned = await findOwnedSessionInstance(id, doctorId)
    if (!owned) {
      res.status(404).json({ message: 'Sessão não encontrada' })
      return
    }

    const result = await prisma.lightFlowSession.updateMany({
      where: { id, instanceId: owned.instance.id },
      data: { status },
    })
    if (result.count === 0) {
      res.status(404).json({ message: 'Sessão não encontrada' })
      return
    }

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SESSION_STATUS_CHANGED',
      description: status === 'CANCELLED' ? 'Sessão de chatbot encerrada manualmente' : 'Sessão de chatbot transferida manualmente para atendente',
      metadata: { doctorId, sessionId: id, status },
    })

    res.json({ message: status === 'CANCELLED' ? 'Sessão encerrada' : 'Sessão transferida para atendente' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Status inválido' })
      return
    }
    console.error('[/chatbot-light/sessions/:id/status]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/history/:id/resend', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params

    const log = await prisma.lightMessageLog.findFirst({ where: { id, doctorId } })
    if (!log) {
      res.status(404).json({ message: 'Mensagem não encontrada' })
      return
    }

    // Logs anteriores à migration multi-chatbot não têm chatbotId — caem no
    // chatbot padrão da conta.
    const instance = log.chatbotId
      ? await prisma.whatsAppInstance.findUnique({ where: { chatbotId: log.chatbotId } })
      : await prisma.whatsAppInstance.findFirst({ where: { doctorId, type: 'CHATBOT_LIGHT' } })
    if (!instance) {
      res.status(400).json({ message: 'WhatsApp não conectado. Vincule uma Sala na aba Conexão.' })
      return
    }

    const ok = await sendLightMessage(instance, log.phone, log.content, log.module, log.triggerEvent ?? undefined, log.recipientName ?? undefined, log.templateId ?? undefined)

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_MESSAGE_RESENT',
      description: `Reenvio de mensagem para ${log.recipientName ?? log.phone}`,
      metadata: { doctorId, originalLogId: id, success: ok },
    })

    res.json({ success: ok })
  } catch (err) {
    console.error('[/chatbot-light/history/:id/resend]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/transactions/:id/send-reminder', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params

    const tx = await prisma.transaction.findFirst({
      where: { id, doctorId },
      include: { appointment: { include: { patient: true } } },
    })
    if (!tx || !tx.appointmentId || !tx.appointment?.patient.phone) {
      res.status(404).json({ message: 'Cobrança não encontrada ou sem consulta/paciente vinculado' })
      return
    }

    const context = await resolveContextFromAppointment(tx.appointmentId, prisma, {
      paymentValue: String(tx.amount),
      link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pagar/${tx.id}`,
    })
    if (!context.patientPhone) {
      res.status(400).json({ message: 'Paciente sem telefone cadastrado' })
      return
    }

    await triggerLightAutomatedMessage(doctorId, 'PAYMENT_REMINDER', {
      ...context,
      patientPhone: context.patientPhone,
    })

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_PAYMENT_REMINDER_SENT',
      description: `Lembrete de cobrança enviado para ${context.patientName ?? context.patientPhone}`,
      metadata: { doctorId, transactionId: id },
    })

    res.json({ sent: true })
  } catch (err) {
    console.error('[/chatbot-light/transactions/:id/send-reminder]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Integration Configs ──────────────────────────────────────────────────────

router.get('/integrations', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const chatbotId = req.query.chatbotId as string | undefined
    const configs = await prisma.lightIntegrationConfig.findMany({
      where: chatbotId ? { doctorId, chatbotId } : { doctorId },
      include: {
        template: { select: { id: true, name: true, content: true } },
        chatbot: { select: { id: true, name: true } },
      },
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
      chatbotId:     z.string().optional(),
    })
    const data = schema.parse(req.body)
    const chatbotId = data.chatbotId ?? (await getOrCreateDefaultChatbot(doctorId)).id

    const config = await prisma.lightIntegrationConfig.upsert({
      where: {
        doctorId_chatbotId_module_triggerEvent: { doctorId, chatbotId, module: data.module, triggerEvent: data.triggerEvent },
      },
      update: {
        enabled:      data.enabled,
        templateId:   data.templateId ?? null,
        delayMinutes: data.delayMinutes,
      },
      create: {
        doctorId,
        chatbotId,
        module:       data.module,
        triggerEvent: data.triggerEvent,
        enabled:      data.enabled,
        templateId:   data.templateId ?? null,
        delayMinutes: data.delayMinutes,
      },
      include: { template: { select: { id: true, name: true } } },
    })

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_INTEGRATION_UPDATED',
      description: `Campanha "${data.module}/${data.triggerEvent}" ${data.enabled ? 'ativada' : 'desativada'}`,
      metadata: { doctorId, module: data.module, triggerEvent: data.triggerEvent, enabled: data.enabled, templateId: data.templateId ?? null },
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_TEMPLATE_CREATED',
      description: `Template "${template.name}" criado`,
      metadata: { doctorId, templateId: template.id },
    })
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_TEMPLATE_UPDATED',
      description: `Template "${updated?.name}" atualizado`,
      metadata: { doctorId, templateId: id },
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

router.delete('/templates/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    await prisma.lightTemplate.deleteMany({ where: { id, doctorId } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_TEMPLATE_DELETED',
      description: 'Template removido',
      metadata: { doctorId, templateId: id },
    })
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

router.get('/history/unified', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const q = req.query
    const result = await getUnifiedHistory(doctorId, {
      startDate: q.startDate ? new Date(String(q.startDate)) : undefined,
      endDate: q.endDate ? new Date(String(q.endDate)) : undefined,
      status: (q.status && q.status !== 'todos') ? q.status as HistoryStatus : undefined,
      module: (q.module && q.module !== 'todos') ? String(q.module) : undefined,
      eventType: (q.eventType && q.eventType !== 'todos') ? q.eventType as HistoryEventType : undefined,
      chatbotId: q.chatbotId ? String(q.chatbotId) : undefined,
      search: q.search ? String(q.search) : undefined,
    })
    res.json(result)
  } catch (err) {
    console.error('[/chatbot-light/history/unified]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Test Message ─────────────────────────────────────────────────────────────

router.post('/test', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const schema = z.object({
      phone:      z.string().min(8, 'Telefone obrigatório'),
      content:    z.string().min(1, 'Mensagem obrigatória'),
      templateId: z.string().optional(),
      chatbotId:  z.string().optional(),
    })
    const { phone, content, templateId, chatbotId: bodyChatbotId } = schema.parse(req.body)
    const chatbotId = bodyChatbotId || (await getOrCreateDefaultChatbot(doctorId)).id

    const target = await resolveChatbotLightSendTarget(chatbotId)
    if (!target) {
      res.status(400).json({ message: 'WhatsApp não conectado. Vincule uma Sala na aba Conexão.' })
      return
    }

    // Resolve and verify the JID before sending
    const resolvedJid = normalizeToWhatsAppJid(phone)
    const normalizedPhone = resolvedJid.replace('@s.whatsapp.net', '')

    // Check if the number exists on WhatsApp (gives proper error instead of silent failure)
    const phoneCheck = await checkPhoneOnWhatsApp(target.instanceKey, phone)
    if (phoneCheck && !phoneCheck.exists) {
      res.status(400).json({
        success: false,
        message: `O número ${phone} não está cadastrado no WhatsApp.`,
        resolvedJid,
      })
      return
    }

    // Use the jid returned by onWhatsApp if available (handles 8-digit / 9-digit variants)
    const deliveryJid = (phoneCheck?.jid && phoneCheck.exists) ? phoneCheck.jid : resolvedJid

    const log = await prisma.lightMessageLog.create({
      data: { doctorId, chatbotId, phone: normalizedPhone, content, module: 'teste', status: 'PENDING', templateId: templateId ?? null },
    })

    try {
      const result = await sendRoomWhatsAppMessage(target.instanceKey, deliveryJid, content)
      if (!result) throw new Error('Não foi possível enviar: sessão indisponível ou número inválido')

      const updated = await prisma.lightMessageLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      res.json({ success: true, log: updated, resolvedJid: result.resolvedJid })
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
    templateId:   z.string().nullable().optional(),
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
    const chatbotId = req.query.chatbotId as string | undefined
    const fluxos = await prisma.lightFluxo.findMany({
      where: chatbotId ? { doctorId, chatbotId } : { doctorId },
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
    const chatbotId = req.body?.chatbotId || (await getOrCreateDefaultChatbot(doctorId)).id
    const fluxo = await prisma.lightFluxo.create({
      data: { doctorId, chatbotId, ...data, options: data.options as object[] },
    })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_FLUXO_CREATED',
      description: `Fluxo "${fluxo.name}" criado`,
      metadata: { doctorId, fluxoId: fluxo.id },
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_FLUXO_UPDATED',
      description: `Fluxo "${updated?.name}" atualizado`,
      metadata: { doctorId, fluxoId: id },
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

router.delete('/fluxos/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    await prisma.lightFluxo.deleteMany({ where: { id, doctorId } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_FLUXO_DELETED',
      description: 'Fluxo removido',
      metadata: { doctorId, fluxoId: id },
    })
    res.json({ message: 'Fluxo removido' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Quick Replies ────────────────────────────────────────────────────────────

const quickReplySchema = z.object({
  keyword:    z.string().min(1, 'Palavra-chave obrigatória'),
  response:   z.string().min(1, 'Resposta obrigatória'),
  templateId: z.string().nullable().optional(),
  active:     z.boolean().default(true),
})

router.get('/quick-replies', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const chatbotId = req.query.chatbotId as string | undefined
    const replies = await prisma.lightQuickReply.findMany({
      where: chatbotId ? { doctorId, chatbotId } : { doctorId },
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
    const chatbotId = req.body?.chatbotId || (await getOrCreateDefaultChatbot(doctorId)).id
    const reply = await prisma.lightQuickReply.create({ data: { doctorId, chatbotId, ...data } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_QUICKREPLY_CREATED',
      description: `Resposta rápida "${reply.keyword}" criada`,
      metadata: { doctorId, quickReplyId: reply.id },
    })
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_QUICKREPLY_UPDATED',
      description: `Resposta rápida "${updated?.keyword}" atualizada`,
      metadata: { doctorId, quickReplyId: id },
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

router.delete('/quick-replies/:id', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    await prisma.lightQuickReply.deleteMany({ where: { id, doctorId } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_QUICKREPLY_DELETED',
      description: 'Resposta rápida removida',
      metadata: { doctorId, quickReplyId: id },
    })
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
    res.json({
      enabledScreens: settings?.enabledScreens ?? ['agenda', 'pacientes', 'prontuario', 'avaliacao', 'financeiro'],
      advancedMode: settings?.advancedMode ?? false,
      businessHours: settings?.businessHours ?? DEFAULT_BUSINESS_HOURS,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const businessHoursSchema = z.object({
  enabled: z.boolean(),
  daysOfWeek: z.array(z.string()),
  startTime: z.string(),
  endTime: z.string(),
  offHoursMessage: z.string(),
  allowLeadCaptureOffHours: z.boolean(),
})

router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const schema = z.object({
      enabledScreens: z.array(z.string()).optional(),
      advancedMode: z.boolean().optional(),
      businessHours: businessHoursSchema.optional(),
    })
    const data = schema.parse(req.body)

    const settings = await prisma.lightSettings.upsert({
      where: { doctorId },
      update: data,
      create: { doctorId, ...data },
    })

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SETTINGS_UPDATED',
      description: 'Configurações do Chatbot Light atualizadas',
      metadata: { doctorId, ...data },
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

async function resolveInstanceForChatbot(doctorId: string, chatbotIdParam?: string) {
  const chatbotId = chatbotIdParam || (await getOrCreateDefaultChatbot(doctorId)).id
  return prisma.whatsAppInstance.findUnique({ where: { chatbotId } })
}

router.get('/system-actions', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const instance = await resolveInstanceForChatbot(doctorId, req.query.chatbotId as string | undefined)
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
    const instance = await resolveInstanceForChatbot(doctorId, req.body?.chatbotId)
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SYSTEMACTION_CREATED',
      description: `Ação do sistema "${config.name}" (${config.actionKey}) criada`,
      metadata: { doctorId, systemActionConfigId: config.id, actionKey: config.actionKey },
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
    const doctorId = await getTargetDoctorId(req)
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SYSTEMACTION_UPDATED',
      description: `Ação do sistema "${updated.name}" atualizada`,
      metadata: { doctorId, systemActionConfigId: id },
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
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const schema = z.object({ active: z.boolean() })
    const { active } = schema.parse(req.body)

    const updated = await prisma.lightSystemActionConfig.update({
      where: { id },
      data: { active },
    })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SYSTEMACTION_TOGGLED',
      description: `Ação do sistema "${updated.name}" ${active ? 'ativada' : 'desativada'}`,
      metadata: { doctorId, systemActionConfigId: id, active },
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
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_SYSTEMACTION_DELETED',
      description: 'Ação do sistema removida',
      metadata: { doctorId, systemActionConfigId: id },
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

const LEAD_STATUSES = ['NOVO', 'EM_ANALISE', 'CONVERTIDO', 'DESCARTADO'] as const

router.get('/pre-schedulings', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const leadStatusFilter = req.query.leadStatus as string | undefined

    const patients = await prisma.patient.findMany({
      where: {
        doctorId,
        origin: 'CHATBOT',
        leadStatus: leadStatusFilter ? leadStatusFilter : { not: null },
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
      doctorId: p.doctorId,
      name: p.name,
      phone: p.phone,
      notes: p.notes,
      status: p.status,
      leadStatus: p.leadStatus,
      createdAt: p.createdAt,
      chatbotSession: p.chatbotSession ?? null,
    }))

    res.json(result)
  } catch (err) {
    console.error('[/chatbot-light/pre-schedulings]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/pre-schedulings/:id/lead-status', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const { leadStatus } = z.object({ leadStatus: z.enum(LEAD_STATUSES) }).parse(req.body)

    const patient = await prisma.patient.findFirst({ where: { id, doctorId, origin: 'CHATBOT' } })
    if (!patient) {
      res.status(404).json({ message: 'Pré-agendamento não encontrado' })
      return
    }

    const data: Record<string, unknown> = { leadStatus }
    // Convertido em paciente: sai do estado "cadastro pendente" que hoje
    // trava Prontuário/Avaliações — mesmo efeito de complete-registration.
    if (leadStatus === 'CONVERTIDO') {
      data.status = 'ATIVO'
      data.completedAt = new Date()
      data.completedByUserId = req.user!.userId
    }

    const updated = await prisma.patient.update({ where: { id }, data })

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_LEAD_STATUS_CHANGED',
      description: `Pré-agendamento de ${patient.name} atualizado para ${leadStatus}`,
      metadata: { doctorId, patientId: id, leadStatus },
    })

    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Status inválido' })
      return
    }
    console.error('[/chatbot-light/pre-schedulings/:id/lead-status]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Auditoria ─────────────────────────────────────────────────────────────

router.get('/audit', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { page = '1' } = req.query
    const take = 20
    const skip = (parseInt(String(page)) - 1) * take

    const where = {
      action: { startsWith: 'CHATBOT_LIGHT_' },
      metadata: { path: ['doctorId'], equals: doctorId },
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.auditLog.count({ where }),
    ])

    res.json({ logs, total, page: parseInt(String(page)), pages: Math.ceil(total / take) })
  } catch (err) {
    console.error('[/chatbot-light/audit]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Chatbots (multi-chatbot, jul/2026) ─────────────────────────────────────
//
// Cada médico pode ter vários "chatbots" (LightChatbot), cada um com sua
// própria sala/número de WhatsApp. O Chatbot Light não tem conexão própria
// (QR code/Baileys) — cada chatbot usa a conexão já estabelecida em uma
// Sala (RoomWhatsAppConnection), vinculada via LightChatbot.boundRoomId.
//
// Retrocompatibilidade: toda conta que já usava Chatbot Light antes desta
// mudança ganhou um "Chatbot Principal" na migration (com a sala que já
// tinha vinculada). As rotas legadas /instance* abaixo continuam existindo
// e operam sobre esse chatbot "padrão" (o mais antigo da conta), resolvido/
// criado sob demanda por getOrCreateDefaultChatbot — nada quebra para quem
// nunca criar um segundo chatbot.

async function getOrCreateDefaultChatbot(doctorId: string) {
  const existing = await prisma.lightChatbot.findFirst({
    where: { doctorId },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  return prisma.lightChatbot.create({
    data: { doctorId, name: 'Chatbot Principal', active: true },
  })
}

async function resolveOrCreateInstance(chatbotId: string, doctorId: string) {
  const existing = await prisma.whatsAppInstance.findUnique({ where: { chatbotId } })
  if (existing) return existing
  return prisma.whatsAppInstance.create({
    data: { doctorId, type: 'CHATBOT_LIGHT', status: 'DISCONNECTED', chatbotId },
  })
}

async function resolveBoundConnectionStatus(chatbotId: string) {
  const chatbot = await prisma.lightChatbot.findUnique({
    where: { id: chatbotId },
    select: { boundRoomId: true },
  })

  if (!chatbot?.boundRoomId) {
    return { status: 'NONE' as const, roomId: null, roomName: null, phoneNumber: null, displayName: null, connectedAt: null }
  }

  const room = await prisma.room.findUnique({
    where: { id: chatbot.boundRoomId },
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

async function bindChatbotRoom(chatbotId: string, doctorId: string, roomId: string, userId: string) {
  const room = await prisma.room.findFirst({ where: { id: roomId, doctorId } })
  if (!room) return { error: 'Sala não encontrada' as const }

  await resolveOrCreateInstance(chatbotId, doctorId)
  try {
    await prisma.lightChatbot.update({ where: { id: chatbotId }, data: { boundRoomId: roomId } })
  } catch (err: any) {
    if (err?.code === 'P2002') return { error: 'Esta sala já está vinculada a outro chatbot' as const }
    throw err
  }

  const merged = await resolveBoundConnectionStatus(chatbotId)
  await logAudit({
    userId,
    roomId,
    action: 'CHATBOT_LIGHT_ROOM_BOUND',
    description: `Sala "${room.name}" vinculada ao chatbot`,
    metadata: { doctorId, chatbotId, roomId },
  })
  return { merged }
}

router.get('/chatbots', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const chatbots = await prisma.lightChatbot.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'asc' },
      include: {
        boundRoom: { select: { id: true, name: true, whatsappConnection: { select: { status: true, phoneNumber: true } } } },
        _count: { select: { fluxos: true, quickReplies: true, integrations: true } },
      },
    })
    const withLastActivity = await Promise.all(chatbots.map(async cb => {
      const lastLog = await prisma.lightMessageLog.findFirst({
        where: { chatbotId: cb.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      return { ...cb, lastActivityAt: lastLog?.createdAt ?? null }
    }))
    res.json(withLastActivity)
  } catch (err) {
    console.error('[/chatbot-light/chatbots]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/chatbots', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const data = z.object({
      name: z.string().min(2, 'Nome obrigatório'),
      description: z.string().optional().nullable(),
      objective: z.string().optional().nullable(),
    }).parse(req.body)

    const chatbot = await prisma.lightChatbot.create({ data: { doctorId, ...data } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_CHATBOT_CREATED',
      description: `Chatbot "${chatbot.name}" criado`,
      metadata: { doctorId, chatbotId: chatbot.id },
    })
    res.json(chatbot)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: err.errors })
      return
    }
    console.error('[/chatbot-light/chatbots POST]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/chatbots/:id', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const data = z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional().nullable(),
      objective: z.string().optional().nullable(),
      active: z.boolean().optional(),
      fallbackQueue: z.string().optional().nullable(),
    }).parse(req.body)

    const result = await prisma.lightChatbot.updateMany({ where: { id, doctorId }, data })
    if (result.count === 0) {
      res.status(404).json({ message: 'Chatbot não encontrado' })
      return
    }
    const chatbot = await prisma.lightChatbot.findUnique({ where: { id } })
    res.json(chatbot)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: err.errors })
      return
    }
    console.error('[/chatbot-light/chatbots/:id PUT]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/chatbots/:id', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params

    const chatbot = await prisma.lightChatbot.findFirst({ where: { id, doctorId } })
    if (!chatbot) {
      res.status(404).json({ message: 'Chatbot não encontrado' })
      return
    }

    const [fluxos, quickReplies, integrations] = await Promise.all([
      prisma.lightFluxo.count({ where: { chatbotId: id } }),
      prisma.lightQuickReply.count({ where: { chatbotId: id } }),
      prisma.lightIntegrationConfig.count({ where: { chatbotId: id } }),
    ])
    if (fluxos + quickReplies + integrations > 0) {
      res.status(400).json({ message: 'Este chatbot tem fluxos, respostas rápidas ou mensagens automáticas vinculadas — remova-os antes de excluir o chatbot.' })
      return
    }

    await prisma.whatsAppInstance.deleteMany({ where: { chatbotId: id } })
    await prisma.lightChatbot.delete({ where: { id } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_CHATBOT_DELETED',
      description: `Chatbot "${chatbot.name}" excluído`,
      metadata: { doctorId, chatbotId: id },
    })
    res.json({ message: 'Chatbot excluído' })
  } catch (err) {
    console.error('[/chatbot-light/chatbots/:id DELETE]', err)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/chatbots/:id/instance', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const chatbot = await prisma.lightChatbot.findFirst({ where: { id, doctorId } })
    if (!chatbot) {
      res.status(404).json({ message: 'Chatbot não encontrado' })
      return
    }
    const merged = await resolveBoundConnectionStatus(id)
    res.json(merged)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/chatbots/:id/bind-room', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const { roomId } = z.object({ roomId: z.string().min(1) }).parse(req.body)

    const chatbot = await prisma.lightChatbot.findFirst({ where: { id, doctorId } })
    if (!chatbot) {
      res.status(404).json({ message: 'Chatbot não encontrado' })
      return
    }

    const result = await bindChatbotRoom(id, doctorId, roomId, req.user!.userId)
    if ('error' in result) {
      res.status(400).json({ message: result.error })
      return
    }
    res.json(result.merged)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: err.errors })
      return
    }
    console.error('[/chatbot-light/chatbots/:id/bind-room]', err)
    res.status(500).json({ message: 'Erro ao vincular sala' })
  }
})

router.post('/chatbots/:id/unbind-room', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const { id } = req.params
    const result = await prisma.lightChatbot.updateMany({ where: { id, doctorId }, data: { boundRoomId: null } })
    if (result.count === 0) {
      res.status(404).json({ message: 'Chatbot não encontrado' })
      return
    }
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_ROOM_UNBOUND',
      description: 'Sala desvinculada do chatbot',
      metadata: { doctorId, chatbotId: id },
    })
    res.json({ status: 'NONE', roomId: null, roomName: null, phoneNumber: null, displayName: null, connectedAt: null })
  } catch (err) {
    console.error('[/chatbot-light/chatbots/:id/unbind-room]', err)
    res.status(500).json({ message: 'Erro ao desvincular sala' })
  }
})

// ─── WhatsApp Instance Management — rotas legadas (single-chatbot) ─────────
// Operam sobre o chatbot "padrão" da conta (o mais antigo) para quem nunca
// criou um segundo chatbot — mantém o comportamento de antes intacto.

router.get('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const chatbot = await getOrCreateDefaultChatbot(doctorId)
    const merged = await resolveBoundConnectionStatus(chatbot.id)
    res.json(merged)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/instance/status', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const chatbot = await getOrCreateDefaultChatbot(doctorId)
    const merged = await resolveBoundConnectionStatus(chatbot.id)
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
    const chatbot = await getOrCreateDefaultChatbot(doctorId)

    const result = await bindChatbotRoom(chatbot.id, doctorId, roomId, req.user!.userId)
    if ('error' in result) {
      res.status(400).json({ message: result.error })
      return
    }
    res.json(result.merged)
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
    const chatbot = await getOrCreateDefaultChatbot(doctorId)
    await prisma.lightChatbot.update({ where: { id: chatbot.id }, data: { boundRoomId: null } })
    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_ROOM_UNBOUND',
      description: 'Sala desvinculada do Chatbot Light',
      metadata: { doctorId, chatbotId: chatbot.id },
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

    await logAudit({
      userId: req.user!.userId,
      action: 'CHATBOT_LIGHT_MANUAL_TRIGGER',
      description: `Disparo manual do evento "${event}" para a consulta`,
      metadata: { doctorId, appointmentId, event },
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
  chatbotId: z.string().optional(),
})

router.post('/simulate', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getTargetDoctorId(req)
    const parsed = simulateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Dados inválidos', errors: parsed.error.errors })
      return
    }
    const { sessionToken, message, chatbotId } = parsed.data
    const result = await simulateLightMessage({ doctorId, sessionToken, messageText: message, chatbotId })
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
