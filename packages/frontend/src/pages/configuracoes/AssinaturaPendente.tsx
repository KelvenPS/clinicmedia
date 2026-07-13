import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import api from '../../lib/api'
import type { SubscriptionStatusResponse } from '../../hooks/useSubscription'

const POLL_INTERVAL_MS = 7_000

export default function AssinaturaPendente() {
  const navigate = useNavigate()

  const { data } = useQuery<SubscriptionStatusResponse>({
    queryKey: ['subscription-status-pending'],
    queryFn: () => api.get('/subscription/status').then(r => r.data),
    refetchInterval: POLL_INTERVAL_MS,
  })

  useEffect(() => {
    if (data?.accessAllowed) {
      navigate('/dashboard', { replace: true })
    }
  }, [data?.accessAllowed, navigate])

  return (
    <div className="max-w-md mx-auto text-center py-16 animate-page-enter">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Clock className="w-8 h-8 text-blue-500 animate-pulse" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900 mb-2">Aguardando confirmação do pagamento</h1>
      <p className="text-slate-500 text-sm leading-relaxed">
        Estamos aguardando a confirmação do seu pagamento. Assim que a Kiwify confirmar a compra,
        o acesso será liberado automaticamente — não é preciso atualizar a página.
      </p>
    </div>
  )
}
