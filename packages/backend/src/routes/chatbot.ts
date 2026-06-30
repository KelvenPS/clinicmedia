import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { requireSecretaryPermission } from '../lib/secretaryAccess'
import type { WAMessage } from '@whiskeysockets/baileys'
import {
  registerMessageHandler,
  startSession,
  stopSession,
  getSyncStatus,
  refreshContactAvatar,
  sendWhatsAppMessage,
  markMessagesReadWA,
  sendTypingPresence,
  isSessionActive,
  resolveWhatsAppContactIdentity,
  resolveDeliveryJid,
} from '../lib/whatsapp'

import { handleIncomingLightMessage } from '../lib/chatbot-light-engine'

const router = Router()

// ─── Seed: default chatbot templates ─────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    name: 'Agendamento Automático',
    description: 'Permite ao paciente agendar, cancelar e remarcar consultas automaticamente',
    category: 'APPOINTMENT',
    icon: 'calendar',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo ao agendamento automático. Como posso ajudar?' } },
      { id: 'menu', type: 'menu', x: 160, y: 290, data: { label: 'Menu principal', text: 'Escolha uma opção:', options: ['Agendar consulta', 'Cancelar consulta', 'Remarcar consulta'] } },
      { id: 'schedule', type: 'message', x: 20, y: 470, data: { label: 'Agendar', text: 'Por favor, informe a data desejada (DD/MM/AAAA):' } },
      { id: 'cancel', type: 'message', x: 230, y: 470, data: { label: 'Cancelar', text: 'Informe o número da sua consulta para cancelamento:' } },
      { id: 'reschedule', type: 'message', x: 440, y: 470, data: { label: 'Remarcar', text: 'Informe o número da consulta e a nova data desejada:' } },
      { id: 'end', type: 'end', x: 270, y: 620, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'menu' },
      { id: 'e3', source: 'menu', sourcePort: 0, target: 'schedule' },
      { id: 'e4', source: 'menu', sourcePort: 1, target: 'cancel' },
      { id: 'e5', source: 'menu', sourcePort: 2, target: 'reschedule' },
      { id: 'e6', source: 'schedule', sourcePort: 0, target: 'end' },
      { id: 'e7', source: 'cancel', sourcePort: 0, target: 'end' },
      { id: 'e8', source: 'reschedule', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Captação de Leads',
    description: 'Coleta dados do paciente interessado e adiciona à lista de espera',
    category: 'LEAD',
    icon: 'user-plus',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Ficamos felizes com seu interesse. Qual é o seu nome completo?' } },
      { id: 'ask_phone', type: 'message', x: 170, y: 290, data: { label: 'Solicitar telefone', text: 'Qual é o melhor telefone para contato?' } },
      { id: 'ask_reason', type: 'message', x: 170, y: 430, data: { label: 'Motivo da consulta', text: 'Qual é o motivo da consulta ou qual especialidade você busca?' } },
      { id: 'confirm', type: 'message', x: 170, y: 570, data: { label: 'Confirmação', text: 'Obrigado! Seus dados foram registrados. Nossa equipe entrará em contato em breve.' } },
      { id: 'end', type: 'end', x: 270, y: 710, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'ask_phone' },
      { id: 'e3', source: 'ask_phone', sourcePort: 0, target: 'ask_reason' },
      { id: 'e4', source: 'ask_reason', sourcePort: 0, target: 'confirm' },
      { id: 'e5', source: 'confirm', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Lembrete de Consulta',
    description: 'Envia lembretes automáticos 24h e 2h antes das consultas',
    category: 'REMINDER',
    icon: 'bell',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'reminder_24h', type: 'message', x: 170, y: 150, data: { label: 'Lembrete 24h', text: 'Olá, {{nome}}! Lembramos que você tem uma consulta amanhã, {{data}} às {{hora}}. Responda SIM para confirmar ou NÃO para cancelar.' } },
      { id: 'menu', type: 'menu', x: 160, y: 290, data: { label: 'Verificar resposta', text: 'O paciente respondeu:', options: ['Confirmar consulta', 'Cancelar consulta'] } },
      { id: 'confirmed', type: 'message', x: 60, y: 470, data: { label: 'Confirmada', text: 'Consulta confirmada! Te esperamos amanhã. Em caso de dúvidas, entre em contato.' } },
      { id: 'cancelled', type: 'message', x: 290, y: 470, data: { label: 'Cancelada', text: 'Consulta cancelada. Se precisar reagendar, entre em contato conosco.' } },
      { id: 'reminder_2h', type: 'message', x: 60, y: 610, data: { label: 'Lembrete 2h', text: 'Olá, {{nome}}! Sua consulta é hoje às {{hora}}. Aguardamos você!' } },
      { id: 'end', type: 'end', x: 270, y: 760, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'reminder_24h' },
      { id: 'e2', source: 'reminder_24h', sourcePort: 0, target: 'menu' },
      { id: 'e3', source: 'menu', sourcePort: 0, target: 'confirmed' },
      { id: 'e4', source: 'menu', sourcePort: 1, target: 'cancelled' },
      { id: 'e5', source: 'confirmed', sourcePort: 0, target: 'reminder_2h' },
      { id: 'e6', source: 'reminder_2h', sourcePort: 0, target: 'end' },
      { id: 'e7', source: 'cancelled', sourcePort: 0, target: 'end' },
    ],
  },
  {
    name: 'Atendimento Inicial',
    description: 'Recepciona o paciente e direciona para o atendimento correto',
    category: 'WELCOME',
    icon: 'message-circle',
    nodes: [
      { id: 'start', type: 'start', x: 270, y: 40, data: { label: 'Início' } },
      { id: 'greet', type: 'message', x: 170, y: 150, data: { label: 'Boas-vindas', text: 'Olá! Bem-vindo à nossa clínica. Como posso ajudar?' } },
      { id: 'router', type: 'menu', x: 150, y: 290, data: { label: 'Direcionar', text: 'Selecione uma opção:', options: ['Agendar consulta', 'Informações sobre planos', 'Resultados de exames', 'Falar com atendente'] } },
      { id: 'schedule', type: 'message', x: 0, y: 500, data: { label: 'Agendamento', text: 'Vou te direcionar para o agendamento. Um momento...' } },
      { id: 'plans', type: 'message', x: 170, y: 500, data: { label: 'Planos', text: 'Trabalhamos com os principais planos de saúde. Qual plano você possui?' } },
      { id: 'exams', type: 'message', x: 340, y: 500, data: { label: 'Exames', text: 'Para acessar resultados de exames, acesse nosso portal ou fale com a recepção.' } },
      { id: 'human', type: 'queue', x: 510, y: 500, data: { label: 'Atendente', text: 'Transferindo para um atendente. Aguarde um momento...' } },
      { id: 'end', type: 'end', x: 270, y: 660, data: { label: 'Fim' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourcePort: 0, target: 'greet' },
      { id: 'e2', source: 'greet', sourcePort: 0, target: 'router' },
      { id: 'e3', source: 'router', sourcePort: 0, target: 'schedule' },
      { id: 'e4', source: 'router', sourcePort: 1, target: 'plans' },
      { id: 'e5', source: 'router', sourcePort: 2, target: 'exams' },
      { id: 'e6', source: 'router', sourcePort: 3, target: 'human' },
      { id: 'e7', source: 'schedule', sourcePort: 0, target: 'end' },
      { id: 'e8', source: 'plans', sourcePort: 0, target: 'end' },
      { id: 'e9', source: 'exams', sourcePort: 0, target: 'end' },
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
    // Non-fatal
  }
}

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
  botType: z.enum(['LIGHT', 'AI_AGENT']).optional().default('LIGHT'),
  nodes: z.array(z.unknown()).optional().default([]),
  edges: z.array(z.unknown()).optional().default([]),
})

