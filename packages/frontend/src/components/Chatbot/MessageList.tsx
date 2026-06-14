import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type Message, formatDateSeparator } from '../../types/chatbot'
import api from '../../lib/api'
import MessageBubble from './MessageBubble'

interface Props {
  conversationId: string
  isGroup?: boolean
}

function isSameDay(a: string, b: string) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

export default function MessageList({ conversationId, isGroup }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ['chatbot-messages', conversationId],
    queryFn: () => api.get(`/chatbot/conversations/${conversationId}/messages`).then(r => r.data),
    retry: 1,
    refetchInterval: 4000,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col gap-3 p-5 overflow-y-auto">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'} animate-pulse`}>
            <div className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-48 bg-slate-200' : 'w-36 bg-blue-200'}`} />
          </div>
        ))}
      </div>
    )
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
        <MessageSquare className="w-8 h-8 text-slate-400" />
        <p className="text-sm text-slate-500">Nenhuma mensagem ainda</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <div className="flex flex-col gap-2">
        {messages.map((msg, idx) => {
          const showDateSep = idx === 0 || !isSameDay(messages[idx - 1].timestamp, msg.timestamp)
          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] text-slate-400 font-medium px-2">
                    {formatDateSeparator(msg.timestamp)}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}
              <MessageBubble message={msg} isGroup={isGroup} />
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
