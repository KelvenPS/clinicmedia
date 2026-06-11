import { useRef } from 'react'
import { Send, Smile, Paperclip, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '../../lib/api'

interface Props {
  conversationId: string
  onMessageSent?: () => void
}

export default function MessageComposer({ conversationId, onMessageSent }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${conversationId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setInput('')
      onMessageSent?.()
      // Reset textarea height
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    },
  })

  function handleSend() {
    const content = input.trim()
    if (!content || sendMutation.isPending) return
    sendMutation.mutate(content)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    // Auto-expand up to 4 lines
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0">
      <div className="flex items-end gap-2">
        <button
          type="button"
          title="Emoji (em breve)"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg flex-shrink-0 transition-colors"
        >
          <Smile className="w-5 h-5" />
        </button>
        <button
          type="button"
          title="Anexo (em breve)"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg flex-shrink-0 transition-colors"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem... (Enter para enviar)"
            rows={1}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex-shrink-0 shadow-sm transition-all"
        >
          {sendMutation.isPending
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Send className="w-5 h-5" />
          }
        </button>
      </div>
    </div>
  )
}
