import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  ArrowLeft,
  Zap,
  MessageSquare,
  Clock,
  Users,
  ListFilter,
  ClipboardList,
  GitBranch,
  Settings,
  Search,
  Send,
  Phone,
  MoreVertical,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Wifi,
  WifiOff,
  QrCode,
  ChevronRight,
  Smile,
  Paperclip,
  X,
  AlertCircle,
  Calendar,
  Target,
  Bell,
  Handshake,
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivePanel = 'atendimento' | 'templates' | 'fluxos' | 'configuracoes'
type ConversationCategory = 'TODOS' | 'ATENDIMENTO' | 'AGUARDANDO' | 'FILA' | 'GRUPOS'
type TriggerType = 'KEYWORD' | 'WELCOME' | 'INACTIVITY' | 'SCHEDULE'

interface Conversation {
  id: string
  contactName: string
  phone: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
  category: 'ATENDIMENTO' | 'AGUARDANDO' | 'FILA' | 'GRUPOS'
  avatar?: string
}

interface Message {
  id: string
  conversationId: string
  content: string
  fromMe: boolean
  isBot: boolean
  sentAt: string
}

interface Template {
  id: string
  name: string
  category: 'APPOINTMENT' | 'LEAD' | 'REMINDER' | 'WELCOME'
  description: string
}

interface Flow {
  id: string
  name: string
  description?: string
  triggerType: TriggerType
  triggerValue?: string
  active: boolean
  executionCount: number
  createdAt: string
}

interface ChatbotInstance {
  id?: string
  instanceKey?: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'
  webhookUrl?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const categoryColors: Record<string, string> = {
  ATENDIMENTO: 'bg-blue-500/20 text-blue-400',
  AGUARDANDO: 'bg-amber-500/20 text-amber-400',
  FILA: 'bg-slate-500/20 text-slate-400',
  GRUPOS: 'bg-purple-500/20 text-purple-400',
}
const categoryLabels: Record<string, string> = {
  ATENDIMENTO: 'Atendimento',
  AGUARDANDO: 'Aguardando',
  FILA: 'Fila',
  GRUPOS: 'Grupos',
}
const templateCategoryColors: Record<string, string> = {
  APPOINTMENT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  LEAD: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  REMINDER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  WELCOME: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}
const templateCategoryLabels: Record<string, string> = {
  APPOINTMENT: 'Agendamento',
  LEAD: 'Lead',
  REMINDER: 'Lembrete',
  WELCOME: 'Boas-vindas',
}
const triggerLabels: Record<TriggerType, string> = {
  KEYWORD: 'Palavra-chave',
  WELCOME: 'Boas-vindas',
  INACTIVITY: 'Inatividade',
  SCHEDULE: 'Agendado',
}

// ─── Avatar Colors ─────────────────────────────────────────────────────────────

const avatarPalette = [
  'from-cyan-500 to-blue-600',
  'from-purple-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-600',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-600',
]
function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarPalette[Math.abs(hash) % avatarPalette.length]
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8'
  return <Loader2 className={`${cls} animate-spin text-cyan-400`} />
}

// ─── Panel: Atendimento ───────────────────────────────────────────────────────

