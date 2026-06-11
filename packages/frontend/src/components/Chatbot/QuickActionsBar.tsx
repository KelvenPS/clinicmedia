import { Send, FileText, Database, Power, Pencil, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Conversation } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  conversation: Conversation
  currentUserId: string
  onUpdate: (updated: Conversation) => void
}

export default function QuickActionsBar({ conversation, onUpdate }: Props) {
  const queryClient = useQueryClient()

  // Mutation to update conversation status (e.g. Encerrar)
  const updateMutation = useMutation({
    mutationFn: (patch: Partial<Conversation>) =>
      api.put(`/chatbot/conversations/${conversation.id}`, patch).then(r => r.data),
    onSuccess: (updated: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      onUpdate(updated)
    },
  })

  // Mutation to send a quick template message
  const sendMsgMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${conversation.id}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
    },
  })

  const isPending = updateMutation.isPending || sendMsgMutation.isPending

  const handleSendQuickMsg = (text: string) => {
    if (isPending) return
    sendMsgMutation.mutate(text)
  }

  const handleCloseChat = () => {
    if (isPending) return
    updateMutation.mutate({ status: 'CLOSED' })
  }

  return (
    <div className="bg-[#f4f7f6] border border-slate-200 rounded-xl px-5 py-3 mx-6 mb-4 flex items-center justify-between flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <span className="text-slate-800 font-bold text-xs flex-shrink-0">Ações rápidas</span>
        
        {/* Row of outline buttons matching Imagem 1 */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {/* Enviar saudação */}
          <button
            onClick={() => handleSendQuickMsg('Olá! Seja bem-vindo ao nosso atendimento. Como posso te ajudar hoje?')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex-shrink-0 shadow-xs"
          >
            <Send className="w-3 h-3 text-blue-500" />
            <span>Enviar saudação</span>
          </button>

          {/* Informar planos */}
          <button
            onClick={() => handleSendQuickMsg('Conheça os nossos planos disponíveis. Qual deles melhor se adapta às suas necessidades?')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex-shrink-0 shadow-xs"
          >
            <FileText className="w-3 h-3 text-emerald-500" />
            <span>Informar planos</span>
          </button>

          {/* Coletar dados */}
          <button
            onClick={() => handleSendQuickMsg('Para podermos prosseguir com o seu atendimento, por favor me informe o seu nome completo e CPF.')}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex-shrink-0 shadow-xs"
          >
            <Database className="w-3 h-3 text-indigo-500" />
            <span>Coletar dados</span>
          </button>

          {/* Encerrar atendimento */}
          <button
            onClick={handleCloseChat}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all flex-shrink-0 shadow-xs"
          >
            {isPending ? (
              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            ) : (
              <Power className="w-3 h-3 text-red-500" />
            )}
            <span>Encerrar atendimento</span>
          </button>
        </div>
      </div>

      {/* Pencil edit action on right */}
      <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg flex-shrink-0 transition-all ml-2">
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
