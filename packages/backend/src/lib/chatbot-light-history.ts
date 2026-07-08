import { prisma } from './prisma'

// Histórico unificado do Chatbot Light — junta LightMessageLog,
// LightSystemActionLog, LightFlowSession (eventos terminais) e Patient
// (origin CHATBOT) numa única linha do tempo, sem criar tabela nova.
// Não junta `Conversation` (é o inbox legado sem tela própria hoje,
// não é escrito pelo motor do Chatbot Light).

export type HistoryEventType =
  | 'Mensagem automática'
  | 'Resposta rápida'
  | 'Fluxo de conversa'
  | 'Ação do sistema'
  | 'Pré-agendamento'
  | 'Teste de envio'
  | 'Transferência para atendente'

export type HistoryStatus = 'Enviado' | 'Pendente' | 'Falhou' | 'Rejeitado' | 'Transferido' | 'Concluído' | 'Cancelado' | 'Expirado'

export interface HistoryEvent {
  id: string
  source: 'message' | 'system_action' | 'session' | 'lead'
  createdAt: Date
  contactName: string | null
  phone: string | null
  chatbotId: string | null
  chatbotName: string | null
  eventType: HistoryEventType
  status: HistoryStatus
  content: string | null
  errorMessage: string | null
  templateId: string | null
  flowId: string | null
  actionKey: string | null
  sessionId: string | null
  conversationId: string | null
}

export interface HistoryFilters {
  startDate?: Date
  endDate?: Date
  status?: HistoryStatus
  module?: string
  eventType?: HistoryEventType
  chatbotId?: string
  search?: string // telefone ou nome
}

export interface HistoryResult {
  events: HistoryEvent[]
  total: number
}

const TAKE_PER_SOURCE = 60

function moduleToEventType(module: string): HistoryEventType {
  if (module === 'teste') return 'Teste de envio'
  if (module === 'fluxo' || module === 'fluxo_guiado') return 'Fluxo de conversa'
  if (module === 'lead_capture') return 'Pré-agendamento'
  if (module === 'resposta_rapida') return 'Resposta rápida'
  return 'Mensagem automática'
}

function messageStatusToHistory(status: string): HistoryStatus {
  if (status === 'SENT') return 'Enviado'
  if (status === 'REJECTED') return 'Rejeitado'
  if (status === 'FAILED') return 'Falhou'
  return 'Pendente'
}

function sessionStatusToHistory(status: string): HistoryStatus {
  if (status === 'TRANSFER') return 'Transferido'
  if (status === 'COMPLETED') return 'Concluído'
  if (status === 'CANCELLED') return 'Cancelado'
  if (status === 'EXPIRED') return 'Expirado'
  return 'Falhou'
}

function actionLogStatusToHistory(status: string): HistoryStatus {
  if (status === 'COMPLETED') return 'Concluído'
  if (status === 'FAILED') return 'Falhou'
  return 'Pendente'
}