const updateFlowSchema = createFlowSchema.partial()

const upsertSettingsSchema = z.object({
  welcomeMessage: z.string().optional().nullable(),
  offHoursMessage: z.string().optional().nullable(),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  businessDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).optional(),
  autoReply: z.boolean().optional(),
  queueEnabled: z.boolean().optional(),
  maxQueueSize: z.number().int().min(1).max(100).optional(),
  notificationsEnabled: z.boolean().optional(),
  botType: z.enum(['LIGHT', 'AI_AGENT']).optional(),
  aiSystemPrompt: z.string().optional().nullable(),
  replyGroups: z.boolean().optional(),
  replyCommunities: z.boolean().optional(),
})

// ─── Helper: resolve or create instance ──────────────────────────────────────

async function resolveInstance(userId: string) {
  const instance = await prisma.whatsAppInstance.findUnique({
    where: {
      doctorId_type: {
        doctorId: userId,
        type: 'CLINICAL_AGENT',
      },
    },
  })
  if (!instance) return instance

  // O status no banco pode ficar desatualizado se o processo reiniciou e a sessão
  // ainda não foi restaurada, ou se a reconexão está em loop sem nunca abrir.
  // Corrige aqui para a tela de Configurações nunca mostrar "Conectado" com a sessão morta.
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
        type: 'CLINICAL_AGENT',
      },
    },
  })
  if (existing) return existing
  return prisma.whatsAppInstance.create({
    data: { doctorId: userId, type: 'CLINICAL_AGENT', status: 'DISCONNECTED' },
  })
}

