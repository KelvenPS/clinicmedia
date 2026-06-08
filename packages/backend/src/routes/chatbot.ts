import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// ─── Seed: default chatbot templates ─────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    name: 'Agendamento Automático',
    description: 'Permite ao paciente agendar, cancelar e remarcar consultas automaticamente',
    category: 'APPOINTMENT',
    icon: 'calendar',
    nodes: [
      { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Início' } },
      { id: 'greet', type: 'message', position: { x: 250, y: 150 }, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo ao agendamento automático. Como posso ajudar?\n1 - Agendar consulta\n2 - Cancelar consulta\n3 - Remarcar consulta' } },
      { id: 'menu', type: 'condition', position: { x: 250, y: 300 }, data: { label: 'Menu principal' } },
      { id: 'schedule', type: 'message', position: { x: 50, y: 450 }, data: { label: 'Agendar', text: 'Por favor, informe a data desejada (DD/MM/AAAA):' } },
      { id: 'cancel', type: 'message', position: { x: 250, y: 450 }, data: { label: 'Cancelar', text: 'Informe o número da sua consulta para cancelamento:' } },
      { id: 'reschedule', type: 'message', position: { x: 450, y: 450 }, data: { label: 'Remarcar', text: 'Informe o número da sua consulta e a nova data desejada:' } },
      { id: 'end', type: 'end', position: { x: 250, y: 600 }, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'greet' },
      { id: 'e2', source: 'greet', target: 'menu' },
      { id: 'e3', source: 'menu', target: 'schedule', label: '1' },
      { id: 'e4', source: 'menu', target: 'cancel', label: '2' },
      { id: 'e5', source: 'menu', target: 'reschedule', label: '3' },
      { id: 'e6', source: 'schedule', target: 'end' },
      { id: 'e7', source: 'cancel', target: 'end' },
      { id: 'e8', source: 'reschedule', target: 'end' },
    ],
  },
  {
    name: 'Captação de Leads',
    description: 'Coleta dados do paciente interessado e adiciona à lista de espera',
    category: 'LEAD',
    icon: 'user-plus',
    nodes: [
      { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Início' } },
      { id: 'greet', type: 'message', position: { x: 250, y: 150 }, data: { label: 'Boas-vindas', text: 'Olá! Ficamos felizes com seu interesse. Vamos coletar alguns dados para entrarmos em contato. Qual é o seu nome completo?' } },
      { id: 'ask_phone', type: 'input', position: { x: 250, y: 280 }, data: { label: 'Solicitar telefone', text: 'Qual é o melhor telefone para contato?' } },
      { id: 'ask_reason', type: 'input', position: { x: 250, y: 410 }, data: { label: 'Motivo da consulta', text: 'Qual é o motivo da consulta ou qual especialidade você busca?' } },
      { id: 'confirm', type: 'message', position: { x: 250, y: 540 }, data: { label: 'Confirmação', text: 'Obrigado! Seus dados foram registrados. Nossa equipe entrará em contato em breve para agendar sua consulta.' } },
      { id: 'end', type: 'end', position: { x: 250, y: 650 }, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'greet' },
      { id: 'e2', source: 'greet', target: 'ask_phone' },
      { id: 'e3', source: 'ask_phone', target: 'ask_reason' },
      { id: 'e4', source: 'ask_reason', target: 'confirm' },
      { id: 'e5', source: 'confirm', target: 'end' },
    ],
  },
  {
    name: 'Lembrete de Consulta',
    description: 'Envia lembretes automáticos 24h e 2h antes das consultas',
    category: 'REMINDER',
    icon: 'bell',
    nodes: [
      { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Início' } },
      { id: 'reminder_24h', type: 'message', position: { x: 250, y: 150 }, data: { label: 'Lembrete 24h', text: 'Olá, {{nome}}! Lembramos que você tem uma consulta amanhã, {{data}} às {{hora}}. Responda 1 para confirmar ou 2 para cancelar.' } },
      { id: 'check_response', type: 'condition', position: { x: 250, y: 300 }, data: { label: 'Verificar resposta' } },
      { id: 'confirmed', type: 'message', position: { x: 100, y: 450 }, data: { label: 'Consulta confirmada', text: 'Consulta confirmada! Te esperamos amanhã. Em caso de dúvidas, entre em contato conosco.' } },
      { id: 'cancelled', type: 'message', position: { x: 400, y: 450 }, data: { label: 'Consulta cancelada', text: 'Consulta cancelada. Se precisar reagendar, entre em contato conosco.' } },
      { id: 'reminder_2h', type: 'message', position: { x: 100, y: 580 }, data: { label: 'Lembrete 2h', text: 'Olá, {{nome}}! Sua consulta é hoje às {{hora}}. Aguardamos você!' } },
      { id: 'end', type: 'end', position: { x: 250, y: 700 }, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'reminder_24h' },
      { id: 'e2', source: 'reminder_24h', target: 'check_response' },
      { id: 'e3', source: 'check_response', target: 'confirmed', label: '1' },
      { id: 'e4', source: 'check_response', target: 'cancelled', label: '2' },
      { id: 'e5', source: 'confirmed', target: 'reminder_2h' },
      { id: 'e6', source: 'reminder_2h', target: 'end' },
      { id: 'e7', source: 'cancelled', target: 'end' },
    ],
  },
  {
    name: 'Atendimento Inicial',
    description: 'Recepciona o paciente e direciona para o atendimento correto',
    category: 'WELCOME',
    icon: 'message-circle',
    nodes: [
      { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Início' } },
      { id: 'greet', type: 'message', position: { x: 250, y: 150 }, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo à nossa clínica. Como posso direcionar seu atendimento?\n1 - Agendar consulta\n2 - Informações sobre planos\n3 - Resultados de exames\n4 - Falar com atendente' } },
      { id: 'router', type: 'condition', position: { x: 250, y: 300 }, data: { label: 'Direcionar' } },
      { id: 'schedule', type: 'message', position: { x: 0, y: 450 }, data: { label: 'Agendamento', text: 'Vou te direcionar para o agendamento. Um momento...' } },
      { id: 'plans', type: 'message', position: { x: 170, y: 450 }, data: { label: 'Planos', text: 'Trabalhamos com os principais planos de saúde. Qual plano você possui?' } },
      { id: 'exams', type: 'message', position: { x: 330, y: 450 }, data: { label: 'Exames', text: 'Para acessar resultados de exames, acesse nosso portal: portal.clinica.com.br' } },
      { id: 'human', type: 'transfer', position: { x: 500, y: 450 }, data: { label: 'Atendente', text: 'Transferindo para um atendente. Aguarde um momento...' } },
      { id: 'end', type: 'end', position: { x: 250, y: 600 }, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'greet' },
      { id: 'e2', source: 'greet', target: 'router' },
      { id: 'e3', source: 'router', target: 'schedule', label: '1' },
      { id: 'e4', source: 'router', target: 'plans', label: '2' },
      { id: 'e5', source: 'router', target: 'exams', label: '3' },
      { id: 'e6', source: 'router', target: 'human', label: '4' },
      { id: 'e7', source: 'schedule', target: 'end' },
      { id: 'e8', source: 'plans', target: 'end' },
      { id: 'e9', source: 'exams', target: 'end' },
      { id: 'e10', source: 'human', target: 'end' },
    ],
  },
]

async function seedTemplates() {
  try {
    const count = await prisma.chatbotTemplate.count()
    if (count === 0) {
      await prisma.chatbotTemplate.createMany({
        data: DEFAULT_TEMPLATES.map(t => ({
          ...t,
          nodes: t.nodes as unknown as object,
          edges: t.edges as unknown as object,
        })),
      })
      console.log('  ✅  Chatbot templates seeded')
    }
  } catch {
    // Non-fatal — templates may already exist or table may not yet exist
  }
}

// Run seed at startup (non-blocking)
seedTemplates().catch(() => {})

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createInstanceSchema = z.object({
  webhookUrl: z.string().url().optional(),
  displayName: z.string().optional(),
})

const updateConversationSchema = z.object({
  category: z.enum(['ATENDIMENTO', 'AGUARDANDO', 'FILA', 'GRUPOS']).optional(),
  status: z.enum(['OPEN', 'CLOSED', 'WAITING', 'BOT']).optional(),
  assignedTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Mensagem não pode ser vazia'),
  type: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'STICKER', 'LOCATION']).default('TEXT'),
  mediaUrl: z.string().url().optional(),
})

const createFlowSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  active: z.boolean().optional().default(false),
  trigger: z.enum(['KEYWORD', 'ALL_MESSAGES', 'FIRST_MESSAGE', 'AFTER_HOURS']).default('KEYWORD'),
  triggerValue: z.string().optional(),
  nodes: z.array(z.unknown()).optional().default([]),
  edges: z.array(z.unknown()).optional().default([]),
})

