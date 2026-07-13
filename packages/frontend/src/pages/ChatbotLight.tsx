import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import {
  BarChart3, MessageSquare, History, Settings, ArrowLeft,
  Calendar, Users, ClipboardList, Brain, DollarSign,
  Plus, Pencil, Trash2, Send, Wifi, WifiOff,
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle,
  ToggleLeft, ToggleRight, Eye, EyeOff,
  Zap, GitBranch, Reply, X, FileText, Play, RotateCcw,
  Smartphone, Info, CalendarClock, PhoneCall, UserCheck,
  PauseCircle, Activity, Download, Bell,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import Modal from '../components/ui/Modal'
import { findCampaignPreset } from '../data/lightCampaignPresets'
import ConstrutorPanel from './chatbot-light/ConstrutorPanel'
import BlockBuilderPanel from './chatbot-light/BlockBuilderPanel'

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Panel = 'central' | 'relatorio' | 'chatbots' | 'notificacoes' | 'historico' | 'configuracoes' | 'pre_agendamentos'
type ConfigTab = 'conexao' | 'teste' | 'telas' | 'horario'
type ChatbotsTab = 'meus' | 'simulador'
type ChatbotDetailTab = 'visao' | 'construtor' | 'msgs' | 'automacoes' | 'testes' | 'config'
export type FluxoActionType = 'SEND_MESSAGE' | 'TRANSFER_QUEUE' | 'OPEN_MENU' | 'SYSTEM_ACTION' | 'END_CHAT' | 'START_PLAN_SCHEDULING' | 'START_LEAD_CAPTURE'

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

export interface FluxoOption {
  id: string
  number: number
  label: string
  triggers: string
  response: string
  actionType: FluxoActionType
  queueId: string | null
  nextFlowId: string | null
  systemAction: string | null
  systemActionKey?: string | null
  systemActionConfigId?: string | null
  transitionMessage?: string | null
  planSource?: string | null
  doctorSelect?: string | null
  limitSlots?: number | string | null
  searchWindowDays?: number | string | null
  durationMinutes?: number | string | null
  requireCpf?: boolean | string | null
  requireConvenio?: boolean | string | null
  useWhatsappPhone?: boolean | string | null
  successMessage?: string | null
}

export interface LightFluxo {
  id: string
  chatbotId: string | null
  name: string
  description: string | null
  keywords: string
  welcomeMessage: string
  options: FluxoOption[]
  maxAttempts: number
  fallbackMessage: string
  active: boolean
  executions: number
  // Camada de rascunho/publicação do Construtor de Atendimento
  status?: 'DRAFT' | 'PUBLISHED'
  hasDraftChanges?: boolean
  lastPublishedAt?: string | null
  createdAt: string
  updatedAt: string
}

interface LightQuickReply {
  id: string
  keyword: string
  response: string
  templateId: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

interface LightNotificationTemplate {
  id: string
  name: string
  message: string
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
  {
    key: 'documentos',
    label: 'Documentos',
    icon: FileText,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    triggers: [
      { event: 'DOCUMENT_SENT', label: 'Documento gerado para o paciente', hasDelay: false },
    ],
  },
]

const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULES.map(m => [m.key, m.label]))
const MODULE_COLORS: Record<string, string> = Object.fromEntries(MODULES.map(m => [m.key, m.color]))

// Rótulos amigáveis para os módulos "técnicos" gravados por outras origens de envio
// (teste manual, fluxos de conversa, agendamento guiado, respostas rápidas) além
// dos módulos disparados por integração já cobertos por MODULE_LABELS acima.
const MODULE_DISPLAY_LABELS: Record<string, string> = {
  ...MODULE_LABELS,
  teste: 'Teste de envio',
  fluxo: 'Fluxos de conversa',
  fluxo_guiado: 'Ações guiadas do sistema',
  lead_capture: 'Captação de leads',
  resposta_rapida: 'Respostas rápidas',
}

// Paleta categórica validada (dataviz skill) para os gráficos do Relatório —
// mesma família cyan/emerald/red/amber já usada nos badges do restante da tela.
const CHART_COLORS = ['#0891b2', '#059669', '#dc2626', '#d97706', '#2563eb', '#9333ea']

const TEMPLATE_VARS: { category: string; label: string; vars: { key: string; desc: string }[] }[] = [
  {
    category: 'paciente',
    label: 'Paciente',
    vars: [
      { key: '{nome}',    desc: 'Nome completo do paciente' },
      { key: '{telefone}',desc: 'Telefone do paciente' },
      { key: '{cpf}',     desc: 'CPF do paciente' },
      { key: '{plano}',   desc: 'Plano de saúde / convênio' },
      { key: '{carteirinha}', desc: 'Número da carteirinha do convênio' },
    ],
  },
  {
    category: 'consulta',
    label: 'Consulta',
    vars: [
      { key: '{data}',             desc: 'Data da consulta (dd/mm/aaaa)' },
      { key: '{hora}',             desc: 'Hora da consulta (HH:MM)' },
      { key: '{tipo_atendimento}', desc: 'Tipo: Consulta, Retorno, Avaliação…' },
      { key: '{status}',           desc: 'Status: Confirmada, Agendada…' },
    ],
  },
  {
    category: 'clinica',
    label: 'Médico / Clínica',
    vars: [
      { key: '{medico}',       desc: 'Nome do profissional' },
      { key: '{especialidade}',desc: 'Especialidade do profissional' },
      { key: '{endereco}',     desc: 'Endereço da sala / clínica' },
      { key: '{clinica}',      desc: 'Nome da sala / clínica' },
      { key: '{telefone_clinica}', desc: 'Telefone do WhatsApp da clínica' },
      { key: '{crm}',          desc: 'CRM/CRP do médico' },
    ],
  },
  {
    category: 'financeiro',
    label: 'Financeiro',
    vars: [
      { key: '{valor}',           desc: 'Valor da consulta (R$)' },
      { key: '{forma_pagamento}', desc: 'Forma de pagamento' },
      { key: '{nf}',              desc: 'Link ou número da nota fiscal' },
    ],
  },
  {
    category: 'digital',
    label: 'Digital / Links',
    vars: [
      { key: '{link}',         desc: 'Link personalizado genérico' },
      { key: '{prontuario}',   desc: 'Link para o prontuário do paciente' },
      { key: '{documento}',    desc: 'Nome de documento enviado' },
    ],
  },
]

// Lista plana mantida para compatibilidade com validações existentes
const VARIABLES = TEMPLATE_VARS.flatMap(g => g.vars.map(v => v.key))

export const FLUXO_ACTIONS: { value: FluxoActionType; label: string; description?: string }[] = [
  { value: 'SEND_MESSAGE',        label: 'Enviar apenas mensagem' },
  { value: 'TRANSFER_QUEUE',      label: 'Transferir para atendimento' },
  { value: 'OPEN_MENU',           label: 'Abrir outro menu' },
  { value: 'SYSTEM_ACTION',       label: 'Executar ação do sistema' },
  { value: 'END_CHAT',            label: 'Encerrar atendimento' },
  { value: 'START_PLAN_SCHEDULING', label: 'Iniciar agendamento por plano/serviço' },
  { value: 'START_LEAD_CAPTURE',  label: 'Capturar Interesse (Pré-Agendamento)', description: 'Coleta nome e telefone do paciente para contato posterior da secretaria' },
]

export const FLUXO_QUEUES = [
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
  { key: 'geral',       label: 'Geral' },
  { key: 'agenda',      label: 'Agenda' },
  { key: 'pacientes',   label: 'Pacientes' },
  { key: 'prontuario',  label: 'Prontuário' },
  { key: 'avaliacao',   label: 'Avaliação' },
  { key: 'financeiro',  label: 'Financeiro' },
  { key: 'documentos',  label: 'Documentos' },
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
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="mt-2 space-y-1.5">
      {TEMPLATE_VARS.map(group => (
        <div key={group.category}>
          <button
            type="button"
            onClick={() => setExpanded(e => e === group.category ? null : group.category)}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-600 transition-colors"
          >
            <span className="w-3 h-3 flex items-center justify-center text-[8px]">
              {expanded === group.category ? '▾' : '▸'}
            </span>
            {group.label}
          </button>
          {expanded === group.category && (
            <div className="flex flex-wrap gap-1.5 mt-1 pl-4">
              {group.vars.map(({ key, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onInsert(key)}
                  title={desc}
                  className="text-xs bg-white border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 text-slate-600 px-2 py-1 rounded-lg font-mono transition-colors"
                >
                  {key}
                </button>
              ))}
            </div>
          )}
        </div>
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

// ─── Central de Tarefas ─────────────────────────────────────────────────────

interface TaskItem {
  id: string
  type: 'TRANSFER' | 'FAILED_MESSAGE' | 'PRE_REGISTRATION' | 'OVERDUE_PAYMENT' | 'UNCONFIRMED_APPOINTMENT'
  title: string
  subtitle: string
  createdAt: string
  actionLabel: string
}

interface SessionCardData {
  id: string
  contactPhone: string
  flowName: string | null
  currentStepKey: string
  updatedAt: string
}

interface FailedReasonCounts {
  invalidNumber: number
  disconnected: number
  other: number
  total: number
}

interface TasksData {
  transfers: SessionCardData[]
  activeSessions: SessionCardData[]
  failedMessages: TaskItem[]
  failedReasonCounts: FailedReasonCounts
  preRegistrations: TaskItem[]
  overduePayments: TaskItem[]
  unconfirmedAppointments: TaskItem[]
  totalCount: number
}

interface ReportCards {
  sent: number
  delivered: number
  failed: number
  deliveryRate: number
  sessionsStarted: number
  transferred: number
  preRegistrations: number
}

interface ReportComparison {
  current: number
  previous: number
  diffPercent: number
}

interface EvolutionPoint {
  date: string
  sent: number
  delivered: number
  failed: number
}

interface ModuleCount {
  module: string
  count: number
}

interface FlowPerformance {
  flowId: string
  flowName: string
  executions: number
  completed: number
  abandoned: number
  transferred: number
  failed: number
}

interface ConversionFunnel {
  sessionsStarted: number
  sessionsCompleted: number
  preRegistrationsGenerated: number
  convertedToAppointment: number
}

interface TemplateUsage {
  templateId: string
  templateName: string
  sent: number
  delivered: number
  failed: number
  deliveryRate: number
}

interface HourBucket {
  hour: number
  label: string
  count: number
}

interface RecentLogEntry {
  id: string
  createdAt: string
  recipientName: string | null
  phone: string
  module: string
  status: string
  errorMessage: string | null
}

interface ChatbotLightReportData {
  cards: ReportCards
  comparison: ReportComparison
  evolution: EvolutionPoint[]
  byModule: ModuleCount[]
  byFlow: FlowPerformance[]
  failedReasonCounts: FailedReasonCounts
  funnel: ConversionFunnel
  templates: TemplateUsage[]
  byHour: HourBucket[]
  recentLogs: RecentLogEntry[]
}

type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom'

const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'custom',label: 'Personalizado' },
]

function resolvePeriodRange(preset: PeriodPreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const now = new Date()
  switch (preset) {
    case 'today': return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now }
    case '7d':    return { start: subDays(now, 7), end: now }
    case '30d':   return { start: subDays(now, 30), end: now }
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'custom': return {
      start: customStart ? new Date(customStart) : subDays(now, 30),
      end: customEnd ? new Date(customEnd + 'T23:59:59') : now,
    }
  }
}

const ReportTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

const STEP_LABELS_SHORT: Record<string, string> = {
  WAITING_MENU_OPTION: 'Aguardando opção de menu',
  CHOOSE_PLAN:         'Escolhendo plano/serviço',
  ASK_NAME:            'Informando o nome',
  ASK_PHONE_CONFIRM:   'Confirmando telefone',
  ASK_PHONE_TEXT:      'Informando telefone',
  ASK_CPF:             'Informando CPF',
  ASK_CONVENIO:        'Escolhendo convênio',
  ASK_DATE:            'Escolhendo data',
  CHOOSE_SLOT:         'Escolhendo horário',
  CONFIRMATION:        'Confirmando agendamento',
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

function SessionCard({
  session, actions, isPending,
}: {
  session: SessionCardData
  actions: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' }[]
  isPending: boolean
}) {
  const digits = session.contactPhone.replace(/\D/g, '')
  return (
    <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2">
          {digits ? (
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-800 hover:text-emerald-600 hover:underline"
            >
              {session.contactPhone}
            </a>
          ) : (
            <span className="text-sm font-medium text-slate-800">{session.contactPhone}</span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Fluxo: {session.flowName ?? '—'} · Etapa: {STEP_LABELS_SHORT[session.currentStepKey] ?? session.currentStepKey} · {timeAgo(session.updatedAt)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            disabled={isPending}
            className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${
              a.variant === 'secondary'
                ? 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                : 'bg-cyan-600 text-white hover:bg-cyan-700'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TaskSection({
  title, icon: Icon, color, bg, items, onAction, isPending,
}: {
  title: string
  icon: any
  color: string
  bg: string
  items: TaskItem[]
  onAction: (item: TaskItem) => void
  isPending: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
        <span className="ml-auto text-xs font-semibold text-slate-400">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map(item => (
          <div key={item.id} className="px-5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
              <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
            </div>
            <button
              onClick={() => onAction(item)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {item.actionLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CentralPanel({
  onGoTo, onGoToConfig, onGoToChatbots,
}: {
  onGoTo: (p: Panel) => void
  onGoToConfig: (t: ConfigTab) => void
  onGoToChatbots: (t: ChatbotsTab) => void
}) {
  const queryClient = useQueryClient()

  const { data: dash, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ['light-dashboard'],
    queryFn: () => api.get('/chatbot-light/dashboard').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: tasks, isLoading: tasksLoading } = useQuery<TasksData>({
    queryKey: ['chatbot-light-tasks'],
    queryFn: () => api.get('/chatbot-light/tasks').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: instance, isLoading: instanceLoading } = useQuery({
    queryKey: ['chatbot-light-instance'],
    queryFn: () => api.get('/chatbot-light/instance').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: integrations = [] } = useQuery<LightIntegrationConfig[]>({
    queryKey: ['light-integrations'],
    queryFn: () => api.get('/chatbot-light/integrations').then(r => r.data),
    staleTime: 30_000,
  })

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ['chatbot-light-tasks'] })

  const resolveTransfer = useMutation({
    mutationFn: (id: string) => api.patch(`/chatbot-light/sessions/${id}/resolve`),
    onSuccess: () => { toast.success('Conversa marcada como atendida'); invalidateTasks() },
    onError: () => toast.error('Erro ao marcar conversa'),
  })

  const resendMessage = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot-light/history/${id}/resend`),
    onSuccess: (r) => {
      if (r.data?.success) { toast.success('Mensagem reenviada'); invalidateTasks() }
      else toast.error('Falha ao reenviar')
    },
    onError: () => toast.error('Erro ao reenviar mensagem'),
  })

  const sendPaymentReminder = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot-light/transactions/${id}/send-reminder`),
    onSuccess: () => { toast.success('Lembrete de cobrança enviado'); invalidateTasks() },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao enviar cobrança'),
  })

  const confirmAppointment = useMutation({
    mutationFn: (id: string) => api.put(`/appointments/${id}`, { status: 'CONFIRMED' }),
    onSuccess: () => { toast.success('Consulta confirmada'); invalidateTasks() },
    onError: () => toast.error('Erro ao confirmar consulta'),
  })

  const endSession = useMutation({
    mutationFn: (id: string) => api.patch(`/chatbot-light/sessions/${id}/status`, { status: 'CANCELLED' }),
    onSuccess: () => { toast.success('Sessão encerrada'); invalidateTasks() },
    onError: () => toast.error('Erro ao encerrar sessão'),
  })

  const transferSession = useMutation({
    mutationFn: (id: string) => api.patch(`/chatbot-light/sessions/${id}/status`, { status: 'TRANSFER' }),
    onSuccess: () => { toast.success('Sessão transferida para atendente'); invalidateTasks() },
    onError: () => toast.error('Erro ao transferir sessão'),
  })

  if (dashLoading || tasksLoading || instanceLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  const d = dash!
  const t = tasks!
  const isPending = resolveTransfer.isPending || resendMessage.isPending || sendPaymentReminder.isPending
    || confirmAppointment.isPending || endSession.isPending || transferSession.isPending

  const isConnected = instance?.status === 'CONNECTED'
  const automationsWithProblem = integrations.filter(c => c.enabled && !c.templateId)

  const cards = [
    { label: 'WhatsApp',           value: isConnected ? 'Conectado' : 'Desconectado', icon: isConnected ? Wifi : WifiOff, color: isConnected ? 'text-emerald-600' : 'text-red-600', bg: isConnected ? 'bg-emerald-50' : 'bg-red-50' },
    { label: 'Falhas de envio',    value: t.failedReasonCounts.total,   icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50' },
    { label: 'Transferências',     value: t.transfers.length,           icon: PhoneCall,    color: 'text-purple-600',  bg: 'bg-purple-50' },
    { label: 'Pré-agendamentos',   value: t.preRegistrations.length,    icon: UserCheck,    color: 'text-blue-600',    bg: 'bg-blue-50' },
    { label: 'Automações pausadas',value: automationsWithProblem.length,icon: PauseCircle,  color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Sessões ativas',     value: t.activeSessions.length,      icon: Activity,     color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  ]

  const hasAnything = t.totalCount > 0 || t.activeSessions.length > 0 || automationsWithProblem.length > 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Central</h2>
        <p className="text-sm text-slate-500 mt-0.5">O que precisa da sua atenção agora</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span>WhatsApp: <strong className={isConnected ? 'text-emerald-600' : 'text-red-600'}>{isConnected ? 'Conectado' : 'Desconectado'}</strong></span>
          <span>Sala vinculada: <strong className="text-slate-700">{instance?.roomName ?? 'Nenhuma'}</strong></span>
          <span>Última atividade: <strong className="text-slate-700">{d.recent[0] ? format(new Date(d.recent[0].createdAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : '—'}</strong></span>
        </div>
      </div>

      {!isConnected && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">WhatsApp desconectado</p>
            <p className="text-xs text-red-600 mt-0.5">Nenhuma mensagem automática será enviada enquanto não houver uma sala vinculada e conectada.</p>
          </div>
          <button
            onClick={() => onGoToConfig('conexao')}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex-shrink-0"
          >
            Vincular sala
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {!hasAnything ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhuma pendência no momento. Tudo em dia!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {t.transfers.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <PhoneCall className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Conversas aguardando atendente</h3>
                <span className="ml-auto text-xs font-semibold text-slate-400">{t.transfers.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {t.transfers.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    isPending={isPending}
                    actions={[{ label: 'Marcar como atendida', onClick: () => resolveTransfer.mutate(s.id) }]}
                  />
                ))}
              </div>
            </div>
          )}

          {t.failedMessages.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Mensagens que falharam</h3>
                <span className="ml-auto text-xs font-semibold text-slate-400">{t.failedReasonCounts.total}</span>
              </div>
              <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{t.failedReasonCounts.invalidNumber} por número inválido</span>
                <span>{t.failedReasonCounts.disconnected} por WhatsApp desconectado</span>
                <span>{t.failedReasonCounts.other} por outro motivo</span>
              </div>
              <div className="divide-y divide-slate-100">
                {t.failedMessages.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                      <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
                    </div>
                    <button
                      onClick={() => resendMessage.mutate(item.id)}
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {automationsWithProblem.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <PauseCircle className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Automações com atenção</h3>
                <span className="ml-auto text-xs font-semibold text-slate-400">{automationsWithProblem.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {automationsWithProblem.map(cfg => {
                  const mod = MODULES.find(m => m.key === cfg.module)
                  const triggerLabel = mod?.triggers.find(tr => tr.event === cfg.triggerEvent)?.label ?? cfg.triggerEvent
                  return (
                    <div key={cfg.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{triggerLabel}</p>
                        <p className="text-xs text-amber-600 truncate">Template não configurado</p>
                      </div>
                      <button
                        onClick={() => onGoTo('chatbots')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors flex-shrink-0"
                      >
                        Corrigir
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {t.activeSessions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Activity className="w-4 h-4 text-cyan-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Sessões ativas</h3>
                <span className="ml-auto text-xs font-semibold text-slate-400">{t.activeSessions.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {t.activeSessions.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    isPending={isPending}
                    actions={[
                      { label: 'Transferir para atendente', onClick: () => transferSession.mutate(s.id), variant: 'secondary' },
                      { label: 'Encerrar sessão', onClick: () => endSession.mutate(s.id) },
                    ]}
                  />
                ))}
              </div>
            </div>
          )}

          {t.preRegistrations.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">Pré-agendamentos recentes</h3>
                <span className="ml-auto text-xs font-semibold text-slate-400">{t.preRegistrations.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {t.preRegistrations.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                      <p className="text-xs text-slate-400 truncate">{item.subtitle}</p>
                    </div>
                    <button
                      onClick={() => onGoTo('pre_agendamentos')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors flex-shrink-0"
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <TaskSection
            title="Consultas próximas sem confirmação" icon={CalendarClock} color="text-blue-600" bg="bg-blue-50"
            items={t.unconfirmedAppointments} isPending={isPending}
            onAction={(item) => confirmAppointment.mutate(item.id)}
          />
          <TaskSection
            title="Cobranças vencidas" icon={DollarSign} color="text-amber-600" bg="bg-amber-50"
            items={t.overduePayments} isPending={isPending}
            onAction={(item) => sendPaymentReminder.mutate(item.id)}
          />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">Ações rápidas</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onGoToChatbots('meus')} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Criar chatbot</button>
          <button onClick={() => onGoToConfig('teste')} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Testar envio</button>
          <button onClick={() => onGoToChatbots('simulador')} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Abrir simulador</button>
        </div>
      </div>
    </div>
  )
}

function RelatorioPanel({ onGoTo }: { onGoTo: (p: Panel) => void }) {
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [flowId, setFlowId] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { start, end } = resolvePeriodRange(preset, customStart, customEnd)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const { data: fluxos = [] } = useQuery<LightFluxo[]>({
    queryKey: ['light-fluxos'],
    queryFn: () => api.get('/chatbot-light/fluxos').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: report, isLoading } = useQuery<ChatbotLightReportData>({
    queryKey: ['chatbot-light-report', startIso, endIso, flowId, moduleFilter, statusFilter],
    queryFn: () => api.get('/chatbot-light/reports', {
      params: {
        startDate: startIso, endDate: endIso,
        flowId: flowId || undefined, module: moduleFilter || undefined, status: statusFilter || undefined,
      },
    }).then(r => r.data),
    staleTime: 30_000,
  })

  const filenameSuffix = `${format(start, 'yyyy-MM-dd')}-${format(end, 'yyyy-MM-dd')}`

  const exportCSV = () => {
    if (!report) return
    const rows = [
      ['Data/Hora', 'Destinatário', 'Telefone', 'Módulo', 'Status', 'Resultado'].join(';'),
      ...report.recentLogs.map(l => [
        format(new Date(l.createdAt), 'dd/MM/yyyy HH:mm'),
        l.recipientName ?? '',
        l.phone,
        MODULE_DISPLAY_LABELS[l.module] ?? l.module,
        l.status,
        l.errorMessage ?? '',
      ].join(';')),
    ].join('\n')
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-chatbot-light-${filenameSuffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    if (!report) return
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Relatório — Chatbot Light', 14, 16)
    doc.setFontSize(9)
    doc.text(`Período: ${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`, 14, 22)

    autoTable(doc, {
      startY: 28,
      head: [['Enviadas', 'Entregues', 'Falhas', 'Taxa', 'Sessões', 'Transferidas', 'Pré-agend.']],
      body: [[
        report.cards.sent, report.cards.delivered, report.cards.failed, `${report.cards.deliveryRate}%`,
        report.cards.sessionsStarted, report.cards.transferred, report.cards.preRegistrations,
      ]],
      styles: { fontSize: 8 },
    })

    let y = (doc as any).lastAutoTable.finalY + 8
    doc.setFontSize(11)
    doc.text('Mensagens por módulo', 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [['Módulo', 'Total']],
      body: report.byModule.map(m => [MODULE_DISPLAY_LABELS[m.module] ?? m.module, m.count]),
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (report.byFlow.length > 0) {
      doc.text('Performance por fluxo', 14, y)
      autoTable(doc, {
        startY: y + 3,
        head: [['Fluxo', 'Execuções', 'Concluídos', 'Abandonos', 'Transferências']],
        body: report.byFlow.map(f => [f.flowName, f.executions, f.completed, f.abandoned, f.transferred]),
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    if (report.templates.length > 0) {
      doc.text('Templates mais usados', 14, y)
      autoTable(doc, {
        startY: y + 3,
        head: [['Template', 'Enviados', 'Entregues', 'Falhas', 'Taxa']],
        body: report.templates.map(t => [t.templateName, t.sent, t.delivered, t.failed, `${t.deliveryRate}%`]),
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    doc.text('Registros recentes', 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [['Data/Hora', 'Destinatário', 'Módulo', 'Status', 'Resultado']],
      body: report.recentLogs.map(l => [
        format(new Date(l.createdAt), 'dd/MM HH:mm'),
        l.recipientName ?? l.phone,
        MODULE_DISPLAY_LABELS[l.module] ?? l.module,
        l.status,
        l.errorMessage ?? '—',
      ]),
      styles: { fontSize: 8 },
    })

    doc.save(`relatorio-chatbot-light-${filenameSuffix}.pdf`)
  }

  const exportExcel = async () => {
    if (!report) return
    const workbook = new ExcelJS.Workbook()

    const resumo = workbook.addWorksheet('Resumo')
    resumo.columns = [{ header: 'Métrica', key: 'k', width: 28 }, { header: 'Valor', key: 'v', width: 16 }]
    resumo.addRows([
      { k: 'Enviadas', v: report.cards.sent },
      { k: 'Entregues', v: report.cards.delivered },
      { k: 'Falhas', v: report.cards.failed },
      { k: 'Taxa de entrega', v: `${report.cards.deliveryRate}%` },
      { k: 'Sessões iniciadas', v: report.cards.sessionsStarted },
      { k: 'Transferidas', v: report.cards.transferred },
      { k: 'Pré-agendamentos', v: report.cards.preRegistrations },
    ])

    const modulos = workbook.addWorksheet('Por Módulo')
    modulos.columns = [{ header: 'Módulo', key: 'm', width: 28 }, { header: 'Total', key: 't', width: 12 }]
    modulos.addRows(report.byModule.map(m => ({ m: MODULE_DISPLAY_LABELS[m.module] ?? m.module, t: m.count })))

    if (report.byFlow.length > 0) {
      const porFluxo = workbook.addWorksheet('Por Fluxo')
      porFluxo.columns = [
        { header: 'Fluxo', key: 'flowName', width: 28 },
        { header: 'Execuções', key: 'executions', width: 12 },
        { header: 'Concluídos', key: 'completed', width: 12 },
        { header: 'Abandonos', key: 'abandoned', width: 12 },
        { header: 'Transferências', key: 'transferred', width: 14 },
      ]
      porFluxo.addRows(report.byFlow)
    }

    if (report.templates.length > 0) {
      const templatesSheet = workbook.addWorksheet('Templates')
      templatesSheet.columns = [
        { header: 'Template', key: 'templateName', width: 28 },
        { header: 'Enviados', key: 'sent', width: 12 },
        { header: 'Entregues', key: 'delivered', width: 12 },
        { header: 'Falhas', key: 'failed', width: 12 },
        { header: 'Taxa', key: 'deliveryRate', width: 10 },
      ]
      templatesSheet.addRows(report.templates)
    }

    const registros = workbook.addWorksheet('Registros')
    registros.columns = [
      { header: 'Data/Hora', key: 'createdAt', width: 18 },
      { header: 'Destinatário', key: 'recipientName', width: 24 },
      { header: 'Telefone', key: 'phone', width: 18 },
      { header: 'Módulo', key: 'module', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Resultado', key: 'errorMessage', width: 32 },
    ]
    registros.addRows(report.recentLogs.map(l => ({
      createdAt: format(new Date(l.createdAt), 'dd/MM/yyyy HH:mm'),
      recipientName: l.recipientName ?? '',
      phone: l.phone,
      module: MODULE_DISPLAY_LABELS[l.module] ?? l.module,
      status: l.status,
      errorMessage: l.errorMessage ?? '',
    })))

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-chatbot-light-${filenameSuffix}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading || !report) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  const growthPositive = report.comparison.diffPercent >= 0
  const comparisonTone = (report.comparison.current === 0 && report.comparison.previous === 0)
    ? 'neutral' : growthPositive ? 'positive' : 'negative'

  const messageCards = [
    { label: 'Enviadas',        value: report.cards.sent,               icon: Send,         color: 'text-blue-600',    bg: 'bg-blue-50' },
    { label: 'Entregues',       value: report.cards.delivered,          icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Falhas',          value: report.cards.failed,             icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50' },
    { label: 'Taxa de entrega', value: `${report.cards.deliveryRate}%`, icon: Zap,          color: 'text-cyan-600',    bg: 'bg-cyan-50' },
  ]
  const resultCards = [
    { label: 'Sessões iniciadas', value: report.cards.sessionsStarted,  icon: Activity,  color: 'text-cyan-600',   bg: 'bg-cyan-50' },
    { label: 'Transferidas',      value: report.cards.transferred,      icon: PhoneCall, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Pré-agendamentos',  value: report.cards.preRegistrations, icon: UserCheck, color: 'text-blue-600',   bg: 'bg-blue-50' },
  ]

  const hasEvolutionData = report.evolution.some(e => e.sent > 0)
  const hasHourData = report.byHour.some(h => h.count > 0)

  const funnelStages = [
    { label: 'Sessões iniciadas',           value: report.funnel.sessionsStarted },
    { label: 'Sessões concluídas',          value: report.funnel.sessionsCompleted },
    { label: 'Pré-agendamentos gerados',    value: report.funnel.preRegistrationsGenerated },
    { label: 'Convertidos em agendamento',  value: report.funnel.convertedToAppointment },
  ]
  const funnelMax = Math.max(1, funnelStages[0].value)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Relatório</h2>
          <p className="text-sm text-slate-500 mt-0.5">Acompanhe o desempenho das mensagens, fluxos e chatbots</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportPDF} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          <button onClick={() => exportExcel()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => onGoTo('historico')} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors">
            Ver histórico completo
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Período</label>
          <div className="flex gap-1">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${preset === p.key ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field text-sm py-1.5" />
            <span className="text-slate-400 text-sm">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field text-sm py-1.5" />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Fluxo</label>
          <select value={flowId} onChange={e => setFlowId(e.target.value)} className="input-field text-sm py-1.5 w-40">
            <option value="">Todos</option>
            {fluxos.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Módulo</label>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} disabled={!!flowId} className="input-field text-sm py-1.5 w-44 disabled:opacity-50">
            <option value="">Todos</option>
            {Object.entries(MODULE_DISPLAY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-sm py-1.5 w-36">
            <option value="">Todos</option>
            <option value="SENT">Enviadas</option>
            <option value="PENDING">Pendentes</option>
            <option value="REJECTED">Rejeitadas</option>
            <option value="FAILED">Com falha</option>
          </select>
        </div>
      </div>

      {/* Cards de mensagens */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Mensagens</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {messageCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cards de resultado */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resultado do chatbot</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {resultCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparativo com período anterior */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        comparisonTone === 'positive' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
        comparisonTone === 'negative' ? 'bg-red-50 border-red-200 text-red-700' :
        'bg-slate-50 border-slate-200 text-slate-600'
      }`}>
        <Zap className="w-4 h-4 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-semibold">
            {growthPositive ? 'Alta' : 'Queda'} de {Math.abs(report.comparison.current - report.comparison.previous)} mensagens
          </span> em relação ao período anterior de mesma duração.
          <span className="block text-xs opacity-80 mt-0.5">
            Período atual: {report.comparison.current} · Período anterior: {report.comparison.previous} · Variação: {report.comparison.diffPercent > 0 ? '+' : ''}{report.comparison.diffPercent}%
          </span>
        </div>
      </div>

      {/* Gráfico de evolução */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-4">Evolução de mensagens por dia</h3>
        {!hasEvolutionData ? (
          <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={report.evolution} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.3} />
              <XAxis dataKey="date" tickFormatter={v => format(new Date(v), 'dd/MM')} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ReportTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sent" name="Enviadas" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="delivered" name="Entregues" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="failed" name="Falhas" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mensagens por módulo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Mensagens por módulo</h3>
          </div>
          <div className="p-5 space-y-3">
            {report.byModule.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-slate-400 mb-3">Nenhum envio registrado no período.</p>
                <button onClick={() => onGoTo('chatbots')} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors">
                  Configurar automações
                </button>
              </div>
            ) : report.byModule.map(row => {
              const total = report.byModule.reduce((s, r) => s + r.count, 0)
              const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
              return (
                <div key={row.module}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700 font-medium">{MODULE_DISPLAY_LABELS[row.module] ?? row.module}</span>
                    <span className="text-sm text-slate-500">{row.count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Falhas por motivo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Falhas por motivo</h3>
          </div>
          <div className="p-5 space-y-3">
            {report.failedReasonCounts.total === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhuma falha no período.</p>
            ) : [
              { label: 'Número não está no WhatsApp', value: report.failedReasonCounts.invalidNumber },
              { label: 'WhatsApp desconectado',        value: report.failedReasonCounts.disconnected },
              { label: 'Outro motivo',                 value: report.failedReasonCounts.other },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold text-slate-900">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance por fluxo */}
      {report.byFlow.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Performance por fluxo</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Fluxo', 'Execuções', 'Concluídos', 'Abandonos', 'Transferências'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.byFlow.map(f => (
                  <tr key={f.flowId}>
                    <td className="px-4 py-3 font-medium text-slate-800">{f.flowName}</td>
                    <td className="px-4 py-3 text-slate-600">{f.executions}</td>
                    <td className="px-4 py-3 text-slate-600">{f.completed}</td>
                    <td className="px-4 py-3 text-slate-600">{f.abandoned}</td>
                    <td className="px-4 py-3 text-slate-600">{f.transferred}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Funil de conversão */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">Funil de conversão</h3>
        <p className="text-xs text-slate-400 mb-4">Versão simplificada — não rastreia as etapas intermediárias da conversa.</p>
        <div className="space-y-2.5">
          {funnelStages.map((stage, i) => {
            const pct = stage.value > 0 ? Math.max(6, Math.round((stage.value / funnelMax) * 100)) : 0
            return (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="text-slate-700">{stage.label}</span>
                  <span className="font-semibold text-slate-900">{stage.value}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Templates mais usados */}
      {report.templates.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Templates mais usados</h3>
            <p className="text-xs text-slate-400 mt-0.5">Reflete apenas Mensagens Automáticas e Respostas Rápidas a partir de hoje.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Template', 'Enviados', 'Entregues', 'Falhas', 'Taxa'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.templates.map(t => (
                  <tr key={t.templateId}>
                    <td className="px-4 py-3 font-medium text-slate-800">{t.templateName}</td>
                    <td className="px-4 py-3 text-slate-600">{t.sent}</td>
                    <td className="px-4 py-3 text-slate-600">{t.delivered}</td>
                    <td className="px-4 py-3 text-slate-600">{t.failed}</td>
                    <td className="px-4 py-3 text-slate-600">{t.deliveryRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Horários de pico */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-4">Horários de maior movimento</h3>
        {!hasHourData ? (
          <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={report.byHour} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ReportTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="count" name="Mensagens" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela analítica */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Registros recentes</h3>
          <button onClick={() => onGoTo('historico')} className="text-xs text-cyan-600 hover:underline">Ver no histórico →</button>
        </div>
        {report.recentLogs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">Nenhum registro no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Data/Hora', 'Destinatário', 'Módulo', 'Status', 'Resultado'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.recentLogs.map(log => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{format(new Date(log.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 text-xs">{log.recipientName ?? '—'}</p>
                      <p className="text-slate-400 text-xs">{log.phone}</p>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs font-semibold text-slate-600">{MODULE_DISPLAY_LABELS[log.module] ?? log.module}</span></td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 max-w-xs"><p className="text-xs text-slate-600 truncate">{log.errorMessage ?? (log.status === 'SENT' ? 'Enviada com sucesso' : '—')}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chatbot Simulator Modal ──────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  WAITING_MENU_OPTION: 'Aguardando opção de menu',
  CHOOSE_PLAN:         'Escolha de plano/serviço',
  ASK_NAME:            'Coletando nome',
  ASK_PHONE_CONFIRM:   'Confirmação de telefone',
  ASK_PHONE_TEXT:      'Coletando telefone',
  ASK_CPF:             'Coletando CPF',
  ASK_CONVENIO:        'Escolha de convênio',
  ASK_DATE:            'Escolha de data',
  ASK_DATE_EMPTY:      'Nenhum horário disponível',
  CHOOSE_SLOT:         'Escolha de horário',
  CONFIRMATION:        'Confirmação de agendamento',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:      'Sessão ativa',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  FAILED:      'Falhou',
  TRANSFER:    'Transferido para humano',
  QUICK_REPLY: 'Resposta rápida',
  NO_MATCH:    'Sem correspondência',
  NO_INSTANCE: 'Sem instância',
  EXPIRED:     'Expirado',
}

interface SimMessage {
  id: string
  fromMe: boolean
  text: string
  ts: Date
}

function FluxoSimulatorModal({
  isOpen,
  onClose,
  initialFluxo,
  fallbackChatbotId,
}: {
  isOpen: boolean
  onClose: () => void
  initialFluxo?: LightFluxo | null
  fallbackChatbotId?: string
}) {
  const [sessionToken]  = useState(() => generateUUID().replace(/-/g, '').substring(0, 16))
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [inputText, setInputText]   = useState('')
  const [currentStep, setCurrentStep]   = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('idle')
  const [flowName, setFlowName]     = useState<string | null>(null)
  const [sending, setSending]       = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addBotMessages = (texts: string[]) => {
    const now = new Date()
    setMessages(prev => [
      ...prev,
      ...texts.map(t => ({ id: generateUUID(), fromMe: false, text: t, ts: now })),
    ])
  }

  const scrollToBottom = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  useEffect(() => {
    if (!isOpen) return
    setMessages([])
    setCurrentStep(null)
    setSessionStatus('idle')
    setFlowName(null)
    setInputText('')
    if (initialFluxo) {
      const hint = initialFluxo.keywords.split(',').map(k => k.trim()).filter(Boolean)
      setMessages([{
        id: generateUUID(),
        fromMe: false,
        text: `Simulador iniciado para o fluxo "${initialFluxo.name}".\n\nEnvie uma das palavras-chave para começar:\n${hint.map(k => `• ${k}`).join('\n')}`,
        ts: new Date(),
      }])
    } else {
      setMessages([{
        id: generateUUID(),
        fromMe: false,
        text: 'Simulador iniciado. Envie uma palavra-chave para ativar um fluxo.',
        ts: new Date(),
      }])
    }
  }, [isOpen, initialFluxo])

  useEffect(() => { if (messages.length) scrollToBottom() }, [messages])

  const handleReset = async () => {
    try {
      await api.delete(`/chatbot-light/simulate/${sessionToken}`)
    } catch { /* ignore */ }
    setMessages([{
      id: generateUUID(),
      fromMe: false,
      text: 'Sessão reiniciada. Envie uma palavra-chave para começar.',
      ts: new Date(),
    }])
    setCurrentStep(null)
    setSessionStatus('idle')
    setFlowName(null)
    setInputText('')
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || sending) return

    const userMsg: SimMessage = { id: generateUUID(), fromMe: true, text, ts: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setSending(true)

    try {
      const { data } = await api.post('/chatbot-light/simulate', {
        sessionToken,
        message: text,
        chatbotId: initialFluxo?.chatbotId ?? fallbackChatbotId ?? undefined,
      })
      const { botMessages, currentStep: step, sessionStatus: status, flowName: fn } = data
      setCurrentStep(step)
      setSessionStatus(status)
      if (fn) setFlowName(fn)
      if (botMessages?.length) addBotMessages(botMessages)
    } catch (err: any) {
      addBotMessages([`⚠️ Erro: ${err?.response?.data?.message || 'Falha na simulação'}`])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
      scrollToBottom()
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const isFinished = ['COMPLETED', 'CANCELLED', 'FAILED', 'TRANSFER'].includes(sessionStatus)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm h-[680px] rounded-3xl overflow-hidden shadow-2xl flex flex-col bg-white" style={{ maxHeight: '90vh' }}>

        {/* WhatsApp-like header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight truncate">
              {flowName ? `Fluxo: ${flowName}` : 'Chatbot Light — Simulador'}
            </p>
            <p className="text-white/70 text-xs">
              {sessionStatus === 'idle' ? 'Aguardando início' : STATUS_LABELS[sessionStatus] ?? sessionStatus}
            </p>
          </div>
          <button
            onClick={handleReset}
            title="Reiniciar simulação"
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Debug bar */}
        {currentStep && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-200">
            <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium truncate">
              Passo: {STEP_LABELS[currentStep] ?? currentStep}
            </p>
          </div>
        )}

        {/* Chat area — WhatsApp background pattern */}
        <div
          className="flex-1 overflow-y-auto px-3 py-4 space-y-2"
          style={{ background: '#ECE5DD url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4c9bd\' fill-opacity=\'0.35\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
        >
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
                  m.fromMe
                    ? 'rounded-tr-sm bg-[#DCF8C6] text-slate-800'
                    : 'rounded-tl-sm bg-white text-slate-800'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                  {m.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Keyword hints for finished sessions */}
        {isFinished && (
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500">Conversa encerrada.</p>
            <button onClick={handleReset} className="text-xs text-cyan-600 font-medium hover:underline mt-0.5">
              Reiniciar simulação
            </button>
          </div>
        )}

        {/* Input area */}
        {!isFinished && (
          <div className="flex items-center gap-2 px-3 py-3 bg-[#F0F0F0] border-t border-slate-200">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite uma mensagem..."
              disabled={sending}
              className="flex-1 bg-white rounded-full px-4 py-2 text-sm text-slate-800 border border-slate-200 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
              style={{ background: '#128C7E' }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chatbots panel (agrupa Meus Chatbots / Ações do Sistema / Simulador) ─────

export interface ChatbotSummary {
  id: string
  name: string
  description: string | null
  objective: string | null
  active: boolean
  boundRoomId: string | null
  fallbackQueue: string | null
  // Fase 3: "legacy" (padrão, motor atual) | "visual_builder" (motor de blocos genérico)
  builderMode?: string
  createdAt: string
  updatedAt: string
  lastActivityAt: string | null
  boundRoom: { id: string; name: string; whatsappConnection: { status: string; phoneNumber: string | null } | null } | null
  _count: { fluxos: number; quickReplies: number; integrations: number }
}

function ChatbotsPanel({ chatbotsTab, setChatbotsTab }: { chatbotsTab: ChatbotsTab; setChatbotsTab: (t: ChatbotsTab) => void }) {
  const [selectedChatbotId, setSelectedChatbotId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<ChatbotDetailTab>('visao')

  const { data: chatbots = [] } = useQuery<ChatbotSummary[]>({
    queryKey: ['light-chatbots'],
    queryFn: () => api.get('/chatbot-light/chatbots').then(r => r.data),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (chatbotsTab === 'simulador' && !selectedChatbotId && chatbots.length > 0) {
      setSelectedChatbotId(chatbots[0].id)
      setDetailTab('testes')
    }
  }, [chatbotsTab, chatbots, selectedChatbotId])

  const openChatbot = (id: string) => {
    setSelectedChatbotId(id)
    setDetailTab('visao')
  }

  const goBack = () => {
    setSelectedChatbotId(null)
    setChatbotsTab('meus')
  }

  if (selectedChatbotId) {
    const chatbot = chatbots.find(c => c.id === selectedChatbotId)
    if (!chatbot) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
    return <ChatbotDetailView chatbot={chatbot} tab={detailTab} setTab={setDetailTab} onBack={goBack} />
  }

  return <MeusChatbotsPanel chatbots={chatbots} onOpen={openChatbot} />
}

function MeusChatbotsPanel({ chatbots, onOpen }: { chatbots: ChatbotSummary[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', objective: '' })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/chatbot-light/chatbots', data).then(r => r.data),
    onSuccess: (chatbot) => {
      qc.invalidateQueries({ queryKey: ['light-chatbots'] })
      setModalOpen(false)
      setForm({ name: '', description: '', objective: '' })
      toast.success('Chatbot criado')
      onOpen(chatbot.id)
    },
    onError: () => toast.error('Erro ao criar chatbot'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/chatbot-light/chatbots/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-chatbots'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Meus Chatbots</h2>
          <p className="text-sm text-slate-500 mt-0.5">Cada chatbot tem seus próprios fluxos, ações, respostas e mensagens automáticas — e pode ter sua própria sala de WhatsApp.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary text-sm flex-shrink-0">
          <Plus className="w-4 h-4" /> Criar chatbot
        </button>
      </div>

      {chatbots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <GitBranch className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nenhum chatbot criado ainda</p>
          <p className="text-slate-400 text-xs mb-5">Crie seu primeiro chatbot para começar a montar fluxos de atendimento.</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Criar primeiro chatbot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chatbots.map(cb => {
            const connStatus = cb.boundRoom?.whatsappConnection?.status
            const isConnected = connStatus === 'CONNECTED'
            return (
              <div key={cb.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-slate-900 text-sm">{cb.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cb.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {cb.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {cb.objective && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{cb.objective}</p>}
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>Fluxos: <strong className="text-slate-700">{cb._count.fluxos}</strong> · Respostas: <strong className="text-slate-700">{cb._count.quickReplies}</strong> · Automações: <strong className="text-slate-700">{cb._count.integrations}</strong></p>
                    <p className="flex items-center gap-1.5">
                      {cb.boundRoom ? (isConnected ? <Wifi className="w-3 h-3 text-emerald-500" /> : <WifiOff className="w-3 h-3 text-red-500" />) : <WifiOff className="w-3 h-3 text-slate-300" />}
                      Sala: {cb.boundRoom?.name ?? 'Nenhuma vinculada'}
                    </p>
                    <p>Última atividade: {cb.lastActivityAt ? format(new Date(cb.lastActivityAt), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button onClick={() => onOpen(cb.id)} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors flex-1">
                    Editar
                  </button>
                  <Toggle enabled={cb.active} onToggle={() => toggleMutation.mutate({ id: cb.id, active: !cb.active })} disabled={toggleMutation.isPending} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Criar chatbot" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nome do chatbot *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ex: Bot de Agendamento" />
          </div>
          <div>
            <label className="label">Objetivo</label>
            <input value={form.objective} onChange={e => setForm(p => ({ ...p, objective: e.target.value }))} className="input-field" placeholder="Ex: Agendar consultas pelo WhatsApp" />
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input-field resize-none" />
          </div>
          <button
            onClick={() => form.name.trim() && createMutation.mutate(form)}
            disabled={!form.name.trim() || createMutation.isPending}
            className="btn-primary w-full"
          >
            {createMutation.isPending ? 'Criando...' : 'Criar chatbot'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function ChatbotDetailView({
  chatbot, tab, setTab, onBack,
}: {
  chatbot: ChatbotSummary
  tab: ChatbotDetailTab
  setTab: (t: ChatbotDetailTab) => void
  onBack: () => void
}) {
  const tabs: { key: ChatbotDetailTab; label: string }[] = [
    { key: 'visao',       label: 'Visão Geral' },
    { key: 'construtor',  label: 'Construtor' },
    { key: 'msgs',        label: 'Mensagens' },
    { key: 'automacoes',  label: 'Automações' },
    { key: 'testes',      label: 'Testes' },
    { key: 'config',      label: 'Configurações' },
  ]

  return (
    <div>
      <div className="px-6 pt-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-xs mb-3 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para Meus Chatbots
        </button>
        <h2 className="text-xl font-bold text-slate-900 mb-3">{chatbot.name}</h2>
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'visao'      && <ChatbotVisaoGeralTab chatbot={chatbot} />}
      {tab === 'construtor' && (
        <div className="h-[calc(100vh-13rem)]">
          {chatbot.builderMode === 'visual_builder'
            ? <BlockBuilderPanel chatbotId={chatbot.id} />
            : <ConstrutorPanel chatbotId={chatbot.id} />}
        </div>
      )}
      {tab === 'msgs'       && <MensagensLibPanel chatbotId={chatbot.id} />}
      {tab === 'automacoes' && <MensagensPanel chatbotId={chatbot.id} />}
      {tab === 'testes'     && <div className="p-6"><SimuladorTab chatbotId={chatbot.id} /></div>}
      {tab === 'config'     && <ChatbotConfigTab chatbot={chatbot} />}
    </div>
  )
}

// Agrupa Templates + Respostas Rápidas numa única aba ("Mensagens"), já que
// nenhuma das duas depende de um fluxo específico do Construtor.
function MensagensLibPanel({ chatbotId }: { chatbotId: string }) {
  const [sub, setSub] = useState<'templates' | 'respostas'>('templates')
  return (
    <div>
      <div className="px-6 pt-4 flex gap-1">
        {([
          { key: 'templates' as const, label: 'Templates' },
          { key: 'respostas' as const, label: 'Respostas Rápidas' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              sub === t.key ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'templates' ? <TemplatesPanel /> : <RespostasPanel chatbotId={chatbotId} />}
    </div>
  )
}

function ChatbotVisaoGeralTab({ chatbot }: { chatbot: ChatbotSummary }) {
  const connStatus = chatbot.boundRoom?.whatsappConnection?.status
  const isConnected = connStatus === 'CONNECTED'
  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${isConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
        {isConnected ? <Wifi className="w-4 h-4 flex-shrink-0" /> : <WifiOff className="w-4 h-4 flex-shrink-0" />}
        <span className="font-medium">
          {chatbot.boundRoom
            ? `${isConnected ? 'Conectado' : 'Desconectado'} · Sala ${chatbot.boundRoom.name}${chatbot.boundRoom.whatsappConnection?.phoneNumber ? ' · ' + chatbot.boundRoom.whatsappConnection.phoneNumber : ''}`
            : 'Nenhuma sala vinculada — configure em "Configurações"'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{chatbot._count.fluxos}</p>
          <p className="text-xs text-slate-500">Fluxos</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{chatbot._count.quickReplies}</p>
          <p className="text-xs text-slate-500">Respostas rápidas</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{chatbot._count.integrations}</p>
          <p className="text-xs text-slate-500">Mensagens automáticas</p>
        </div>
      </div>

      {chatbot.description && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição</p>
          <p className="text-sm text-slate-700">{chatbot.description}</p>
        </div>
      )}
      {chatbot.objective && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Objetivo</p>
          <p className="text-sm text-slate-700">{chatbot.objective}</p>
        </div>
      )}
    </div>
  )
}

function ChatbotConfigTab({ chatbot }: { chatbot: ChatbotSummary }) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form, setForm] = useState({ name: chatbot.name, description: chatbot.description ?? '', objective: chatbot.objective ?? '', fallbackQueue: chatbot.fallbackQueue ?? '' })

  const { data: rooms = [] } = useQuery<ChatbotLightRoomOption[]>({
    queryKey: ['chatbot-light-available-rooms'],
    queryFn: () => api.get('/chatbot-light/instance/available-rooms').then(r => r.data),
    enabled: pickerOpen,
  })

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.put(`/chatbot-light/chatbots/${chatbot.id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-chatbots'] }); toast.success('Chatbot atualizado') },
    onError: () => toast.error('Erro ao salvar'),
  })

  const bindMutation = useMutation({
    mutationFn: (roomId: string) => api.post(`/chatbot-light/chatbots/${chatbot.id}/bind-room`, { roomId }).then(r => r.data),
    onSuccess: () => {
      toast.success('Sala vinculada')
      setPickerOpen(false)
      qc.invalidateQueries({ queryKey: ['light-chatbots'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao vincular sala'),
  })

  const unbindMutation = useMutation({
    mutationFn: () => api.post(`/chatbot-light/chatbots/${chatbot.id}/unbind-room`).then(r => r.data),
    onSuccess: () => { toast.success('Sala desvinculada'); qc.invalidateQueries({ queryKey: ['light-chatbots'] }) },
    onError: () => toast.error('Erro ao desvincular sala'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/chatbot-light/chatbots/${chatbot.id}`),
    onSuccess: () => { toast.success('Chatbot excluído'); qc.invalidateQueries({ queryKey: ['light-chatbots'] }) },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao excluir'),
  })

  const builderModeMutation = useMutation({
    mutationFn: (builderMode: string) => api.patch(`/chatbot-light/chatbots/${chatbot.id}/builder-mode`, { builderMode }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-chatbots'] }); toast.success('Modo do Construtor atualizado') },
    onError: () => toast.error('Erro ao mudar o modo do Construtor'),
  })

  const hasBoundRoom = !!chatbot.boundRoomId
  const connStatus = chatbot.boundRoom?.whatsappConnection?.status
  const isConnected = connStatus === 'CONNECTED'

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="font-semibold text-slate-900 mb-3">Sala de WhatsApp deste chatbot</h3>
        <div className={`flex items-center gap-4 p-5 rounded-2xl border ${isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            {isConnected ? <Wifi className="w-6 h-6 text-white" /> : <WifiOff className="w-6 h-6 text-white" />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">{hasBoundRoom ? chatbot.boundRoom?.name : 'Nenhuma sala vinculada'}</p>
            {hasBoundRoom && chatbot.boundRoom?.whatsappConnection?.phoneNumber && (
              <p className="text-sm text-slate-500">{chatbot.boundRoom.whatsappConnection.phoneNumber}</p>
            )}
          </div>
          {hasBoundRoom ? (
            <button onClick={() => unbindMutation.mutate()} disabled={unbindMutation.isPending} className="px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50">
              Desvincular
            </button>
          ) : (
            <button onClick={() => setPickerOpen(true)} className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 rounded-xl hover:bg-cyan-700 transition-colors flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Vincular Sala
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-900 mb-3">Modo do Construtor</h3>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => builderModeMutation.mutate('legacy')}
              disabled={builderModeMutation.isPending}
              className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                (chatbot.builderMode ?? 'legacy') === 'legacy' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              Legado (Fluxos/Ações do Sistema)
            </button>
            <button
              onClick={() => builderModeMutation.mutate('visual_builder')}
              disabled={builderModeMutation.isPending}
              className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                chatbot.builderMode === 'visual_builder' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              Construtor de Blocos (novo)
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Trocar de modo <strong>não converte nada automaticamente</strong>. No modo novo, a conversa é montada do zero
            com blocos (Boas-vindas, Menu, Coletar dado, Ação do sistema...) na aba Construtor — mensagens que hoje vêm de
            uma Ação do Sistema legada podem ser recriadas como bloco em "Mensagens herdadas", dentro do Construtor.
          </p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-900 mb-3">Identificação</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Nome</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="label">Objetivo</label>
            <input value={form.objective} onChange={e => setForm(p => ({ ...p, objective: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input-field resize-none" />
          </div>
          <button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending} className="btn-primary">
            {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-red-700 mb-2">Excluir chatbot</h3>
        <p className="text-xs text-slate-500 mb-3">Só é possível excluir chatbots sem fluxos, respostas rápidas ou mensagens automáticas vinculadas.</p>
        <button
          onClick={() => { if (confirm(`Excluir o chatbot "${chatbot.name}"?`)) deleteMutation.mutate() }}
          disabled={deleteMutation.isPending}
          className="px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          Excluir chatbot
        </button>
      </div>

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Vincular Sala" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Selecione a sala cuja conexão WhatsApp este chatbot deve usar.</p>
          {rooms.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhuma sala cadastrada. Crie uma sala em Configurações &gt; Salas.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {rooms.map(room => {
                const roomConnected = room.whatsappConnection?.status === 'CONNECTED'
                return (
                  <button
                    key={room.id}
                    onClick={() => bindMutation.mutate(room.id)}
                    disabled={bindMutation.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${roomConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      {roomConnected ? <Wifi className="w-4 h-4 text-white" /> : <WifiOff className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{room.name}</p>
                      <p className="text-xs text-slate-500">
                        {roomConnected ? (room.whatsappConnection?.phoneNumber ?? 'Conectado') : 'WhatsApp desconectado'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ─── Mensagens automáticas panel ──────────────────────────────────────────────

function MensagensPanel({ chatbotId }: { chatbotId?: string } = {}) {
  const qc = useQueryClient()

  const { data: configs = [] } = useQuery<LightIntegrationConfig[]>({
    queryKey: ['light-integrations', chatbotId ?? 'all'],
    queryFn:  () => api.get('/chatbot-light/integrations', { params: chatbotId ? { chatbotId } : {} }).then(r => r.data),
  })

  const activatePresetMutation = useMutation({
    mutationFn: async ({ module, triggerEvent }: { module: string; triggerEvent: string }) => {
      const preset = findCampaignPreset(module, triggerEvent)
      if (!preset) throw new Error('Sem texto pronto para este evento')
      const template = await api.post('/chatbot-light/templates', {
        name: preset.name, category: preset.category, content: preset.content, variables: [], active: true,
      }).then(r => r.data)
      return api.put('/chatbot-light/integrations', {
        module, triggerEvent, enabled: true, templateId: template.id, delayMinutes: 0, chatbotId,
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-integrations'] })
      qc.invalidateQueries({ queryKey: ['light-templates'] })
      toast.success('Campanha ativada com texto pronto — edite quando quiser em Templates')
    },
    onError: () => toast.error('Erro ao ativar campanha'),
  })

  const { data: templates = [] } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const { data: settings } = useQuery<{ enabledScreens: string[] }>({
    queryKey: ['light-settings'],
    queryFn:  () => api.get('/chatbot-light/settings').then(r => r.data),
  })

  const { data: instance } = useQuery({
    queryKey: ['chatbot-light-instance'],
    queryFn:  () => api.get('/chatbot-light/instance').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const saveMutation = useMutation({
    mutationFn: (data: { module: string; triggerEvent: string; enabled: boolean; templateId?: string | null; delayMinutes?: number }) =>
      api.put('/chatbot-light/integrations', { ...data, chatbotId }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-integrations'] }); toast.success('Configuração salva') },
    onError: () => toast.error('Erro ao salvar'),
  })

  const enabledScreens = settings?.enabledScreens ?? ['agenda', 'pacientes', 'prontuario', 'avaliacao', 'financeiro']
  const visibleModules  = MODULES.filter(m => enabledScreens.includes(m.key))

  const getConfig = (module: string, event: string) =>
    configs.find(c => c.module === module && c.triggerEvent === event)

  const isConnected = instance?.status === 'CONNECTED'
  const enabledWithoutTemplate = configs.filter(c => c.enabled && !c.templateId)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mensagens Automáticas</h2>
        <p className="text-sm text-slate-500 mt-0.5">Disparos automáticos por evento — ative com um texto pronto ou escolha um template seu</p>
      </div>

      {/* Status de conexão WhatsApp */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
        isConnected
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}>
        {isConnected ? (
          <Wifi className="w-4 h-4 flex-shrink-0 text-emerald-600" />
        ) : (
          <WifiOff className="w-4 h-4 flex-shrink-0 text-red-500" />
        )}
        <div className="flex-1">
          <span className="font-medium">
            {isConnected
              ? `WhatsApp conectado${instance?.phoneNumber ? ' · ' + instance.phoneNumber : ''}`
              : 'WhatsApp desconectado'}
          </span>
          {!isConnected && (
            <span className="text-xs block text-red-600 mt-0.5">
              As mensagens automáticas não serão enviadas até você conectar o WhatsApp em <strong>Configurações</strong>.
            </span>
          )}
        </div>
        {isConnected && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />}
      </div>

      {templates.length === 0 && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-cyan-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Clique em <strong>Usar texto pronto</strong> em qualquer campanha abaixo para ativá-la já com um texto sugerido — você pode editar depois.
        </div>
      )}

      {enabledWithoutTemplate.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {enabledWithoutTemplate.length} gatilho{enabledWithoutTemplate.length > 1 ? 's ativados' : ' ativado'} sem template selecionado — as mensagens não serão enviadas.
            Selecione um template abaixo.
          </span>
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

                  const hasTemplateWarning = isEnabled && !selectedTemplate

                  return (
                    <div key={trigger.event} className={`px-5 py-4 ${hasTemplateWarning ? 'bg-amber-50/40' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-800">{trigger.label}</p>
                            {hasTemplateWarning && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                                <AlertCircle className="w-3 h-3" />
                                Sem template
                              </span>
                            )}
                          </div>
                          {isEnabled && cfg?.template && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate">Template: {cfg.template.name}</p>
                          )}
                        </div>
                        {!selectedTemplate && findCampaignPreset(mod.key, trigger.event) && (
                          <button
                            onClick={() => activatePresetMutation.mutate({ module: mod.key, triggerEvent: trigger.event })}
                            disabled={activatePresetMutation.isPending}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-cyan-200 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-50 transition-colors flex-shrink-0 whitespace-nowrap"
                          >
                            Usar texto pronto
                          </button>
                        )}
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

function RespostasPanel({ chatbotId }: { chatbotId?: string } = {}) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<LightQuickReply | null>(null)
  const [form, setForm]           = useState({ keyword: '', response: '', templateId: '', active: true })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const { data: replies = [], isLoading } = useQuery<LightQuickReply[]>({
    queryKey: ['light-quick-replies', chatbotId ?? 'all'],
    queryFn:  () => api.get('/chatbot-light/quick-replies', { params: chatbotId ? { chatbotId } : {} }).then(r => r.data),
  })

  const { data: templates = [] } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const openNew = () => {
    setEditing(null)
    setForm({ keyword: '', response: '', templateId: '', active: true })
    setFormErrors({})
    setModalOpen(true)
  }

  const openEdit = (r: LightQuickReply) => {
    setEditing(r)
    setForm({ keyword: r.keyword, response: r.response, templateId: r.templateId ?? '', active: r.active })
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
        : api.post('/chatbot-light/quick-replies', { ...data, chatbotId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-quick-replies', chatbotId] })
      setModalOpen(false)
      toast.success(editing ? 'Resposta atualizada' : 'Resposta criada')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/quick-replies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-quick-replies', chatbotId] }); toast.success('Resposta removida') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/chatbot-light/quick-replies/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-quick-replies', chatbotId] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const handleSave = () => {
    if (!validate()) return
    saveMutation.mutate({ ...form, templateId: form.templateId || null })
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
          Para menus com múltiplas opções, use a seção <strong>Chatbots</strong>.
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

          {templates.length > 0 && (
            <div>
              <label className="label">Usar template existente (opcional)</label>
              <select
                value={form.templateId}
                onChange={e => {
                  const templateId = e.target.value
                  const template = templates.find(t => t.id === templateId)
                  setForm(p => ({ ...p, templateId, response: template ? template.content : p.response }))
                }}
                className="input-field text-sm"
              >
                <option value="">— Texto livre abaixo —</option>
                {templates.filter(t => t.active).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Selecionar um template preenche o texto abaixo — você ainda pode editá-lo.</p>
            </div>
          )}

          <div>
            <label className="label">Resposta *</label>
            <textarea
              value={form.response}
              onChange={e => setForm(p => ({ ...p, response: e.target.value, templateId: '' }))}
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

// ─── Notificações panel ───────────────────────────────────────────────────────

const NOTIF_VARIABLE_CHIPS = [
  { key: '{nome}',             label: 'Nome' },
  { key: '{data}',             label: 'Data' },
  { key: '{hora}',             label: 'Hora' },
  { key: '{medico}',           label: 'Médico' },
  { key: '{clinica}',          label: 'Clínica' },
  { key: '{tipo_atendimento}', label: 'Tipo' },
  { key: '{status}',           label: 'Status' },
  { key: '{valor}',            label: 'Valor' },
  { key: '{endereco}',         label: 'Endereço' },
]

function NotificacoesPanel() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<LightNotificationTemplate | null>(null)
  const msgRef = useRef<HTMLTextAreaElement>(null)

  const { data: templates = [], isLoading } = useQuery<LightNotificationTemplate[]>({
    queryKey: ['light-notif-templates'],
    queryFn:  () => api.get('/chatbot-light/notification-templates').then(r => r.data),
  })

  const { register, handleSubmit, reset, setValue, watch } = useForm<{ name: string; message: string; active: boolean }>({
    defaultValues: { name: '', message: '', active: true },
  })
  const messageValue = watch('message', '')

  const openNew = () => {
    setEditing(null)
    reset({ name: '', message: '', active: true })
    setModalOpen(true)
  }

  const openEdit = (t: LightNotificationTemplate) => {
    setEditing(t)
    reset({ name: t.name, message: t.message, active: t.active })
    setModalOpen(true)
  }

  const insertVariable = (v: string) => {
    const el = msgRef.current
    if (!el) { setValue('message', messageValue + v); return }
    const start = el.selectionStart ?? messageValue.length
    const end   = el.selectionEnd   ?? messageValue.length
    const next  = messageValue.slice(0, start) + v + messageValue.slice(end)
    setValue('message', next)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length) }, 0)
  }

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; message: string; active: boolean }) =>
      editing
        ? api.put(`/chatbot-light/notification-templates/${editing.id}`, data).then(r => r.data)
        : api.post('/chatbot-light/notification-templates', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-notif-templates'] })
      setModalOpen(false)
      toast.success(editing ? 'Notificação atualizada' : 'Notificação criada')
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/notification-templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-notif-templates'] }); toast.success('Notificação removida') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put(`/chatbot-light/notification-templates/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-notif-templates'] }),
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Notificações</h2>
          <p className="text-sm text-slate-500 mt-0.5">Templates de mensagem enviados ao agendar uma consulta</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Nova notificação
        </button>
      </div>

      <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 text-sm text-cyan-800">
        <p className="font-medium mb-1 flex items-center gap-1.5"><Bell className="w-4 h-4" /> Como funciona</p>
        <p>Crie templates com variáveis dinâmicas (ex: <code className="bg-cyan-100 px-1 rounded">{'{nome}'}</code>, <code className="bg-cyan-100 px-1 rounded">{'{data}'}</code>). Na agenda, ao abrir um agendamento, clique em <strong>Notificar Paciente</strong> e escolha qual enviar via WhatsApp.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nenhuma notificação criada ainda</p>
          <p className="text-slate-400 text-xs mb-5">Crie templates para enviar ao paciente ao agendar uma consulta.</p>
          <button onClick={openNew} className="btn-primary text-sm mx-auto">
            <Plus className="w-4 h-4" /> Criar primeira notificação
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-900 text-sm truncate">{t.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 whitespace-pre-wrap line-clamp-2">{t.message}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate({ id: t.id, active: !t.active })}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title={t.active ? 'Desativar' : 'Ativar'}
                  >
                    {t.active ? <ToggleRight className="w-4 h-4 text-cyan-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm('Remover esta notificação?')) deleteMutation.mutate(t.id) }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Notificação' : 'Nova Notificação'} size="md">
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Nome da notificação *</label>
            <input {...register('name', { required: true })} className="input-field" placeholder="Ex: Confirmação de agendamento" />
          </div>
          <div>
            <label className="label">Variáveis disponíveis</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {NOTIF_VARIABLE_CHIPS.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="text-[11px] px-2 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-700 hover:bg-cyan-100 font-mono transition-colors"
                >
                  {v.key}
                </button>
              ))}
            </div>
            <label className="label">Mensagem *</label>
            <textarea
              {...register('message', { required: true })}
              ref={(el) => {
                (register('message').ref as (el: HTMLTextAreaElement | null) => void)(el)
                ;(msgRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
              }}
              rows={6}
              className="input-field resize-none font-mono text-sm"
              placeholder={`Olá {nome}! Sua consulta foi agendada para {data} às {hora} com {medico}. Local: {clinica}. Qualquer dúvida estamos à disposição!`}
            />
            {messageValue && (
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wide">Pré-visualização</p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">
                  {messageValue
                    .replace('{nome}', 'João Silva')
                    .replace('{data}', '15/07/2026')
                    .replace('{hora}', '14:30')
                    .replace('{medico}', 'Dr. Carlos')
                    .replace('{clinica}', 'Clínica Saúde')
                    .replace('{tipo_atendimento}', 'Consulta')
                    .replace('{status}', 'Agendado')
                    .replace('{valor}', 'R$ 180,00')
                    .replace('{endereco}', 'Rua das Flores, 123')
                  }
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" {...register('active')} id="notif-active" className="w-4 h-4 accent-cyan-600" />
            <label htmlFor="notif-active" className="text-sm text-slate-700">Ativo</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ─── Histórico panel ──────────────────────────────────────────────────────────

type HistoryStatus = 'Enviado' | 'Pendente' | 'Falhou' | 'Rejeitado' | 'Transferido' | 'Concluído' | 'Cancelado' | 'Expirado'
type HistoryEventType = 'Mensagem automática' | 'Resposta rápida' | 'Fluxo de conversa' | 'Ação do sistema' | 'Pré-agendamento' | 'Teste de envio' | 'Transferência para atendente'

interface HistoryEvent {
  id: string
  source: 'message' | 'system_action' | 'session' | 'lead'
  createdAt: string
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

const HISTORY_STATUSES: HistoryStatus[] = ['Enviado', 'Pendente', 'Falhou', 'Rejeitado', 'Transferido', 'Concluído', 'Cancelado', 'Expirado']
const HISTORY_EVENT_TYPES: HistoryEventType[] = ['Mensagem automática', 'Resposta rápida', 'Fluxo de conversa', 'Ação do sistema', 'Pré-agendamento', 'Teste de envio', 'Transferência para atendente']

const HISTORY_STATUS_COLOR: Record<HistoryStatus, string> = {
  Enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pendente: 'bg-amber-50 text-amber-700 border-amber-200',
  Falhou: 'bg-red-50 text-red-700 border-red-200',
  Rejeitado: 'bg-orange-50 text-orange-700 border-orange-200',
  Transferido: 'bg-purple-50 text-purple-700 border-purple-200',
  'Concluído': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
  Expirado: 'bg-slate-100 text-slate-500 border-slate-200',
}

function HistoryStatusPill({ status }: { status: HistoryStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${HISTORY_STATUS_COLOR[status]}`}>
      {status}
    </span>
  )
}

function HistoricoPanel() {
  const [preset, setPreset] = useState<PeriodPreset>('30d')
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [statusFilter, setStatusFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [chatbotFilter, setChatbotFilter] = useState('')
  const [search, setSearch] = useState('')
  const [detailEvent, setDetailEvent] = useState<HistoryEvent | null>(null)

  const { start, end } = resolvePeriodRange(preset, customStart, customEnd)

  const { data: chatbots = [] } = useQuery<ChatbotSummary[]>({
    queryKey: ['light-chatbots'],
    queryFn: () => api.get('/chatbot-light/chatbots').then(r => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery<{ events: HistoryEvent[]; total: number }>({
    queryKey: ['light-history-unified', start.toISOString(), end.toISOString(), statusFilter, moduleFilter, eventTypeFilter, chatbotFilter, search],
    queryFn: () => api.get('/chatbot-light/history/unified', {
      params: {
        startDate: start.toISOString(), endDate: end.toISOString(),
        status: statusFilter || undefined, module: moduleFilter || undefined,
        eventType: eventTypeFilter || undefined, chatbotId: chatbotFilter || undefined,
        search: search || undefined,
      },
    }).then(r => r.data),
    staleTime: 20_000,
  })

  const resendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot-light/history/${id}/resend`),
    onSuccess: (r) => {
      if (r.data?.success) toast.success('Mensagem reenviada')
      else toast.error('Falha ao reenviar')
    },
    onError: () => toast.error('Erro ao reenviar mensagem'),
  })

  const events = data?.events ?? []
  const total = data?.total ?? 0
  const sentCount = events.filter(e => e.status === 'Enviado' || e.status === 'Concluído').length
  const failedCount = events.filter(e => e.status === 'Falhou' || e.status === 'Rejeitado').length
  const transferredCount = events.filter(e => e.status === 'Transferido').length

  const copyError = (msg: string) => {
    navigator.clipboard.writeText(msg).then(() => toast.success('Erro copiado')).catch(() => toast.error('Não foi possível copiar'))
  }

  const clearFilters = () => {
    setStatusFilter(''); setModuleFilter(''); setEventTypeFilter(''); setChatbotFilter(''); setSearch('')
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Histórico</h2>
        <p className="text-sm text-slate-500 mt-0.5">O que o chatbot fez, quando fez, para quem e qual foi o resultado</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Período</label>
          <div className="flex gap-1">
            {PERIOD_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${preset === p.key ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field text-sm py-1.5" />
            <span className="text-slate-400 text-sm">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field text-sm py-1.5" />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-sm py-1.5 w-36">
            <option value="">Todos</option>
            {HISTORY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Tipo de evento</label>
          <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)} className="input-field text-sm py-1.5 w-48">
            <option value="">Todos</option>
            {HISTORY_EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Módulo</label>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="input-field text-sm py-1.5 w-44">
            <option value="">Todos</option>
            {Object.entries(MODULE_DISPLAY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Chatbot</label>
          <select value={chatbotFilter} onChange={e => setChatbotFilter(e.target.value)} className="input-field text-sm py-1.5 w-40">
            <option value="">Todos</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Telefone/Paciente</label>
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field text-sm py-1.5" placeholder="Buscar..." />
        </div>
        <button onClick={clearFilters} className="text-xs text-cyan-600 hover:underline pb-2">Limpar filtros</button>
      </div>

      {/* Cards rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Registros encontrados', value: total, icon: History, color: 'text-slate-600', bg: 'bg-slate-100' },
          { label: 'Enviados/Concluídos', value: sentCount, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Falhas', value: failedCount, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Transferências', value: transferredCount, icon: PhoneCall, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Lista de eventos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhum registro encontrado no período/filtro selecionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Data/Hora', 'Paciente/Contato', 'Tipo', 'Status', 'Resultado', 'Ações'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map(ev => {
                  const digits = ev.phone?.replace(/\D/g, '')
                  const canResend = ev.source === 'message' && ev.status === 'Falhou'
                  return (
                    <tr key={`${ev.source}-${ev.id}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {format(new Date(ev.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs">{ev.contactName ?? '—'}</p>
                        <p className="text-slate-400 text-xs">{ev.phone ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs font-semibold text-slate-600">{ev.eventType}</span></td>
                      <td className="px-4 py-3"><HistoryStatusPill status={ev.status} /></td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-slate-600 truncate">{ev.errorMessage ?? ev.content ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setDetailEvent(ev)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                            Ver detalhes
                          </button>
                          {digits && (
                            <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors">
                              Abrir conversa
                            </a>
                          )}
                          {canResend && (
                            <button
                              onClick={() => resendMutation.mutate(ev.id)}
                              disabled={resendMutation.isPending}
                              className="text-xs px-2 py-1 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                            >
                              Reenviar
                            </button>
                          )}
                          {ev.errorMessage && (
                            <button onClick={() => copyError(ev.errorMessage!)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                              Copiar erro
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!detailEvent} onClose={() => setDetailEvent(null)} title="Detalhes do histórico" size="md">
        {detailEvent && (
          <div className="space-y-2 text-sm">
            {[
              ['Paciente/Contato', detailEvent.contactName ?? '—'],
              ['Telefone', detailEvent.phone ?? '—'],
              ['Chatbot', detailEvent.chatbotName ?? '—'],
              ['Tipo de evento', detailEvent.eventType],
              ['Status', detailEvent.status],
              ['Data', format(new Date(detailEvent.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })],
              ['Mensagem/Conteúdo', detailEvent.content ?? '—'],
              ['Erro', detailEvent.errorMessage ?? '—'],
              ['ID da sessão', detailEvent.sessionId ?? '—'],
              ['ID da conversa', detailEvent.conversationId ?? '—'],
              ['Fluxo (ID)', detailEvent.flowId ?? '—'],
              ['Ação do sistema', detailEvent.actionKey ?? '—'],
              ['Template (ID)', detailEvent.templateId ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-shrink-0">{label}</span>
                <span className="text-xs text-slate-700 text-right break-all">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}


// ─── System Actions Panel ────────────────────────────────────────────────────

export interface CatalogItem {
  key: string
  label: string
  implemented: boolean
  description?: string
}

export interface SystemActionConfig {
  id: string
  instanceId: string
  actionKey: string
  name: string
  description: string | null
  active: boolean
  schemaVersion: number
  config: any
  createdAt: string
  updatedAt: string
}

interface SimBubble {
  id: string
  sender: 'bot' | 'user'
  text: string
}

export function SystemActionsPanel({ chatbotId }: { chatbotId: string }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedAction, setSelectedAction] = useState<CatalogItem | null>(null)
  const [editingConfig, setEditingConfig] = useState<SystemActionConfig | null>(null)
  const [activeTab, setActiveTab] = useState(0)

  // Test state
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // Form states for SCHEDULE_APPOINTMENT
  const [configName, setConfigName] = useState('')
  const [configDesc, setConfigDesc] = useState('')
  const [configActive, setConfigActive] = useState(true)

  // Config parameters
  const [planSource, setPlanSource] = useState('DOCTOR_SERVICES')
  const [customItems, setCustomItems] = useState<Array<{ id: string; label: string; displayValue?: string }>>([])
  const [batchCapture, setBatchCapture] = useState(false)
  const [customFields, setCustomFields] = useState<Array<{ key: string; label: string; question?: string; required?: boolean }>>([])
  const [doctorSelect, setDoctorSelect] = useState('INSTANCE_OWNER')
  const [limitSlots, setLimitSlots] = useState(3)
  const [searchWindowDays, setSearchWindowDays] = useState(15)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [requireCpf, setRequireCpf] = useState(false)
  const [cpfOption, setCpfOption] = useState('DONT_ASK')
  const [requireConvenio, setRequireConvenio] = useState(false)
  const [useWhatsappPhone, setUseWhatsappPhone] = useState(true)
  const [appointmentInitialStatus, setAppointmentInitialStatus] = useState('SCHEDULED')

  // Config messages
  const [msgAskPlan, setMsgAskPlan] = useState('Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)')
  const [msgAskName, setMsgAskName] = useState('Para prosseguir, qual o seu nome completo?')
  const [msgAskPhoneConfirm, setMsgAskPhoneConfirm] = useState('Posso usar este número de WhatsApp como telefone de contato?\n\n1 - Sim\n2 - Informar outro número')
  const [msgAskPhoneText, setMsgAskPhoneText] = useState('Por favor, informe seu telefone com DDD:')
  const [msgAskCpf, setMsgAskCpf] = useState('Por favor, digite seu CPF (apenas números):')
  const [msgAskDate, setMsgAskDate] = useState('Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)')
  const [msgSuccess, setMsgSuccess] = useState('Agendamento confirmado com sucesso!\n\nConsulta: {planoNome}\nData: {data}')
  const [msgNoSlots, setMsgNoSlots] = useState('Infelizmente não encontrei horários livres para este período. O que deseja fazer?\n\n1 - Escolher outra data\n2 - Falar com atendente')
  const [msgSummary, setMsgSummary] = useState('Confira os dados do seu agendamento:')
  const [msgSummaryBody, setMsgSummaryBody] = useState('👤 Nome: {nome}\n📞 Telefone: {telefone}\n💳 CPF: {cpf}\n💼 Plano/Serviço: {planoNome}\n🩺 Médico: {medico}\n📅 Data/Horário: {data}')
  const [msgAskConfirm, setMsgAskConfirm] = useState('Posso confirmar seu agendamento?')
  const [msgOptionConfirm, setMsgOptionConfirm] = useState('Sim, confirmar agendamento')
  const [msgOptionChange, setMsgOptionChange] = useState('Escolher outro horário')
  const [msgOptionCancel, setMsgOptionCancel] = useState('Cancelar')
  const [msgCancel, setMsgCancel] = useState('Tudo bem, o agendamento não foi confirmado.')

  // CONFIRM_APPOINTMENT fields
  const [confirmationMessage, setConfirmationMessage] = useState(
    'Olá {nome}! Sua consulta com {medico} está marcada para {data} às {hora}.\n\nPara confirmar, responda *SIM*.\nPara reagendar, responda *NÃO*.'
  )
  const [declineMessage, setDeclineMessage] = useState(
    'Entendemos, {nome}! Nossa equipe entrará em contato para encontrar um horário melhor para você. Até logo!'
  )

  // Fallbacks
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [fallbackMessage, setFallbackMessage] = useState('Não consegui entender. Vou transferir para um atendente.')

  // Simulator states
  const [simIsLid, setSimIsLid] = useState(false)
  const [simStep, setSimStep] = useState('START')
  const [simMessages, setSimMessages] = useState<SimBubble[]>([])
  const [simCollected, setSimCollected] = useState<Record<string, string>>({
    nome: '', telefone: '', cpf: '', planoNome: '', medico: 'Dr. Kelven Pereira', data: ''
  })
  const [simInput, setSimInput] = useState('')

  // Queries
  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: ['light-system-actions-catalog'],
    queryFn: () => api.get('/chatbot-light/system-actions/catalog').then(r => r.data),
  })

  const { data: configs = [], isLoading } = useQuery<SystemActionConfig[]>({
    queryKey: ['light-system-actions-configs', chatbotId],
    queryFn: () => api.get('/chatbot-light/system-actions', { params: { chatbotId } }).then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editingConfig
        ? api.put(`/chatbot-light/system-actions/${editingConfig.id}`, data).then(r => r.data)
        : api.post('/chatbot-light/system-actions', { ...data, chatbotId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-system-actions-configs', chatbotId] })
      setModalOpen(false)
      toast.success(editingConfig ? 'Configuração atualizada!' : 'Configuração criada com sucesso!')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao salvar configuração.'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot-light/system-actions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-system-actions-configs', chatbotId] })
      toast.success('Configuração excluída.')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao excluir.'
      toast.error(msg)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/chatbot-light/system-actions/${id}/active`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['light-system-actions-configs', chatbotId] }),
    onError: () => toast.error('Erro ao alternar status'),
  })

  const openNew = (action: CatalogItem) => {
    setSelectedAction(action)
    setEditingConfig(null)
    setActiveTab(0)
    setTestResult(null)

    // Reset fields to defaults
    setConfigName(`Configuração ${action.label}`)
    setConfigDesc('')
    setConfigActive(true)
    setPlanSource('DOCTOR_SERVICES')
    setCustomItems([])
    setBatchCapture(false)
    setCustomFields([])
    setDoctorSelect('INSTANCE_OWNER')
    setLimitSlots(3)
    setSearchWindowDays(15)
    setDurationMinutes(30)
    setRequireCpf(false)
    setCpfOption('DONT_ASK')
    setRequireConvenio(false)
    setUseWhatsappPhone(true)
    setAppointmentInitialStatus('SCHEDULED')
    setMsgAskPlan('Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)')
    setMsgAskName('Para prosseguir, qual o seu nome completo?')
    setMsgAskPhoneConfirm('Posso usar este número de WhatsApp como telefone de contato?\n\n1 - Sim\n2 - Informar outro número')
    setMsgAskPhoneText('Por favor, informe seu telefone com DDD:')
    setMsgAskCpf('Por favor, digite seu CPF (apenas números):')
    setMsgAskDate('Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)')
    setMsgSuccess('Agendamento confirmado com sucesso!\n\nConsulta: {planoNome}\nData: {data}')
    setMsgNoSlots('Infelizmente não encontrei horários livres para este período. O que deseja fazer?\n\n1 - Escolher outra data\n2 - Falar com atendente')
    setMsgSummary('Confira os dados do seu agendamento:')
    setMsgSummaryBody('👤 Nome: {nome}\n📞 Telefone: {telefone}\n💳 CPF: {cpf}\n💼 Plano/Serviço: {planoNome}\n🩺 Médico: {medico}\n📅 Data/Horário: {data}')
    setMsgAskConfirm('Posso confirmar seu agendamento?')
    setMsgOptionConfirm('Sim, confirmar agendamento')
    setMsgOptionChange('Escolher outro horário')
    setMsgOptionCancel('Cancelar')
    setMsgCancel('Tudo bem, o agendamento não foi confirmado.')
    setMaxAttempts(3)
    setFallbackMessage('Não consegui entender. Vou transferir para um atendente.')
    setConfirmationMessage('Olá {nome}! Sua consulta com {medico} está marcada para {data} às {hora}.\n\nPara confirmar, responda *SIM*.\nPara reagendar, responda *NÃO*.')
    setDeclineMessage('Entendemos, {nome}! Nossa equipe entrará em contato para encontrar um horário melhor para você. Até logo!')
    setSimStep('START')
    setSimMessages([])

    setModalOpen(true)
  }

  const openEdit = (cfg: SystemActionConfig) => {
    const action = catalog.find(a => a.key === cfg.actionKey) || { key: cfg.actionKey, label: 'Ação do Sistema', implemented: true }
    setSelectedAction(action)
    setEditingConfig(cfg)
    setActiveTab(0)
    setTestResult(null)

    setConfigName(cfg.name)
    setConfigDesc(cfg.description || '')
    setConfigActive(cfg.active)

    const c = cfg.config || {}
    setPlanSource(c.planSource || 'DOCTOR_SERVICES')
    setCustomItems(Array.isArray(c.customItems) ? c.customItems : [])
    setBatchCapture(c.batchCapture === true)
    setCustomFields(Array.isArray(c.customFields) ? c.customFields : [])
    setDoctorSelect(c.doctorSelect || 'INSTANCE_OWNER')
    setLimitSlots(parseInt(c.limitSlots) || 3)
    setSearchWindowDays(parseInt(c.searchWindowDays) || 15)
    setDurationMinutes(parseInt(c.durationMinutes) || 30)
    
    let valCpf = c.cpfOption
    if (!valCpf) {
      valCpf = (c.requireCpf === true || c.requireCpf === 'true') ? 'ASK_REQUIRED' : 'DONT_ASK'
    }
    setCpfOption(valCpf)
    setRequireCpf(valCpf === 'ASK_REQUIRED')

    setRequireConvenio(c.requireConvenio === true || c.requireConvenio === 'true')
    setUseWhatsappPhone(c.useWhatsappPhone === true || c.useWhatsappPhone === 'true')
    setAppointmentInitialStatus(c.appointmentInitialStatus || 'SCHEDULED')

    const msgs = c.messages || {}
    setMsgAskPlan(msgs.askPlan || 'Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)')
    setMsgAskName(msgs.askName || 'Para prosseguir, qual o seu nome completo?')
    setMsgAskPhoneConfirm(msgs.askPhoneConfirm || 'Posso usar este número de WhatsApp como telefone de contato?\n\n1 - Sim\n2 - Informar outro número')
    setMsgAskPhoneText(msgs.askPhoneText || 'Por favor, informe seu telefone com DDD:')
    setMsgAskCpf(msgs.askCpf || 'Por favor, digite seu CPF (apenas números):')
    setMsgAskDate(msgs.askDate || 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)')
    setMsgSuccess(msgs.success || 'Agendamento confirmado com sucesso!\n\nConsulta: {planoNome}\nData: {data}')
    setMsgNoSlots(msgs.noSlots || 'Infelizmente não encontrei horários livres para este período. O que deseja fazer?\n\n1 - Escolher outra data\n2 - Falar com atendente')
    setMsgSummary(msgs.summary || 'Confira os dados do seu agendamento:')
    setMsgSummaryBody(msgs.summaryBody || '👤 Nome: {nome}\n📞 Telefone: {telefone}\n💳 CPF: {cpf}\n💼 Plano/Serviço: {planoNome}\n🩺 Médico: {medico}\n📅 Data/Horário: {data}')
    setMsgAskConfirm(msgs.askConfirm || 'Posso confirmar seu agendamento?')
    setMsgOptionConfirm(msgs.optionConfirm || 'Sim, confirmar agendamento')
    setMsgOptionChange(msgs.optionChange || 'Escolher outro horário')
    setMsgOptionCancel(msgs.optionCancel || 'Cancelar')
    setMsgCancel(msgs.cancel || 'Tudo bem, o agendamento não foi confirmado.')

    const fback = c.fallback || {}
    setMaxAttempts(parseInt(fback.maxAttempts) || 3)
    setFallbackMessage(fback.fallbackMessage || 'Não consegui entender. Vou transferir para um atendente.')
    setConfirmationMessage(c.confirmationMessage || 'Olá {nome}! Sua consulta com {medico} está marcada para {data} às {hora}.\n\nPara confirmar, responda *SIM*.\nPara reagendar, responda *NÃO*.')
    setDeclineMessage(c.declineMessage || 'Entendemos, {nome}! Nossa equipe entrará em contato para encontrar um horário melhor para você. Até logo!')
    setSimStep('START')
    setSimMessages([])

    setModalOpen(true)
  }

  const handleSave = () => {
    if (!configName.trim()) {
      toast.error('Nome da configuração é obrigatório.')
      return
    }

    const isConfirmAction = selectedAction?.key === 'CONFIRM_APPOINTMENT'

    const payload = {
      actionKey: selectedAction?.key,
      name: configName,
      description: configDesc,
      active: configActive,
      config: isConfirmAction ? {
        confirmationMessage,
        declineMessage,
      } : {
        planSource,
        customItems: planSource === 'CUSTOM' ? customItems : undefined,
        batchCapture,
        customFields: customFields.length > 0 ? customFields : undefined,
        doctorSelect,
        limitSlots,
        searchWindowDays,
        durationMinutes,
        cpfOption,
        requireCpf: cpfOption === 'ASK_REQUIRED',
        requireConvenio,
        useWhatsappPhone,
        appointmentInitialStatus,
        messages: {
          askPlan: msgAskPlan,
          askName: msgAskName,
          askPhoneConfirm: msgAskPhoneConfirm,
          askPhoneText: msgAskPhoneText,
          askCpf: msgAskCpf,
          askDate: msgAskDate,
          success: msgSuccess,
          noSlots: msgNoSlots,
          summary: msgSummary,
          summaryBody: msgSummaryBody,
          askConfirm: msgAskConfirm,
          optionConfirm: msgOptionConfirm,
          optionChange: msgOptionChange,
          optionCancel: msgOptionCancel,
          cancel: msgCancel
        },
        fallback: {
          maxAttempts,
          fallbackMessage
        }
      }
    }

    saveMutation.mutate(payload)
  }

  const runValidation = async () => {
    if (!editingConfig) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/chatbot-light/system-actions/${editingConfig.id}/test`).then(r => r.data)
      setTestResult({ success: true, message: res.message || 'Configuração validada e pronta para produção!' })
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Falha ao validar configuração no servidor.'
      setTestResult({ success: false, message: msg })
    } finally {
      setTesting(false)
    }
  }

  const isConfirmAction = selectedAction?.key === 'CONFIRM_APPOINTMENT'

  const tabs = isConfirmAction
    ? [{ label: '1. Geral' }, { label: '2. Templates' }]
    : [
        { label: '1. Geral' },
        { label: '2. Paciente' },
        { label: '3. Serviços' },
        { label: '4. Agenda' },
        { label: '5. Captura' },
        { label: '6. Confirmação' },
        { label: '7. Fallbacks' },
        { label: '8. Ordem' },
        { label: '9. Simulador' },
      ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 font-sans">Ações do Sistema</h2>
        <p className="text-sm text-slate-500 mt-0.5">Configure ações complexas que o robô pode realizar automaticamente no sistema</p>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalog.map(action => {
          const isImplemented = action.implemented
          const actionConfigs = configs.filter(c => c.actionKey === action.key)

          return (
            <div key={action.key} className={`bg-white rounded-2xl border p-5 shadow-sm flex flex-col justify-between transition-all duration-200 ${isImplemented ? 'border-slate-200 hover:border-cyan-300' : 'border-slate-100 opacity-60'}`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${isImplemented ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-slate-100 text-slate-400'}`}>
                    {isImplemented ? 'Disponível' : 'Em breve'}
                  </span>
                  {isImplemented && (
                    <span className="text-xs text-slate-400 font-medium">
                      {actionConfigs.length} config{actionConfigs.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1 font-sans">{action.label}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-4">{action.description || 'Executa operações automáticas no banco de dados da clínica.'}</p>
              </div>

              <div className="pt-2 border-t border-slate-100 mt-auto flex items-center justify-between">
                {isImplemented ? (
                  <button
                    onClick={() => openNew(action)}
                    className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Configurar Ação
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 italic font-medium">Indisponível</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Configured Actions List */}
      <div className="space-y-4">
        <div className="border-b border-slate-200 pb-2">
          <h3 className="font-bold text-slate-800 text-sm font-sans">Configurações Ativas</h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
        ) : configs.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
            Nenhuma configuração de ação criada. Crie uma nova configuração acima para vincular aos seus menus de fluxo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {configs.map(cfg => (
              <div key={cfg.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm font-sans">{cfg.name}</h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{cfg.actionKey === 'SCHEDULE_APPOINTMENT' ? 'Agendar consulta' : cfg.actionKey === 'CONFIRM_APPOINTMENT' ? 'Confirmar consulta' : cfg.actionKey}</p>
                    {cfg.description && <p className="text-xs text-slate-500 mt-1.5">{cfg.description}</p>}
                  </div>
                  <Toggle
                    enabled={cfg.active}
                    onToggle={() => toggleMutation.mutate({ id: cfg.id, active: !cfg.active })}
                    disabled={toggleMutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
                  <span className="text-[10px] text-slate-400">
                    Criado em {format(new Date(cfg.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEdit(cfg)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Deseja excluir esta configuração? Esta ação não pode ser desfeita.')) {
                          deleteMutation.mutate(cfg.id)
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingConfig ? `Editar Configuração: ${editingConfig.name}` : `Nova Configuração: ${selectedAction?.label}`}
        size="lg"
      >
        <div className="flex flex-col h-[70vh]">
          {/* Tab buttons */}
          <div className="flex overflow-x-auto border-b border-slate-200 pb-2 mb-4 gap-1 scrollbar-none flex-shrink-0">
            {tabs.map((tab, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveTab(idx)
                  setTestResult(null)
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeTab === idx ? 'bg-cyan-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form scrollable viewport */}
          <div className="flex-grow overflow-y-auto pr-1 space-y-4 text-slate-700 pb-4">
            {/* Tab 1: Geral */}
            {activeTab === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="label">Nome da configuração *</label>
                  <input
                    value={configName}
                    onChange={e => setConfigName(e.target.value)}
                    className="input-field"
                    placeholder="Ex: Agendamento Nutrição"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Identificação interna para você vincular nos menus de fluxo.</p>
                </div>
                <div>
                  <label className="label">Descrição (opcional)</label>
                  <textarea
                    value={configDesc}
                    onChange={e => setConfigDesc(e.target.value)}
                    className="input-field resize-none"
                    rows={3}
                    placeholder="Ex: Utilizado para o fluxo de novos pacientes de nutrição"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="label mb-0">Configuração Ativa</label>
                  <Toggle enabled={configActive} onToggle={() => setConfigActive(!configActive)} />
                </div>
                {isConfirmAction && (
                  <div className="flex items-start gap-2 p-3 bg-cyan-50 border border-cyan-200 rounded-xl">
                    <span className="text-cyan-500 text-base leading-none mt-0.5">ℹ️</span>
                    <p className="text-xs text-cyan-800">
                      Quando a secretária agendar uma consulta, o WhatsApp enviará automaticamente o template de confirmação ao paciente.
                      O paciente responde <strong>SIM</strong> para confirmar ou <strong>NÃO</strong> para reagendar.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Templates (CONFIRM_APPOINTMENT only) */}
            {isConfirmAction && activeTab === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="label">Mensagem de confirmação</label>
                  <p className="text-[11px] text-slate-400 -mt-1">
                    Enviada ao paciente quando a secretária cria o agendamento. Peça que responda SIM ou NÃO.
                  </p>
                  <textarea
                    value={confirmationMessage}
                    onChange={e => setConfirmationMessage(e.target.value)}
                    rows={6}
                    className="input-field font-mono text-xs resize-none"
                    placeholder="Olá {nome}! Sua consulta..."
                  />
                  <p className="text-[10px] text-slate-400">
                    Variáveis disponíveis: <code className="bg-slate-100 px-1 rounded">{'{nome}'}</code> <code className="bg-slate-100 px-1 rounded">{'{medico}'}</code> <code className="bg-slate-100 px-1 rounded">{'{data}'}</code> <code className="bg-slate-100 px-1 rounded">{'{hora}'}</code> <code className="bg-slate-100 px-1 rounded">{'{endereco}'}</code>
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="label">Mensagem quando paciente responde NÃO</label>
                  <p className="text-[11px] text-slate-400 -mt-1">
                    Enviada automaticamente caso o paciente recuse. A secretária recebe uma notificação para reagendar.
                  </p>
                  <textarea
                    value={declineMessage}
                    onChange={e => setDeclineMessage(e.target.value)}
                    rows={4}
                    className="input-field font-mono text-xs resize-none"
                    placeholder="Entendemos, {nome}! Nossa equipe entrará em contato..."
                  />
                  <p className="text-[10px] text-slate-400">
                    Variáveis disponíveis: <code className="bg-slate-100 px-1 rounded">{'{nome}'}</code> <code className="bg-slate-100 px-1 rounded">{'{medico}'}</code> <code className="bg-slate-100 px-1 rounded">{'{data}'}</code> <code className="bg-slate-100 px-1 rounded">{'{hora}'}</code>
                  </p>
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                  <p className="text-xs text-amber-800">
                    O paciente tem até <strong>24 horas</strong> para responder. Respostas válidas para SIM: "sim", "s", "1", "confirmar", "ok".
                    Para NÃO: "não", "nao", "n", "2", "cancelar".
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Paciente (SCHEDULE_APPOINTMENT only) */}
            {!isConfirmAction && activeTab === 1 && (
              <div className="space-y-4">
                {/* CPF Radio Group */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">CPF do Paciente</p>
                  {[
                    { value: 'DONT_ASK', label: 'Não solicitar', desc: 'O robô não pedirá CPF. Recomendado para consultas simples.' },
                    { value: 'ASK_OPTIONAL', label: 'Opcional (pode pular)', desc: 'O robô pede o CPF mas o paciente pode digitar 0, "pular" ou "ignorar" para avançar.' },
                    { value: 'ASK_REQUIRED', label: 'Obrigatório', desc: 'O robô exige o CPF. O paciente não avança sem informar.' },
                  ].map(opt => (
                    <label key={opt.value} className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-colors ${
                      cpfOption === opt.value ? 'bg-cyan-50 border-cyan-300' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}>
                      <input
                        type="radio"
                        name="cpfOption"
                        value={opt.value}
                        checked={cpfOption === opt.value}
                        onChange={() => { setCpfOption(opt.value); setRequireCpf(opt.value === 'ASK_REQUIRED') }}
                        className="text-cyan-600 focus:ring-cyan-500 mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Convênio */}
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={requireConvenio}
                    onChange={e => setRequireConvenio(e.target.checked)}
                    className="rounded text-cyan-600 focus:ring-cyan-500 mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Solicitar Convênio</p>
                    <p className="text-xs text-slate-400">O robô listará os convênios do médico para o paciente escolher.</p>
                  </div>
                </label>

                {/* WhatsApp Phone */}
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={useWhatsappPhone}
                    onChange={e => setUseWhatsappPhone(e.target.checked)}
                    className="rounded text-cyan-600 focus:ring-cyan-500 mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Usar telefone do WhatsApp</p>
                    <p className="text-xs text-slate-400">Se ativo, perguntará se pode usar o número do WhatsApp do paciente como telefone. Se o contato for identificado por LID (sem telefone visível), o bot coletará o número manualmente.</p>
                  </div>
                </label>

                {/* LID warning */}
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                  <p className="text-xs text-amber-800">
                    <strong>Contatos LID:</strong> alguns usuários do WhatsApp aparecem com um identificador interno (ex: <code className="font-mono bg-amber-100 px-1 rounded">73444@lid</code>) em vez do telefone real. Nesses casos, o bot sempre coletará o número manualmente, independente desta configuração.
                  </p>
                </div>
              </div>
            )}

            {/* Tab 3: Serviço/Plano */}
            {!isConfirmAction && activeTab === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="label">Fonte dos planos/serviços *</label>
                  <select
                    value={planSource}
                    onChange={e => setPlanSource(e.target.value)}
                    className="input-field"
                  >
                    <option value="DOCTOR_SERVICES">Serviços/Procedimentos cadastrados (AppointmentType)</option>
                    <option value="DOCTOR_CONVENIOS">Convênios do médico (HealthPlan)</option>
                    <option value="CUSTOM">Personalizado (itens customizados)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Indica o que será oferecido para o paciente escolher como a especialidade/tipo de atendimento.
                  </p>
                </div>

                {planSource === 'CUSTOM' && (
                  <div className="space-y-3 border border-dashed border-slate-300 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Itens personalizados</p>
                      <button
                        type="button"
                        onClick={() => setCustomItems(prev => [...prev, { id: `item_${Date.now()}`, label: '', displayValue: '' }])}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >+ Adicionar item</button>
                    </div>
                    {customItems.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">Nenhum item. Clique em "Adicionar item" para começar.</p>
                    )}
                    {customItems.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                        <div>
                          <label className="label text-[10px]">Nome exibido</label>
                          <input
                            value={item.label}
                            onChange={e => setCustomItems(prev => prev.map((ci, i) => i === idx ? { ...ci, label: e.target.value } : ci))}
                            placeholder="Ex: Consulta Geral"
                            className="input-field text-xs"
                          />
                        </div>
                        <div>
                          <label className="label text-[10px]">Valor / descrição (opcional)</label>
                          <input
                            value={item.displayValue || ''}
                            onChange={e => setCustomItems(prev => prev.map((ci, i) => i === idx ? { ...ci, displayValue: e.target.value } : ci))}
                            placeholder="Ex: R$ 180,00"
                            className="input-field text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setCustomItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-xs pb-1"
                          title="Remover"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Agenda */}
            {!isConfirmAction && activeTab === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Médico Responsável *</label>
                    <select
                      value={doctorSelect}
                      onChange={e => setDoctorSelect(e.target.value)}
                      className="input-field text-sm"
                    >
                      <option value="INSTANCE_OWNER">Dono da conexão WhatsApp</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Status Inicial da Consulta *</label>
                    <select
                      value={appointmentInitialStatus}
                      onChange={e => setAppointmentInitialStatus(e.target.value)}
                      className="input-field text-sm"
                    >
                      <option value="SCHEDULED">Confirmado / Agendado</option>
                      <option value="PENDING">Pendente de Confirmação</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Número de horários a oferecer *</label>
                    <input
                      type="number"
                      min={1} max={5}
                      value={limitSlots}
                      onChange={e => setLimitSlots(parseInt(e.target.value) || 3)}
                      className="input-field text-sm"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Slots mais próximos sugeridos.</p>
                  </div>

                  <div>
                    <label className="label">Janela de busca (dias) *</label>
                    <select
                      value={searchWindowDays}
                      onChange={e => setSearchWindowDays(parseInt(e.target.value) || 15)}
                      className="input-field text-sm"
                    >
                      <option value="7">Próximos 7 dias</option>
                      <option value="15">Próximos 15 dias</option>
                      <option value="30">Próximos 30 dias</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Duração padrão da consulta *</label>
                    <select
                      value={durationMinutes}
                      onChange={e => setDurationMinutes(parseInt(e.target.value) || 30)}
                      className="input-field text-sm"
                    >
                      <option value="15">15 minutos</option>
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">60 minutos</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Captura */}
            {!isConfirmAction && activeTab === 4 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Perguntas enviadas pelo robô para coletar dados</p>

                <div className="space-y-3">
                  <div>
                    <label className="label text-[11px]">Pergunta: Escolha do plano/serviço</label>
                    <textarea
                      value={msgAskPlan}
                      onChange={e => setMsgAskPlan(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5">Use {"{opcoes}"} onde a lista numerada de planos/serviços deve ser injetada.</p>
                  </div>

                  <div>
                    <label className="label text-[11px]">Pergunta: Solicitar nome completo</label>
                    <textarea
                      value={msgAskName}
                      onChange={e => setMsgAskName(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {useWhatsappPhone && (
                    <div>
                      <label className="label text-[11px]">Pergunta: Confirmar número do WhatsApp</label>
                      <textarea
                        value={msgAskPhoneConfirm}
                        onChange={e => setMsgAskPhoneConfirm(e.target.value)}
                        rows={2}
                        className="input-field text-xs font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label text-[11px]">Pergunta: Solicitar telefone manualmente</label>
                    <textarea
                      value={msgAskPhoneText}
                      onChange={e => setMsgAskPhoneText(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                  </div>

                  {cpfOption !== 'DONT_ASK' && (
                    <div>
                      <label className="label text-[11px]">Pergunta: Solicitar CPF</label>
                      <textarea
                        value={msgAskCpf}
                        onChange={e => setMsgAskCpf(e.target.value)}
                        rows={2}
                        className="input-field text-xs font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label text-[11px]">Pergunta: Solicitar data preferida</label>
                    <textarea
                      value={msgAskDate}
                      onChange={e => setMsgAskDate(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campos adicionais de captura</p>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={batchCapture}
                      onChange={e => setBatchCapture(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-xs text-slate-700 font-medium">Agrupar captura (enviar todas as perguntas de uma vez)</span>
                  </label>
                  <p className="text-[10px] text-slate-400 -mt-1 ml-6">Quando ativado, todas as perguntas de captura são enviadas em sequência numa única mensagem.</p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600">Campos personalizados extras</span>
                      <button
                        type="button"
                        onClick={() => setCustomFields(prev => [...prev, { key: `campo_${Date.now()}`, label: '', question: '', required: false }])}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >+ Adicionar campo</button>
                    </div>
                    {customFields.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">Nenhum campo extra. Serão coletados antes da data preferida.</p>
                    )}
                    {customFields.map((field, idx) => (
                      <div key={field.key} className="border border-slate-200 rounded p-2 space-y-2">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <div>
                            <label className="label text-[10px]">Rótulo (nome do campo)</label>
                            <input
                              value={field.label}
                              onChange={e => setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || f.key } : f))}
                              placeholder="Ex: Número do convênio"
                              className="input-field text-xs"
                            />
                          </div>
                          <div>
                            <label className="label text-[10px]">Pergunta enviada ao paciente</label>
                            <input
                              value={field.question || ''}
                              onChange={e => setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, question: e.target.value } : f))}
                              placeholder="Ex: Informe seu número de carteirinha:"
                              className="input-field text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomFields(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 text-xs pb-1"
                            title="Remover"
                          >✕</button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={field.required === true}
                            onChange={e => setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, required: e.target.checked } : f))}
                            className="w-3 h-3"
                          />
                          <span className="text-[10px] text-slate-600">Campo obrigatório (não pode pular)</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Confirmação */}
            {!isConfirmAction && activeTab === 5 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resumo e confirmação antes de criar o agendamento</p>

                <div className="space-y-3">
                  <div>
                    <label className="label text-[11px]">Cabeçalho do resumo</label>
                    <textarea
                      value={msgSummary}
                      onChange={e => setMsgSummary(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5">Texto enviado antes dos dados coletados. Ex: "Confira os dados do seu agendamento:"</p>
                  </div>

                  <div>
                    <label className="label text-[11px]">Corpo do resumo (variáveis disponíveis)</label>
                    <textarea
                      value={msgSummaryBody}
                      onChange={e => setMsgSummaryBody(e.target.value)}
                      rows={5}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5">
                      Variáveis: <span className="font-mono">{'{nome}'} {'{telefone}'} {'{cpf}'} {'{planoNome}'} {'{medico}'} {'{data}'}</span><br/>
                      Variáveis ainda não coletadas serão removidas automaticamente do resumo.
                    </p>
                  </div>

                  <div>
                    <label className="label text-[11px]">Pergunta de confirmação</label>
                    <textarea
                      value={msgAskConfirm}
                      onChange={e => setMsgAskConfirm(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5">Enviada após o resumo. O paciente deve responder 1, 2 ou 3.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="label text-[11px]">Opção 1 — Confirmar agendamento</label>
                      <input value={msgOptionConfirm} onChange={e => setMsgOptionConfirm(e.target.value)} className="input-field text-xs" />
                    </div>
                    <div>
                      <label className="label text-[11px]">Opção 2 — Escolher outro horário</label>
                      <input value={msgOptionChange} onChange={e => setMsgOptionChange(e.target.value)} className="input-field text-xs" />
                    </div>
                    <div>
                      <label className="label text-[11px]">Opção 3 — Cancelar</label>
                      <input value={msgOptionCancel} onChange={e => setMsgOptionCancel(e.target.value)} className="input-field text-xs" />
                    </div>
                  </div>

                  <div>
                    <label className="label text-[11px]">Mensagem após confirmação com sucesso</label>
                    <textarea
                      value={msgSuccess}
                      onChange={e => setMsgSuccess(e.target.value)}
                      rows={3}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5 font-semibold">Variáveis: {'{nome}'} {'{planoNome}'} {'{medico}'} {'{data}'}</p>
                  </div>

                  <div>
                    <label className="label text-[11px]">Mensagem quando o paciente cancela (opção 3)</label>
                    <textarea
                      value={msgCancel}
                      onChange={e => setMsgCancel(e.target.value)}
                      rows={2}
                      className="input-field text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 7: Fallbacks */}
            {!isConfirmAction && activeTab === 6 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tratamento de indisponibilidade e respostas incorretas</p>

                <div className="space-y-3">
                  <div>
                    <label className="label text-[11px]">Mensagem: Nenhum horário disponível</label>
                    <textarea
                      value={msgNoSlots}
                      onChange={e => setMsgNoSlots(e.target.value)}
                      rows={3}
                      className="input-field text-xs font-mono"
                    />
                    <p className="text-[9px] text-slate-400 font-sans mt-0.5">Enviado quando a agenda está cheia no período.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label text-[11px]">Limite de tentativas inválidas</label>
                      <input
                        type="number"
                        min={1} max={10}
                        value={maxAttempts}
                        onChange={e => setMaxAttempts(parseInt(e.target.value) || 3)}
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="label text-[11px]">Mensagem de erro de digitação persistente</label>
                      <textarea
                        value={fallbackMessage}
                        onChange={e => setFallbackMessage(e.target.value)}
                        rows={2}
                        className="input-field text-xs font-sans"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 8: Ordem da Conversa */}
            {!isConfirmAction && activeTab === 7 && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ordem real das etapas da conversa</p>
                <p className="text-xs text-slate-400">Esta é a sequência exata que o robô seguirá quando um paciente iniciar o agendamento. As etapas condicionais aparecem em cinza quando inativas.</p>

                {(() => {
                  type Step = { icon: string; label: string; desc: string; active?: boolean; conditional?: boolean }
                  const steps: Step[] = [
                    { icon: '👋', label: 'Exibir menu principal', desc: 'Mensagem inicial configurada no fluxo', active: true },
                    { icon: '🗂️', label: 'Paciente escolhe a opção', desc: 'Ex: digitar "1" para Agendar Consulta', active: true },
                    { icon: '💼', label: 'Escolha do plano/serviço', desc: msgAskPlan.slice(0, 60) + '...', active: true },
                    { icon: '👤', label: 'Coletar nome completo', desc: msgAskName, active: true },
                    { icon: '📱', label: 'Confirmar número do WhatsApp', desc: msgAskPhoneConfirm.slice(0, 60) + '...', active: useWhatsappPhone, conditional: true },
                    { icon: '☎️', label: 'Coletar telefone manualmente', desc: msgAskPhoneText, active: true, conditional: true },
                    { icon: '🪪', label: 'Coletar CPF', desc: cpfOption === 'DONT_ASK' ? '(desativado)' : cpfOption === 'ASK_OPTIONAL' ? 'Opcional — paciente pode pular' : 'Obrigatório', active: cpfOption !== 'DONT_ASK', conditional: true },
                    { icon: '📅', label: 'Solicitar data preferida', desc: msgAskDate, active: true },
                    { icon: '🕐', label: 'Exibir horários disponíveis', desc: `Exibe até ${limitSlots} horários nos próximos ${searchWindowDays} dias`, active: true },
                    { icon: '📋', label: 'Resumo dos dados', desc: msgSummary, active: true },
                    { icon: '✅', label: 'Confirmar ou alterar', desc: `1 - ${msgOptionConfirm} / 2 - ${msgOptionChange} / 3 - ${msgOptionCancel}`, active: true },
                    { icon: '🎉', label: 'Agendamento criado', desc: msgSuccess.slice(0, 60) + '...', active: true },
                  ]
                  return (
                    <div className="relative pl-6">
                      <div className="absolute left-2.5 top-3 bottom-3 w-0.5 bg-slate-200 rounded-full" />
                      <div className="space-y-3">
                        {steps.map((step, i) => (
                          <div key={i} className={`relative flex items-start gap-3 p-3 rounded-xl border transition-all ${
                            step.active
                              ? 'bg-white border-slate-200 shadow-sm'
                              : 'bg-slate-50 border-slate-100 opacity-50'
                          }`}>
                            <div className={`absolute -left-6 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] ${
                              step.active ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-slate-200 border-slate-300 text-slate-400'
                            }`}>
                              {i + 1}
                            </div>
                            <span className="text-lg leading-none">{step.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-slate-800">{step.label}</p>
                                {step.conditional && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                    step.active ? 'bg-cyan-50 text-cyan-600' : 'bg-slate-100 text-slate-400'
                                  }`}>{step.active ? 'ativa' : 'inativa'}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{step.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Tab 9: Simulador */}
            {!isConfirmAction && activeTab === 8 && (() => {
              const interpolate = (tpl: string) => {
                const d = simCollected
                return tpl
                  .replace(/\{nome\}/g, d.nome || '')
                  .replace(/\{telefone\}/g, d.telefone || '')
                  .replace(/\{cpf\}/g, d.cpf ? `***.***.${d.cpf.slice(-5, -2)}-${d.cpf.slice(-2)}` : '')
                  .replace(/\{planoNome\}/g, d.planoNome || 'Consulta Geral')
                  .replace(/\{medico\}/g, d.medico || 'Dr. (médico)')
                  .replace(/\{data\}/g, d.data || '(data a definir)')
                  .replace(/\{[^}]+\}/g, '')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim()
              }

              const botSay = (text: string) => {
                const id = `bot-${Date.now()}-${Math.random()}`
                setSimMessages(prev => [...prev, { id, sender: 'bot', text }])
              }

              const userSay = (text: string) => {
                const id = `usr-${Date.now()}-${Math.random()}`
                setSimMessages(prev => [...prev, { id, sender: 'user', text }])
              }

              const startSim = () => {
                setSimMessages([])
                setSimCollected({ nome: '', telefone: '', cpf: '', planoNome: '', medico: 'Dr. Kelven Pereira', data: 'Sexta-feira, 10h' })
                setSimInput('')
                setSimStep('CHOOSE_PLAN')
                setTimeout(() => botSay(interpolate(msgAskPlan.replace('{opcoes}', '1 - Consulta Geral\n2 - Retorno\n3 - Exame'))), 100)
              }

              const handleSimInput = () => {
                const val = simInput.trim()
                if (!val) return
                userSay(val)
                setSimInput('')

                setTimeout(() => {
                  if (simStep === 'CHOOSE_PLAN') {
                    const plans: Record<string, string> = { '1': 'Consulta Geral', '2': 'Retorno', '3': 'Exame' }
                    const chosen = plans[val] || 'Consulta Geral'
                    setSimCollected(p => ({ ...p, planoNome: chosen }))
                    setSimStep('ASK_NAME')
                    botSay(msgAskName)

                  } else if (simStep === 'ASK_NAME') {
                    setSimCollected(p => ({ ...p, nome: val }))
                    if (useWhatsappPhone && !simIsLid) {
                      setSimStep('ASK_PHONE_CONFIRM')
                      botSay(interpolate(msgAskPhoneConfirm))
                    } else {
                      setSimStep('ASK_PHONE_TEXT')
                      botSay(msgAskPhoneText)
                    }

                  } else if (simStep === 'ASK_PHONE_CONFIRM') {
                    if (val === '1') {
                      setSimCollected(p => ({ ...p, telefone: '(34) 9 1234-5678' }))
                      if (cpfOption !== 'DONT_ASK') {
                        setSimStep('ASK_CPF')
                        botSay(msgAskCpf)
                      } else {
                        setSimStep('ASK_DATE')
                        botSay(msgAskDate)
                      }
                    } else {
                      setSimStep('ASK_PHONE_TEXT')
                      botSay(msgAskPhoneText)
                    }

                  } else if (simStep === 'ASK_PHONE_TEXT') {
                    setSimCollected(p => ({ ...p, telefone: val }))
                    if (cpfOption !== 'DONT_ASK') {
                      setSimStep('ASK_CPF')
                      botSay(msgAskCpf)
                    } else {
                      setSimStep('ASK_DATE')
                      botSay(msgAskDate)
                    }

                  } else if (simStep === 'ASK_CPF') {
                    const skip = val === '0' || val.toLowerCase() === 'pular' || val.toLowerCase() === 'ignorar'
                    if (!skip || cpfOption !== 'ASK_OPTIONAL') {
                      setSimCollected(p => ({ ...p, cpf: val.replace(/\D/g, '') }))
                    }
                    setSimStep('ASK_DATE')
                    botSay(msgAskDate)

                  } else if (simStep === 'ASK_DATE') {
                    setSimCollected(p => ({ ...p, data: val }))
                    setSimStep('CONFIRM')
                    const updatedCollected: Record<string, string> = { ...simCollected, data: val }
                    const body = msgSummaryBody
                      .replace(/\{nome\}/g, updatedCollected.nome)
                      .replace(/\{telefone\}/g, updatedCollected.telefone)
                      .replace(/\{cpf\}/g, updatedCollected.cpf ? `***.***-${updatedCollected.cpf.slice(-5, -2)}-${updatedCollected.cpf.slice(-2)}` : '')
                      .replace(/\{planoNome\}/g, updatedCollected.planoNome || 'Consulta Geral')
                      .replace(/\{medico\}/g, updatedCollected.medico || 'Dr. (médico)')
                      .replace(/\{data\}/g, val)
                      .replace(/\{[^}]+\}/g, '').replace(/\n{3,}/g, '\n\n').trim()
                    botSay(`${msgSummary}\n\n${body}\n\n${msgAskConfirm}\n\n1 - ${msgOptionConfirm}\n2 - ${msgOptionChange}\n3 - ${msgOptionCancel}`)

                  } else if (simStep === 'CONFIRM') {
                    if (val === '1') {
                      setSimStep('DONE')
                      botSay(interpolate(msgSuccess))
                    } else if (val === '2') {
                      setSimStep('ASK_DATE')
                      botSay(msgAskDate)
                    } else {
                      setSimStep('CANCELLED')
                      botSay(msgCancel)
                    }
                  } else {
                    botSay('A simulação já foi concluída. Clique em "Reiniciar" para simular novamente.')
                  }
                }, 350)
              }

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Simulador de conversa</p>
                      <p className="text-xs text-slate-400 mt-0.5">Teste o fluxo completo com as mensagens configuradas nas outras abas.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simIsLid}
                          onChange={e => setSimIsLid(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                        Simular contato LID
                      </label>
                      <button
                        type="button"
                        onClick={startSim}
                        className="px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <span>▶</span> {simStep === 'START' ? 'Iniciar' : 'Reiniciar'}
                      </button>
                    </div>
                  </div>

                  {/* Chat Window */}
                  <div className="bg-[#ece5dd] rounded-2xl border border-slate-200 overflow-hidden" style={{ height: '340px', display: 'flex', flexDirection: 'column' }}>
                    <div className="bg-[#128C7E] text-white px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">🤖</div>
                      <div>
                        <p className="text-sm font-semibold leading-none">Clínica Bot</p>
                        <p className="text-[10px] text-white/70">Chatbot Light</p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {simMessages.length === 0 && (
                        <div className="h-full flex items-center justify-center">
                          <p className="text-xs text-slate-400 text-center">Clique em <strong>Iniciar</strong> para começar a simulação</p>
                        </div>
                      )}
                      {simMessages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap shadow-sm ${
                            msg.sender === 'user'
                              ? 'bg-[#dcf8c6] text-slate-800 rounded-br-sm'
                              : 'bg-white text-slate-800 rounded-bl-sm'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-[#f0f0f0] border-t border-slate-200 px-3 py-2 flex items-center gap-2 flex-shrink-0">
                      <input
                        type="text"
                        value={simInput}
                        onChange={e => setSimInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSimInput()}
                        placeholder={simStep === 'START' ? 'Clique em Iniciar primeiro...' : 'Digite sua resposta...'}
                        disabled={simStep === 'START' || simStep === 'DONE' || simStep === 'CANCELLED'}
                        className="flex-1 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs outline-none focus:border-cyan-400 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handleSimInput}
                        disabled={simStep === 'START' || simStep === 'DONE' || simStep === 'CANCELLED' || !simInput.trim()}
                        className="w-8 h-8 rounded-full bg-[#128C7E] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#0f6e62] transition-colors text-sm"
                      >
                        ➤
                      </button>
                    </div>
                  </div>

                  {/* Step indicator */}
                  {simStep !== 'START' && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{simStep}</span>
                      <span>→ etapa atual do simulador</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Action button */}
          <div className="border-t border-slate-200 pt-4 mt-auto flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="btn-primary"
            >
              {saveMutation.isPending ? 'Salvando...' : editingConfig ? 'Salvar Configuração' : 'Criar Configuração'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}



interface ChatbotLightRoomOption {
  id: string
  name: string
  whatsappConnection: { status: string; phoneNumber: string | null; displayName: string | null } | null
}

function ConexaoResumoTab({ onGoToChatbots }: { onGoToChatbots: (t: ChatbotsTab) => void }) {
  const { data: chatbots = [], isLoading } = useQuery<ChatbotSummary[]>({
    queryKey: ['light-chatbots'],
    queryFn: () => api.get('/chatbot-light/chatbots').then(r => r.data),
    staleTime: 15_000,
  })

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Conexão WhatsApp</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Cada chatbot tem sua própria sala/número de WhatsApp — gerencie a conexão de cada um em
          WhatsApp &gt; Chatbots &gt; [bot] &gt; Configurações. Aqui você só acompanha o status geral.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : chatbots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400 mb-3">Nenhum chatbot criado ainda.</p>
          <button onClick={() => onGoToChatbots('meus')} className="btn-primary text-sm mx-auto">Criar chatbot</button>
        </div>
      ) : (
        <div className="space-y-3">
          {chatbots.map(cb => {
            const connStatus = cb.boundRoom?.whatsappConnection?.status
            const isConnected = connStatus === 'CONNECTED'
            return (
              <div key={cb.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  {isConnected ? <Wifi className="w-5 h-5 text-white" /> : <WifiOff className="w-5 h-5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{cb.name}</p>
                  <p className="text-xs text-slate-500">
                    {cb.boundRoom ? `Sala: ${cb.boundRoom.name}${cb.boundRoom.whatsappConnection?.phoneNumber ? ' · ' + cb.boundRoom.whatsappConnection.phoneNumber : ''}` : 'Nenhuma sala vinculada'}
                  </p>
                </div>
                <button onClick={() => onGoToChatbots('meus')} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0">
                  Gerenciar
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Para conectar/desconectar o número de uma sala, acesse <Link to="/configuracoes/salas" className="font-semibold text-cyan-600 hover:underline">Configurações &gt; Salas</Link>.
      </div>
    </div>
  )
}

// ─── Config: Teste de Envio ───────────────────────────────────────────────────

function TesteTab() {
  const { data: templates = [] } = useQuery<LightTemplate[]>({
    queryKey: ['light-templates'],
    queryFn:  () => api.get('/chatbot-light/templates').then(r => r.data),
  })

  const [phone, setPhone] = useState('')

  function formatBrazilPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length === 0) return ''
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
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

  // Encontra variáveis não preenchidas ou não suportadas
  const emptyVars = Array.from(baseContent.matchAll(/\{(\w+)\}/g))
    .map(m => m[1])
    .filter(v => {
      if (['nome', 'data', 'hora', 'medico', 'valor', 'link'].includes(v)) {
        return !simVars[v as keyof typeof simVars]?.trim()
      }
      return true
    })

  const hasEmptyVars = emptyVars.length > 0

  const testMutation = useMutation({
    mutationFn: () => api.post('/chatbot-light/test', { phone, content: previewContent }).then(r => r.data),
    onSuccess: (data: { resolvedJid?: string }) => {
      const jidInfo = data?.resolvedJid ? ` → ${data.resolvedJid}` : ''
      setLastResult({ success: true, msg: `Mensagem enviada com sucesso!${jidInfo}` })
    },
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
          <label className="label">Celular *</label>
          <input
            value={phone}
            onChange={e => setPhone(formatBrazilPhone(e.target.value))}
            className="input-field"
            placeholder="(34) 99999-0000"
            inputMode="numeric"
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

        {hasEmptyVars && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>Existem variáveis sem preenchimento: {emptyVars.map(v => `{${v}}`).join(', ')}</span>
          </div>
        )}

        <button
          onClick={() => { setLastResult(null); testMutation.mutate() }}
          disabled={!phone || !baseContent || testMutation.isPending || hasEmptyVars}
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

// ─── Config: Horário de funcionamento ─────────────────────────────────────────

interface BusinessHoursConfig {
  enabled: boolean
  daysOfWeek: string[]
  startTime: string
  endTime: string
  offHoursMessage: string
  allowLeadCaptureOffHours: boolean
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: false,
  daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  startTime: '08:00',
  endTime: '18:00',
  offHoursMessage: 'No momento estamos fora do horário de atendimento. Você pode deixar sua mensagem ou iniciar um pré-agendamento — nossa equipe responderá assim que possível.',
  allowLeadCaptureOffHours: true,
}

const DAY_OPTIONS: { key: string; label: string }[] = [
  { key: 'MON', label: 'Seg' }, { key: 'TUE', label: 'Ter' }, { key: 'WED', label: 'Qua' },
  { key: 'THU', label: 'Qui' }, { key: 'FRI', label: 'Sex' }, { key: 'SAT', label: 'Sáb' }, { key: 'SUN', label: 'Dom' },
]

function HorarioFuncionamentoTab() {
  const qc = useQueryClient()
  const { data: settings } = useQuery<{ businessHours?: BusinessHoursConfig }>({
    queryKey: ['light-settings'],
    queryFn: () => api.get('/chatbot-light/settings').then(r => r.data),
  })

  const [form, setForm] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (settings && !loaded) {
      setForm(settings.businessHours ?? DEFAULT_BUSINESS_HOURS)
      setLoaded(true)
    }
  }, [settings, loaded])

  const saveMutation = useMutation({
    mutationFn: (data: BusinessHoursConfig) => api.put('/chatbot-light/settings', { businessHours: data }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['light-settings'] }); toast.success('Configurações salvas') },
    onError: () => toast.error('Erro ao salvar'),
  })

  const toggleDay = (key: string) => {
    setForm(p => ({ ...p, daysOfWeek: p.daysOfWeek.includes(key) ? p.daysOfWeek.filter(d => d !== key) : [...p.daysOfWeek, key] }))
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="font-semibold text-slate-900">Horário de funcionamento</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Fora do horário, os fluxos normais são substituídos pela mensagem abaixo — respostas rápidas continuam
          funcionando sempre, e pré-agendamento pode continuar se você permitir.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 px-5 py-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800">Restringir horário de funcionamento</p>
          <p className="text-xs text-slate-400">Quando desligado, o chatbot responde a qualquer hora, todos os dias</p>
        </div>
        <Toggle enabled={form.enabled} onToggle={() => setForm(p => ({ ...p, enabled: !p.enabled }))} />
      </div>

      {form.enabled && (
        <>
          <div>
            <label className="label">Dias da semana</label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_OPTIONS.map(d => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.daysOfWeek.includes(d.key) ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início</label>
              <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="label">Fim</label>
              <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} className="input-field" />
            </div>
          </div>

          <div>
            <label className="label">Mensagem fora do horário</label>
            <textarea
              value={form.offHoursMessage}
              onChange={e => setForm(p => ({ ...p, offHoursMessage: e.target.value }))}
              rows={3}
              className="input-field resize-none text-sm"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors">
            <input
              type="checkbox"
              checked={form.allowLeadCaptureOffHours}
              onChange={e => setForm(p => ({ ...p, allowLeadCaptureOffHours: e.target.checked }))}
              className="rounded text-cyan-600 focus:ring-cyan-500 mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">Permitir pré-agendamento fora do horário</p>
              <p className="text-xs text-slate-400">Fluxos que capturam interesse (Pré-Agendamento) continuam funcionando mesmo fora do horário configurado</p>
            </div>
          </label>
        </>
      )}

      <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary">
        {saveMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </div>
  )
}

// ─── Config: Módulos habilitados ──────────────────────────────────────────────

function TelasTab() {
  const qc = useQueryClient()

  const { data: settings } = useQuery<{ enabledScreens: string[]; advancedMode?: boolean }>({
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

// ─── Pré-Agendamentos panel ───────────────────────────────────────────────────

type LeadStatus = 'NOVO' | 'EM_ANALISE' | 'CONVERTIDO' | 'DESCARTADO'

interface PreSchedulingLead {
  id: string
  doctorId: string | null
  name: string
  phone: string
  notes?: string | null
  status: 'PRE_CADASTRO' | 'ATIVO' | 'INCOMPLETO' | 'INATIVO'
  leadStatus: LeadStatus | null
  createdAt: string
  chatbotSession?: {
    id: string
    completedAt: string | null
    contactPhone: string
  } | null
}

const LEAD_STATUS_TABS: { key: LeadStatus; label: string }[] = [
  { key: 'NOVO',       label: 'Novos' },
  { key: 'EM_ANALISE', label: 'Em análise' },
  { key: 'CONVERTIDO', label: 'Convertidos' },
  { key: 'DESCARTADO', label: 'Descartados' },
]

function LeadStatusBadge({ status }: { status: LeadStatus | null }) {
  const map: Record<LeadStatus, { label: string; cls: string }> = {
    NOVO:       { label: 'Novo',       cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    EM_ANALISE: { label: 'Em análise', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    CONVERTIDO: { label: 'Convertido', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    DESCARTADO: { label: 'Descartado', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  }
  const { label, cls } = map[status ?? 'NOVO']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

function QuickScheduleModal({
  isOpen, onClose, lead,
}: {
  isOpen: boolean
  onClose: () => void
  lead: PreSchedulingLead | null
}) {
  const qc = useQueryClient()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState('09:00')
  const [title, setTitle] = useState('Consulta')

  const createMutation = useMutation({
    mutationFn: () => api.post('/appointments', {
      patientId: lead!.id,
      doctorId: lead!.doctorId,
      title,
      date: new Date(`${date}T${time}:00`).toISOString(),
      duration: 30,
    }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-light-pre-schedulings'] })
      toast.success('Agendamento criado')
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao criar agendamento'),
  })

  if (!lead) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Criar agendamento — ${lead.name}`} size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Hora</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input-field" />
          </div>
        </div>
        <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="btn-primary w-full">
          {createMutation.isPending ? 'Criando...' : 'Criar agendamento'}
        </button>
      </div>
    </Modal>
  )
}

function PreAgendamentosPanel() {
  const qc = useQueryClient()
  const [activeStatus, setActiveStatus] = useState<LeadStatus>('NOVO')
  const [scheduleModalLead, setScheduleModalLead] = useState<PreSchedulingLead | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: leads = [], isLoading } = useQuery<PreSchedulingLead[]>({
    queryKey: ['chatbot-light-pre-schedulings', activeStatus],
    queryFn: () => api.get('/chatbot-light/pre-schedulings', { params: { leadStatus: activeStatus } }).then(r => r.data),
    staleTime: 30_000,
  })

  const { data: allLeads = [] } = useQuery<PreSchedulingLead[]>({
    queryKey: ['chatbot-light-pre-schedulings-all'],
    queryFn: () => api.get('/chatbot-light/pre-schedulings').then(r => r.data),
    staleTime: 30_000,
  })

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, leadStatus }: { id: string; leadStatus: LeadStatus }) =>
      api.patch(`/chatbot-light/pre-schedulings/${id}/lead-status`, { leadStatus }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-light-pre-schedulings'] })
      qc.invalidateQueries({ queryKey: ['chatbot-light-pre-schedulings-all'] })
      toast.success('Status atualizado')
    },
    onError: () => toast.error('Erro ao atualizar status'),
  })

  const countByStatus = (s: LeadStatus) => allLeads.filter(l => l.leadStatus === s).length
  const newCount = countByStatus('NOVO')

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Pré-Agendamentos</h2>
            {newCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                {newCount} nov{newCount !== 1 ? 'os' : 'o'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Pacientes/leads capturados pelo chatbot — valide e converta em paciente ou agendamento
          </p>
        </div>
        <button
          onClick={() => { qc.invalidateQueries({ queryKey: ['chatbot-light-pre-schedulings'] }); qc.invalidateQueries({ queryKey: ['chatbot-light-pre-schedulings-all'] }) }}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
          title="Atualizar lista"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {LEAD_STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveStatus(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors ${
              activeStatus === t.key
                ? 'border-cyan-600 text-cyan-700 bg-cyan-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-slate-400">({countByStatus(t.key)})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <CalendarClock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium text-sm mb-1">Nada por aqui</p>
          <p className="text-slate-400 text-xs max-w-sm mx-auto">
            Leads capturados pela ação <strong>Capturar Interesse</strong> de um Chatbot aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Data/Hora', 'Paciente', 'Telefone', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map(lead => (
                  <>
                    <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {format(new Date(lead.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)} className="flex items-center gap-2 hover:underline">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[10px] font-bold">
                              {lead.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-slate-800 text-xs">{lead.name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
                        >
                          <PhoneCall className="w-3 h-3" />
                          {lead.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <LeadStatusBadge status={lead.leadStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {lead.leadStatus === 'NOVO' && (
                            <button
                              onClick={() => changeStatusMutation.mutate({ id: lead.id, leadStatus: 'EM_ANALISE' })}
                              disabled={changeStatusMutation.isPending}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                              Em análise
                            </button>
                          )}
                          {(lead.leadStatus === 'NOVO' || lead.leadStatus === 'EM_ANALISE') && (
                            <>
                              <button
                                onClick={() => changeStatusMutation.mutate({ id: lead.id, leadStatus: 'CONVERTIDO' })}
                                disabled={changeStatusMutation.isPending}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              >
                                Converter em paciente
                              </button>
                              <button
                                onClick={() => setScheduleModalLead(lead)}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors"
                              >
                                Criar agendamento
                              </button>
                              <button
                                onClick={() => changeStatusMutation.mutate({ id: lead.id, leadStatus: 'DESCARTADO' })}
                                disabled={changeStatusMutation.isPending}
                                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
                              >
                                Descartar
                              </button>
                            </>
                          )}
                          {lead.leadStatus === 'CONVERTIDO' && (
                            <button
                              onClick={() => setScheduleModalLead(lead)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors"
                            >
                              Criar agendamento
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === lead.id && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3 bg-slate-50/60">
                          <p className="text-xs text-slate-500"><strong>Observação:</strong> {lead.notes ?? '—'}</p>
                          {lead.chatbotSession && (
                            <p className="text-xs text-slate-400 mt-1">Sessão do chatbot: {lead.chatbotSession.contactPhone}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-500">{leads.length} registro{leads.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      <QuickScheduleModal isOpen={!!scheduleModalLead} onClose={() => setScheduleModalLead(null)} lead={scheduleModalLead} />
    </div>
  )
}

// ─── Simulador embutido (para aba Configuracoes) ──────────────────────────────

function SimuladorTab({ chatbotId }: { chatbotId?: string } = {}) {
  const { data: fluxos = [] } = useQuery<LightFluxo[]>({
    queryKey: ['light-fluxos', chatbotId ?? 'all'],
    queryFn: () => api.get('/chatbot-light/fluxos', { params: chatbotId ? { chatbotId } : {} }).then(r => r.data),
    staleTime: 60_000,
  })

  const { data: instance } = useQuery({
    queryKey: ['chatbot-light-instance', chatbotId ?? 'default'],
    queryFn: () => (chatbotId
      ? api.get(`/chatbot-light/chatbots/${chatbotId}/instance`).then(r => r.data).catch(() => null)
      : api.get('/chatbot-light/instance').then(r => r.data).catch(() => null)),
    staleTime: 30_000,
  })

  const isConnected = instance?.status === 'CONNECTED'
  const activeFluxos = fluxos.filter(f => f.active)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Simulador de WhatsApp</h3>
        <p className="text-sm text-slate-500 mt-0.5">Teste seus fluxos sem precisar de WhatsApp conectado</p>
      </div>

      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-600">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
        <span>Este teste usa a <strong>versão publicada</strong> dos fluxos. Para testar alterações ainda não publicadas, use o botão "Testar" dentro do <strong>Construtor</strong>.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Coluna esquerda: instruções */}
        <div className="space-y-4">
          {/* Status da conexão */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
            isConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            {isConnected
              ? <Wifi className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              : <WifiOff className="w-4 h-4 flex-shrink-0 text-slate-400" />
            }
            <span className="font-medium text-sm">
              {isConnected
                ? `WhatsApp conectado${instance?.phoneNumber ? ' · ' + instance.phoneNumber : ''}`
                : 'WhatsApp desconectado — o simulador funciona mesmo assim'
              }
            </span>
            {isConnected && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0 ml-auto" />}
          </div>

          {/* Dica de uso */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">Como usar:</p>
            <p>1. Digite qualquer palavra-chave no simulador ao lado</p>
            <p>2. O bot responderá simulando o fluxo cadastrado</p>
            <p>3. Para o pré-agendamento, envie: <code className="bg-blue-100 px-1 rounded font-mono">agendar</code> ou <code className="bg-blue-100 px-1 rounded font-mono">consulta</code></p>
          </div>

          {/* Fluxos ativos */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Chatbots ativos — palavras-chave
              </p>
            </div>
            {activeFluxos.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                Nenhum fluxo ativo. Crie e ative um fluxo na seção <strong>Chatbots</strong>.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeFluxos.map(f => (
                  <div key={f.id} className="px-4 py-3 flex items-start gap-3">
                    <GitBranch className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{f.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {f.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                          <span key={k} className="text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 px-1.5 py-0.5 rounded font-mono">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fluxo de pré-agendamento */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Fluxo de pré-agendamento
            </p>
            <p className="text-[11px] text-emerald-700">
              Exemplo de conversa para captura de interesse:
            </p>
            <div className="space-y-1 text-[11px] text-emerald-800 font-mono bg-white/60 rounded-lg p-2">
              <p>Paciente: "agendar"</p>
              <p>Bot: Mostra menu</p>
              <p>Paciente: "1" (Agendar Consulta)</p>
              <p>Bot: Coleta nome</p>
              <p>Bot: Coleta telefone</p>
              <p>Bot: "Interesse registrado!"</p>
            </div>
          </div>
        </div>

        {/* Coluna direita: simulador visual */}
        <div className="flex justify-center">
          <EmbeddedSimulator chatbotId={chatbotId} />
        </div>
      </div>
    </div>
  )
}

function EmbeddedSimulator({ chatbotId }: { chatbotId?: string } = {}) {
  const [sessionToken] = useState(() => generateUUID().replace(/-/g, '').substring(0, 16) + '_emb')
  const [messages, setMessages] = useState<SimMessage[]>([{
    id: generateUUID(),
    fromMe: false,
    text: '👋 Bem-vindo ao simulador! Digite qualquer palavra (ex: "olá", "agendar") para iniciar um fluxo.',
    ts: new Date(),
  }])
  const [inputText, setInputText] = useState('')
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>('idle')
  const [flowName, setFlowName] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addBotMessages = (texts: string[]) => {
    const now = new Date()
    setMessages(prev => [
      ...prev,
      ...texts.map(t => ({ id: generateUUID(), fromMe: false, text: t, ts: now })),
    ])
  }

  const scrollToBottom = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  useEffect(() => { if (messages.length) scrollToBottom() }, [messages])

  const handleReset = async () => {
    try { await api.delete(`/chatbot-light/simulate/${sessionToken}`) } catch { /* ignore */ }
    setMessages([{
      id: generateUUID(),
      fromMe: false,
      text: '🔄 Sessão reiniciada. Digite qualquer palavra para começar.',
      ts: new Date(),
    }])
    setCurrentStep(null)
    setSessionStatus('idle')
    setFlowName(null)
    setInputText('')
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || sending) return
    const userMsg: SimMessage = { id: generateUUID(), fromMe: true, text, ts: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setSending(true)
    try {
      const { data } = await api.post('/chatbot-light/simulate', { sessionToken, message: text, chatbotId })
      const { botMessages, currentStep: step, sessionStatus: status, flowName: fn } = data
      setCurrentStep(step)
      setSessionStatus(status)
      if (fn) setFlowName(fn)
      if (botMessages?.length) addBotMessages(botMessages)
    } catch (err: any) {
      addBotMessages([`Erro: ${err?.response?.data?.message || 'Falha na simulação'}`])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
      scrollToBottom()
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const isFinished = ['COMPLETED', 'CANCELLED', 'FAILED', 'TRANSFER'].includes(sessionStatus)

  return (
    <div
      className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-slate-200"
      style={{ height: '580px' }}
    >
      {/* Header WhatsApp-like */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">
            {flowName ? `Fluxo: ${flowName}` : 'Bot da Clínica'}
          </p>
          <p className="text-white/70 text-xs">
            {sessionStatus === 'idle' ? 'online' : STATUS_LABELS[sessionStatus] ?? sessionStatus}
          </p>
        </div>
        <button
          onClick={handleReset}
          title="Reiniciar simulação"
          className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Debug step badge */}
      {currentStep && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <Info className="w-3 h-3 text-amber-600 flex-shrink-0" />
          <p className="text-[10px] text-amber-700 font-medium truncate">
            Step: {STEP_LABELS[currentStep] ?? currentStep}
          </p>
        </div>
      )}

      {/* Chat area */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{ background: '#ECE5DD url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4c9bd\' fill-opacity=\'0.35\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
      >
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
              m.fromMe
                ? 'rounded-tr-sm bg-[#DCF8C6] text-slate-800'
                : 'rounded-tl-sm bg-white text-slate-800'
            }`}>
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.text}</p>
              <p className="text-[9px] text-slate-400 mt-0.5 text-right">
                {m.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Finished banner */}
      {isFinished && (
        <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-center flex-shrink-0">
          <p className="text-xs text-slate-500">Conversa encerrada.</p>
          <button onClick={handleReset} className="text-xs text-cyan-600 font-medium hover:underline mt-0.5">
            Reiniciar
          </button>
        </div>
      )}

      {/* Input */}
      {!isFinished && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#F0F0F0] border-t border-slate-200 flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Digite uma mensagem..."
            disabled={sending}
            className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-slate-800 border border-slate-200 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
            style={{ background: '#128C7E' }}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Configurações panel ──────────────────────────────────────────────────────

function ConfigPanel({
  configTab, setConfigTab, onGoToChatbots,
}: {
  configTab: ConfigTab
  setConfigTab: (t: ConfigTab) => void
  onGoToChatbots: (t: ChatbotsTab) => void
}) {
  const tabs: { key: ConfigTab; label: string }[] = [
    { key: 'conexao',    label: 'Conexão' },
    { key: 'telas',      label: 'Módulos habilitados' },
    { key: 'horario',    label: 'Horário de funcionamento' },
    { key: 'teste',      label: 'Teste de Envio' },
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
        {configTab === 'conexao'   && <ConexaoResumoTab onGoToChatbots={onGoToChatbots} />}
        {configTab === 'telas'     && <TelasTab />}
        {configTab === 'horario'   && <HorarioFuncionamentoTab />}
        {configTab === 'teste'     && <TesteTab />}
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
    queryKey: ['chatbot-light-instance'],
    queryFn:  () => api.get('/chatbot-light/instance').then(r => r.data).catch(() => null),
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
  const [panel, setPanel]         = useState<Panel>('central')
  const [configTab, setConfigTab] = useState<ConfigTab>('conexao')
  const [chatbotsTab, setChatbotsTab] = useState<ChatbotsTab>('meus')

  // Badge de pendentes nos pré-agendamentos
  const { data: preLeads = [] } = useQuery<PreSchedulingLead[]>({
    queryKey: ['chatbot-light-pre-schedulings'],
    queryFn: () => api.get('/chatbot-light/pre-schedulings').then(r => r.data).catch(() => []),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  const pendingLeadsCount = preLeads.filter(l => l.leadStatus === 'NOVO').length

  const goTo = (p: Panel) => {
    setPanel(p)
    if (p !== 'configuracoes') setConfigTab('conexao')
    if (p !== 'chatbots') setChatbotsTab('meus')
  }

  const goToConfig = (tab: ConfigTab) => {
    setPanel('configuracoes')
    setConfigTab(tab)
  }

  const goToChatbots = (tab: ChatbotsTab) => {
    setPanel('chatbots')
    setChatbotsTab(tab)
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

          <SideNavBtn panel="central"         current={panel} onClick={goTo} icon={AlertCircle}  label="Central" />
          <SideNavBtn panel="relatorio"       current={panel} onClick={goTo} icon={BarChart3}    label="Relatório" />

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-5">WhatsApp</p>
          <SideNavBtn panel="chatbots"        current={panel} onClick={goTo} icon={GitBranch}    label="Chatbots" />
          <SideNavBtn
            panel="pre_agendamentos"
            current={panel}
            onClick={goTo}
            icon={CalendarClock}
            label="Pré-Agendamentos"
            badge={pendingLeadsCount > 0 ? (
              <span className="ml-auto flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                {pendingLeadsCount > 9 ? '9+' : pendingLeadsCount}
              </span>
            ) : undefined}
          />
          <SideNavBtn panel="notificacoes"    current={panel} onClick={goTo} icon={Bell}          label="Notificações" />

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-5">Menu</p>
          <SideNavBtn panel="historico"       current={panel} onClick={goTo} icon={History}      label="Histórico" />
          <SideNavBtn panel="configuracoes"   current={panel} onClick={goTo} icon={Settings}     label="Configurações" />
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
        {panel === 'central'           && <CentralPanel onGoTo={goTo} onGoToConfig={goToConfig} onGoToChatbots={goToChatbots} />}
        {panel === 'relatorio'         && <RelatorioPanel onGoTo={goTo} />}
        {panel === 'chatbots'          && <ChatbotsPanel chatbotsTab={chatbotsTab} setChatbotsTab={setChatbotsTab} />}
        {panel === 'notificacoes'      && <NotificacoesPanel />}
        {panel === 'historico'         && <HistoricoPanel />}
        {panel === 'pre_agendamentos'  && <PreAgendamentosPanel />}
        {panel === 'configuracoes'     && <ConfigPanel configTab={configTab} setConfigTab={setConfigTab} onGoToChatbots={goToChatbots} />}
      </main>
    </div>
  )
}