// ─── Handler de mensagens recebidas via Baileys ───────────────────────────────

async function handleIncomingMessage(instanceId: string, msg: WAMessage): Promise<void> {
  const remoteJid = msg.key.remoteJid ?? ''
  const fromMe = msg.key.fromMe ?? false
  const pushName = msg.pushName ?? ''
  const mc = msg.message ?? {}

  let content = ''
  let messageType: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'LOCATION' = 'TEXT'
  let mediaUrl: string | undefined

  if (mc.conversation) {
    content = mc.conversation
  } else if (mc.extendedTextMessage?.text) {
    content = mc.extendedTextMessage.text
  } else if (mc.imageMessage) {
    content = mc.imageMessage.caption ?? ''
    messageType = 'IMAGE'
    mediaUrl = mc.imageMessage.url ?? undefined
  } else if (mc.audioMessage) {
    content = '[Áudio]'
    messageType = 'AUDIO'
  } else if (mc.videoMessage) {
    content = mc.videoMessage.caption ?? '[Vídeo]'
    messageType = 'VIDEO'
  } else if (mc.documentMessage) {
    content = mc.documentMessage.fileName ?? '[Documento]'
    messageType = 'DOCUMENT'
    mediaUrl = mc.documentMessage.url ?? undefined
  } else if (mc.stickerMessage) {
    content = '[Sticker]'
    messageType = 'STICKER'
  } else if (mc.locationMessage) {
    const loc = mc.locationMessage
    content = `[Localização] Lat: ${loc.degreesLatitude}, Lng: ${loc.degreesLongitude}`
    messageType = 'LOCATION'
  } else if (mc.buttonsResponseMessage?.selectedButtonId) {
    content = mc.buttonsResponseMessage.selectedButtonId
    messageType = 'TEXT'
  } else if (mc.listResponseMessage?.singleSelectReply?.selectedRowId) {
    content = mc.listResponseMessage.singleSelectReply.selectedRowId
    messageType = 'TEXT'
  } else {
    return // tipo desconhecido, ignora
  }

  const identity = await resolveWhatsAppContactIdentity(instanceId, remoteJid, msg)
  const contactPhone = identity.normalizedPhone || identity.lidJid || remoteJid
  const isGroup = remoteJid.endsWith('@g.us')

  // Para msgs de grupo: quem enviou (msg.pushName = nome, msg.key.participant = JID do membro)
  const senderName = pushName || null
  // O "lastMessageSender" só é relevante em grupos — em privado o contact já é a pessoa
  const lastMessageSender = isGroup ? senderName : null
  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } })
  if (!instance) return

  // Checar configuração de resposta a grupos
  if (isGroup && !fromMe) {
    const settings = await prisma.chatbotSettings.findUnique({ where: { instanceId } })
    if (settings && !settings.replyGroups) return
  }

  // Categorização: grupos → GRUPOS; individuais → fluxo normal
  const convCategory = isGroup ? 'GRUPOS' : (fromMe ? 'ATENDIMENTO' : 'AGUARDANDO')
  const convStatus   = fromMe ? 'OPEN' : (isGroup ? 'OPEN' : 'WAITING')

  let conversation = await prisma.conversation.findFirst({
    where: { instanceId, contactPhone },
  })

  const isNew = !conversation

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        instanceId,
        contactPhone,
        // Para grupos: contactName = null aqui (será preenchido durante sync de histórico)
        // Para privado: contactName = nome do contato (pushName) ou padrão
        contactName: isGroup ? null : (senderName || (identity.lidJid ? 'Contato WhatsApp' : null)),
        isGroup,
        lastMessage: content,
        lastMessageSender,
        lastMessageAt: new Date(),
        unreadCount: fromMe ? 0 : 1,
        status: convStatus,
        category: convCategory,
        remoteJid: identity.remoteJid,
        deliveryJid: identity.deliveryJid,
        lidJid: identity.lidJid || null,
        phoneJid: identity.phoneJid || null,
        normalizedPhone: identity.normalizedPhone || null
      },
    })
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessage: content,
        lastMessageSender,
        lastMessageAt: new Date(),
        // Para privados: atualiza nome com pushName. Para grupos: não sobrescreve nome do grupo
        ...(!isGroup && senderName && { contactName: senderName }),
        unreadCount: fromMe ? conversation.unreadCount : { increment: 1 },
        remoteJid: identity.remoteJid,
        deliveryJid: identity.deliveryJid,
        lidJid: identity.lidJid || null,
        phoneJid: identity.phoneJid || null,
        normalizedPhone: identity.normalizedPhone || null
      },
    })
  }

  // Buscar avatar em background quando conversa é nova
  if (isNew && instance) {
    const jid = isGroup ? `${contactPhone}@g.us` : `${contactPhone}@s.whatsapp.net`
    setTimeout(() => refreshContactAvatar(instance.instanceKey, jid, conversation!.id).catch(() => {}), 1000)
  }

  // Timestamp real da mensagem WA
  const msgTimestamp = msg.messageTimestamp
    ? new Date(toLong(msg.messageTimestamp) * 1000)
    : new Date()

  // senderName em grupos = pushName (quem enviou no grupo)
  const senderNameForMsg = isGroup
    ? (msg.pushName || msg.key.participant?.replace('@s.whatsapp.net', '') || null)
    : null

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      waMessageId: msg.key.id ?? null,
      fromMe,
      senderName: senderNameForMsg,
      content,
      type: messageType,
      mediaUrl: mediaUrl ?? null,
      status: fromMe ? 'SENT' : 'DELIVERED',
      isBot: false,
      timestamp: msgTimestamp,
    },
  }).catch(async (err) => {
    // Unique constraint on waMessageId — mensagem já existe, ignora
    if (err?.code === 'P2002') return
    throw err
  })

  if (!fromMe && !isGroup) {
    await prisma.notification.create({
      data: {
        userId: instance.doctorId,
        title: `Nova mensagem de ${pushName || contactPhone}`,
        message: content.slice(0, 100),
        type: 'INFO',
        link: '/chatbot',
      },
    }).catch(() => {})
  }

  // Logger helper
  const logWA = (level: 'info' | 'warn' | 'error', instanceKey: string, event: string, meta?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    console.log(JSON.stringify({ ts, level, module: 'WA', instanceKey, event, ...meta }))
  }

  logWA('info', instance.instanceKey, 'whatsapp.message.saved', {
    messageId: msg.key.id,
    conversationId: conversation.id,
    contactPhone,
  })

  if (instance.type === 'CHATBOT_LIGHT') {
    logWA('info', instance.instanceKey, 'whatsapp.message.light_engine_called', {
      messageId: msg.key.id,
      contactPhone,
    })
    await handleIncomingLightMessage({
      socketInstanceKey: instance.instanceKey,
      whatsappInstanceId: instance.id,
      conversationId: conversation.id,
      remoteJid,
      deliveryJid: identity.deliveryJid,
      lidJid: identity.lidJid,
      phoneJid: identity.phoneJid,
      normalizedPhone: identity.normalizedPhone,
      messageId: msg.key.id!,
      messageText: content,
      msgRaw: msg
    })
    return
  }
}