const updateFlowSchema = createFlowSchema.partial()

// ─── Helper: resolve instance for authenticated user ─────────────────────────

async function resolveInstance(userId: string, role: string) {
  if (role === 'ADMIN') {
    // ADMINs use their own instance (same as DOCTOR)
    return prisma.whatsAppInstance.findUnique({ where: { doctorId: userId } })
  }
  return prisma.whatsAppInstance.findUnique({ where: { doctorId: userId } })
}

// ─── PUBLIC: Webhook (Evolution API format) ──────────────────────────────────

router.post('/webhook/:instanceKey', async (req: Request, res: Response) => {
  try {
    const { instanceKey } = req.params
    const body = req.body

    const instance = await prisma.whatsAppInstance.findUnique({ where: { instanceKey } })
    if (!instance) {
      res.status(404).json({ message: 'Instance not found' })
      return
    }

    // Evolution API payload: body.data.key, body.data.message, body.data.pushName, etc.
    const data = body?.data ?? body
    const key = data?.key ?? {}
    const remoteJid: string = key?.remoteJid ?? data?.remoteJid ?? ''
    const fromMe: boolean = key?.fromMe ?? data?.fromMe ?? false
    const pushName: string = data?.pushName ?? data?.notifyName ?? ''
    const messageContent = data?.message ?? {}

    // Resolve message content and type
    let content = ''
    let messageType: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'LOCATION' = 'TEXT'
    let mediaUrl: string | undefined

    if (messageContent.conversation) {
      content = messageContent.conversation
      messageType = 'TEXT'
    } else if (messageContent.extendedTextMessage?.text) {
      content = messageContent.extendedTextMessage.text
      messageType = 'TEXT'
    } else if (messageContent.imageMessage) {
      content = messageContent.imageMessage.caption ?? ''
      messageType = 'IMAGE'
      mediaUrl = messageContent.imageMessage.url
    } else if (messageContent.audioMessage) {
      content = '[Áudio]'
      messageType = 'AUDIO'
      mediaUrl = messageContent.audioMessage.url
    } else if (messageContent.videoMessage) {
      content = messageContent.videoMessage.caption ?? '[Vídeo]'
      messageType = 'VIDEO'
      mediaUrl = messageContent.videoMessage.url
    } else if (messageContent.documentMessage) {
      content = messageContent.documentMessage.fileName ?? '[Documento]'
      messageType = 'DOCUMENT'
      mediaUrl = messageContent.documentMessage.url
    } else if (messageContent.stickerMessage) {
      content = '[Sticker]'
      messageType = 'STICKER'
    } else if (messageContent.locationMessage) {
      const loc = messageContent.locationMessage
      content = `[Localização] Lat: ${loc.degreesLatitude}, Lng: ${loc.degreesLongitude}`
      messageType = 'LOCATION'
    } else {
      // Fallback: stringify what we got
      content = typeof body === 'string' ? body : JSON.stringify(data)
    }

    const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')
    const isGroup = remoteJid.endsWith('@g.us')

    // Upsert conversation (find by instanceId + contactPhone)
    let conversation = await prisma.conversation.findFirst({
      where: { instanceId: instance.id, contactPhone },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          instanceId: instance.id,
          contactPhone,
          contactName: pushName || null,
          isGroup,
          lastMessage: content,
          lastMessageAt: new Date(),
          unreadCount: fromMe ? 0 : 1,
        },
      })
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content,
          lastMessageAt: new Date(),
          contactName: pushName || conversation.contactName,
          unreadCount: fromMe ? conversation.unreadCount : { increment: 1 },
        },
      })
    }

    // Store the message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        fromMe,
        content,
        type: messageType,
        mediaUrl: mediaUrl ?? null,
        status: fromMe ? 'SENT' : 'DELIVERED',
        isBot: false,
        timestamp: new Date(),
      },
    })

    res.status(200).json({ received: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    res.status(500).json({ message: 'Internal error' })
  }
})

