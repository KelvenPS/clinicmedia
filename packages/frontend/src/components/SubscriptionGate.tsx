import { useLocation, useNavigate } from 'react-router-dom'
import { Lock, Zap, Clock } from 'lucide-react'
import { useSubscription } from '../hooks/useSubscription'
import { useAuthStore } from '../store/authStore'

// Rotas que continuam acessíveis mesmo com o tenant bloqueado — cobrança,
// perfil ("conta") e ajuda/suporte.
const ALWAYS_ALLOWED_PREFIXES = ['/configuracoes/assinatura', '/configuracoes/perfil', '/configuracoes/ajuda']

interface SubscriptionGateProps {
  children: React.ReactNode
}

const BLOCKED_MESSAGES: Record<string, { title: string; body: string }> = {
  PAYMENT_PENDING: {
    title: 'Aguardando confirmação do pagamento',
    body: 'Identificamos um pagamento em processamento. Assim que for confirmado, o acesso é liberado automaticamente.',
  },
  PAYMENT_LATE: {
    title: 'Pagamento em atraso',
    body: 'Regularize a assinatura para continuar utilizando a Clinic Pro.',
  },
  SUBSCRIPTION_CANCELED: {
    title: 'Assinatura cancelada',
    body: 'Assine novamente para recuperar o acesso completo.',
  },
  TRIAL_EXPIRED: {
    title: 'Seu período gratuito terminou',
    body: 'Assine a Clinic Pro para continuar utilizando Agenda, Prontuário, Financeiro e Chatbot Light.',
  },
  SUBSCRIPTION_BLOCKED: {
    title: 'Acesso à Clinic Pro bloqueado',
    body: 'Regularize a assinatura para recuperar o acesso da sua equipe.',
  },
}

// Envolve apenas o <Outlet/> (conteúdo da página) — cabeçalho, menu lateral e
// botão de sair continuam sempre visíveis/funcionais, mesmo com o tenant
// bloqueado, para que o responsável consiga navegar até a cobrança e a
// equipe consiga sair da conta.
export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { subscription, accessAllowed, isLoading, canManageBilling } = useSubscription()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const onAllowedPage = ALWAYS_ALLOWED_PREFIXES.some(prefix => location.pathname.startsWith(prefix))

  if (isLoading || !user || accessAllowed || onAllowedPage) {
    return <>{children}</>
  }

  const message = BLOCKED_MESSAGES[subscription?.reason ?? ''] ?? BLOCKED_MESSAGES.SUBSCRIPTION_BLOCKED

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-page-enter">
      <div className="max-w-md">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          {subscription?.reason === 'PAYMENT_PENDING'
            ? <Clock className="w-8 h-8 text-amber-500" />
            : <Lock className="w-8 h-8 text-red-500" />}
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">{message.title}</h2>

        {canManageBilling ? (
          <>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              {message.body}
              {subscription && ` — R$ ${subscription.monthlyPrice}/mês.`}
            </p>
            <button onClick={() => navigate('/configuracoes/assinatura')} className="btn-primary w-full justify-center">
              <Zap className="w-4 h-4" />
              Regularizar assinatura
            </button>
          </>
        ) : (
          <p className="text-slate-500 text-sm leading-relaxed">
            O acesso da equipe está temporariamente indisponível. A assinatura da Clinic Pro precisa ser
            regularizada pelo médico ou especialista responsável.
          </p>
        )}
      </div>
    </div>
  )
}