// Helper para toLong (duplicado aqui para não importar do whatsapp.ts)
function toLong(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

// Registra o handler no gerenciador de sessões Baileys
registerMessageHandler(handleIncomingMessage)

// ─── All routes below require authentication ──────────────────────────────────

router.use(authenticate)
router.use(requireSecretaryPermission('chatbot_agente'))

// ─── Instance Management ─────────────────────────────────────────────────────

router.get('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
    res.json(instance ?? null)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const data = createInstanceSchema.parse(req.body)

    const existing = await prisma.whatsAppInstance.findUnique({
      where: {
        doctorId_type: {
          doctorId: userId,
          type: 'CLINICAL_AGENT',
        },
      },
    })
    if (existing) {
      res.status(409).json({ message: 'Instância já existe. Use a existente ou exclua-a primeiro.' })
      return
    }

    const instance = await prisma.whatsAppInstance.create({
      data: {
        doctorId: userId,
        type: 'CLINICAL_AGENT',
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

router.delete('/instance', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
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

// ─── Connect: inicia sessão WhatsApp diretamente via Baileys ─────────────────

router.post('/instance/connect', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const instance = await resolveOrCreateInstance(userId)

    // Reseta status e limpa QR antigo antes de gerar novo
    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'CONNECTING', qrCode: null, qrCodeExpiresAt: null },
    })

    // Inicia sessão Baileys de forma assíncrona
    // O QR será gerado e salvo no banco via connection.update → o frontend faz polling
    startSession(instance.instanceKey, instance.id).catch(err =>
      console.error('[/instance/connect] Erro Baileys:', err)
    )

    res.json({ status: 'CONNECTING', instanceKey: instance.instanceKey })
  } catch (err) {
    console.error('[/instance/connect]', err)
    res.status(500).json({ message: 'Erro ao iniciar conexão com WhatsApp' })
  }
})

// ─── Status: polling do QR code e estado da conexão ─────────────────────────

router.get('/instance/status', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
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

// ─── Sync status ─────────────────────────────────────────────────────────────

router.get('/instance/sync-status', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.json({ syncing: false, total: 0, syncedAt: null })
      return
    }
    const sync = getSyncStatus(instance.instanceKey)
    const convCount = await prisma.conversation.count({ where: { instanceId: instance.id } })
    res.json({ ...sync, conversationCount: convCount })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── QR Code (compat) ────────────────────────────────────────────────────────

router.get('/instance/qr', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada. Inicie a conexão primeiro.' })
      return
    }
    const now = new Date()
    const qrExpired = instance.qrCodeExpiresAt ? instance.qrCodeExpiresAt < now : false
    res.json({
      status: instance.status,
      qrCode: qrExpired ? null : instance.qrCode,
      qrCodeExpired: qrExpired,
      instanceKey: instance.instanceKey,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    // Encerra sessão Baileys e limpa arquivos de credenciais
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
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/instance/recover', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const instance = await resolveInstance(userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    if (instance.status !== 'QUARANTINED') {
      res.status(400).json({ message: 'A instância não está em quarentena' })
      return
    }

    // Marca como CONNECTING para que o watchdog não interfira
    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'CONNECTING', reconnectAttempts: 0 },
    })

    // Inicia sessão Baileys usando as credenciais em disco
    startSession(instance.instanceKey, instance.id).catch(err =>
      console.error('[/instance/recover] Erro Baileys:', err)
    )

    res.json({ status: 'CONNECTING', instanceKey: instance.instanceKey })
  } catch (err) {
    console.error('[/instance/recover]', err)
    res.status(500).json({ message: 'Erro ao tentar recuperar conexão' })
  }
})