// ─── All routes below require authentication ──────────────────────────────────

router.use(authenticate)

// ─── Instance Management ─────────────────────────────────────────────────────

// GET /api/chatbot/instance
router.get('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    res.json(instance ?? null)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/chatbot/instance
router.post('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const data = createInstanceSchema.parse(req.body)

    const existing = await prisma.whatsAppInstance.findUnique({ where: { doctorId: userId } })
    if (existing) {
      res.status(409).json({ message: 'Instância já existe. Use a existente ou exclua-a primeiro.' })
      return
    }

    const instance = await prisma.whatsAppInstance.create({
      data: {
        doctorId: userId,
        webhookUrl: data.webhookUrl ?? null,
        displayName: data.displayName ?? null,
        status: 'DISCONNECTED',
      },
    })

    res.status(201).json(instance)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// DELETE /api/chatbot/instance
router.delete('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const instance = await resolveInstance(userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    await prisma.whatsAppInstance.delete({ where: { id: instance.id } })
    res.json({ message: 'Instância e todos os dados associados foram removidos' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/chatbot/instance/qr
router.get('/instance/qr', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada. Crie uma instância primeiro.' })
      return
    }

    res.json({
      status: 'SIMULATED',
      message: 'Integração com Evolution API em desenvolvimento. Configure seu webhook URL nas configurações.',
      instanceKey: instance.instanceKey,
      instanceStatus: instance.status,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/chatbot/instance/disconnect
router.post('/instance/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'DISCONNECTED', qrCode: null, phoneNumber: null },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Conversations ────────────────────────────────────────────────────────────

// GET /api/chatbot/conversations
router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.json([])
      return
    }

    const { category, status, search } = req.query

    const where: Record<string, unknown> = { instanceId: instance.id }

    if (category) where.category = category as string
    if (status) where.status = status as string
    if (search) {
      where.OR = [
        { contactName: { contains: search as string, mode: 'insensitive' } },
        { contactPhone: { contains: search as string } },
      ]
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: [{ unreadCount: 'desc' }, { lastMessageAt: 'desc' }],
      include: {
        _count: { select: { messages: true } },
      },
    })

    res.json(conversations)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/chatbot/conversations/:id
router.get('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    res.json(conversation)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// PUT /api/chatbot/conversations/:id
router.put('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const data = updateConversationSchema.parse(req.body)

    const existing = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!existing) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        ...(data.category !== undefined && { category: data.category }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo }),
        ...(data.notes !== undefined && { notes: data.notes }),
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

// POST /api/chatbot/conversations/:id/read
router.post('/conversations/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!existing) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Messages ─────────────────────────────────────────────────────────────────

// GET /api/chatbot/conversations/:id/messages
router.get('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))
    const skip = (page - 1) * limit

    const conversation = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])

    res.json({
      data: messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/chatbot/conversations/:id/messages
router.post('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const data = sendMessageSchema.parse(req.body)

    const conversation = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        fromMe: true,
        content: data.content,
        type: data.type,
        mediaUrl: data.mediaUrl ?? null,
        status: 'SENT',
        isBot: false,
        timestamp: new Date(),
      },
    })

    // Update conversation last message
    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessage: data.content,
        lastMessageAt: new Date(),
      },
    })

    res.status(201).json(message)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Chatbot Flows ────────────────────────────────────────────────────────────

// GET /api/chatbot/flows
router.get('/flows', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.json([])
      return
    }

    const flows = await prisma.chatbotFlow.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
    })

    res.json(flows)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/chatbot/flows
router.post('/flows', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada. Crie uma instância WhatsApp primeiro.' })
      return
    }

    const data = createFlowSchema.parse(req.body)

    const flow = await prisma.chatbotFlow.create({
      data: {
        instanceId: instance.id,
        name: data.name,
        description: data.description ?? null,
        active: data.active,
        trigger: data.trigger,
        triggerValue: data.triggerValue ?? null,
        nodes: (data.nodes ?? []) as unknown as object,
        edges: (data.edges ?? []) as unknown as object,
      },
    })

    res.status(201).json(flow)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/chatbot/flows/:id
router.get('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const flow = await prisma.chatbotFlow.findFirst({
      where: { id, instanceId: instance.id },
    })

    if (!flow) {
      res.status(404).json({ message: 'Flow não encontrado' })
      return
    }

    res.json(flow)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// PUT /api/chatbot/flows/:id
