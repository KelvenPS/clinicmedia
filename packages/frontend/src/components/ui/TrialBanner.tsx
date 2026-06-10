import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X, Zap, Clock } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSubscription } from '../../hooks/useSubscription'

export function TrialBanner() {
  const { isTrial, isTrialExpired, isPaidExpired, trialDaysLeft, subscription, daysUntilRenewal } = useSubscription()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  // Show for trial with ≤5 days left, expired trial, or expired paid plan
  const shouldShow = !dismissed && (
    isTrialExpired ||
    isPaidExpired ||
    (isTrial && trialDaysLeft <= 5)
  )

  if (!shouldShow) return null

  const isUrgent = isTrialExpired || isPaidExpired || trialDaysLeft <= 2

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium flex-shrink-0 ${
      isUrgent
        ? 'bg-red-600 text-white'
        : 'bg-amber-500 text-white'
    }`}>
      {isUrgent ? (
        <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
      ) : (
        <Clock className="w-4 h-4 flex-shrink-0" />
      )}

      <span className="flex-1 text-center">
        {isTrialExpired
          ? 'Período gratuito encerrado — assine um plano para continuar'
          : isPaidExpired
            ? `Assinatura expirada em ${subscription?.currentPeriodEnd ? format(new Date(subscription.currentPeriodEnd), "d MMM", { locale: ptBR }) : ''} — renove para não perder acesso`
            : trialDaysLeft === 0
              ? 'Último dia do período gratuito — assine hoje para não perder acesso'
              : `${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''} restante${trialDaysLeft !== 1 ? 's' : ''} no período gratuito`}
      </span>

      <button
        onClick={() => navigate('/configuracoes/planos')}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors text-xs font-bold whitespace-nowrap"
      >
        <Zap className="w-3 h-3" />
        Ver planos
      </button>

      {!isTrialExpired && !isPaidExpired && (
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
          aria-label="Fechar aviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
