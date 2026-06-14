import { useRef, useState, useEffect, useCallback } from 'react'
import { Send, Smile, Paperclip, ClipboardList, Loader2, AlertCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'

interface Props {
  conversationId: string
  onMessageSent?: () => void
}

type ComposerTab = 'responder' | 'nota'

export default function MessageComposer({ conversationId, onMessageSent }: Props) {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<ComposerTab>('responder')
  const [isTyping, setIsTyping] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setInput('')
    setActiveTab('responder')
    setIsTyping(false)
  }, [conversationId])

  // Typing indicator — debounced: send "composing" on type, "paused" 3s after stop
  const sendTyping = useCallback((typing: boolean) => {
    if (activeTab !== 'responder') return
    api.post(`/chatbot/conversations/${conversationId}/typing`, { typing }).catch(() => {})
  }, [conversationId, activeTab])

  function handleTypingStart() {
    if (!isTyping) {
      setIsTyping(true)
      sendTyping(true)
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false)
      sendTyping(false)
    }, 3000)
  }

  // Cleanup typing on unmount or conversation change
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (isTyping) sendTyping(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const sendMsgMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${conversationId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setInput('')
      setIsTyping(false)
      sendTyping(false)
      onMessageSent?.()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Erro ao enviar mensagem. Verifique a conexão WhatsApp.'
      toast.error(msg, { duration: 5000 })
    },
  })

  const saveNoteMutation = useMutation({
    mutationFn: (notes: string) =>
      api.put(`/chatbot/conversations/${conversationId}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setInput('')
      onMessageSent?.()
      setActiveTab('responder')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      toast.success('Nota interna salva')
    },
    onError: () => {
      toast.error('Erro ao salvar nota')
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
    if (e.target.value.trim()) handleTypingStart()
  }

  const isError = sendMsgMutation.isError

  return (
    <div className="bg-white border-t border-slate-200 px-6 py-4 flex-shrink-0">
      <div className={`border rounded-2xl overflow-hidden shadow-sm bg-white transition-colors ${isError ? 'border-rose-300' : 'border-slate-200'}`}>
        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-4 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('responder')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'responder' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Responder
          </button>
          <button
            onClick={() => setActiveTab('nota')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'nota' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Nota interna
          </button>

          {/* Typing indicator */}
          {isTyping && activeTab === 'responder' && (
            <div className="ml-auto flex items-center gap-1.5 pr-2 py-2.5">
              <div className="flex gap-0.5">
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[10px] text-slate-400">enviando...</span>
            </div>
          )}

          {activeTab === 'nota' && (
            <div className="ml-auto flex items-center pr-2 py-2.5">
              <span className="text-[10px] text-amber-500 font-medium">Visível apenas internamente</span>
            </div>
          )}
        </div>

        {/* Textarea */}
        <div className={`p-3 ${activeTab === 'nota' ? 'bg-amber-50/30' : ''}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              activeTab === 'responder'
                ? 'Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)'
                : 'Digite uma observação interna... (Enter para salvar)'
            }
            rows={2}
            className={`w-full px-2 py-1.5 bg-transparent border-0 rounded-none text-[13.5px] resize-none focus:outline-none focus:ring-0 placeholder-slate-400 ${
              activeTab === 'nota' ? 'text-amber-900' : 'text-slate-700'
            }`}
            style={{ minHeight: '50px', maxHeight: '120px' }}
          />

          {/* Error message */}
          {isError && (
            <div className="flex items-center gap-1.5 px-2 py-1 mb-2 text-rose-600 text-xs bg-rose-50 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Falha ao enviar. WhatsApp conectado?</span>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100/60">
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Anexo (em breve)"
                disabled
                className="p-1.5 text-slate-300 cursor-not-allowed rounded-lg"
              >
                <Paperclip className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                title="Emoji (em breve)"
                disabled
                className="p-1.5 text-slate-300 cursor-not-allowed rounded-lg"
              >
                <Smile className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                title="Templates"
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <ClipboardList className="w-4.5 h-4.5" />
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className={`p-2 text-white rounded-xl flex-shrink-0 shadow-sm transition-all flex items-center justify-center ${
                activeTab === 'nota'
                  ? 'bg-amber-500 hover:bg-amber-600 disabled:opacity-40'
                  : 'bg-[#10b981] hover:bg-[#0e9f6e] disabled:opacity-40'
              } disabled:cursor-not-allowed`}
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
