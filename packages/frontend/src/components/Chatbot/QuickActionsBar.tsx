import { Clock, CheckCircle2, UserCheck, ArrowRightCircle, RefreshCw, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Conversation } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  conversation: Conversation
  currentUserId: string
  onUpdate: (updated: Conversation) => void
}

export default function QuickActionsBar({ conversation, currentUserId, onUpdate }: Props) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<Conversation>) =>
      api.put(`/chatbot/conversations/${conversation.id}`, patch).then(r => r.data),
    onSuccess: (updated: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      onUpdate(updated)
    },
  })

  const isClosed = conversation.status === 'CLOSED'
  const isWaiting = conversation.status === 'WAITING' || conversation.category === 'AGUARDANDO'
  const isAssigned = conversation.assignedTo === currentUserId

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Assumir */}
      {!isAssigned && !isClosed && (
        <button
          onClick={() => updateMutation.mutate({ assignedTo: currentUserId })}
          disabled={updateMutation.isPending}
          title="Assumir atendimento"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all"
        >
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
          <span className="hidden sm:inline">Assumir</span>
        </button>
      )}

      {/* Transferir para fila */}
      {!isClosed && conversation.category !== 'FILA' && (
        <button
          onClick={() => updateMutation.mutate({ category: 'FILA' })}
          disabled={updateMutation.isPending}
          title="Transferir para fila"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-all"
        >
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightCircle className="w-3 h-3" />}
          <span className="hidden sm:inline">Fila</span>
        </button>
      )}

      {/* Aguardar */}
      {!isClosed && !isWaiting && (
        <button
          onClick={() => updateMutation.mutate({ category: 'AGUARDANDO', status: 'WAITING' })}
          disabled={updateMutation.isPending}
          title="Marcar como aguardando"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all"
        >
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          <span className="hidden sm:inline">Aguardar</span>
        </button>
      )}

      {/* Fechar */}
      {!isClosed && (
        <button
          onClick={() => updateMutation.mutate({ status: 'CLOSED' })}
          disabled={updateMutation.isPending}
          title="Finalizar atendimento"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all"
        >
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
          <span className="hidden sm:inline">Fechar</span>
        </button>
      )}

      {/* Reabrir */}
      {isClosed && (
        <button
          onClick={() => updateMutation.mutate({ status: 'OPEN', category: 'ATENDIMENTO' })}
          disabled={updateMutation.isPending}
          title="Reabrir atendimento"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all"
        >
          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="hidden sm:inline">Reabrir</span>
        </button>
      )}
    </div>
  )
}