router.post('/instance/force-new-qr', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId
    const instance = await resolveInstance(userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    // Para o socket e apaga as credenciais do disco
    await stopSession(instance.instanceKey)

    // Reseta status no banco de dados e limpa QR
    await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: 'CONNECTING',
        qrCode: null,
        qrCodeExpiresAt: null,
        phoneNumber: null,
        displayName: null,
        reconnectAttempts: 0,
        quarantinedAt: null,
        lastDisconnectCode: null
      },
    })

    // Inicia nova sessão Baileys para gerar novo QR
    startSession(instance.instanceKey, instance.id).catch(err =>
      console.error('[/instance/force-new-qr] Erro Baileys:', err)
    )

    res.json({ status: 'CONNECTING', instanceKey: instance.instanceKey })
  } catch (err) {
    console.error('[/instance/force-new-qr]', err)
    res.status(500).json({ message: 'Erro ao forçar novo QR Code' })
  }
})

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.json(null)
      return
    }
    const settings = await prisma.chatbotSettings.findUnique({
      where: { instanceId: instance.id },
    })
    res.json(settings ?? null)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveOrCreateInstance(req.user!.userId)
    const data = upsertSettingsSchema.parse(req.body)

    const settings = await prisma.chatbotSettings.upsert({
      where: { instanceId: instance.id },
      create: {
        instanceId: instance.id,
        ...data,
      },
      update: data,
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

// ─── Conversations ────────────────────────────────────────────────────────────

router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
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
      include: { _count: { select: { messages: true } } },
    })

    const users = await prisma.user.findMany({ select: { id: true, name: true } })
    const userMap = new Map(users.map(u => [u.id, u.name]))

    const result = conversations.map(c => {
      const isLid = c.contactPhone.endsWith('@lid') || c.contactPhone.includes('lid')
      return {
        ...c,
        contactPhone: isLid ? (c.normalizedPhone || '') : c.contactPhone,
        contactName: c.contactName || (isLid ? 'Contato WhatsApp' : 'Contato não identificado'),
        assignedName: c.assignedTo ? userMap.get(c.assignedTo) || null : null,
      }
    })

    res.json(result)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, instanceId: instance.id },
      include: {
        messages: { orderBy: { timestamp: 'asc' }, take: 50 },
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    const isLid = conversation.contactPhone.endsWith('@lid') || conversation.contactPhone.includes('lid')
    const formattedConv = {
      ...conversation,
      contactPhone: isLid ? (conversation.normalizedPhone || '') : conversation.contactPhone,
      contactName: conversation.contactName || (isLid ? 'Contato WhatsApp' : 'Contato não identificado'),
    }

    let assignedName: string | null = null
    if (conversation.assignedTo) {
      const u = await prisma.user.findUnique({
        where: { id: conversation.assignedTo },
        select: { name: true },
      })
      assignedName = u?.name || null
    }

    res.json({
      ...formattedConv,
      assignedName,
    })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const data = updateConversationSchema.parse(req.body)
    const existing = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id } })
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

    let assignedName: string | null = null
    if (updated.assignedTo) {
      const u = await prisma.user.findUnique({
        where: { id: updated.assignedTo },
        select: { name: true },
      })
      assignedName = u?.name || null
    }

    res.json({
      ...updated,
      assignedName,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/conversations/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id } })
    if (!existing) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    // Abrir conversa → zerar não lidos e mover de AGUARDANDO para ATENDIMENTO
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: 0,
        ...(existing.category === 'AGUARDANDO' && {
          category: 'ATENDIMENTO',
          status: 'OPEN',
        }),
      },
    })

    // Enviar read receipts ao WhatsApp para as mensagens não lidas
    if (existing.unreadCount > 0 && instance.status === 'CONNECTED') {
      const jid = existing.isGroup
        ? `${existing.contactPhone}@g.us`
        : `${existing.contactPhone}@s.whatsapp.net`

      const unreadMsgs = await prisma.message.findMany({
        where: { conversationId: id, fromMe: false, status: { in: ['SENT', 'DELIVERED'] }, waMessageId: { not: null } },
        select: { waMessageId: true },
        orderBy: { timestamp: 'desc' },
        take: 20,
      })

      if (unreadMsgs.length > 0) {
        const keys = unreadMsgs.map(m => ({ remoteJid: jid, id: m.waMessageId!, fromMe: false }))
        markMessagesReadWA(instance.instanceKey, keys).catch(() => {})

        // Atualiza status no DB
        await prisma.message.updateMany({
          where: { conversationId: id, fromMe: false, status: { in: ['SENT', 'DELIVERED'] } },
          data: { status: 'READ' },
        }).catch(() => {})
      }
    }

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Typing indicator ─────────────────────────────────────────────────────────

