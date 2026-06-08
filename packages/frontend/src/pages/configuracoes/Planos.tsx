import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Zap, Star, Building2, AlertCircle, Calendar } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { DoctorSubscription } from '../../types'

const PLANS = [
  {
    key: 'PRO',
    name: 'Pro',
    icon: Zap,
    color: 'from-blue-500 to-blue-700',
    border: 'border-blue-400',
    monthly: 69.90,
    features: [
      'Agenda completa',
      'Prontuário eletrônico',
      'Módulo financeiro',
      '1 secretária',
      'Suporte por email',
    ],
  },
  {
    key: 'PLUS',
    name: 'Plus',
    icon: Star,
    color: 'from-purple-500 to-purple-700',
    border: 'border-purple-400',
    monthly: 89.90,
    popular: true,
    features: [
      'Tudo do Pro',
      '3 secretárias',
      'Notificações automáticas',
      'Formas de pagamento',
      'Documentos ilimitados',
      'Suporte prioritário',
    ],
  },
  {
    key: 'CLINIC',
    name: 'Clínica',
    icon: Building2,
    color: 'from-emerald-500 to-emerald-700',
    border: 'border-emerald-400',
    monthly: 109.90,
    features: [
      'Tudo do Plus',
      'Secretárias ilimitadas',
      'Salas ilimitadas',
      'Múltiplos médicos',
      'Relatórios avançados',
      'Suporte 24h',
    ],
  },
]

interface CheckoutResponse {
  id: string
  init_point: string
}

export default function Planos() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)

  const { data: subscription } = useQuery<DoctorSubscription | null>({
    queryKey: ['my-subscription'],
    queryFn: () => api.get('/subscriptions/me').then(r => r.data).catch(() => null),
  })

  // Handle MercadoPago return status via query params
  useEffect(() => {
    const status = searchParams.get('status')
    if (!status) return

    if (status === 'success') {
      toast.success('Pagamento confirmado! Seu plano foi ativado.')
      qc.invalidateQueries({ queryKey: ['my-subscription'] })
      qc.invalidateQueries({ queryKey: ['subscription-status'] })
    } else if (status === 'failure') {
      toast.error('Pagamento não aprovado. Tente novamente ou use outro método.')
    } else if (status === 'pending') {
      toast('Pagamento em análise. Você receberá uma confirmação em breve.', { icon: 'ℹ️' })
    }

    // Remove status params from URL without triggering navigation
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('status')
      next.delete('plan')
      next.delete('cycle')
      return next
    }, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkoutMutation = useMutation({
    mutationFn: (data: { plan: string; billingCycle: string }) =>
      api.post<CheckoutResponse>('/subscriptions/checkout', data).then(r => r.data),
    onSuccess: (data) => {
      window.location.href = data.init_point
    },
    onError: () => {
      toast.error('Erro ao iniciar pagamento. Tente novamente.')
      setCheckoutPlan(null)
    },
  })

  const handleSubscribe = (planKey: string) => {
    setCheckoutPlan(planKey)
    checkoutMutation.mutate({ plan: planKey, billingCycle })
  }

  const annual = (monthly: number) => monthly * 12 * 0.85
  const price = (p: typeof PLANS[0]) => billingCycle === 'MONTHLY' ? p.monthly : annual(p.monthly) / 12

  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(0, differenceInDays(new Date(subscription.trialEndsAt), new Date()))
    : 0

  const isTrial = subscription?.plan === 'TRIAL'
  const isTrialExpired = isTrial && subscription?.trialEndsAt != null && new Date() > new Date(subscription.trialEndsAt)
  const currentPlan = subscription?.plan

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Planos ClinIQ Pro</h1>
        <p className="page-subtitle">Escolha o plano ideal para sua prática</p>
      </div>

      {/* Trial expired banner */}
      {isTrialExpired && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-red-50 border-red-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-sm text-red-800">Período de teste encerrado</p>
            <p className="text-xs mt-0.5 text-red-600">
              Assine um dos planos abaixo para continuar usando o ClinIQ Pro
            </p>
          </div>
        </div>
      )}

      {/* Trial active banner */}
      {isTrial && !isTrialExpired && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${trialDaysLeft <= 5 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <AlertCircle className={`w-5 h-5 flex-shrink-0 ${trialDaysLeft <= 5 ? 'text-red-600' : 'text-amber-600'}`} />
          <div>
            <p className={`font-semibold text-sm ${trialDaysLeft <= 5 ? 'text-red-800' : 'text-amber-800'}`}>
              {trialDaysLeft > 0 ? `${trialDaysLeft} dias restantes no período gratuito` : 'Último dia do período gratuito'}
            </p>
            <p className={`text-xs mt-0.5 ${trialDaysLeft <= 5 ? 'text-red-600' : 'text-amber-600'}`}>
              {subscription?.trialEndsAt
                ? `Expira em ${format(new Date(subscription.trialEndsAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
                : 'Escolha um plano para continuar usando o ClinIQ Pro'
              }
            </p>
          </div>
        </div>
      )}

      {/* Current paid plan */}
      {!isTrial && subscription && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800 text-sm">
              Plano {currentPlan} ativo · {subscription.billingCycle === 'MONTHLY' ? 'Mensal' : 'Anual'}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="text-xs text-emerald-600 mt-0.5">
                Próxima renovação: {format(new Date(subscription.currentPeriodEnd), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Billing cycle toggle */}
      <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-xl w-fit mx-auto">
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

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const Icon = plan.icon
          const isActive = currentPlan === plan.key
          const monthlyPrice = price(plan)
          const isPending = checkoutMutation.isPending && checkoutPlan === plan.key

          return (
            <div
              key={plan.key}
              className={`relative card border-2 transition-all ${plan.popular ? `${plan.border} shadow-lg` : 'border-slate-200'}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Mais popular
                  </span>
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold text-slate-900">
                  R$ {monthlyPrice.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-slate-500 text-sm">/mês</span>
                {billingCycle === 'ANNUAL' && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    R$ {annual(plan.monthly).toFixed(2).replace('.', ',')} cobrado anualmente
                  </p>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.key)}
                disabled={isActive || checkoutMutation.isPending}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : `bg-gradient-to-r ${plan.color} text-white hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`
                }`}
              >
                {isActive ? '✓ Plano atual' : isPending ? 'Aguarde...' : `Assinar ${plan.name}`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="card bg-slate-50 border-slate-200 text-sm text-slate-600 space-y-1">
        <p className="flex items-center gap-2 font-medium text-slate-700">
          <Calendar className="w-4 h-4" /> Período gratuito
        </p>
        <p>
          Novos médicos têm 30 dias gratuitos para experimentar todos os recursos da plataforma.
          Após este período, é necessário escolher um plano para continuar usando o ClinIQ Pro.
        </p>
      </div>
    </div>
  )
}
