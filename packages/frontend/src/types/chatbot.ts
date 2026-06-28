// ─── Chatbot Types, Helpers & Constants ────────────────────────────────────────

// ─── Enums / Literal Types ──────────────────────────────────────────────────────

export type ActivePanel = 'atendimento' | 'templates' | 'fluxos' | 'configuracoes'

export type ConversationCategory = 'TODOS' | 'ATENDIMENTO' | 'AGUARDANDO' | 'FILA' | 'GRUPOS'

export type ConversationStatus = 'OPEN' | 'CLOSED' | 'WAITING' | 'BOT'

export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'LOCATION'

export type TriggerType = 'KEYWORD' | 'ALL_MESSAGES' | 'FIRST_MESSAGE' | 'AFTER_HOURS'

export type BotType = 'LIGHT' | 'AI_AGENT'

export type TemplateCategory = 'APPOINTMENT' | 'LEAD' | 'REMINDER' | 'WELCOME'

// ─── Interfaces ─────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string
  instanceId: string
  contactName: string | null
  contactPhone: string
  contactAvatar: string | null
  lastMessage: string | null
  lastMessageSender: string | null
  lastMessageAt: string | null
  unreadCount: number
  category: 'ATENDIMENTO' | 'AGUARDANDO' | 'FILA' | 'GRUPOS'
  status: ConversationStatus
  isGroup: boolean
  assignedTo: string | null
  assignedName?: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
  messages?: Message[]
}

export interface Message {
  id: string
  conversationId: string
  waMessageId: string | null
  content: string
  fromMe: boolean
  isBot: boolean
  senderName: string | null
  timestamp: string
  type: MessageType
  mediaUrl: string | null
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
}

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  description: string | null
  icon: string | null
  nodes: unknown[]
  edges: unknown[]
  isGlobal: boolean
}

export interface Flow {
  id: string
  instanceId: string
  name: string
  description: string | null
  trigger: TriggerType
  triggerValue: string | null
  active: boolean
  executions: number
  botType: BotType
  nodes: unknown[]
  edges: unknown[]
  createdAt: string
  updatedAt: string
}

export interface ChatbotInstance {
  id: string
  doctorId: string
  instanceKey: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QUARANTINED'
  qrCode: string | null
  qrCodeExpiresAt: string | null
  phoneNumber: string | null
  displayName: string | null
  webhookUrl: string | null
  active: boolean
  connectedAt: string | null
  disconnectedAt: string | null
}

export interface InstanceStatus {
  status: 'NONE' | 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'QUARANTINED'
  qrCode: string | null
  qrCodeExpired: boolean
  phoneNumber: string | null
  displayName: string | null
  connectedAt: string | null
}

export interface ChatbotSettings {
  id: string
  instanceId: string
  welcomeMessage: string | null
  offHoursMessage: string | null
  businessHoursStart: string
  businessHoursEnd: string
  businessDays: string[]
  autoReply: boolean
  queueEnabled: boolean
  maxQueueSize: number
  notificationsEnabled: boolean
  botType: BotType
  aiSystemPrompt: string | null
  replyGroups: boolean
  replyCommunities: boolean
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

export function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return d.toLocaleDateString('pt-BR')
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 1 && d.getDate() === now.getDate()) return 'Hoje'
  if (diff < 2) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const AVATAR_PALETTE = [
  'from-blue-400 to-blue-600',
  'from-emerald-400 to-emerald-600',
  'from-violet-400 to-violet-600',
  'from-amber-400 to-amber-600',
  'from-rose-400 to-rose-600',
  'from-cyan-400 to-cyan-600',
  'from-orange-400 to-orange-600',
  'from-indigo-400 to-indigo-600',
]

export function avatarGradient(name: string | null): string {
  if (!name) return AVATAR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

// ─── Display Constants ──────────────────────────────────────────────────────────

export const categoryColors: Record<string, string> = {
  TODOS: 'bg-slate-100 text-slate-700 border-slate-200',
  ATENDIMENTO: 'bg-blue-100 text-blue-700 border-blue-200',
  AGUARDANDO: 'bg-amber-100 text-amber-700 border-amber-200',
  FILA: 'bg-violet-100 text-violet-700 border-violet-200',
  GRUPOS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export const categoryLabels: Record<string, string> = {
  TODOS: 'Todos',
  ATENDIMENTO: 'Atendimento',
  AGUARDANDO: 'Aguardando',
  FILA: 'Fila',
  GRUPOS: 'Grupos',
}

export const statusColors: Record<string, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-500',
  WAITING: 'bg-amber-100 text-amber-700',
  BOT: 'bg-violet-100 text-violet-700',
}

export const statusLabels: Record<string, string> = {
  OPEN: 'Aberto',
  CLOSED: 'Fechado',
  WAITING: 'Aguardando',
  BOT: 'Bot',
}

export const templateCategoryColors: Record<string, string> = {
  APPOINTMENT: 'bg-blue-100 text-blue-700',
  LEAD: 'bg-emerald-100 text-emerald-700',
  REMINDER: 'bg-amber-100 text-amber-700',
  WELCOME: 'bg-violet-100 text-violet-700',
}

export const templateCategoryLabels: Record<string, string> = {
  APPOINTMENT: 'Agendamento',
  LEAD: 'Captação',
  REMINDER: 'Lembrete',
  WELCOME: 'Boas-vindas',
}

export const triggerLabels: Record<string, string> = {
  KEYWORD: 'Palavra-chave',
  ALL_MESSAGES: 'Todas mensagens',
  FIRST_MESSAGE: 'Primeira mensagem',
  AFTER_HOURS: 'Fora do horário',
}

export const templateIcons: Record<string, string> = {
  APPOINTMENT: '📅',
  LEAD: '🎯',
  REMINDER: '⏰',
  WELCOME: '👋',
}

// ─── Pré-Agendamento via Chatbot ────────────────────────────────────────────────

export interface PreSchedulingLead {
  id: string
  name: string
  phone: string
  notes?: string | null
  status: 'PRE_CADASTRO' | 'ATIVO' | 'INCOMPLETO'
  createdAt: string
  chatbotSession?: {
    id: string
    completedAt: string | null
    contactPhone: string
  } | null
}
