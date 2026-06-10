import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Zap, Star, Building2, Video } from 'lucide-react'
import { useSubscription } from '../../hooks/useSubscription'
import { PLAN_DISPLAY } from '../../types'

const FEATURE_LABELS: Record<string, { label: string; minPlan: string; icon: typeof Zap }> = {
  prontuario:  { label: 'Prontuário Eletrônico', minPlan: 'PRO',  icon: Zap },
  financeiro:  { label: 'Módulo Financeiro',     minPlan: 'PRO',  icon: Zap },
  avaliacoes:  { label: 'Avaliações',            minPlan: 'PRO',  icon: Zap },
  nota_fiscal: { label: 'Nota Fiscal',           minPlan: 'PRO',  icon: Zap },
  documentos:  { label: 'Documentos',            minPlan: 'PRO',  icon: Zap },
  chatbot:     { label: 'Chatbot IA',            minPlan: 'PLUS', icon: Star },
  whatsapp:    { label: 'WhatsApp',              minPlan: 'CLINIC', icon: Building2 },
  teleconsulta:{ label: 'Teleconsulta',          minPlan: 'TELECONSULTA', icon: Video },
}

interface FeatureGateProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { hasFeature, isTrialExpired, isPaidExpired, isLoading } = useSubscription()

  if (isLoading) return null

  if (isTrialExpired || isPaidExpired || !hasFeature(feature)) {
    return fallback ? <>{fallback}</> : <FeatureLockedScreen feature={feature} expired={isTrialExpired || isPaidExpired} />
  }

  return <>{children}</>
}

function FeatureLockedScreen({ feature, expired }: { feature: string; expired: boolean }) {
  const navigate = useNavigate()
  const meta = FEATURE_LABELS[feature] ?? { label: feature, minPlan: 'PRO', icon: Zap }
  const Icon = meta.icon

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center animate-page-enter">
      <div className="max-w-md">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-float">
          <Lock className="w-10 h-10 text-slate-400" />
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {expired ? 'Plano expirado' : `${meta.label} bloqueado`}
        </h2>

        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          {expired
            ? 'Seu período gratuito encerrou. Assine um plano para retomar o acesso a todas as funcionalidades.'
            : `${meta.label} está disponível a partir do plano ${PLAN_DISPLAY[meta.minPlan as keyof typeof PLAN_DISPLAY] ?? meta.minPlan}.`}
        </p>

        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 ${
            meta.minPlan === 'CLINIC' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
            meta.minPlan === 'PLUS'   ? 'bg-purple-50  border-purple-300  text-purple-700'  :
            meta.minPlan === 'TELECONSULTA' ? 'bg-cyan-50 border-cyan-300 text-cyan-700' :
                                             'bg-blue-50   border-blue-300   text-blue-700'
          }`}>
            <Icon className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {PLAN_DISPLAY[meta.minPlan as keyof typeof PLAN_DISPLAY] ?? meta.minPlan}
            </span>
          </div>
          <span className="text-slate-400 text-sm">ou superior</span>
        </div>

        <button
          onClick={() => navigate('/configuracoes/planos')}
          className="btn-primary px-8 py-3 text-base"
        >
          <Zap className="w-4 h-4" />
          Ver planos disponíveis
        </button>
      </div>
    </div>
  )
}