export async function getUnifiedHistory(doctorId: string, filters: HistoryFilters): Promise<HistoryResult> {
  const dateWhere = (filters.startDate || filters.endDate)
    ? { gte: filters.startDate, lte: filters.endDate }
    : undefined

  const chatbots = await prisma.lightChatbot.findMany({ where: { doctorId }, select: { id: true, name: true } })
  const chatbotNameById = new Map(chatbots.map(c => [c.id, c.name]))

  // LightSystemActionLog e LightFlowSession não têm doctorId próprio (só
  // instanceId) — sem escopar pelas instâncias do médico aqui, essas duas
  // fontes vazavam telefone/conteúdo de conversa de TODAS as clínicas do
  // sistema para qualquer médico autenticado.
  const doctorInstances = await prisma.whatsAppInstance.findMany({
    where: { doctorId, ...(filters.chatbotId ? { chatbotId: filters.chatbotId } : {}) },
    select: { id: true, chatbotId: true },
  })
  const doctorInstanceIds = doctorInstances.map(i => i.id)
  const chatbotIdByInstance = new Map(doctorInstances.map(i => [i.id, i.chatbotId]))

  // Cada filtro de "eventType" restringe a fonte relevante — os outros
  // gêneros de evento simplesmente não têm esse conceito.
  const wantsMessages = !filters.eventType || filters.eventType !== 'Ação do sistema' && filters.eventType !== 'Transferência para atendente'
  const wantsSystemActions = (!filters.eventType || filters.eventType === 'Ação do sistema') && doctorInstanceIds.length > 0
  const wantsSessions = (!filters.eventType || filters.eventType === 'Transferência para atendente' || filters.eventType === 'Fluxo de conversa') && doctorInstanceIds.length > 0
  const wantsLeads = !filters.eventType || filters.eventType === 'Pré-agendamento'

  const [messages, systemActionLogs, sessions, leadPatients] = await Promise.all([
    wantsMessages
      ? prisma.lightMessageLog.findMany({
          where: {
            doctorId,
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            ...(filters.module ? { module: filters.module } : {}),
            ...(filters.chatbotId ? { chatbotId: filters.chatbotId } : {}),
            ...(filters.search ? { OR: [{ phone: { contains: filters.search } }, { recipientName: { contains: filters.search, mode: 'insensitive' } }] } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: TAKE_PER_SOURCE,
        })
      : Promise.resolve([]),
    wantsSystemActions
      ? prisma.lightSystemActionLog.findMany({
          where: {
            instanceId: { in: doctorInstanceIds },
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            ...(filters.search ? { contactPhone: { contains: filters.search } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: TAKE_PER_SOURCE,
        })
      : Promise.resolve([]),
    wantsSessions
      ? prisma.lightFlowSession.findMany({
          where: {
            instanceId: { in: doctorInstanceIds },
            status: { in: ['TRANSFER', 'COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED'] },
            ...(dateWhere ? { updatedAt: dateWhere } : {}),
            ...(filters.search ? { contactPhone: { contains: filters.search } } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          take: TAKE_PER_SOURCE,
        })
      : Promise.resolve([]),
    wantsLeads
      ? prisma.patient.findMany({
          where: {
            doctorId,
            origin: 'CHATBOT',
            ...(dateWhere ? { createdAt: dateWhere } : {}),
            ...(filters.search ? { OR: [{ phone: { contains: filters.search } }, { name: { contains: filters.search, mode: 'insensitive' } }] } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: TAKE_PER_SOURCE,
        })
      : Promise.resolve([]),
  ])

  const events: HistoryEvent[] = []

  for (const l of messages) {
    events.push({
      id: l.id,
      source: 'message',
      createdAt: l.createdAt,
      contactName: l.recipientName,
      phone: l.phone,
      chatbotId: l.chatbotId,
      chatbotName: l.chatbotId ? chatbotNameById.get(l.chatbotId) ?? null : null,
      eventType: moduleToEventType(l.module),
      status: messageStatusToHistory(l.status),
      content: l.content,
      errorMessage: l.errorMessage,
      templateId: l.templateId,
      flowId: null,
      actionKey: null,
      sessionId: null,
      conversationId: null,
    })
  }

  for (const a of systemActionLogs) {
    events.push({
      id: a.id,
      source: 'system_action',
      createdAt: a.createdAt,
      contactName: null,
      phone: a.contactPhone,
      chatbotId: null,
      chatbotName: null,
      eventType: 'Ação do sistema',
      status: actionLogStatusToHistory(a.status),
      content: a.message,
      errorMessage: a.status === 'FAILED' ? a.message : null,
      templateId: null,
      flowId: null,
      actionKey: a.actionKey,
      sessionId: a.sessionId,
      conversationId: a.conversationId,
    })
  }

  for (const s of sessions) {
    const chatbotId = chatbotIdByInstance.get(s.instanceId) ?? null
    if (filters.chatbotId && chatbotId !== filters.chatbotId) continue
    events.push({
      id: s.id,
      source: 'session',
      createdAt: s.updatedAt,
      contactName: null,
      phone: s.contactPhone,
      chatbotId,
      chatbotName: chatbotId ? chatbotNameById.get(chatbotId) ?? null : null,
      eventType: s.status === 'TRANSFER' ? 'Transferência para atendente' : 'Fluxo de conversa',
      status: sessionStatusToHistory(s.status),
      content: null,
      errorMessage: s.failedReason,
      templateId: null,
      flowId: s.flowId,
      actionKey: null,
      sessionId: s.id,
      conversationId: s.conversationId,
    })
  }

  for (const p of leadPatients) {
    events.push({
      id: p.id,
      source: 'lead',
      createdAt: p.createdAt,
      contactName: p.name,
      phone: p.phone,
      chatbotId: null,
      chatbotName: null,
      eventType: 'Pré-agendamento',
      status: 'Concluído',
      content: 'Lead capturado pelo chatbot',
      errorMessage: null,
      templateId: null,
      flowId: null,
      actionKey: null,
      sessionId: p.chatbotSessionId,
      conversationId: null,
    })
  }

  let filtered = events
  if (filters.status) filtered = filtered.filter(e => e.status === filters.status)

  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return { events: filtered, total: filtered.length }
}
