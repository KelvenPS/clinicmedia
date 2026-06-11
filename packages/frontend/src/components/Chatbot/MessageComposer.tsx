import { useRef, useState, useEffect } from 'react'
import { Send, Smile, Paperclip, ClipboardList, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'

interface Props {
  conversationId: string
  onMessageSent?: () => void
}

type ComposerTab = 'responder' | 'nota'

export default function MessageComposer({ conversationId, onMessageSent }: Props) {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<ComposerTab>('responder')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  // Reset input when conversation changes
  useEffect(() => {
    setInput('')
    setActiveTab('responder')
  }, [conversationId])

  // Send message mutation
  const sendMsgMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${conversationId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setInput('')
      onMessageSent?.()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    },
  })

  // Save internal note mutation
  const saveNoteMutation = useMutation({
    mutationFn: (notes: string) =>
      api.put(`/chatbot/conversations/${conversationId}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setInput('')
      onMessageSent?.()
      setActiveTab('responder') // Switch back to reply tab after saving
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    },
  })

  const isPending = sendMsgMutation.isPending || saveNoteMutation.isPending

  function handleSend() {
    const text = input.trim()
    if (!text || isPending) return

    if (activeTab === 'responder') {
      sendMsgMutation.mutate(text)
    } else {
      saveNoteMutation.mutate(text)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="bg-white border-t border-slate-200 px-6 py-4 flex-shrink-0">
      {/* Container matching Imagem 1 composer */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
        {/* Composer Tabs */}
        <div className="flex border-b border-slate-100 px-4 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('responder')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'responder'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Responder
          </button>
          <button
            onClick={() => setActiveTab('nota')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'nota'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Nota interna
          </button>
        </div>

        {/* Text Input area */}
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab === 'responder'
                ? 'Digite sua mensagem... (Enter para enviar)'
                : 'Digite uma observação interna... (Enter para salvar)'
            }
            rows={2}
            className="w-full px-2 py-1.5 bg-transparent border-0 rounded-none text-[13.5px] resize-none focus:outline-none focus:ring-0 text-slate-700 placeholder-slate-400"
            style={{ minHeight: '50px', maxHeight: '120px' }}
          />

          {/* Action Row - matches Imagem 1 */}
          <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100/60">
            <div className="flex items-center gap-1">
              {/* Attachment, Emoji, Template buttons */}
              <button
                type="button"
                title="Anexo"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Paperclip className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                title="Emoji"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Smile className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                title="Templates Rápidos"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <ClipboardList className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Send button (WhatsApp style green) */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="p-2 bg-[#10b981] hover:bg-[#0e9f6e] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex-shrink-0 shadow-sm transition-all flex items-center justify-center"
            >
              {isPending ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" />
              ) : (
                <Send className="w-4.5 h-4.5" fill="white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
