import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart3, MessageSquare, History, Settings, ArrowLeft,
  Calendar, Users, ClipboardList, Brain, DollarSign,
  Plus, Pencil, Trash2, Send, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle,
  ToggleLeft, ToggleRight, Eye, EyeOff, QrCode,
  Zap, GitBranch, Reply, X, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import Modal from '../components/ui/Modal'

// ─── Types ────────────────────────────────────────────────────────────────────

type Panel = 'relatorio' | 'fluxos' | 'mensagens' | 'templates' | 'respostas' | 'historico' | 'configuracoes'
type ConfigTab = 'conexao' | 'teste' | 'telas'
type FluxoActionType = 'SEND_MESSAGE' | 'TRANSFER_QUEUE' | 'OPEN_MENU' | 'SYSTEM_ACTION' | 'END_CHAT'

interface LightTemplate {
  id: string
  name: string
  category: string
  content: string
  variables: string[]
  active: boolean
  createdAt: string
}

interface LightIntegrationConfig {
  id: string
  module: string
  triggerEvent: string
  enabled: boolean
  templateId: string | null
  delayMinutes: number
  template?: { id: string; name: string; content: string } | null
}

interface LightMessageLog {
  id: string
  phone: string
  recipientName: string | null
  content: string
  module: string
  triggerEvent: string | null
  status: 'PENDING' | 'SENT' | 'REJECTED' | 'FAILED'
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
}

interface DashboardData {
  total: number
  totalLastMonth: number
  sent: number
  rejected: number
  failed: number
  deliveryRate: number
  byModule: { module: string; _count: { id: number } }[]
  recent: LightMessageLog[]
}

interface FluxoOption {
  id: string
  number: number
  label: string
  triggers: string
  response: string
  actionType: FluxoActionType
  queueId: string | null
  nextFlowId: string | null
  systemAction: string | null
}

interface LightFluxo {
  id: string
  name: string
  description: string | null
  keywords: string
  welcomeMessage: string
  options: FluxoOption[]
  maxAttempts: number
  fallbackMessage: string
  active: boolean
  executions: number
  createdAt: string
  updatedAt: string
}

interface LightQuickReply {
  id: string
  keyword: string
  response: string
  active: boolean
  createdAt: string
  updatedAt: string
}

// ─── Module metadata ──────────────────────────────────────────────────────────

const MODULES = [
  {
    key: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    triggers: [
      { event: 'APPOINTMENT_CONFIRMATION', label: 'Confirmação de agendamento', hasDelay: false },
      { event: 'APPOINTMENT_REMINDER_24H', label: 'Lembrete 24h antes da consulta', hasDelay: false },
      { event: 'APPOINTMENT_REMINDER_2H',  label: 'Lembrete 2h antes da consulta',  hasDelay: false },
    ],
  },
  {
    key: 'pacientes',
    label: 'Pacientes',
    icon: Users,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    triggers: [
      { event: 'NEW_PATIENT_WELCOME', label: 'Boas-vindas ao novo paciente', hasDelay: false },
    ],
  },
  {
    key: 'prontuario',
    label: 'Prontuário',
    icon: ClipboardList,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    triggers: [
      { event: 'POST_CONSULTATION_SUMMARY', label: 'Resumo após consulta', hasDelay: true, delayLabel: 'Enviar após (minutos)' },
    ],
  },
  {
    key: 'avaliacao',
    label: 'Avaliação',
    icon: Brain,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    triggers: [
      { event: 'ASSESSMENT_COMPLETE', label: 'Avaliação disponível para o paciente', hasDelay: false },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    icon: DollarSign,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    triggers: [
      { event: 'PAYMENT_REMINDER', label: 'Lembrete de pagamento pendente', hasDelay: false },
      { event: 'PAYMENT_OVERDUE',  label: 'Aviso de pagamento em atraso',   hasDelay: false },
    ],
  },
]

const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map(m => [m.key, m.label]))
const MODULE_COLORS: Record<string, string> = Object.fromEntries(MODULES.map(m => [m.key, m.color]))

const VARIABLES = ['{nome}', '{data}', '{hora}', '{medico}', '{valor}', '{link}']

const FLUXO_ACTIONS: { value: FluxoActionType; label: string }[] = [
  { value: 'SEND_MESSAGE',   label: 'Enviar apenas mensagem' },
  { value: 'TRANSFER_QUEUE', label: 'Transferir para atendimento' },
  { value: 'OPEN_MENU',      label: 'Abrir outro menu' },
  { value: 'SYSTEM_ACTION',  label: 'Executar ação do sistema' },
  { value: 'END_CHAT',       label: 'Encerrar atendimento' },
]

const FLUXO_QUEUES = [
  { value: 'recepcao',   label: 'Recepção' },
  { value: 'agenda',     label: 'Agenda' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'suporte',    label: 'Suporte' },
]

const FLUXO_SYSTEM_ACTIONS = [
  { value: 'CONFIRM_APPOINTMENT', label: 'Confirmar consulta' },
  { value: 'CANCEL_APPOINTMENT',  label: 'Cancelar consulta' },
  { value: 'SEND_PAYMENT_LINK',   label: 'Enviar link de pagamento' },
  { value: 'SEND_REVIEW_FORM',    label: 'Enviar formulário de avaliação' },
  { value: 'UPDATE_PATIENT_DATA', label: 'Atualizar cadastro do paciente' },
]

const CATEGORIES = [
  { key: 'geral',      label: 'Geral' },
  { key: 'agenda',     label: 'Agenda' },
  { key: 'pacientes',  label: 'Pacientes' },
  { key: 'prontuario', label: 'Prontuário' },
  { key: 'avaliacao',  label: 'Avaliação' },
  { key: 'financeiro', label: 'Financeiro' },
]

// ─── Shared components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    SENT:     { label: 'Enviada',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    PENDING:  { label: 'Pendente',  cls: 'bg-amber-50   text-amber-700   border-amber-200',   Icon: Clock },
    REJECTED: { label: 'Rejeitada', cls: 'bg-orange-50  text-orange-700  border-orange-200',  Icon: XCircle },
    FAILED:   { label: 'Falhou',    cls: 'bg-red-50     text-red-700     border-red-200',     Icon: XCircle },
  }
  const { label, cls, Icon } = map[status] ?? map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

