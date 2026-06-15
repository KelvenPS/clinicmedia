import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Zap, Star, Building2, Check, AlertCircle, X } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { DoctorSubscription } from '../types'
import { useAuthStore } from '../store/authStore'

const PAYWALL_PLANS = [
  {
    key: 'PRO' as const,
    name: 'Pro',
    icon: Zap,
    color: 'from-blue-500 to-blue-700',
    border: 'border-blue-400',
    monthly: 89.90,
    features: ['Agenda completa', 'Prontuário eletrônico', 'Módulo financeiro', '1 sala de atendimento', '1 secretária'],
  },
  {
    key: 'PLUS' as const,
    name: 'Plus',
    icon: Star,
    color: 'from-purple-500 to-purple-700',
    border: 'border-purple-400',
    monthly: 109.90,
    popular: true,
    features: ['Tudo do Pro', '3 salas de atendimento', '3 secretárias'],
  },
  {
    key: 'CLINIC' as const,
    name: 'Clínica',
    icon: Building2,
    color: 'from-emerald-500 to-emerald-700',
    border: 'border-emerald-400',
    monthly: 159.90,
    features: ['Tudo do Plus', 'Salas e secretárias ilimitadas', 'Chatbot IA light', 'Avaliações psicológicas'],
  },
]

interface CheckoutResponse {
  id: string
  init_point: string
}

interface SubscriptionGateProps {
  children: React.ReactNode
}

export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { user } = useAuthStore()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)

  const { data: sub } = useQuery<DoctorSubscription | null>({
    queryKey: ['subscription-status'],
    queryFn: () => api.get('/subscriptions/me').then(r => r.data).catch(() => null),
    enabled: user?.role === 'DOCTOR',
    refetchInterval: 5 * 60 * 1000,
  })

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
    checkoutMutation.mutate({ plan: planKey, billingCycle: 'MONTHLY' })
  }

  const isTrialExpired =
    sub?.plan === 'TRIAL' &&
    sub?.trialEndsAt != null &&
    new Date() > new Date(sub.trialEndsAt)

  const trialDaysLeft =
    sub?.plan === 'TRIAL' && sub?.trialEndsAt
      ? Math.max(0, differenceInDays(new Date(sub.trialEndsAt), new Date()))
      : null

  const showTrialBanner =
    !bannerDismissed &&
    sub?.plan === 'TRIAL' &&
    !isTrialExpired &&
    trialDaysLeft !== null &&
    trialDaysLeft <= 7

  return (
    <>
      {/* Trial expiring soon — dismissible banner */}
      {showTrialBanner && (
        <div className="relative z-40 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>
              <span className="font-semibold">
                {trialDaysLeft === 0 ? 'Último dia' : `${trialDaysLeft} dias restantes`}
              </span>{' '}
              no seu período de teste.{' '}
              <Link to="/configuracoes/planos" className="underline font-medium hover:text-amber-900">
                Assine agora para continuar
              </Link>
            </span>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="p-0.5 rounded text-amber-600 hover:text-amber-900 hover:bg-amber-100 flex-shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main content */}
      {children}

      {/* Trial expired paywall — full-screen overlay */}
      {isTrialExpired && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto">
            {/* Header */}
            <div className="text-center px-8 pt-10 pb-6 border-b border-slate-100">
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-lg">CP</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Seu período de teste encerrou</h1>
              <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">
                Continue usando todas as funcionalidades do ClinIQ Pro escolhendo o plano ideal para você.
              </p>
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
              {PAYWALL_PLANS.map(plan => {
                const Icon = plan.icon
                const isPending = checkoutMutation.isPending && checkoutPlan === plan.key

                return (
                  <div
                    key={plan.key}
                    className={`relative rounded-xl border-2 p-5 flex flex-col transition-all ${plan.popular ? `${plan.border} shadow-lg` : 'border-slate-200'}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                          Mais popular
                        </span>
                      </div>
                    )}

                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>

                    <h3 className="font-bold text-slate-900">{plan.name}</h3>
                    <div className="mt-1 mb-4">
                      <span className="text-2xl font-bold text-slate-900">
                        R$ {plan.monthly.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-slate-500 text-xs">/mês</span>
                    </div>

                    <ul className="space-y-1.5 mb-5 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                          <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSubscribe(plan.key)}
                      disabled={checkoutMutation.isPending}
                      className={`w-full py-2 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r ${plan.color} text-white hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {isPending ? 'Aguarde...' : 'Assinar agora'}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="px-6 pb-6 text-center">
              <Link
                to="/configuracoes/planos"
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Ver detalhes dos planos em Configurações
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
