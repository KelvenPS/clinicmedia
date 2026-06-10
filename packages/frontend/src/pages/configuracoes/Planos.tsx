import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Check, Zap, Star, Building2, Video, AlertCircle, Calendar,
  CreditCard, Clock, CheckCircle2, X, ChevronRight, Receipt,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useSubscription } from '../../hooks/useSubscription'
import { PLAN_DISPLAY, PLAN_PRICES } from '../../types'

// ─── Plan catalogue ───────────────────────────────────────────────────────────

const PLANS = [
  {
    key:     'PRO',
    name:    'Pro',
    icon:    Zap,
    color:   'from-blue-500 to-blue-700',
    border:  'border-blue-400',
    accent:  'blue',
    price:   PLAN_PRICES.PRO,
    features: [
      { label: 'Agenda completa', included: true },
      { label: 'Prontuário eletrônico', included: true },
      { label: 'Módulo financeiro', included: true },
      { label: 'Avaliações psicológicas', included: true },
      { label: 'Nota Fiscal (NFS-e)', included: true },
      { label: '2 salas de atendimento', included: true },
      { label: '1 secretária', included: true },
      { label: 'Suporte por email', included: true },
      { label: 'Chatbot IA', included: false },
      { label: 'Teleconsulta', included: false },
    ],
  },
  {
    key:     'PLUS',
    name:    'Plus',
    icon:    Star,
    color:   'from-purple-500 to-purple-700',
    border:  'border-purple-400',
    accent:  'purple',
    price:   PLAN_PRICES.PLUS,
    popular: true,
    features: [
      { label: 'Tudo do Pro', included: true },
      { label: '5 salas de atendimento', included: true },
      { label: '5 secretárias', included: true },
      { label: 'Chatbot IA (light)', included: true },
      { label: 'Notificações automáticas', included: true },
      { label: 'Suporte prioritário', included: true },
      { label: 'Teleconsulta', included: false },
    ],
  },
  {
    key:     'CLINIC',
    name:    'Clínica',
    icon:    Building2,
    color:   'from-emerald-500 to-emerald-700',
    border:  'border-emerald-400',
    accent:  'emerald',
    price:   PLAN_PRICES.CLINIC,
    features: [
      { label: 'Tudo do Plus', included: true },
      { label: 'Salas ilimitadas', included: true },
      { label: 'Secretárias ilimitadas', included: true },
      { label: 'Chatbot com IA completo', included: true },
      { label: 'Atendimento via WhatsApp', included: true },
      { label: '3 meses de consultoria', included: true },
      { label: 'Suporte 24h', included: true },
    ],
  },
  {
    key:     'TELECONSULTA',
    name:    'Teleconsulta',
    icon:    Video,
    color:   'from-cyan-500 to-cyan-700',
    border:  'border-cyan-400',
    accent:  'cyan',
    price:   PLAN_PRICES.TELECONSULTA,
    addon:   true,
    features: [
      { label: '4 teleconsultas por mês', included: true },
      { label: 'Sala virtual privada', included: true },
      { label: 'Link de acesso ao paciente', included: true },
      { label: 'Gravação da consulta', included: true },
      { label: 'Receita digital pós-consulta', included: true },
    ],
  },
]

