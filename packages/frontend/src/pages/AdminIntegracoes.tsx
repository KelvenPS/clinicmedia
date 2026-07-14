import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Webhook, Copy, Eye, EyeOff, RotateCcw, CheckCircle2,
  XCircle, Clock, AlertTriangle, Save, ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import Modal from '../components/ui/Modal'

interface KiwifyConfigView {
  enabled: boolean
  checkoutUrl: string | null
  productId: string | null
  accountId: string | null
  clientId: string | null
  hasClientSecret: boolean
  hasWebhookSecret: boolean
  webhookSecretPreview: string | null
  webhookUrl: string
  updatedAt: string | null
}

interface KiwifyEvent {
  id: string
  eventType: string
  kiwifyOrderId: string | null
  processingStatus: string
  receivedAt: string
  processedAt: string | null
  errorMessage: string | null
  attempts: number
}

const EVENT_STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PROCESSED: { label: 'Processado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  IGNORED: { label: 'Ignorado', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: AlertTriangle },
  RECEIVED: { label: 'Recebido', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
}

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value)
  toast.success(`${label} copiado`)
}

export default function AdminIntegracoes() {
  const qc = useQueryClient()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  const [form, setForm] = useState({
    enabled: false,
    checkoutUrl: '',
    productId: '',
    accountId: '',
    clientId: '',
    clientSecret: '',
  })

  const { data: config, isLoading } = useQuery<KiwifyConfigView>({
    queryKey: ['admin-integrations-kiwify'],
    queryFn: () => api.get('/admin/integrations/kiwify').then(r => r.data),
  })

  const { data: events = [] } = useQuery<KiwifyEvent[]>({
    queryKey: ['admin-integrations-kiwify-events'],
    queryFn: () => api.get('/admin/integrations/kiwify/events', { params: { take: 20 } }).then(r => r.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (!config) return
    setForm({
      enabled: config.enabled,
      checkoutUrl: config.checkoutUrl ?? '',
      productId: config.productId ?? '',
      accountId: config.accountId ?? '',
      clientId: config.clientId ?? '',
      clientSecret: '',
    })
  }, [config])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/admin/integrations/kiwify', {
        enabled: form.enabled,
        checkoutUrl: form.checkoutUrl || null,
        productId: form.productId || null,
        accountId: form.accountId || null,
        clientId: form.clientId || null,
        ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
      }),
    onSuccess: () => {
      toast.success('Configuração salva')
      setForm(f => ({ ...f, clientSecret: '' }))
      qc.invalidateQueries({ queryKey: ['admin-integrations-kiwify'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Não foi possível salvar'),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => api.post('/admin/integrations/kiwify/webhook-secret/regenerate').then(r => r.data),
    onSuccess: (data: { webhookSecret: string }) => {
      setRevealedSecret(data.webhookSecret)
      setShowRegenerateConfirm(false)
      toast.success('Novo segredo gerado — copie e atualize no painel da Kiwify')
      qc.invalidateQueries({ queryKey: ['admin-integrations-kiwify'] })
    },
    onError: () => toast.error('Não foi possível gerar o segredo'),
  })

  const revealMutation = useMutation({
    mutationFn: () => api.get('/admin/integrations/kiwify/webhook-secret').then(r => r.data),
    onSuccess: (data: { webhookSecret: string }) => setRevealedSecret(data.webhookSecret),
    onError: () => toast.error('Não foi possível revelar o segredo'),
  })

  if (isLoading || !config) {
    return <div className="py-12 text-center text-slate-400">Carregando...</div>
  }

  return (
    <div className="space-y-4 animate-page-enter">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Integrações — Kiwify</h1>
        <p className="text-sm text-slate-400">
          Configure o webhook que a Kiwify usa para avisar a Clinic Pro sobre pagamentos, renovações e cancelamentos.
          Isso libera automaticamente o acesso de cada médico/especialista após o pagamento ou os 7 dias de teste grátis.
        </p>
      </div>

      {/* Status */}
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${config.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <Webhook className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">
              Integração {config.enabled ? 'ativa' : 'inativa'}
            </p>
            <p className="text-xs text-slate-400">
              {config.hasWebhookSecret ? 'Segredo do webhook configurado' : 'Segredo do webhook ainda não gerado'}
              {config.updatedAt && ` · atualizado ${format(new Date(config.updatedAt), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}`}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
          />
          Integração ativa
        </label>
      </div>

      {/* Endpoint + secret */}
      <div className="card p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Endpoint do webhook</p>
          <p className="text-xs text-slate-400 mb-2">
            Cole esta URL no painel da Kiwify em Configurações do produto → Webhooks.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={config.webhookUrl} className="input-field w-full font-mono text-xs bg-slate-50" />
            <button
              onClick={() => copyToClipboard(config.webhookUrl, 'Endpoint')}
              className="btn-icon flex-shrink-0"
              title="Copiar endpoint"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Segredo do webhook</p>
          <p className="text-xs text-slate-400 mb-2">
            Cole este valor no campo de token/assinatura do webhook, no painel da Kiwify. Gerar um novo segredo invalida o anterior.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={revealedSecret ?? config.webhookSecretPreview ?? 'Nenhum segredo gerado'}
              className="input-field w-full font-mono text-xs bg-slate-50"
            />
            {config.hasWebhookSecret && (
              <button
                onClick={() => revealedSecret ? setRevealedSecret(null) : revealMutation.mutate()}
                className="btn-icon flex-shrink-0"
                title={revealedSecret ? 'Ocultar' : 'Revelar'}
              >
                {revealedSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
            {revealedSecret && (
              <button onClick={() => copyToClipboard(revealedSecret, 'Segredo')} className="btn-icon flex-shrink-0" title="Copiar segredo">
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowRegenerateConfirm(true)}
              className="btn-icon flex-shrink-0 text-amber-600"
              title="Gerar novo segredo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Produto / checkout */}
      <div className="card p-4 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto e checkout</p>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">URL de checkout da Kiwify</label>
          <input
            value={form.checkoutUrl}
            onChange={e => setForm(f => ({ ...f, checkoutUrl: e.target.value }))}
            placeholder="https://pay.kiwify.com.br/xxxxxxx"
            className="input-field w-full"
          />
          <p className="text-xs text-slate-400 mt-1">
            Use o link de checkout direto (pay.kiwify.com.br), não o link da página do produto — só o de checkout aceita os parâmetros de rastreamento que identificam o médico.
          </p>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">ID do produto (opcional)</label>
          <input
            value={form.productId}
            onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
            placeholder="Deixe em branco para aceitar pagamentos de qualquer produto da conta"
            className="input-field w-full"
          />
        </div>

        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Configuração avançada (reconciliação via API Kiwify)
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-1 border-l-2 border-slate-100">
            <div className="pl-3">
              <label className="text-xs text-slate-500 mb-1 block">Account ID</label>
              <input value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="input-field w-full" />
            </div>
            <div className="pl-3">
              <label className="text-xs text-slate-500 mb-1 block">Client ID</label>
              <input value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} className="input-field w-full" />
            </div>
            <div className="pl-3">
              <label className="text-xs text-slate-500 mb-1 block">
                Client Secret {config.hasClientSecret && <span className="text-slate-400">(já configurado — deixe em branco para manter)</span>}
              </label>
              <input
                type="password"
                value={form.clientSecret}
                onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                className="input-field w-full"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            Salvar configuração
          </button>
        </div>
      </div>

      {/* Eventos recentes */}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-900">Últimos webhooks recebidos</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Recebido</th>
              <th className="px-4 py-3">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum webhook recebido ainda</td></tr>
            )}
            {events.map(ev => {
              const statusInfo = EVENT_STATUS_LABEL[ev.processingStatus] ?? EVENT_STATUS_LABEL.RECEIVED
              const StatusIcon = statusInfo.icon
              return (
                <tr key={ev.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{ev.eventType}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{ev.kiwifyOrderId ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {format(new Date(ev.receivedAt), "d MMM yyyy HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[240px] truncate" title={ev.errorMessage ?? ''}>
                    {ev.errorMessage ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        title="Gerar novo segredo do webhook"
        subtitle="O segredo anterior deixa de funcionar imediatamente — você precisa atualizar o valor no painel da Kiwify também, ou os próximos pagamentos deixam de ser confirmados automaticamente."
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowRegenerateConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Gerar novo segredo
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Confirma a geração de um novo segredo? Copie o novo valor e cole no painel da Kiwify assim que terminar.
        </p>
      </Modal>
    </div>
  )
}