router.post('/conversations/:id/typing', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { typing } = req.body as { typing: boolean }
    const instance = await resolveInstance(req.user!.userId)
    if (!instance || instance.status !== 'CONNECTED') { res.json({ ok: true }); return }

    const conv = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id }, select: { contactPhone: true, isGroup: true } })
    if (!conv) { res.json({ ok: true }); return }

    const jid = conv.isGroup ? `${conv.contactPhone}@g.us` : `${conv.contactPhone}@s.whatsapp.net`
    await sendTypingPresence(instance.instanceKey, jid, typing ?? false)
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
})

// ─── Avatar refresh ───────────────────────────────────────────────────────────

router.post('/conversations/:id/refresh-avatar', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) { res.json({ avatarUrl: null }); return }

    const conv = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id } })
    if (!conv) { res.status(404).json({ message: 'Conversa não encontrada' }); return }

    const jid = conv.isGroup
      ? `${conv.contactPhone}@g.us`
      : `${conv.contactPhone}@s.whatsapp.net`

    const url = await refreshContactAvatar(instance.instanceKey, jid, conv.id)
    res.json({ avatarUrl: url })
  } catch {
    res.json({ avatarUrl: null })
  }
})

// ─── Messages ─────────────────────────────────────────────────────────────────

// Returns messages as a flat array (oldest first), up to `limit`
router.get('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))

    const conversation = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id } })
    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    // Fetch newest `limit` messages, then reverse so oldest is first
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    res.json(messages.reverse())
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/conversations/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    if (instance.status !== 'CONNECTED') {
      res.status(400).json({ message: 'WhatsApp não está conectado. Conecte na aba Configurações.' })
      return
    }

    const data = sendMessageSchema.parse(req.body)
    const conversation = await prisma.conversation.findFirst({ where: { id, instanceId: instance.id } })
    if (!conversation) {
      res.status(404).json({ message: 'Conversa não encontrada' })
      return
    }

    // Montar JID do destinatário
    const jid = resolveDeliveryJid(conversation.contactPhone)

    // Enviar via WhatsApp (apenas para mensagens de texto por enquanto)
    let waMessageId: string | null = null
    if (data.type === 'TEXT') {
      try {
        const waResult = await sendWhatsAppMessage(instance.instanceKey, jid, data.content)
        if (!waResult) {
          res.status(503).json({ message: 'Não foi possível enviar a mensagem. Verifique a conexão WhatsApp.' })
          return
        }
        waMessageId = waResult.waMessageId
      } catch (sendErr: any) {
        if (sendErr?.code === 'WA_RECENTLY_CONNECTED') {
          res.status(429).json({
            success: false,
            code: 'WA_RECENTLY_CONNECTED',
            message: sendErr.message
          })
          return
        }
        console.error('[sendWhatsAppMessage error]', sendErr)
        res.status(503).json({ message: 'Não foi possível enviar a mensagem: ' + (sendErr?.message || String(sendErr)) })
        return
      }
    }

    const now = new Date()

    // Salvar mensagem no banco com o waMessageId para evitar duplicata quando o eco chegar
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        waMessageId,
        fromMe: true,
        content: data.content,
        type: data.type,
        mediaUrl: data.mediaUrl ?? null,
        status: 'SENT',
        isBot: false,
        timestamp: now,
      },
    })

    // Mover conversa de AGUARDANDO → ATENDIMENTO quando agente responde
    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessage: data.content,
        lastMessageSender: null,
        lastMessageAt: now,
        ...(conversation.category === 'AGUARDANDO' && {
          category: 'ATENDIMENTO',
          status: 'OPEN',
          unreadCount: 0,
        }),
      },
    })

    res.status(201).json(message)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[POST /messages]', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── Chatbot Flows ────────────────────────────────────────────────────────────