interface CheckoutResponse {
  id: string
  init_point: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Planos() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)
  const [showPaymentHistory, setShowPaymentHistory] = useState(false)

  const {
    subscription,
    plan: currentPlan,
    isTrial,
    isTrialExpired,
    isPaidExpired,
    trialDaysLeft,
    daysUntilRenewal,
  } = useSubscription()

  // Handle MercadoPago return
  useEffect(() => {
    const status = searchParams.get('status')
    if (!status) return

    if (status === 'success') {
      toast.success('Pagamento confirmado! Seu plano foi ativado.')
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
    } else if (status === 'failure') {
      toast.error('Pagamento não aprovado. Tente novamente ou use outro método.')
    } else if (status === 'pending') {
      toast('Pagamento em análise. Confirmaremos em breve.', { icon: 'ℹ️' })
    }

    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('status'); next.delete('plan'); next.delete('cycle')
      return next
    }, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkoutMutation = useMutation({
    mutationFn: (data: { plan: string; billingCycle: string }) =>
      api.post<CheckoutResponse>('/subscriptions/checkout', data).then(r => r.data),
    onSuccess: (data) => { window.location.href = data.init_point },
    onError: () => {
      toast.error('Erro ao iniciar pagamento. Tente novamente.')
      setCheckoutPlan(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post('/subscriptions/cancel'),
    onSuccess: () => {
      toast.success('Assinatura cancelada.')
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
    },
    onError: () => toast.error('Erro ao cancelar. Tente novamente.'),
  })

  const handleSubscribe = (planKey: string) => {
    setCheckoutPlan(planKey)
    checkoutMutation.mutate({ plan: planKey, billingCycle })
  }

  const monthlyPrice = (key: string) => {
    const p = PLAN_PRICES[key]
    if (!p) return 0
    return billingCycle === 'MONTHLY' ? p.monthly : p.annual / 12
  }

  const isCurrentPlan = (key: string) => currentPlan === key

  return (
    <div className="max-w-5xl space-y-6 animate-page-enter">
      {/* Header */}
      <div className="animate-stagger-1">
        <h1 className="page-title">Planos ClinIQ Pro</h1>
        <p className="page-subtitle">Escolha o plano ideal para sua prática clínica</p>
      </div>

      {/* Status banners */}
      <div className="space-y-3 animate-stagger-2">
        {isTrialExpired && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800 text-sm">Período de teste encerrado</p>
              <p className="text-xs text-red-600 mt-0.5">
                Assine um dos planos abaixo para continuar usando todas as funcionalidades do ClinIQ Pro.
              </p>
            </div>
          </div>
        )}

        {isPaidExpired && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800 text-sm">Assinatura expirada</p>
              <p className="text-xs text-red-600 mt-0.5">
                Renove seu plano para retomar o acesso completo à plataforma.
              </p>
            </div>
          </div>
        )}

        {isTrial && !isTrialExpired && (
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${trialDaysLeft <= 5 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
            <Clock className={`w-5 h-5 flex-shrink-0 mt-0.5 ${trialDaysLeft <= 5 ? 'text-amber-600' : 'text-blue-600'}`} />
            <div className="flex-1">
              <p className={`font-semibold text-sm ${trialDaysLeft <= 5 ? 'text-amber-800' : 'text-blue-800'}`}>
                {trialDaysLeft > 0
                  ? `${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''} restante${trialDaysLeft !== 1 ? 's' : ''} no período gratuito`
                  : 'Último dia do período gratuito'}
              </p>
              <p className={`text-xs mt-0.5 ${trialDaysLeft <= 5 ? 'text-amber-600' : 'text-blue-600'}`}>
                {subscription?.trialEndsAt
                  ? `Expira em ${format(new Date(subscription.trialEndsAt), "d 'de' MMMM", { locale: ptBR })}`
                  : 'Escolha um plano para continuar com acesso completo'}
              </p>
            </div>
          </div>
        )}

        {!isTrial && !isPaidExpired && subscription && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800 text-sm">
                Plano {PLAN_DISPLAY[currentPlan]} ativo · {subscription.billingCycle === 'MONTHLY' ? 'Mensal' : 'Anual'}
              </p>
              {subscription.currentPeriodEnd && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  Renova em {format(new Date(subscription.currentPeriodEnd), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  {daysUntilRenewal > 0 ? ` · ${daysUntilRenewal} dias` : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (confirm('Deseja cancelar sua assinatura? O acesso continuará até o fim do período pago.')) {
                  cancelMutation.mutate()
                }
              }}
              disabled={cancelMutation.isPending}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-xl w-fit mx-auto animate-stagger-2">
        <button
          onClick={() => setBillingCycle('MONTHLY')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === 'MONTHLY' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Mensal
        </button>
        <button
          onClick={() => setBillingCycle('ANNUAL')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${billingCycle === 'ANNUAL' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Anual
          <span className="text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">-15%</span>
        </button>
      </div>

      {/* Plan cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 animate-stagger-3">
        {PLANS.map((plan, idx) => {
          const Icon = plan.icon
          const isActive = isCurrentPlan(plan.key)
          const price = monthlyPrice(plan.key)
          const isPending = checkoutMutation.isPending && checkoutPlan === plan.key

          return (
            <div
              key={plan.key}
              className={`relative card border-2 flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                isActive
                  ? `${plan.border} shadow-lg`
                  : plan.popular
                    ? `${plan.border} shadow-md`
                    : 'border-slate-200 hover:border-slate-300'
              }`}
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              {plan.popular && !isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                    Mais popular
                  </span>
                </div>
              )}
              {isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Plano atual
                  </span>
                </div>
              )}
              {plan.addon && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-cyan-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                    Add-on
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4 shadow-lg`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>

              {/* Price */}
              <div className="mt-2 mb-5">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">
                    R$ {price.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-slate-500 text-sm">/mês</span>
                </div>
                {billingCycle === 'ANNUAL' && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    R$ {(PLAN_PRICES[plan.key]?.annual ?? 0).toFixed(2).replace('.', ',')} cobrado anualmente
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f.label} className={`flex items-center gap-2 text-sm ${f.included ? 'text-slate-700' : 'text-slate-400'}`}>
                    {f.included
                      ? <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : <X className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                    {f.label}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleSubscribe(plan.key)}
                disabled={isActive || checkoutMutation.isPending}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : `bg-gradient-to-r ${plan.color} text-white hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`
                }`}
              >
                {isActive
                  ? <><CheckCircle2 className="w-4 h-4" /> Plano atual</>
                  : isPending
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Aguarde...</>
                    : <><CreditCard className="w-4 h-4" /> Assinar {plan.name}</>}
              </button>
            </div>
          )
        })}
      </div>

      {/* Trial info */}
      <div className="card bg-slate-50 border-slate-200 animate-stagger-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <p className="flex items-center gap-2 font-semibold text-slate-700 mb-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              Período gratuito de 30 dias
            </p>
            <p className="text-sm text-slate-500">
              Novos médicos têm 30 dias para experimentar o ClinIQ Pro.
              No plano gratuito: acesso à agenda apenas.
              Escolha um plano para desbloquear prontuário, financeiro, avaliações e mais.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-500 flex-shrink-0">
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Sem cartão no cadastro</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Cancele quando quiser</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" /> Suporte via email</span>
          </div>
        </div>
      </div>

      {/* Payment history */}
      {subscription?.payments && subscription.payments.length > 0 && (
        <div className="card animate-stagger-4">
          <button
            onClick={() => setShowPaymentHistory(!showPaymentHistory)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-500" />
              Histórico de pagamentos
            </h3>
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showPaymentHistory ? 'rotate-90' : ''}`} />
          </button>

          {showPaymentHistory && (
            <div className="mt-4 space-y-2 animate-scale-in">
              {subscription.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm py-2 border-t border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{PLAN_DISPLAY[p.plan as keyof typeof PLAN_DISPLAY] ?? p.plan}</p>
                    <p className="text-xs text-slate-400">
                      {p.paidAt ? format(new Date(p.paidAt), "d MMM yyyy", { locale: ptBR }) : 'Pendente'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">R$ {p.amount.toFixed(2).replace('.', ',')}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>{p.status === 'PAID' ? 'Pago' : p.status === 'PENDING' ? 'Pendente' : p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