function AtendimentoPanel() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ConversationCategory>('TODOS')
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: conversations, isLoading: convLoading } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', category],
    queryFn: () =>
      api
        .get(`/chatbot/conversations${category !== 'TODOS' ? `?category=${category}` : ''}`)
        .then(r => r.data),
    retry: 1,
  })

  const { data: messages, isLoading: msgLoading } = useQuery<Message[]>({
    queryKey: ['chatbot-messages', selectedConversation?.id],
    queryFn: () =>
      selectedConversation
        ? api.get(`/chatbot/conversations/${selectedConversation.id}/messages`).then(r => r.data)
        : Promise.resolve([]),
    enabled: !!selectedConversation,
    retry: 1,
    refetchInterval: 5000,
  })

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${selectedConversation!.id}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', selectedConversation?.id] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setMessageInput('')
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filtered = (conversations ?? []).filter(c =>
    c.contactName.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )

  const tabs: { key: ConversationCategory; label: string; icon: React.ReactNode }[] = [
    { key: 'TODOS', label: 'Todos', icon: <ListFilter className="w-3.5 h-3.5" /> },
    { key: 'ATENDIMENTO', label: 'Atendimento', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { key: 'AGUARDANDO', label: 'Aguardando', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'FILA', label: 'Fila', icon: <ListFilter className="w-3.5 h-3.5" /> },
    { key: 'GRUPOS', label: 'Grupos', icon: <Users className="w-3.5 h-3.5" /> },
  ]

  function handleSend() {
    const content = messageInput.trim()
    if (!content || !selectedConversation || sendMutation.isPending) return
    sendMutation.mutate(content)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Conversation List ── */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar contato..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                category === tab.key
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex items-center justify-center h-32">
              <Spinner size="md" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Nenhuma conversa</p>
              <p className="text-xs text-slate-400 mt-1">
                {search ? 'Tente outro termo de busca' : 'As conversas aparecerão aqui'}
              </p>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`w-full flex items-start gap-3 px-3 py-3 text-left border-b border-slate-50 transition-all hover:bg-slate-50 ${
                  selectedConversation?.id === conv.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(conv.contactName)} flex items-center justify-center flex-shrink-0 shadow-sm`}
                >
                  <span className="text-white text-xs font-bold">{getInitials(conv.contactName)}</span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-semibold text-slate-800 truncate">{conv.contactName}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-1">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.phone}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{conv.lastMessage}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[conv.category]}`}>
                      {categoryLabels[conv.category]}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="text-xs bg-cyan-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center leading-tight">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat View ── */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
              <MessageSquare className="w-9 h-9 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-600">Selecione uma conversa</p>
              <p className="text-sm text-slate-400 mt-1">Escolha um contato para visualizar as mensagens</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(selectedConversation.contactName)} flex items-center justify-center shadow-sm`}
                >
                  <span className="text-white text-xs font-bold">{getInitials(selectedConversation.contactName)}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{selectedConversation.contactName}</p>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-500">{selectedConversation.phone}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${categoryColors[selectedConversation.category]}`}>
                      {categoryLabels[selectedConversation.category]}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all">
                  <Clock className="w-3.5 h-3.5" />
                  Aguardar
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Fechar
                </button>
                <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner size="md" />
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                  <MessageSquare className="w-8 h-8 text-slate-400" />
                  <p className="text-sm text-slate-500">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex flex-col max-w-[68%] ${msg.fromMe ? 'items-end' : 'items-start'}`}>
                      {/* Bot indicator */}
                      {msg.isBot && (
                        <div className="flex items-center gap-1 mb-1 px-1">
                          <Bot className="w-3 h-3 text-cyan-500" />
                          <span className="text-xs text-cyan-500 font-medium">Bot</span>
                        </div>
                      )}
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                          msg.fromMe
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : 'bg-white text-slate-800 border border-slate-100 rounded-tl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-xs text-slate-400 mt-1 px-1">
                        {new Date(msg.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-slate-200 px-4 py-3">
              <div className="flex items-end gap-2">
                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex-shrink-0">
                  <Smile className="w-5 h-5" />
                </button>
                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all flex-shrink-0">
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite uma mensagem..."
                    rows={1}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
                    style={{ maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMutation.isPending}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all flex-shrink-0 shadow-sm"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Panel: Templates ─────────────────────────────────────────────────────────

const defaultTemplates: Template[] = [
  {
    id: 'tpl-1',
    name: 'Agendamento Automático',
    category: 'APPOINTMENT',
    description: 'Fluxo completo para agendar consultas via WhatsApp, com confirmação e lembrete automático.',
  },
  {
    id: 'tpl-2',
    name: 'Captação de Leads',
    category: 'LEAD',
    description: 'Qualifica novos contatos com perguntas personalizadas e encaminha para a equipe certa.',
  },
  {
    id: 'tpl-3',
    name: 'Lembrete de Consulta',
    category: 'REMINDER',
    description: 'Envia lembretes automáticos 24h e 1h antes da consulta para reduzir faltas.',
  },
  {
    id: 'tpl-4',
    name: 'Atendimento Inicial',
    category: 'WELCOME',
    description: 'Mensagem de boas-vindas personalizada e coleta de informações básicas do paciente.',
  },
]

const templateIcons: Record<string, React.ReactNode> = {
  APPOINTMENT: <Calendar className="w-6 h-6" />,
  LEAD: <Target className="w-6 h-6" />,
  REMINDER: <Bell className="w-6 h-6" />,
  WELCOME: <Handshake className="w-6 h-6" />,
}

const templateIconBg: Record<string, string> = {
  APPOINTMENT: 'bg-blue-500/10 text-blue-500',
  LEAD: 'bg-emerald-500/10 text-emerald-500',
  REMINDER: 'bg-amber-500/10 text-amber-500',
  WELCOME: 'bg-purple-500/10 text-purple-500',
}

function TemplatesPanel() {
  const { data: apiTemplates, isLoading } = useQuery<Template[]>({
    queryKey: ['chatbot-templates'],
    queryFn: () => api.get('/chatbot/templates').then(r => r.data),
    retry: 1,
  })

  const templates = apiTemplates && apiTemplates.length > 0 ? apiTemplates : defaultTemplates

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Templates de Fluxo</h2>
        <p className="text-sm text-slate-500 mt-1">
          Comece rapidamente com um template pré-configurado para sua clínica.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 hover:shadow-md hover:border-slate-300 transition-all group"
            >
              {/* Icon + category */}
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${templateIconBg[tpl.category]}`}>
                  {templateIcons[tpl.category]}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium border ${templateCategoryColors[tpl.category]}`}
                >
                  {templateCategoryLabels[tpl.category]}
                </span>
              </div>

              {/* Name + Description */}
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-800 mb-1">{tpl.name}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{tpl.description}</p>
              </div>

              {/* Action */}
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 group-hover:bg-cyan-500 text-slate-600 group-hover:text-white border border-slate-200 group-hover:border-cyan-500 rounded-lg text-sm font-medium transition-all duration-200">
                <Plus className="w-4 h-4" />
                Usar Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Panel: Fluxos ────────────────────────────────────────────────────────────

function FluxosPanel() {
  const [showModal, setShowModal] = useState(false)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    triggerType: 'KEYWORD' as TriggerType,
    triggerValue: '',
  })
  const queryClient = useQueryClient()

  const { data: flows, isLoading } = useQuery<Flow[]>({
    queryKey: ['chatbot-flows'],
    queryFn: () => api.get('/chatbot/flows').then(r => r.data),
    retry: 1,
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/chatbot/flows', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] })
      setShowModal(false)
      setForm({ name: '', description: '', triggerType: 'KEYWORD', triggerValue: '' })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot/flows/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot/flows/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] }),
  })

  function openNew() {
    setEditingFlow(null)
    setForm({ name: '', description: '', triggerType: 'KEYWORD', triggerValue: '' })
    setShowModal(true)
  }

  function openEdit(flow: Flow) {
    setEditingFlow(flow)
    setForm({
      name: flow.name,
      description: flow.description ?? '',
      triggerType: flow.triggerType,
      triggerValue: flow.triggerValue ?? '',
    })
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    createMutation.mutate(form)
  }

  const triggerColors: Record<TriggerType, string> = {
    KEYWORD: 'bg-blue-500/10 text-blue-600 border-blue-200',
    WELCOME: 'bg-purple-500/10 text-purple-600 border-purple-200',
    INACTIVITY: 'bg-amber-500/10 text-amber-600 border-amber-200',
    SCHEDULE: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Meus Fluxos</h2>
          <p className="text-sm text-slate-500 mt-1">Automatize o atendimento com fluxos de conversa inteligentes.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Novo Fluxo
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <GitBranch className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">Nenhum fluxo criado</p>
            <p className="text-xs text-slate-400 mt-1">Crie seu primeiro fluxo de automação</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Criar Fluxo
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Fluxo</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Gatilho</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Execuções</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Criado em</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flows.map(flow => (
                <tr key={flow.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{flow.name}</p>
                    {flow.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{flow.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border inline-flex w-fit ${triggerColors[flow.triggerType]}`}>
                        {triggerLabels[flow.triggerType]}
                      </span>
                      {flow.triggerValue && (
                        <span className="text-xs text-slate-400 font-mono">"{flow.triggerValue}"</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm font-medium text-slate-700">{flow.executionCount.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {new Date(flow.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toggleMutation.mutate(flow.id)}
                      disabled={toggleMutation.isPending}
                      className="flex items-center gap-2 text-xs font-medium transition-all"
                    >
                      {flow.active ? (
                        <>
                          <ToggleRight className="w-5 h-5 text-emerald-500" />
                          <span className="text-emerald-600">Ativo</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-5 h-5 text-slate-400" />
                          <span className="text-slate-400">Inativo</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(flow)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(flow.id)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {editingFlow ? 'Editar Fluxo' : 'Novo Fluxo'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingFlow ? 'Atualize as configurações do fluxo' : 'Configure um novo fluxo de automação'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Nome do Fluxo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Agendamento automático"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descreva o objetivo deste fluxo..."
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Gatilho</label>
                <select
                  value={form.triggerType}
                  onChange={e => setForm(f => ({ ...f, triggerType: e.target.value as TriggerType }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 bg-white"
                >
                  <option value="KEYWORD">Palavra-chave</option>
                  <option value="WELCOME">Boas-vindas (primeiro contato)</option>
                  <option value="INACTIVITY">Inatividade</option>
                  <option value="SCHEDULE">Agendado</option>
                </select>
              </div>

              {form.triggerType === 'KEYWORD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Palavra-chave
                  </label>
                  <input
                    type="text"
                    value={form.triggerValue}
                    onChange={e => setForm(f => ({ ...f, triggerValue: e.target.value }))}
                    placeholder="Ex: agendar, consulta, olá..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                  />
                  <p className="text-xs text-slate-400 mt-1">O fluxo será acionado quando a mensagem contiver esta palavra.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingFlow ? (
                    'Atualizar'
                  ) : (
                    'Criar Fluxo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Panel: Configurações ─────────────────────────────────────────────────────

function ConfiguracoesPanel() {
  const [qrResult, setQrResult] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: instance, isLoading: instanceLoading } = useQuery<ChatbotInstance>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
  })

  const createInstanceMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-instance'] }),
  })

  const getQrMutation = useMutation({
    mutationFn: () => api.get('/chatbot/instance/qr').then(r => r.data),
    onSuccess: (data) => setQrResult(data?.message || data?.qr || JSON.stringify(data)),
  })

  async function handleConnect() {
    await createInstanceMutation.mutateAsync()
    await getQrMutation.mutateAsync()
  }

  const isConnected = instance?.status === 'CONNECTED'
  const isConnecting = instance?.status === 'CONNECTING'

  return (
    <div className="p-6 h-full overflow-y-auto max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Configurações do Chatbot</h2>
        <p className="text-sm text-slate-500 mt-1">Gerencie a conexão WhatsApp e configurações de automação.</p>
      </div>

      {/* WhatsApp Connection Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Conexão WhatsApp</h3>
            <p className="text-xs text-slate-500 mt-0.5">Conecte seu número de WhatsApp ao chatbot.</p>
          </div>
          <div className="p-2 bg-emerald-50 rounded-lg">
            <Phone className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

        {instanceLoading ? (
          <div className="flex items-center gap-3 py-2">
            <Spinner />
            <span className="text-sm text-slate-500">Verificando conexão...</span>
          </div>
        ) : (
          <>
            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Wifi className="w-4 h-4 text-emerald-500" />
                  </div>
                  <span className="text-sm font-medium text-emerald-600">Conectado</span>
                </>
              ) : isConnecting ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  </div>
                  <span className="text-sm font-medium text-amber-600">Conectando...</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <WifiOff className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Desconectado</span>
                </>
              )}
            </div>

            {/* Instance info if connected */}
            {isConnected && instance?.instanceKey && (
              <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chave da Instância</span>
                  <p className="text-xs font-mono text-slate-700 mt-0.5 break-all">{instance.instanceKey}</p>
                </div>
                {instance.webhookUrl && (
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Webhook URL</span>
                    <p className="text-xs font-mono text-slate-700 mt-0.5 break-all">{instance.webhookUrl}</p>
                  </div>
                )}
              </div>
            )}

            {/* QR code result */}
            {qrResult && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <QrCode className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-cyan-700 mb-1">QR Code / Instrução</p>
                    <p className="text-xs text-cyan-700 leading-relaxed break-all font-mono">{qrResult}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Connect button */}
            {!isConnected && (
              <button
                onClick={handleConnect}
                disabled={createInstanceMutation.isPending || getQrMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all"
              >
                {(createInstanceMutation.isPending || getQrMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Conectar WhatsApp
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-slate-400 mt-3">
              Quando conectado, escaneie o QR Code com seu WhatsApp para vincular o número ao chatbot.
            </p>
          </>
        )}
      </div>

      {/* Em breve card */}
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-slate-100 rounded-lg flex-shrink-0">
            <Settings className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-slate-600">Configurações Avançadas</h3>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Em breve</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Personalização de horários de atendimento, mensagens padrão, integração com prontuários,
              limite de sessões simultâneas e muito mais.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['Horários', 'Mensagens padrão', 'Agendamento automático', 'Relatórios'].map(tag => (
                <span key={tag} className="text-xs bg-slate-50 border border-slate-200 text-slate-400 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatbotIA() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activePanel, setActivePanel] = useState<ActivePanel>('atendimento')

  const sidebarItems: {
    key: ActivePanel
    icon: React.ReactNode
    label: string
    section?: string
  }[] = [
    {
      key: 'atendimento',
      icon: <MessageSquare className="w-5 h-5" />,
      label: 'Atendimento',
      section: 'Atendimento',
    },
    {
      key: 'templates',
      icon: <ClipboardList className="w-5 h-5" />,
      label: 'Templates',
    },
    {
      key: 'fluxos',
      icon: <GitBranch className="w-5 h-5" />,
      label: 'Criar Fluxo',
    },
    {
      key: 'configuracoes',
      icon: <Settings className="w-5 h-5" />,
      label: 'Configurações',
    },
  ]

  const panelTitles: Record<ActivePanel, string> = {
    atendimento: 'Atendimento',
    templates: 'Templates',
    fluxos: 'Fluxos',
    configuracoes: 'Configurações',
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Left Sidebar ── */}
      <aside className="w-56 bg-slate-900 flex flex-col h-screen flex-shrink-0 sticky top-0">
        {/* Back + Logo */}
        <div className="px-4 py-4 border-b border-white/10">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium mb-4 transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Voltar ao sistema
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-600/30">
              <Zap className="w-4 h-4 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm leading-tight tracking-tight">ClinIQ</h1>
              <p className="text-cyan-400 text-xs font-medium">Chatbot IA</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
            Atendimento
          </p>

          {/* Atendimento item */}
          <button
            onClick={() => setActivePanel('atendimento')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
              activePanel === 'atendimento'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MessageSquare className={`w-5 h-5 flex-shrink-0 ${activePanel === 'atendimento' ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
            <span className="flex-1 text-left">Atendimento</span>
            {activePanel === 'atendimento' && <ChevronRight className="w-4 h-4 opacity-50" />}
          </button>

          {/* Sub-items under Atendimento */}
          <div className="pl-3 space-y-0.5">
            {[
              { key: 'AGUARDANDO', label: 'Aguardando', color: 'text-amber-400' },
              { key: 'FILA', label: 'Fila', color: 'text-slate-400' },
              { key: 'GRUPOS', label: 'Grupos', color: 'text-purple-400' },
            ].map(sub => (
              <button
                key={sub.key}
                onClick={() => setActivePanel('atendimento')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${sub.color} opacity-70`} />
                {sub.label}
              </button>
            ))}
          </div>

          <div className="border-t border-white/10 mt-4 pt-4 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
              Ferramentas
            </p>
            {[
              { key: 'templates' as ActivePanel, icon: <ClipboardList className="w-5 h-5" />, label: 'Templates' },
              { key: 'fluxos' as ActivePanel, icon: <GitBranch className="w-5 h-5" />, label: 'Criar Fluxo' },
              { key: 'configuracoes' as ActivePanel, icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setActivePanel(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  activePanel === item.key
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={`flex-shrink-0 ${activePanel === item.key ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {activePanel === item.key && <ChevronRight className="w-4 h-4 opacity-50" />}
              </button>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user?.name
                  .split(' ')
                  .slice(0, 2)
                  .map(n => n[0])
                  .join('')
                  .toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Bot className="w-3 h-3 text-cyan-400" />
                <span className="text-cyan-400 text-xs">Chatbot IA</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-cyan-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{panelTitles[activePanel]}</h2>
              <p className="text-xs text-slate-400">Chatbot IA — ClinIQ Pro</p>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
            <span className="text-xs bg-cyan-500/10 text-cyan-600 border border-cyan-200 px-2.5 py-1 rounded-full font-medium">
              BETA
            </span>
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {activePanel === 'atendimento' && <AtendimentoPanel />}
          {activePanel === 'templates' && <TemplatesPanel />}
          {activePanel === 'fluxos' && <FluxosPanel />}
          {activePanel === 'configuracoes' && <ConfiguracoesPanel />}
        </div>
      </main>
    </div>
  )
}