function ModuleBadge({ module }: { module: string }) {
  const label = MODULE_LABELS[module] ?? module
  const color = MODULE_COLORS[module] ?? 'text-slate-600'
  return <span className={`text-xs font-semibold ${color}`}>{label}</span>
}

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className="flex-shrink-0 flex items-center gap-1.5 group">
      {enabled
        ? <ToggleRight className="w-8 h-8 text-cyan-500" />
        : <ToggleLeft  className="w-8 h-8 text-slate-300" />
      }
      <span className={`text-xs font-medium ${enabled ? 'text-cyan-600' : 'text-slate-400'}`}>
        {enabled ? 'Ativo' : 'Inativo'}
      </span>
    </button>
  )
}

function VariableButtons({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {VARIABLES.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="text-xs bg-white border border-slate-200 hover:border-cyan-400 hover:text-cyan-700 text-slate-600 px-2 py-1 rounded-lg font-mono transition-colors"
          title={`Inserir ${v}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement>,
  variable: string,
  value: string,
  onChange: (v: string) => void
) {
  const ta = ref.current
  if (!ta) { onChange(value + variable); return }
  const start = ta.selectionStart ?? value.length
  const end   = ta.selectionEnd   ?? value.length
  const next  = value.slice(0, start) + variable + value.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    ta.setSelectionRange(start + variable.length, start + variable.length)
    ta.focus()
  })
}

// ─── Relatório panel ──────────────────────────────────────────────────────────

function RelatorioPanel({ onGoTo }: { onGoTo: (p: Panel) => void }) {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['light-dashboard'],
    queryFn: () => api.get('/chatbot-light/dashboard').then(r => r.data),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  const d = data!
  const growthPositive = d.total >= d.totalLastMonth

  const stats = [
    { label: 'Enviadas (mês)',  value: d.total,              icon: Send,         color: 'text-blue-600',    bg: 'bg-blue-50' },
    { label: 'Entregues',       value: d.sent,               icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Falhas',          value: d.rejected + d.failed,icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50' },
    { label: 'Taxa de entrega', value: `${d.deliveryRate}%`, icon: Zap,          color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  ]

  const hasData = d.total > 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Relatório</h2>
        <p className="text-sm text-slate-500 mt-0.5">Resumo de mensagens automáticas este mês</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {d.totalLastMonth > 0 && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${growthPositive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <Zap className="w-4 h-4 flex-shrink-0" />
          <span>
            {growthPositive ? '▲' : '▼'} {Math.abs(d.total - d.totalLastMonth)} mensagens comparado ao mês anterior ({d.totalLastMonth})
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Mensagens por módulo</h3>
          </div>
          <div className="p-5 space-y-3">
            {!hasData ? (
              <div className="py-6 text-center">
                <p className="text-sm text-slate-400 mb-3">Nenhum envio registrado ainda.</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => onGoTo('configuracoes')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Conectar WhatsApp
                  </button>
                  <button
                    onClick={() => onGoTo('mensagens')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
                  >
                    Configurar automações
                  </button>
                </div>
              </div>
            ) : d.byModule.map(row => {
              const pct = d.total > 0 ? Math.round((row._count.id / d.total) * 100) : 0
              const mod = MODULES.find(m => m.key === row.module)
              return (
                <div key={row.module}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{mod?.label ?? row.module}</span>
                    <span className="text-sm text-slate-500">{row._count.id} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Atividade recente</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {d.recent.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-400 mb-2">Nenhuma atividade ainda.</p>
                <button
                  onClick={() => onGoTo('configuracoes')}
                  className="text-xs text-cyan-600 hover:underline"
                >
                  Enviar mensagem de teste →
                </button>
              </div>
            ) : d.recent.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                <StatusBadge status={log.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{log.recipientName ?? log.phone}</p>
                  <p className="text-xs text-slate-400 truncate">{log.content}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                  {format(new Date(log.createdAt), 'dd/MM HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fluxos panel ─────────────────────────────────────────────────────────────

function FluxosPanel() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<LightFluxo | null>(null)
  const welcomeRef = useRef<HTMLTextAreaElement>(null)

  const { data: fluxos = [], isLoading } = useQuery<LightFluxo[]>({
    queryKey: ['light-fluxos'],
    queryFn:  () => api.get('/chatbot-light/fluxos').then(r => r.data),
  })

  const [form, setForm] = useState({
    name: '', description: '', keywords: '', welcomeMessage: '',
    maxAttempts: 3, fallbackMessage: 'Não consegui entender. Vou transferir para um atendente.',
    active: true,
  })
  const [options, setOptions] = useState<FluxoOption[]>([])
  const [errors, setErrors]   = useState<Record<string, string>>({})

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', description: '', keywords: '', welcomeMessage: '', maxAttempts: 3, fallbackMessage: 'Não consegui entender. Vou transferir para um atendente.', active: true })
    setOptions([])
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (f: LightFluxo) => {
    setEditing(f)
    setForm({
      name: f.name, description: f.description ?? '', keywords: f.keywords,
      welcomeMessage: f.welcomeMessage, maxAttempts: f.maxAttempts,
      fallbackMessage: f.fallbackMessage, active: f.active,
    })
    setOptions(f.options ?? [])
    setErrors({})
    setModalOpen(true)
  }

  const addOption = () => {
    setOptions(prev => [...prev, {
      id: crypto.randomUUID(),
      number: prev.length + 1,
      label: '',
      triggers: String(prev.length + 1),
      response: '',
      actionType: 'SEND_MESSAGE',
      queueId: null,
      nextFlowId: null,
      systemAction: null,
    }])
  }

  const generateWelcomeMessage = () => {
    const menu = options
      .filter(o => o.label.trim() !== '')
      .map(o => `${o.number} - ${o.label}`)
      .join('\n')
    if (!menu) return
    setForm(p => ({ ...p, welcomeMessage: `Olá, {nome}! Seja bem-vindo(a).\n\nEscolha uma opção:\n${menu}` }))
  }

  const removeOption = (id: string) => {
    setOptions(prev => prev.filter(o => o.id !== id).map((o, i) => ({ ...o, number: i + 1 })))
  }

  const updateOption = (id: string, patch: Partial<FluxoOption>) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim())           e.name = 'Nome obrigatório'
    if (!form.keywords.trim())       e.keywords = 'Pelo menos uma palavra-chave'
    if (!form.welcomeMessage.trim()) e.welcomeMessage = 'Mensagem obrigatória'
    for (const opt of options) {
      if (!opt.label.trim())    { e.options = `Informe o texto da opção ${opt.number}`; break }
      if (!opt.triggers.trim()) { e.options = `Informe as palavras aceitas da opção ${opt.number}`; break }
      if (!opt.response.trim()) { e.options = `Informe a resposta do bot da opção ${opt.number}`; break }
      if (opt.actionType === 'TRANSFER_QUEUE' && !opt.queueId) {
        e.options = `Selecione a fila de destino da opção ${opt.number}`; break
      }
      if (opt.actionType === 'OPEN_MENU' && !opt.nextFlowId) {
        e.options = `Selecione o submenu da opção ${opt.number}`; break
      }
      if (opt.actionType === 'SYSTEM_ACTION' && !opt.systemAction) {
        e.options = `Selecione a ação do sistema da opção ${opt.number}`; break
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: (data: object) =>
      editing
        ? api.put(`/chatbot-light/fluxos/${editing.id}`, data).then(r => r.data)
        : api.post('/chatbot-light/fluxos', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-fluxos'] })
      setModalOpen(false)
      toast.success(editing ? 'Fluxo atualizado' : 'Fluxo criado')
    },
    onError: () => toast.error('Erro ao salvar fluxo'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/fluxos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-fluxos'] }); toast.success('Fluxo removido') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/chatbot-light/fluxos/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-fluxos'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const handleSave = () => {
    if (!validate()) return
    saveMutation.mutate({ ...form, options })
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Fluxos</h2>
          <p className="text-sm text-slate-500 mt-0.5">Menus automáticos ativados por palavras-chave enviadas pelo paciente</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo fluxo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : fluxos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <GitBranch className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nenhum fluxo criado ainda</p>
          <p className="text-slate-400 text-xs mb-5">Crie um fluxo para responder automaticamente quando o paciente enviar "oi", "menu" ou outra palavra-chave.</p>
          <button onClick={openNew} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Criar primeiro fluxo
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {fluxos.map(f => (
            <div key={f.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-semibold text-slate-900 text-sm">{f.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${f.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {f.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {f.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                      <span key={k} className="text-xs bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full font-mono">
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">
                    {f.options?.length ?? 0} opções · {f.executions} execuções · Atualizado {format(new Date(f.updatedAt), "dd/MM/yy", { locale: ptBR })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Toggle
                    enabled={f.active}
                    onToggle={() => toggleMutation.mutate({ id: f.id, active: !f.active })}
                    disabled={toggleMutation.isPending}
                  />
                  <button
                    onClick={() => openEdit(f)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remover este fluxo?')) deleteMutation.mutate(f.id) }}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview welcome message snippet */}
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <p className="text-xs text-slate-400 mb-0.5 font-medium">Mensagem de abertura</p>
                <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">{f.welcomeMessage}</p>
              </div>

              {/* Preview menu options */}
              {f.options?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.options.map(o => (
                    <span key={o.id} className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                      {o.number} - {o.label || '(sem texto)'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fluxo editor modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Fluxo' : 'Novo Fluxo'}
        size="lg"
      >
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* Name */}
          <div>
            <label className="label">Nome do fluxo *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="input-field"
              placeholder="Ex: Atendimento inicial"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Keywords */}
          <div>
            <label className="label">Palavras-chave *</label>
            <input
              value={form.keywords}
              onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))}
              className="input-field font-mono text-sm"
              placeholder="oi, olá, menu, bom dia, boa tarde"
            />
            <p className="text-xs text-slate-400 mt-1">Separadas por vírgula. O chatbot ativa este fluxo quando o paciente enviar qualquer uma delas.</p>
            {errors.keywords && <p className="text-xs text-red-500 mt-1">{errors.keywords}</p>}
          </div>

          {/* Welcome message */}
          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Mensagem de abertura *</label>
              {options.length > 0 && (
                <button
                  type="button"
                  onClick={generateWelcomeMessage}
                  className="text-xs flex items-center gap-1 text-cyan-600 hover:text-cyan-700 font-medium"
                >
                  Gerar mensagem com opções
                </button>
              )}
            </div>
            <textarea
              ref={welcomeRef}
              value={form.welcomeMessage}
              onChange={e => setForm(p => ({ ...p, welcomeMessage: e.target.value }))}
              rows={5}
              className="input-field resize-none text-sm"
              placeholder={`Olá, {nome}! Seja bem-vindo(a).\n\nEscolha uma opção:\n1 - Confirmar consulta\n2 - Reagendar\n3 - Falar com atendente`}
            />
            <p className="text-xs text-slate-500 mt-1">Variáveis disponíveis (clique para inserir):</p>
            <VariableButtons
              onInsert={v => insertAtCursor(welcomeRef, v, form.welcomeMessage, val => setForm(p => ({ ...p, welcomeMessage: val })))}
            />
            {errors.welcomeMessage && <p className="text-xs text-red-500 mt-1">{errors.welcomeMessage}</p>}
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Opções do menu</label>
              <button
                type="button"
                onClick={addOption}
                className="text-xs flex items-center gap-1 text-cyan-600 hover:text-cyan-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar opção
              </button>
            </div>

            {options.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl py-5 text-center">
                <p className="text-xs text-slate-400">Nenhuma opção. Clique em "Adicionar opção" para criar os itens do menu.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {options.map((opt, i) => (
                  <div key={opt.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <span className="w-6 h-6 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        Opção {i + 1}
                      </span>
                      <button type="button" onClick={() => removeOption(opt.id)} className="text-xs flex items-center gap-1 text-slate-400 hover:text-red-500 font-medium">
                        <X className="w-3.5 h-3.5" /> Remover opção
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="label text-[11px] mb-0.5">Texto da opção *</label>
                        <input
                          value={opt.label}
                          onChange={e => updateOption(opt.id, { label: e.target.value })}
                          className="input-field text-sm py-1.5"
                          placeholder="Ex: Confirmar consulta"
                        />
                      </div>
                      <div>
                        <label className="label text-[11px] mb-0.5">Quando o paciente digitar *</label>
                        <input
                          value={opt.triggers}
                          onChange={e => updateOption(opt.id, { triggers: e.target.value })}
                          className="input-field text-sm py-1.5 font-mono"
                          placeholder={`Ex: ${i + 1}, confirmar, sim`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label text-[11px] mb-0.5">Resposta do bot *</label>
                      <textarea
                        value={opt.response}
                        onChange={e => updateOption(opt.id, { response: e.target.value })}
                        rows={2}
                        className="input-field text-sm py-1.5 resize-none"
                        placeholder="Ex: Perfeito, {nome}! Sua consulta foi confirmada."
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="label text-[11px] mb-0.5">Ação após resposta *</label>
                        <select
                          value={opt.actionType}
                          onChange={e => updateOption(opt.id, {
                            actionType: e.target.value as FluxoActionType,
                            queueId: null, nextFlowId: null, systemAction: null,
                          })}
                          className="input-field text-sm py-1.5"
                        >
                          {FLUXO_ACTIONS.map(a => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>
                      </div>

                      {opt.actionType === 'TRANSFER_QUEUE' && (
                        <div>
                          <label className="label text-[11px] mb-0.5">Fila de destino *</label>
                          <select
                            value={opt.queueId ?? ''}
                            onChange={e => updateOption(opt.id, { queueId: e.target.value || null })}
                            className="input-field text-sm py-1.5"
                          >
                            <option value="">— Selecionar fila —</option>
                            {FLUXO_QUEUES.map(q => (
                              <option key={q.value} value={q.value}>{q.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {opt.actionType === 'OPEN_MENU' && (
                        <div>
                          <label className="label text-[11px] mb-0.5">Submenu (fluxo) *</label>
                          <select
                            value={opt.nextFlowId ?? ''}
                            onChange={e => updateOption(opt.id, { nextFlowId: e.target.value || null })}
                            className="input-field text-sm py-1.5"
                          >
                            <option value="">— Selecionar fluxo —</option>
                            {fluxos.filter(f => f.id !== editing?.id).map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {opt.actionType === 'SYSTEM_ACTION' && (
                        <div>
                          <label className="label text-[11px] mb-0.5">Ação do sistema *</label>
                          <select
                            value={opt.systemAction ?? ''}
                            onChange={e => updateOption(opt.id, { systemAction: e.target.value || null })}
                            className="input-field text-sm py-1.5"
                          >
                            <option value="">— Selecionar ação —</option>
                            {FLUXO_SYSTEM_ACTIONS.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {errors.options && <p className="text-xs text-red-500 mt-1">{errors.options}</p>}
          </div>

          {/* Advanced */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Configurações avançadas</p>

            <div className="flex gap-4">
              <div className="w-44">
                <label className="label">Tentativas inválidas</label>
                <input
                  type="number"
                  min={1} max={10}
                  value={form.maxAttempts}
                  onChange={e => setForm(p => ({ ...p, maxAttempts: parseInt(e.target.value) || 3 }))}
                  className="input-field text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">Máximo antes do fallback</p>
              </div>
              <div className="flex-1">
                <label className="label">Mensagem de fallback</label>
                <textarea
                  value={form.fallbackMessage}
                  onChange={e => setForm(p => ({ ...p, fallbackMessage: e.target.value }))}
                  rows={2}
                  className="input-field text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="label mb-0">Status do fluxo</label>
              <Toggle enabled={form.active} onToggle={() => setForm(p => ({ ...p, active: !p.active }))} />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary w-full"
          >
            {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar fluxo'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Mensagens automáticas panel ──────────────────────────────────────────────

function MensagensPanel() {
  const qc = useQueryClient()

  const { data: configs = [] } = useQuery<LightIntegrationConfig[]>({
    queryKey: ['light-integrations'],
    queryFn:  () => api.get('/chatbot-light/integrations').then(r => r.data),
  })

  const { data: templates = [] } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const { data: settings } = useQuery<{ enabledScreens: string[] }>({
    queryKey: ['light-settings'],
    queryFn:  () => api.get('/chatbot-light/settings').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: { module: string; triggerEvent: string; enabled: boolean; templateId?: string | null; delayMinutes?: number }) =>
      api.put('/chatbot-light/integrations', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-integrations'] }); toast.success('Configuração salva') },
    onError: () => toast.error('Erro ao salvar'),
  })

  const enabledScreens = settings?.enabledScreens ?? ['agenda', 'pacientes', 'prontuario', 'avaliacao', 'financeiro']
  const visibleModules  = MODULES.filter(m => enabledScreens.includes(m.key))

  const getConfig = (module: string, event: string) =>
    configs.find(c => c.module === module && c.triggerEvent === event)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mensagens Automáticas</h2>
        <p className="text-sm text-slate-500 mt-0.5">Disparos iniciados pelo sistema — a clínica envia primeiro</p>
      </div>

      {templates.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Crie templates de mensagem em <strong>Templates</strong> antes de ativar as integrações.
        </div>
      )}

      <div className="space-y-4">
        {visibleModules.map(mod => {
          const Icon = mod.icon
          return (
            <div key={mod.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 ${mod.bg}`}>
                <div className="w-8 h-8 bg-white/70 rounded-lg flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${mod.color}`} />
                </div>
                <h3 className={`font-semibold text-sm ${mod.color}`}>{mod.label}</h3>
              </div>

              <div className="divide-y divide-slate-100">
                {mod.triggers.map(trigger => {
                  const cfg = getConfig(mod.key, trigger.event)
                  const isEnabled      = cfg?.enabled ?? false
                  const selectedTemplate = cfg?.templateId ?? ''

                  return (
                    <div key={trigger.event} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{trigger.label}</p>
                          {isEnabled && cfg?.template && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">Template: {cfg.template.name}</p>
                          )}
                        </div>
                        <Toggle
                          enabled={isEnabled}
                          onToggle={() => saveMutation.mutate({
                            module: mod.key, triggerEvent: trigger.event,
                            enabled: !isEnabled, templateId: cfg?.templateId ?? null,
                            delayMinutes: cfg?.delayMinutes ?? 0,
                          })}
                          disabled={saveMutation.isPending}
                        />
                      </div>

                      {isEnabled && (
                        <div className="mt-3 space-y-3 pt-3 border-t border-slate-100">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                              Template de mensagem
                            </label>
                            <select
                              value={selectedTemplate}
                              onChange={e => saveMutation.mutate({
                                module: mod.key, triggerEvent: trigger.event,
                                enabled: true, templateId: e.target.value || null,
                                delayMinutes: cfg?.delayMinutes ?? 0,
                              })}
                              className="input-field text-sm"
                            >
                              <option value="">— Selecione um template —</option>
                              {templates.filter(t => t.active).map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>

                          {trigger.hasDelay && (
                            <div>
                              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                                {'delayLabel' in trigger ? trigger.delayLabel : 'Atraso (minutos)'}
                              </label>
                              <input
                                type="number" min={0}
                                value={cfg?.delayMinutes ?? 0}
                                onChange={e => saveMutation.mutate({
                                  module: mod.key, triggerEvent: trigger.event,
                                  enabled: true, templateId: cfg?.templateId ?? null,
                                  delayMinutes: parseInt(e.target.value) || 0,
                                })}
                                className="input-field text-sm w-32"
                              />
                            </div>
                          )}

                          {cfg?.template && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                              <p className="text-xs text-slate-400 mb-1 font-medium">Prévia da mensagem</p>
                              <p className="text-xs text-slate-700 whitespace-pre-wrap line-clamp-3">{cfg.template.content}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Templates panel ──────────────────────────────────────────────────────────

function TemplatesPanel() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<LightTemplate | null>(null)
  const [preview, setPreview]     = useState<string | null>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const { data: templates = [], isLoading } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<{
    name: string; category: string; content: string
  }>()

  const contentValue = watch('content', '')

  const openNew = () => {
    setEditing(null)
    reset({ name: '', category: 'geral', content: '' })
    setModalOpen(true)
  }

  const openEdit = (t: LightTemplate) => {
    setEditing(t)
    setValue('name', t.name)
    setValue('category', t.category)
    setValue('content', t.content)
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; category: string; content: string }) =>
      editing
        ? api.put(`/chatbot-light/templates/${editing.id}`, data).then(r => r.data)
        : api.post('/chatbot-light/templates', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-templates'] })
      setModalOpen(false)
      toast.success(editing ? 'Template atualizado' : 'Template criado')
    },
    onError: () => toast.error('Erro ao salvar template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-templates'] }); toast.success('Template removido') },
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Templates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Mensagens reutilizáveis com variáveis dinâmicas</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo template
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nenhum template criado ainda</p>
          <p className="text-slate-400 text-xs mb-5">Templates são usados pelas mensagens automáticas e pelos fluxos.</p>
          <button onClick={openNew} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Criar primeiro template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full capitalize">
                      {CATEGORIES.find(c => c.key === t.category)?.label ?? t.category}
                    </span>
                    {!t.active && (
                      <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{t.content}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setPreview(preview === t.id ? null : t.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all"
                    title="Pré-visualizar"
                  >
                    {preview === t.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remover este template?')) deleteMutation.mutate(t.id) }}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {preview === t.id && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wide">Pré-visualização</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Template' : 'Novo Template'}
        size="md"
      >
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nome do template *</label>
            <input
              {...register('name', { required: 'Nome obrigatório' })}
              className="input-field"
              placeholder="Ex: Lembrete de consulta"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Categoria</label>
            <select {...register('category')} className="input-field">
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Mensagem *</label>
            <textarea
              {...register('content', { required: 'Mensagem obrigatória', minLength: { value: 5, message: 'Mínimo 5 caracteres' } })}
              ref={e => {
                register('content').ref(e)
                ;(contentRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e
              }}
              rows={5}
              className="input-field resize-none text-sm"
              placeholder="Olá {nome}, sua consulta está agendada para {data} às {hora} com Dr(a). {medico}. Confirme respondendo SIM."
            />
            {errors.content && <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>}
            <p className="text-xs text-slate-500 mt-1.5">Variáveis (clique para inserir):</p>
            <VariableButtons
              onInsert={v => insertAtCursor(contentRef as React.RefObject<HTMLTextAreaElement>, v, contentValue, val => setValue('content', val, { shouldValidate: true }))}
            />
          </div>

          {contentValue && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Pré-visualização</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{contentValue}</p>
            </div>
          )}

          <button type="submit" disabled={saveMutation.isPending} className="btn-primary w-full">
            {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar template'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// ─── Respostas Rápidas panel ──────────────────────────────────────────────────

function RespostasPanel() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<LightQuickReply | null>(null)
  const [form, setForm]           = useState({ keyword: '', response: '', active: true })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const { data: replies = [], isLoading } = useQuery<LightQuickReply[]>({
    queryKey: ['light-quick-replies'],
    queryFn:  () => api.get('/chatbot-light/quick-replies').then(r => r.data),
  })

  const openNew = () => {
    setEditing(null)
    setForm({ keyword: '', response: '', active: true })
    setFormErrors({})
    setModalOpen(true)
  }

  const openEdit = (r: LightQuickReply) => {
    setEditing(r)
    setForm({ keyword: r.keyword, response: r.response, active: r.active })
    setFormErrors({})
    setModalOpen(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.keyword.trim())  e.keyword  = 'Palavra-chave obrigatória'
    if (!form.response.trim()) e.response = 'Resposta obrigatória'
    setFormErrors(e)
    return Object.keys(e).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: (data: object) =>
      editing
        ? api.put(`/chatbot-light/quick-replies/${editing.id}`, data).then(r => r.data)
        : api.post('/chatbot-light/quick-replies', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-quick-replies'] })
      setModalOpen(false)
      toast.success(editing ? 'Resposta atualizada' : 'Resposta criada')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/quick-replies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-quick-replies'] }); toast.success('Resposta removida') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/chatbot-light/quick-replies/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-quick-replies'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const handleSave = () => {
    if (!validate()) return
    saveMutation.mutate(form)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Respostas Rápidas</h2>
          <p className="text-sm text-slate-500 mt-0.5">Palavras-chave que disparam uma resposta automática simples</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Nova resposta
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Dica:</strong> Use respostas rápidas para perguntas simples como "endereço", "horário", "convênios".
          Para menus com múltiplas opções, use a seção <strong>Fluxos</strong>.
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : replies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Reply className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nenhuma resposta rápida cadastrada</p>
          <p className="text-slate-400 text-xs mb-5">Ex: paciente envia "endereço" → chatbot responde com o endereço da clínica.</p>
          <button onClick={openNew} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Criar primeira resposta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {replies.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full font-mono font-semibold">
                      {r.keyword}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {r.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2">{r.response}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Toggle
                    enabled={r.active}
                    onToggle={() => toggleMutation.mutate({ id: r.id, active: !r.active })}
                    disabled={toggleMutation.isPending}
                  />
                  <button
                    onClick={() => openEdit(r)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Remover esta resposta rápida?')) deleteMutation.mutate(r.id) }}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Palavra-chave *</label>
            <input
              value={form.keyword}
              onChange={e => setForm(p => ({ ...p, keyword: e.target.value }))}
              className="input-field font-mono text-sm"
              placeholder="Ex: endereço"
            />
            <p className="text-xs text-slate-400 mt-1">Quando o paciente enviar essa palavra, o chatbot responde automaticamente.</p>
            {formErrors.keyword && <p className="text-xs text-red-500 mt-1">{formErrors.keyword}</p>}
          </div>

          <div>
            <label className="label">Resposta *</label>
            <textarea
              value={form.response}
              onChange={e => setForm(p => ({ ...p, response: e.target.value }))}
              rows={4}
              className="input-field resize-none text-sm"
              placeholder="Nossa clínica fica na Av. Brasil, 1234 — sala 501. Funcionamos de segunda a sexta, das 8h às 18h."
            />
            {formErrors.response && <p className="text-xs text-red-500 mt-1">{formErrors.response}</p>}
          </div>

          <div className="flex items-center gap-3">
            <label className="label mb-0">Status</label>
            <Toggle enabled={form.active} onToggle={() => setForm(p => ({ ...p, active: !p.active }))} />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="btn-primary w-full"
          >
            {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar resposta rápida'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Histórico panel ──────────────────────────────────────────────────────────

function HistoricoPanel() {
  const [moduleFilter, setModuleFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['light-history', moduleFilter, statusFilter, page],
    queryFn:  () => api.get('/chatbot-light/history', {
      params: { module: moduleFilter, status: statusFilter, page },
    }).then(r => r.data),
    staleTime: 30_000,
  })

  const logs: LightMessageLog[] = data?.logs ?? []
  const total: number           = data?.total ?? 0
  const pages: number           = data?.pages ?? 1

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Histórico de Mensagens</h2>
        <p className="text-sm text-slate-500 mt-0.5">{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={moduleFilter}
          onChange={e => { setModuleFilter(e.target.value); setPage(1) }}
          className="input-field text-sm w-44"
        >
          <option value="todos">Todos os módulos</option>
          {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          <option value="teste">Teste de envio</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="input-field text-sm w-44"
        >
          <option value="todos">Todos os status</option>
          <option value="SENT">Enviadas</option>
          <option value="PENDING">Pendentes</option>
          <option value="REJECTED">Rejeitadas</option>
          <option value="FAILED">Com falha</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhum registro encontrado</p>
            {moduleFilter !== 'todos' || statusFilter !== 'todos' ? (
              <button
                onClick={() => { setModuleFilter('todos'); setStatusFilter('todos'); setPage(1) }}
                className="text-xs text-cyan-600 hover:underline mt-2"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Data/Hora', 'Destinatário', 'Módulo', 'Status', 'Mensagem'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {format(new Date(log.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{log.recipientName ?? '—'}</p>
                        <p className="text-slate-400 text-xs">{log.phone}</p>
                      </td>
                      <td className="px-4 py-3"><ModuleBadge module={log.module} /></td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                        {log.errorMessage && (
                          <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate" title={log.errorMessage}>
                            {log.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-slate-600 truncate">{log.content}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Página {page} de {pages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Config: Conexão ─────────────────────────────────────────────────────────

function ConexaoTab() {
  const qc = useQueryClient()
  const [polling, setPolling]     = useState(false)
  const [qrCode, setQrCode]       = useState<string | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)

  const { data: instance, refetch } = useQuery({
    queryKey: ['chatbot-instance'],
    queryFn:  () => api.get('/chatbot/instance').then(r => r.data).catch(() => null),
    staleTime: 10_000,
  })

  const isConnected = instance?.status === 'CONNECTED'
  const isQuarantined = instance?.status === 'QUARANTINED'

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/chatbot/instance/status').then(r => r.data)
        if (res.qrCode) setQrCode(res.qrCode)
        if (res.status === 'CONNECTED') {
          setPolling(false)
          setShowQrModal(false)
          toast.success('WhatsApp conectado!')
          refetch()
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, refetch])

  const connectMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance/connect').then(r => r.data),
    onSuccess:  () => { setPolling(true); setShowQrModal(true) },
    onError:    () => toast.error('Erro ao iniciar conexão'),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance/disconnect').then(r => r.data),
    onSuccess:  () => {
      toast.success('WhatsApp desconectado')
      qc.invalidateQueries({ queryKey: ['chatbot-instance'] })
      refetch()
    },
    onError: () => toast.error('Erro ao desconectar'),
  })

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Conexão WhatsApp</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Conecte seu WhatsApp para enviar mensagens automáticas para os pacientes
        </p>
      </div>

      <div className={`flex items-center gap-4 p-5 rounded-2xl border ${isConnected ? 'bg-emerald-50 border-emerald-200' : isQuarantined ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isConnected ? 'bg-emerald-500' : isQuarantined ? 'bg-amber-500' : 'bg-slate-300'}`}>
          {isConnected ? <Wifi className="w-6 h-6 text-white" /> : isQuarantined ? <AlertCircle className="w-6 h-6 text-white" /> : <WifiOff className="w-6 h-6 text-white" />}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">
            {isConnected ? 'WhatsApp conectado' : isQuarantined ? 'WhatsApp em Quarentena' : 'WhatsApp desconectado'}
          </p>
          {isConnected ? (
            <div className="text-sm text-emerald-700 space-y-0.5 mt-0.5">
              {instance?.phoneNumber  && <p>{instance.phoneNumber}</p>}
              {instance?.displayName  && <p className="text-xs text-emerald-600">{instance.displayName}</p>}
            </div>
          ) : isQuarantined ? (
            <p className="text-sm text-amber-700">A conexão foi interrompida repetidamente. Acesse as configurações completas do chatbot para recuperar.</p>
          ) : (
            <p className="text-sm text-slate-500">Escaneie o QR code para conectar</p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Desconectar
            </button>
          ) : isQuarantined ? (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
              Em Quarentena
            </span>
          ) : (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || polling}
              className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {polling
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguardando QR...</>
                : <><QrCode className="w-4 h-4" /> Conectar WhatsApp</>
              }
            </button>
          )}
          {!isConnected && !isQuarantined && (
            <button
              onClick={() => refetch()}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Verificar status
            </button>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Com o WhatsApp desconectado, nenhuma mensagem automática será enviada.
        </div>
      )}

      <Modal isOpen={showQrModal} onClose={() => { setShowQrModal(false); setPolling(false) }} title="Escanear QR Code" size="sm">
        <div className="text-center space-y-4">
          <p className="text-sm text-slate-500">
            Abra o WhatsApp no celular → <strong>Menu → Aparelhos conectados → Conectar aparelho</strong>
          </p>
          {qrCode ? (
            <div className="flex items-center justify-center">
              <img src={qrCode} alt="QR Code WhatsApp" className="w-56 h-56 rounded-xl border border-slate-200" />
            </div>
          ) : (
            <div className="w-56 h-56 mx-auto rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          )}
          <p className="text-xs text-slate-400">Aguardando conexão... O QR atualiza automaticamente.</p>
        </div>
      </Modal>
    </div>
  )
}

// ─── Config: Teste de Envio ───────────────────────────────────────────────────

function TesteTab() {
  const { data: templates = [] } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const [phone, setPhone]                   = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [customMsg, setCustomMsg]           = useState('')
  const [simVars, setSimVars] = useState({ nome: 'Maria Silva', data: '20/06/2026', hora: '14:00', medico: 'Dr. João', valor: 'R$ 150,00', link: 'https://clinica.com/confirmar' })
  const [lastResult, setLastResult]         = useState<{ success: boolean; msg: string } | null>(null)

  const baseContent = selectedTemplate
    ? templates.find(t => t.id === selectedTemplate)?.content ?? customMsg
    : customMsg

  const previewContent = baseContent
    .replace(/\{nome\}/g, simVars.nome)
    .replace(/\{data\}/g, simVars.data)
    .replace(/\{hora\}/g, simVars.hora)
    .replace(/\{medico\}/g, simVars.medico)
    .replace(/\{valor\}/g, simVars.valor)
    .replace(/\{link\}/g, simVars.link)

  const testMutation = useMutation({
    mutationFn: () => api.post('/chatbot-light/test', { phone, content: baseContent }).then(r => r.data),
    onSuccess: () => setLastResult({ success: true, msg: 'Mensagem enviada com sucesso!' }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Falha no envio'
      setLastResult({ success: false, msg })
    },
  })

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="font-semibold text-slate-900">Teste de Envio</h3>
        <p className="text-sm text-slate-500 mt-0.5">Envie uma mensagem de teste para verificar a conexão</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">Número de telefone *</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="input-field"
            placeholder="5511999999999 (com código do país)"
          />
        </div>

        <div>
          <label className="label">Template (opcional)</label>
          <select
            value={selectedTemplate}
            onChange={e => setSelectedTemplate(e.target.value)}
            className="input-field"
          >
            <option value="">— Usar mensagem personalizada —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Mensagem {selectedTemplate ? '(preenchida pelo template)' : '*'}</label>
          <textarea
            value={baseContent}
            onChange={e => setCustomMsg(e.target.value)}
            readOnly={!!selectedTemplate}
            rows={4}
            className="input-field resize-none text-sm"
            placeholder="Olá {nome}, sua consulta está confirmada para {data} às {hora}."
          />
        </div>

        {/* Variable simulation */}
        {baseContent && baseContent.includes('{') && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Simular variáveis</p>
            <div className="grid grid-cols-2 gap-2">
              {(['nome', 'data', 'hora', 'medico', 'valor', 'link'] as const).map(key => (
                baseContent.includes(`{${key}}`) ? (
                  <div key={key}>
                    <label className="text-xs text-slate-500 mb-0.5 block font-mono">{`{${key}}`}</label>
                    <input
                      value={simVars[key]}
                      onChange={e => setSimVars(p => ({ ...p, [key]: e.target.value }))}
                      className="input-field text-xs py-1.5"
                    />
                  </div>
                ) : null
              ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1 font-medium">Pré-visualização</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{previewContent}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => { setLastResult(null); testMutation.mutate() }}
          disabled={!phone || !baseContent || testMutation.isPending}
          className="btn-primary w-full"
        >
          {testMutation.isPending
            ? <span className="flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Enviando...</span>
            : <span className="flex items-center gap-2 justify-center"><Send className="w-4 h-4" />Enviar teste</span>
          }
        </button>

        {lastResult && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${lastResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {lastResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {lastResult.msg}
            {!lastResult.success && (
              <span className="ml-auto text-xs opacity-70">Verifique a conexão WhatsApp</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Config: Módulos habilitados ──────────────────────────────────────────────

function TelasTab() {
  const qc = useQueryClient()

  const { data: settings } = useQuery<{ enabledScreens: string[] }>({
    queryKey: ['light-settings'],
    queryFn:  () => api.get('/chatbot-light/settings').then(r => r.data),
  })

  const enabledScreens = settings?.enabledScreens ?? ['agenda', 'pacientes', 'prontuario', 'avaliacao', 'financeiro']

  const saveMutation = useMutation({
    mutationFn: (screens: string[]) =>
      api.put('/chatbot-light/settings', { enabledScreens: screens }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-settings'] })
      toast.success('Configurações salvas')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const toggle = (key: string) => {
    const next = enabledScreens.includes(key)
      ? enabledScreens.filter(s => s !== key)
      : [...enabledScreens, key]
    saveMutation.mutate(next)
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="font-semibold text-slate-900">Módulos habilitados</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Escolha quais módulos podem gerar automações no Chatbot Light
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {MODULES.map(mod => {
          const Icon = mod.icon
          const isEnabled = enabledScreens.includes(mod.key)
          return (
            <div key={mod.key} className="flex items-center gap-4 px-5 py-4">
              <div className={`w-9 h-9 ${mod.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${mod.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{mod.label}</p>
                <p className="text-xs text-slate-400">
                  {mod.triggers.length} automação{mod.triggers.length !== 1 ? 'ões' : ''} disponível{mod.triggers.length !== 1 ? 'eis' : ''}
                </p>
              </div>
              <Toggle
                enabled={isEnabled}
                onToggle={() => toggle(mod.key)}
                disabled={saveMutation.isPending}
              />
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-400">
        Desativar um módulo não remove as configurações existentes, apenas oculta as automações da tela Mensagens.
      </p>
    </div>
  )
}

// ─── Configurações panel ──────────────────────────────────────────────────────

function ConfigPanel({ configTab, setConfigTab }: { configTab: ConfigTab; setConfigTab: (t: ConfigTab) => void }) {
  const tabs: { key: ConfigTab; label: string }[] = [
    { key: 'conexao', label: 'Conexão' },
    { key: 'teste',   label: 'Teste de Envio' },
    { key: 'telas',   label: 'Módulos habilitados' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Configurações</h2>
      </div>

      <div className="flex border-b border-slate-200 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setConfigTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
              configTab === tab.key
                ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {configTab === 'conexao' && <ConexaoTab />}
        {configTab === 'teste'   && <TesteTab />}
        {configTab === 'telas'   && <TelasTab />}
      </div>
    </div>
  )
}

// ─── Sidebar nav button ───────────────────────────────────────────────────────

function SideNavBtn({
  panel, current, onClick, icon: Icon, label, badge,
}: {
  panel: Panel; current: Panel; onClick: (p: Panel) => void
  icon: React.ElementType; label: string; badge?: React.ReactNode
}) {
  const isActive = panel === current
  return (
    <button
      onClick={() => onClick(panel)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
        isActive
          ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/20'
          : 'text-slate-400 hover:text-white hover:bg-white/6'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-cyan-400' : ''}`} />
      <span className="flex-1 text-left">{label}</span>
      {badge}
    </button>
  )
}

// ─── Sidebar connection status ────────────────────────────────────────────────

function SidebarConnectionStatus() {
  const { data: instance } = useQuery({
    queryKey: ['chatbot-instance'],
    queryFn:  () => api.get('/chatbot/instance').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const isConnected = instance?.status === 'CONNECTED'
  const isQuarantined = instance?.status === 'QUARANTINED'

  return (
    <div className="px-3 py-3 border-t border-white/8">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${isConnected ? 'bg-emerald-500/10 text-emerald-400' : isQuarantined ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400 animate-pulse' : isQuarantined ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="truncate">
          {isConnected ? `Conectado${instance?.phoneNumber ? ' · ' + instance.phoneNumber : ''}` : isQuarantined ? 'Sessão em Quarentena' : 'WhatsApp desconectado'}
        </span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatbotLight() {
  const { user } = useAuthStore()
  const [panel, setPanel]         = useState<Panel>('relatorio')
  const [configTab, setConfigTab] = useState<ConfigTab>('conexao')

  const navItems: { panel: Panel; label: string; icon: React.ElementType }[] = [
    { panel: 'relatorio',     label: 'Relatório',           icon: BarChart3 },
    { panel: 'fluxos',        label: 'Fluxos',              icon: GitBranch },
    { panel: 'mensagens',     label: 'Mensagens Automáticas', icon: MessageSquare },
    { panel: 'templates',     label: 'Templates',           icon: FileText },
    { panel: 'respostas',     label: 'Respostas Rápidas',   icon: Reply },
    { panel: 'historico',     label: 'Histórico',           icon: History },
    { panel: 'configuracoes', label: 'Configurações',        icon: Settings },
  ]

  const goTo = (p: Panel) => {
    setPanel(p)
    if (p !== 'configuracoes') setConfigTab('conexao')
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* ── Left sidebar ── */}
      <aside className="w-64 bg-slate-900 border-r border-white/8 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/8">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao sistema
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/30 flex-shrink-0">
              <MessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Chatbot Light</p>
              <p className="text-cyan-400 text-xs">Automação por regras</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Menu</p>
          {navItems.map(item => (
            <SideNavBtn
              key={item.panel}
              panel={item.panel}
              current={panel}
              onClick={goTo}
              icon={item.icon}
              label={item.label}
            />
          ))}

        </nav>

        {/* WhatsApp connection status */}
        <SidebarConnectionStatus />

        {/* User info */}
        <div className="px-4 py-3 border-t border-white/8 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {user?.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {panel === 'relatorio'     && <RelatorioPanel onGoTo={goTo} />}
        {panel === 'fluxos'        && <FluxosPanel />}
        {panel === 'mensagens'     && <MensagensPanel />}
        {panel === 'templates'     && <TemplatesPanel />}
        {panel === 'respostas'     && <RespostasPanel />}
        {panel === 'historico'     && <HistoricoPanel />}
        {panel === 'configuracoes' && <ConfigPanel configTab={configTab} setConfigTab={setConfigTab} />}
      </main>
    </div>
  )
}
