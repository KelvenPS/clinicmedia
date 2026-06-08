import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Webhook, Calendar, Mail, MessageCircle, Bot,
  Plus, Trash2, Power, FlaskConical, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Info, Copy, ExternalLink,
  Shield, Zap, Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { Integration, WebhookLog, IntegrationType } from '../../types'
import Modal from '../../components/ui/Modal'

// ─── integration meta ──────────────────────────────────────────────────────────

const INTEGRATION_META: Record<IntegrationType, {
  label: string
  description: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
  badge: string
  docsUrl?: string
}> = {
  WEBHOOK: {
    label: 'Webhook',
    description: 'Envie dados para qualquer URL ao ocorrer eventos (n8n, Make, Zapier, chatbots, IA)',
    icon: Webhook,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  GOOGLE_CALENDAR: {
    label: 'Google Calendar',
    description: 'Sincronize agendamentos com sua agenda do Google Calendar automaticamente',
    icon: Calendar,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    docsUrl: 'https://developers.google.com/calendar/api/guides/overview',
  },
  GOOGLE_GMAIL: {
    label: 'Gmail',
    description: 'Envie confirmações e lembretes de consulta via Gmail automaticamente',
    icon: Mail,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    docsUrl: 'https://developers.google.com/gmail/api/guides',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    description: 'Envie mensagens via WhatsApp Business API (Evolution API / Baileys)',
    icon: MessageCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
    docsUrl: 'https://doc.evolution-api.com',
  },
  AI_AGENT: {
    label: 'Agente de IA',
    description: 'Conecte um agente de IA (OpenAI, Gemini, ou webhook de chatbot personalizado)',
    icon: Bot,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
    docsUrl: 'https://platform.openai.com/docs/overview',
  },
}

const WEBHOOK_EVENTS = [
  { value: 'appointment.created',   label: 'Consulta agendada' },
  { value: 'appointment.updated',   label: 'Consulta atualizada' },
  { value: 'appointment.completed', label: 'Consulta concluída' },
  { value: 'appointment.cancelled', label: 'Consulta cancelada' },
  { value: 'patient.created',       label: 'Novo paciente cadastrado' },
  { value: 'transaction.created',   label: 'Transação financeira criada' },
]

// ─── Config forms per type ─────────────────────────────────────────────────────

function WebhookForm({ config, events, onChange, onEventsChange }: {
  config: Record<string, unknown>
  events: string[]
  onChange: (c: Record<string, unknown>) => void
  onEventsChange: (e: string[]) => void
}) {
  const toggleEvent = (ev: string) => {
    onEventsChange(events.includes(ev) ? events.filter(e => e !== ev) : [...events, ev])
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">URL de destino *</label>
        <input
          className="input-field"
          placeholder="https://n8n.meuservidor.com/webhook/abc123"
          value={(config.url as string) || ''}
          onChange={e => onChange({ ...config, url: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">Endpoint que receberá as requisições POST com payload JSON</p>
      </div>

      <div>
        <label className="label">Secret (opcional)</label>
        <input
          className="input-field font-mono"
          placeholder="minha-chave-secreta"
          value={(config.secret as string) || ''}
          onChange={e => onChange({ ...config, secret: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">
          Se preenchido, cada requisição terá o header <code className="bg-slate-100 px-1 rounded">X-ClinIQ-Signature: sha256=...</code>
        </p>
      </div>

      <div>
        <label className="label mb-2">Eventos que disparam este webhook</label>
        <div className="space-y-2">
          {WEBHOOK_EVENTS.map(ev => (
            <label key={ev.value} className="flex items-center gap-3 p-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={events.includes(ev.value)}
                onChange={() => toggleEvent(ev.value)}
                className="w-4 h-4 text-blue-600"
              />
              <div className="flex-1">
                <p className="text-sm text-slate-800">{ev.label}</p>
                <p className="text-xs text-slate-400 font-mono">{ev.value}</p>
              </div>
            </label>
          ))}
        </div>
        {events.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">Selecione ao menos um evento</p>
        )}
      </div>

      {/* Payload example */}
      <details className="border border-slate-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 select-none">
          Exemplo de payload recebido
        </summary>
        <pre className="px-4 py-3 bg-slate-900 text-emerald-400 text-xs overflow-x-auto leading-relaxed">
{`{
  "event": "appointment.created",
  "timestamp": "2025-06-06T10:30:00.000Z",
  "data": {
    "id": "appt_abc123",
    "patientName": "João Silva",
    "patientPhone": "(11) 99999-9999",
    "doctorName": "Dr. Ana Costa",
    "date": "2025-06-10T14:00:00.000Z",
    "type": "Consulta",
    "status": "SCHEDULED",
    "value": 200.00
  }
}`}
        </pre>
      </details>
    </div>
  )
}

function GoogleCalendarForm({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5"><Info className="w-4 h-4" />Como configurar</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700 text-xs mt-2">
          <li>Acesse <strong>console.cloud.google.com</strong> e crie um projeto</li>
          <li>Ative a <strong>Google Calendar API</strong></li>
          <li>Crie credenciais OAuth 2.0 (tipo: aplicação web)</li>
          <li>Cole o Client ID e Client Secret abaixo</li>
          <li>Use <strong>Make.com ou n8n</strong> para automatizar sem OAuth se preferir</li>
        </ol>
      </div>
      <div>
        <label className="label">Calendar ID</label>
        <input
          className="input-field"
          placeholder="seuemail@gmail.com ou ID da agenda"
          value={(config.calendarId as string) || ''}
          onChange={e => onChange({ ...config, calendarId: e.target.value })}
        />
      </div>
      <div>
        <label className="label">OAuth Client ID</label>
        <input
          className="input-field font-mono text-xs"
          placeholder="xxxx.apps.googleusercontent.com"
          value={(config.clientId as string) || ''}
          onChange={e => onChange({ ...config, clientId: e.target.value })}
        />
      </div>
      <div>
        <label className="label">OAuth Client Secret</label>
        <input
          type="password"
          className="input-field font-mono text-xs"
          placeholder="GOCSPX-..."
          value={(config.clientSecret as string) || ''}
          onChange={e => onChange({ ...config, clientSecret: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Refresh Token</label>
        <input
          type="password"
          className="input-field font-mono text-xs"
          placeholder="Token de atualização OAuth"
          value={(config.refreshToken as string) || ''}
          onChange={e => onChange({ ...config, refreshToken: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">Obtenha em: OAuth Playground ou via fluxo de autorização</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <strong>Dica rápida:</strong> Use o <strong>n8n</strong> ou <strong>Make.com</strong> com um webhook do ClinIQ Pro para integrar ao Google Calendar sem precisar de OAuth — muito mais simples para começar.
      </div>
    </div>
  )
}

function GmailForm({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5"><Info className="w-4 h-4" />Opções de configuração</p>
        <ul className="list-disc list-inside text-xs text-blue-700 space-y-1 mt-2">
          <li><strong>Gmail SMTP:</strong> crie uma senha de app em myaccount.google.com/apppasswords</li>
          <li><strong>Outro SMTP:</strong> qualquer servidor (Mailgun, SendGrid, etc.)</li>
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Servidor SMTP</label>
          <input
            className="input-field"
            placeholder="smtp.gmail.com"
            value={(config.host as string) || ''}
            onChange={e => onChange({ ...config, host: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Porta</label>
          <input
            type="number"
            className="input-field"
            placeholder="587"
            value={(config.port as string) || ''}
            onChange={e => onChange({ ...config, port: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Email remetente</label>
        <input
          className="input-field"
          placeholder="seuemail@gmail.com"
          value={(config.from as string) || ''}
          onChange={e => onChange({ ...config, from: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Usuário</label>
        <input
          className="input-field"
          placeholder="seuemail@gmail.com"
          value={(config.user as string) || ''}
          onChange={e => onChange({ ...config, user: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Senha / App Password</label>
        <input
          type="password"
          className="input-field"
          placeholder="Senha de app (não a senha da conta)"
          value={(config.password as string) || ''}
          onChange={e => onChange({ ...config, password: e.target.value })}
        />
      </div>
    </div>
  )
}

function WhatsAppForm({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-semibold mb-1 flex items-center gap-1.5"><Info className="w-4 h-4" />Evolution API</p>
        <p className="text-xs text-green-700 mt-1">
          A <strong>Evolution API</strong> é uma API não-oficial de WhatsApp Business compatível com Baileys.
          Hospede em seu servidor ou use um serviço gerenciado. <a href="https://doc.evolution-api.com" target="_blank" rel="noopener" className="underline">Ver documentação</a>
        </p>
      </div>
      <div>
        <label className="label">URL da Evolution API</label>
        <input
          className="input-field"
          placeholder="https://evolution.meuservidor.com"
          value={(config.apiUrl as string) || ''}
          onChange={e => onChange({ ...config, apiUrl: e.target.value })}
        />
      </div>
      <div>
        <label className="label">API Key</label>
        <input
          type="password"
          className="input-field font-mono"
          placeholder="sua-api-key"
          value={(config.apiKey as string) || ''}
          onChange={e => onChange({ ...config, apiKey: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Nome da Instância</label>
        <input
          className="input-field"
          placeholder="clinica"
          value={(config.instance as string) || ''}
          onChange={e => onChange({ ...config, instance: e.target.value })}
        />
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
        <strong>Dica:</strong> Para usar a API oficial do WhatsApp Business (Meta), crie uma conta em <strong>business.whatsapp.com</strong> e use o webhook do ClinIQ Pro + n8n para enviar mensagens.
      </div>
    </div>
  )
}

function AIAgentForm({ config, onChange }: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Tipo de agente</label>
        <select
          className="input-field"
          value={(config.provider as string) || 'webhook'}
          onChange={e => onChange({ ...config, provider: e.target.value })}
        >
          <option value="webhook">Webhook personalizado (n8n, Make, Flowise...)</option>
          <option value="openai">OpenAI (ChatGPT)</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>

      {(config.provider === 'openai' || config.provider === 'gemini') && (
        <>
          <div>
            <label className="label">API Key</label>
            <input
              type="password"
              className="input-field font-mono text-xs"
              placeholder={config.provider === 'openai' ? 'sk-...' : 'AIza...'}
              value={(config.apiKey as string) || ''}
              onChange={e => onChange({ ...config, apiKey: e.target.value })}
            />
          </div>
          {config.provider === 'openai' && (
            <div>
              <label className="label">Modelo</label>
              <select
                className="input-field"
                value={(config.model as string) || 'gpt-4o-mini'}
                onChange={e => onChange({ ...config, model: e.target.value })}
              >
                <option value="gpt-4o-mini">GPT-4o Mini (econômico)</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
          )}
          <div>
            <label className="label">Prompt do sistema</label>
            <textarea
              className="input-field resize-none text-sm"
              rows={4}
              placeholder="Você é um assistente de uma clínica médica. Responda de forma educada e profissional..."
              value={(config.systemPrompt as string) || ''}
              onChange={e => onChange({ ...config, systemPrompt: e.target.value })}
            />
          </div>
        </>
      )}

      {(!config.provider || config.provider === 'webhook') && (
        <div>
          <label className="label">URL do webhook do agente</label>
          <input
            className="input-field"
            placeholder="https://flowise.meuservidor.com/api/v1/prediction/..."
            value={(config.url as string) || ''}
            onChange={e => onChange({ ...config, url: e.target.value })}
          />
          <p className="text-xs text-slate-400 mt-1">O ClinIQ Pro enviará eventos para esta URL e aguardará resposta do agente</p>
        </div>
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-800">
        <strong>Ferramentas recomendadas:</strong> Flowise, n8n, Botpress, ou Dify — todas suportam webhook e podem ser conectadas ao ClinIQ Pro sem código.
      </div>
    </div>
  )
}

// ─── Tutorial accordion ────────────────────────────────────────────────────────

const TUTORIALS = [
  {
    title: 'Conectar ao n8n (automação gratuita)',
    icon: Zap,
    color: 'text-orange-600',
    steps: [
      'Instale o n8n (n8n.io) em seu servidor ou use n8n.cloud',
      'Crie um novo Workflow e adicione o nó "Webhook"',
      'Copie a URL gerada pelo n8n',
      'No ClinIQ Pro, crie uma integração do tipo Webhook e cole a URL',
      'Ative a integração e selecione os eventos desejados',
      'No n8n, adicione ações após o webhook (enviar email, WhatsApp, Google Calendar, etc.)',
    ],
  },
  {
    title: 'Conectar ao Make.com (ex-Integromat)',
    icon: Activity,
    color: 'text-violet-600',
    steps: [
      'Crie uma conta em make.com',
      'Clique em "+ Create a new scenario"',
      'Adicione o módulo "Webhooks > Custom Webhook"',
      'Copie a URL do webhook gerada',
      'No ClinIQ Pro, crie uma integração Webhook com essa URL',
      'Configure os módulos seguintes (Google Sheets, Calendar, WhatsApp, etc.)',
    ],
  },
  {
    title: 'Segurança: verificar assinatura HMAC',
    icon: Shield,
    color: 'text-blue-600',
    steps: [
      'Configure um "Secret" na sua integração Webhook',
      'Cada requisição terá o header X-ClinIQ-Signature: sha256=<hash>',
      'No seu servidor, calcule HMAC-SHA256 do corpo da requisição usando o mesmo secret',
      'Compare o hash calculado com o do header para garantir autenticidade',
      'Rejeite requisições com assinatura inválida (status 401)',
    ],
  },
  {
    title: 'Google Calendar via n8n (sem OAuth manual)',
    icon: Calendar,
    color: 'text-emerald-600',
    steps: [
      'No n8n, crie um workflow com trigger Webhook',
      'Adicione o nó "Google Calendar > Create Event"',
      'Autentique com sua conta Google no n8n (processo guiado)',
      'Mapeie os campos: patientName → title, date → start, etc.',
      'Configure a URL desse workflow no ClinIQ Pro como Webhook',
      'Ative o evento "appointment.created"',
    ],
  },
]

function TutorialSection() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-500" />
        Tutoriais de integração
      </h3>
      {TUTORIALS.map((t, i) => {
        const Icon = t.icon
        const isOpen = open === i
        return (
          <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${t.color}`} />
              <span className="flex-1 text-sm font-medium text-slate-800">{t.title}</span>
              {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {isOpen && (
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                <ol className="space-y-2">
                  {t.steps.map((step, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{j + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Webhook logs panel ────────────────────────────────────────────────────────

function LogsPanel({ integrationId, onClose }: { integrationId: string; onClose: () => void }) {
  const { data: logs = [], isLoading } = useQuery<WebhookLog[]>({
    queryKey: ['webhook-logs', integrationId],
    queryFn: () => api.get(`/integrations/${integrationId}/logs`).then(r => r.data),
    refetchInterval: 10000,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Últimas 50 entregas · atualiza a cada 10s</p>
        <button onClick={onClose} className="text-xs text-blue-600 hover:underline">Fechar</button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-4">Carregando...</p>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma entrega ainda. Use o botão "Testar" para enviar um evento.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {logs.map(log => (
            <div key={log.id} className={`border rounded-lg p-3 text-xs ${log.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {log.success
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                  <span className="font-mono font-semibold text-slate-700">{log.event}</span>
                  {log.statusCode && (
                    <span className={`px-1.5 py-0.5 rounded font-bold ${log.success ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`}>
                      {log.statusCode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
                  {log.duration && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{log.duration}ms</span>}
                  <span>{format(new Date(log.createdAt), 'dd/MM HH:mm:ss', { locale: ptBR })}</span>
                </div>
              </div>
              {log.error && <p className="mt-1 text-red-600 font-mono">{log.error}</p>}
              {log.responseBody && <p className="mt-1 text-slate-500 font-mono truncate">{log.responseBody}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit'

export default function Integracoes() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null)
  const [logsFor, setLogsFor] = useState<string | null>(null)

  // Form state
  const [type, setType] = useState<IntegrationType>('WEBHOOK')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [events, setEvents] = useState<string[]>([])

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post('/integrations', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integração criada!')
      setModalOpen(false)
    },
    onError: () => toast.error('Erro ao criar integração'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.put(`/integrations/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integração atualizada!')
      setModalOpen(false)
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/integrations/${id}/toggle`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
    onError: () => toast.error('Erro ao alterar status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['integrations'] })
      toast.success('Integração removida')
    },
    onError: () => toast.error('Erro ao remover'),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/test`).then(r => r.data),
    onSuccess: (_, id) => {
      toast.success('Payload de teste enviado!')
      setLogsFor(id)
      qc.invalidateQueries({ queryKey: ['webhook-logs', id] })
    },
    onError: () => toast.error('Erro ao enviar teste'),
  })

  const openCreate = (t: IntegrationType) => {
    setModalMode('create')
    setType(t)
    setName(INTEGRATION_META[t].label)
    setConfig({})
    setEvents([])
    setEditingIntegration(null)
    setModalOpen(true)
  }

  const openEdit = (intg: Integration) => {
    setModalMode('edit')
    setType(intg.type)
    setName(intg.name)
    setConfig(intg.config)
    setEvents(intg.events)
    setEditingIntegration(intg)
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('Informe um nome'); return }
    const payload = { type, name, config, events, active: false }
    if (modalMode === 'edit' && editingIntegration) {
      updateMutation.mutate({ id: editingIntegration.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const copyToken = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado!')
  }

  const configured = integrations.filter(i => i.active).length

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Zap className="w-6 h-6 text-blue-600" />
          Integrações
        </h1>
        <p className="page-subtitle">Conecte o ClinIQ Pro a outras plataformas via webhook, Google, WhatsApp e IA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total</p>
          <p className="text-2xl font-bold text-slate-900">{integrations.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Ativas</p>
          <p className="text-2xl font-bold text-emerald-600">{configured}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Entregas totais</p>
          <p className="text-2xl font-bold text-blue-600">
            {integrations.reduce((s, i) => s + (i._count?.webhookLogs ?? 0), 0)}
          </p>
        </div>
      </div>

      {/* Add new integration */}
      <div className="card">
        <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-500" />
          Adicionar integração
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.entries(INTEGRATION_META) as [IntegrationType, typeof INTEGRATION_META[IntegrationType]][]).map(([t, meta]) => {
            const Icon = meta.icon
            return (
              <button
                key={t}
                onClick={() => openCreate(t)}
                className={`flex items-start gap-3 p-4 border-2 ${meta.border} ${meta.bg} rounded-xl text-left hover:shadow-md transition-all group`}
              >
                <Icon className={`w-5 h-5 ${meta.color} flex-shrink-0 mt-0.5`} />
                <div className="min-w-0">
                  <p className={`font-semibold text-sm ${meta.color}`}>{meta.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{meta.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Existing integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Integrações configuradas</h2>
          {integrations.map(intg => {
            const meta = INTEGRATION_META[intg.type]
            const Icon = meta.icon
            const showLogs = logsFor === intg.id

            return (
              <div key={intg.id} className="card p-0 overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg} border ${meta.border}`}>
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{intg.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${intg.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {intg.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                      {intg.events.length > 0 && (
                        <span>{intg.events.length} evento{intg.events.length !== 1 ? 's' : ''}</span>
                      )}
                      {intg._count && intg._count.webhookLogs > 0 && (
                        <span>{intg._count.webhookLogs} entrega{intg._count.webhookLogs !== 1 ? 's' : ''}</span>
                      )}
                      <span>{formatDistanceToNow(new Date(intg.createdAt), { addSuffix: true, locale: ptBR })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {intg.type === 'WEBHOOK' && (
                      <>
                        <button
                          onClick={() => setLogsFor(showLogs ? null : intg.id)}
                          title="Ver logs"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Activity className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => testMutation.mutate(intg.id)}
                          disabled={testMutation.isPending}
                          title="Enviar evento de teste"
                          className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                        >
                          <FlaskConical className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(intg)}
                      title="Editar"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(intg.id)}
                      title={intg.active ? 'Desativar' : 'Ativar'}
                      className={`p-1.5 rounded-lg transition-colors ${intg.active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm('Remover integração?')) deleteMutation.mutate(intg.id) }}
                      title="Remover"
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {showLogs && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50">
                    <LogsPanel integrationId={intg.id} onClose={() => setLogsFor(null)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Payload signature reference */}
      <div className="card bg-slate-900 text-white p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold">Headers enviados em cada webhook</span>
          <button onClick={() => copyToken('X-ClinIQ-Signature')} className="ml-auto text-slate-400 hover:text-white">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        <pre className="px-4 py-3 text-xs text-emerald-400 leading-relaxed overflow-x-auto">
{`Content-Type: application/json
User-Agent: ClinIQ-Pro/1.0
X-ClinIQ-Event: appointment.created
X-ClinIQ-Timestamp: 2025-06-06T10:30:00.000Z
X-ClinIQ-Signature: sha256=<hmac-sha256-do-corpo>  ← apenas se secret configurado`}
        </pre>
      </div>

      {/* Tutorials */}
      <TutorialSection />

      {/* External links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'n8n.io', desc: 'Automação open-source', url: 'https://n8n.io', color: 'text-orange-600' },
          { label: 'Make.com', desc: 'Automação visual', url: 'https://make.com', color: 'text-violet-600' },
          { label: 'Evolution API', desc: 'WhatsApp API', url: 'https://doc.evolution-api.com', color: 'text-green-600' },
          { label: 'Flowise', desc: 'Chatbot com IA', url: 'https://flowiseai.com', color: 'text-blue-600' },
        ].map(link => (
          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
            className="card flex items-start gap-3 p-3 hover:shadow-md transition-shadow group">
            <ExternalLink className={`w-4 h-4 ${link.color} flex-shrink-0 mt-0.5`} />
            <div>
              <p className={`text-sm font-semibold ${link.color}`}>{link.label}</p>
              <p className="text-xs text-slate-400">{link.desc}</p>
            </div>
          </a>
        ))}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'create' ? `Nova integração — ${INTEGRATION_META[type].label}` : `Editar — ${editingIntegration?.name}`}
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="label">Nome da integração</label>
            <input
              className="input-field"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Webhook n8n Agenda, WhatsApp Confirmações..."
            />
          </div>

          {type === 'WEBHOOK' && <WebhookForm config={config} events={events} onChange={setConfig} onEventsChange={setEvents} />}
          {type === 'GOOGLE_CALENDAR' && <GoogleCalendarForm config={config} onChange={setConfig} />}
          {type === 'GOOGLE_GMAIL' && <GmailForm config={config} onChange={setConfig} />}
          {type === 'WHATSAPP' && <WhatsAppForm config={config} onChange={setConfig} />}
          {type === 'AI_AGENT' && <AIAgentForm config={config} onChange={setConfig} />}

          <div className="flex gap-3 pt-2 justify-end">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : modalMode === 'create' ? 'Criar integração' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
