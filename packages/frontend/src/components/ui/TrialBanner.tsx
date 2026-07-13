import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, X, Zap } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'

export function TrialBanner() {
  const { subscription, accessAllowed, canManageBilling } = useSubscription()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  const daysRemaining = subscription?.trialDaysRemaining
  const shouldShow = !dismissed
    && canManageBilling
    && accessAllowed
    && subscription?.status === 'TRIAL'
    && daysRemaining != null
    && daysRemaining <= 3

  if (!shouldShow) return null

  const isUrgent = daysRemaining === 0

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium flex-shrink-0 ${
      isUrgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
    }`}>
      {isUrgent
        ? <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
        : <Clock className="w-4 h-4 flex-shrink-0" />}

      <span className="flex-1 text-center">
        {isUrgent
          ? 'Último dia do período gratuito — assine hoje para não perder acesso'
          : `Seu período gratuito termina em ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''}`}
      </span>

      <button
        onClick={() => navigate('/configuracoes/assinatura')}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors text-xs font-bold whitespace-nowrap"
      >
        <Zap className="w-3 h-3" />
        Assinar por R$ {subscription?.monthlyPrice}/mês
      </button>

      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
        aria-label="Fechar aviso"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
