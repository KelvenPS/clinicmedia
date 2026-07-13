import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Zap, CheckCircle2, Clock, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useSubscription } from '../../hooks/useSubscription'

const INCLUDED_FEATURES = [
  'Agenda', 'Prontuário', 'Financeiro', 'WhatsApp', 'Chatbot Light', 'Relatórios', 'Configurações',
]

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  TRIAL: { label: 'Período gratuito', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  ACTIVE: { label: 'Ativa', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PENDING_PAYMENT: { label: 'Pagamento pendente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAST_DUE: { label: 'Pagamento atrasado', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  CANCELED: { label: 'Cancelada', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  BLOCKED: { label: 'Bloqueada', color: 'bg-red-50 text-red-700 border-red-200' },
}

export default function Assinatura() {
  const { subscription, isLoading, canManageBilling, refreshSubscription } = useSubscription()
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)

  const checkoutMutation = useMutation({
    mutationFn: () => api.post('/subscription/checkout').then(r => r.data),
    onSuccess: (data: { checkoutUrl: string }) => {
      window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer')
      navigate('/configuracoes/assinatura/pendente')
    },
    onError: () => toast.error('Não foi possível abrir o checkout. Tente novamente.'),
    onSettled: () => setOpening(false),
  })

  const reconcileMutation = useMutation({
    mutationFn: () => api.post('/subscription/reconcile').then(r => r.data),
    onSuccess: (data: { message?: string }) => {
      toast.success(data.message || 'Verificação concluída.')
      refreshSubscription()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Não foi possível verificar o pagamento agora.')
    },
  })

  if (isLoading || !subscription) {
    return <div className="animate-pulse text-slate-400 text-sm">Carregando...</div>
  }

  const statusInfo = STATUS_LABEL[subscription.status] ?? STATUS_LABEL.BLOCKED

  return (
    <div className="max-w-2xl space-y-6 animate-page-enter">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{subscription.product}</h1>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              R$ {subscription.monthlyPrice}<span className="text-sm font-normal text-slate-400">/mês</span>
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-2 mb-6">
          {INCLUDED_FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        {subscription.status === 'TRIAL' && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-sm text-blue-700">
            <Clock className="w-4 h-4 flex-shrink-0" />
            {subscription.trialDaysRemaining === 0
              ? 'Último dia do seu período gratuito.'
              : `Restam ${subscription.trialDaysRemaining} dia${subscription.trialDaysRemaining !== 1 ? 's' : ''} do seu período gratuito.`}
            {subscription.trialEndsAt && (
              <span className="text-blue-400">
                (até {format(new Date(subscription.trialEndsAt), "d 'de' MMMM", { locale: ptBR })})
              </span>
            )}
          </div>
        )}

        {subscription.status === 'PENDING_PAYMENT' && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4 text-sm text-amber-700">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Aguardando confirmação do pagamento (Pix/boleto). O acesso é liberado automaticamente assim que for confirmado.
          </div>
        )}

        {(subscription.status === 'BLOCKED' || subscription.status === 'PAST_DUE') && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {subscription.status === 'PAST_DUE'
              ? 'Identificamos um problema no pagamento. Regularize para manter o acesso.'
              : 'Assinatura bloqueada. Assine para restaurar o acesso completo.'}
          </div>
        )}

        {subscription.currentPeriodEndsAt && subscription.status === 'ACTIVE' && (
          <p className="text-sm text-slate-500 mb-4">
            Próxima renovação em {format(new Date(subscription.currentPeriodEndsAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}.
          </p>
        )}

        {canManageBilling ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => { setOpening(true); checkoutMutation.mutate() }}
              disabled={checkoutMutation.isPending || opening}
              className="btn-primary flex-1 justify-center"
            >
              <Zap className="w-4 h-4" />
              Assinar por R$ {subscription.monthlyPrice}/mês
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              className="btn-secondary flex-1 justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
              Já realizei o pagamento
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Somente o administrador da clínica pode gerenciar a assinatura.
          </p>
        )}
      </div>

      {subscription.payments.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Histórico de pagamentos</h2>
          <div className="space-y-2">
            {subscription.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-500">
                  {format(new Date(p.approvedAt ?? p.createdAt), "d MMM yyyy", { locale: ptBR })}
                </span>
                <span className="text-slate-700 font-medium">R$ {(p.amountCents / 100).toFixed(2).replace('.', ',')}</span>
                <span className="text-xs text-slate-400">{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