router.get('/flows', async (req: AuthRequest, res: Response) => {
  try {
    const instance = await resolveInstance(req.user!.userId)
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

router.post('/flows', async (req: AuthRequest, res: Response) => {
  try {
    // Auto-create instance if needed so user doesn't need to connect WhatsApp first
    const instance = await resolveOrCreateInstance(req.user!.userId)
    const data = createFlowSchema.parse(req.body)

    const flow = await prisma.chatbotFlow.create({
      data: {
        instanceId: instance.id,
        name: data.name,
        description: data.description ?? null,
        active: data.active,
        trigger: data.trigger,
        triggerValue: data.triggerValue ?? null,
        botType: data.botType ?? 'LIGHT',
        nodes: (data.nodes ?? []) as unknown as object,
        edges: (data.edges ?? []) as unknown as object,
      },
    })

    res.status(201).json(flow)
  } catch (error) {
    console.error('Error in POST /flows:', error)
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const flow = await prisma.chatbotFlow.findFirst({ where: { id, instanceId: instance.id } })
    if (!flow) {
      res.status(404).json({ message: 'Flow não encontrado' })
      return
    }

    res.json(flow)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const data = updateFlowSchema.parse(req.body)
    const existing = await prisma.chatbotFlow.findFirst({ where: { id, instanceId: instance.id } })
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
        ...(data.botType !== undefined && { botType: data.botType }),
        ...(data.nodes !== undefined && { nodes: data.nodes as unknown as object }),
        ...(data.edges !== undefined && { edges: data.edges as unknown as object }),
      },
    })

    res.json(updated)
  } catch (error) {
    console.error('Error in PUT /flows/:id:', error)
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/flows/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.chatbotFlow.findFirst({ where: { id, instanceId: instance.id } })
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

router.post('/flows/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const instance = await resolveInstance(req.user!.userId)
    if (!instance) {
      res.status(404).json({ message: 'Instância não encontrada' })
      return
    }

    const existing = await prisma.chatbotFlow.findFirst({ where: { id, instanceId: instance.id } })
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