router.put('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const data = updateFlowSchema.parse(req.body)

    const existing = await prisma.chatbotFlow.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!existing) {
      res.status(404).json({ message: 'Flow não encontrado' })
      return
    }

    const updated = await prisma.chatbotFlow.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.trigger !== undefined && { trigger: data.trigger }),
        ...(data.triggerValue !== undefined && { triggerValue: data.triggerValue }),
        ...(data.nodes !== undefined && { nodes: data.nodes as unknown as object }),
        ...(data.edges !== undefined && { edges: data.edges as unknown as object }),
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

// DELETE /api/chatbot/flows/:id
router.delete('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.chatbotFlow.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!existing) {
      res.status(404).json({ message: 'Flow não encontrado' })
      return
    }

    await prisma.chatbotFlow.delete({ where: { id } })
    res.json({ message: 'Flow removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/chatbot/flows/:id/toggle
router.post('/flows/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId, req.user!.role)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.chatbotFlow.findFirst({
      where: { id, instanceId: instance.id },
    })
    if (!existing) {
      res.status(404).json({ message: 'Flow não encontrado' })
      return
    }

    const updated = await prisma.chatbotFlow.update({
      where: { id },
      data: { active: !existing.active },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Templates ────────────────────────────────────────────────────────────────

// GET /api/chatbot/templates
router.get('/templates', async (_req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.chatbotTemplate.findMany({
      where: { isGlobal: true },
      orderBy: { name: 'asc' },
    })
    res.json(templates)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
