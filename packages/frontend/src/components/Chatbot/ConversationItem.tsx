import { useState } from 'react'
import { Bot, MessageCircle, Users } from 'lucide-react'
import {
  type Conversation,
  avatarGradient,
  getInitials,
  formatTime,
} from '../../types/chatbot'

interface Props {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
}

// Left border + background accent per category
const CATEGORY_ACCENT: Record<string, { border: string; selectedBg: string }> = {
  ATENDIMENTO: { border: 'border-l-blue-500',    selectedBg: 'bg-blue-50/60' },
  AGUARDANDO:  { border: 'border-l-amber-400',   selectedBg: 'bg-amber-50/60' },
  FILA:        { border: 'border-l-violet-500',  selectedBg: 'bg-violet-50/60' },
  GRUPOS:      { border: 'border-l-emerald-500', selectedBg: 'bg-emerald-50/60' },
}

const BADGE: Record<string, { text: string; cls: string }> = {
  ATENDIMENTO: { text: 'Atendimento', cls: 'bg-blue-100 text-blue-700' },
  AGUARDANDO:  { text: 'Aguardando',  cls: 'bg-amber-100 text-amber-700' },
  FILA:        { text: 'Fila',        cls: 'bg-violet-100 text-violet-700' },
  GRUPOS:      { text: 'Grupo',       cls: 'bg-emerald-100 text-emerald-700' },
  OPEN:        { text: 'Aberto',      cls: 'bg-emerald-100 text-emerald-700' },
  CLOSED:      { text: 'Finalizado',  cls: 'bg-slate-100 text-slate-500' },
  WAITING:     { text: 'Aguardando',  cls: 'bg-amber-100 text-amber-700' },
  BOT:         { text: 'Bot',         cls: 'bg-violet-100 text-violet-700' },
}

// Returns color class based on how long ago the last message was
function slaDotColor(lastMessageAt: string | null, hasUnread: boolean): string {
  if (!hasUnread || !lastMessageAt) return ''
  const mins = (Date.now() - new Date(lastMessageAt).getTime()) / 60000
  if (mins < 5)  return 'ring-2 ring-emerald-400'
  if (mins < 30) return 'ring-2 ring-amber-400'
  return 'ring-2 ring-rose-400'
}

export default function ConversationItem({ conversation, isSelected, onClick }: Props) {
  const [imgError, setImgError] = useState(false)

  const name = conversation.contactName ?? conversation.contactPhone
  const hasUnread = conversation.unreadCount > 0
  const isGroup = conversation.isGroup || conversation.category === 'GRUPOS'
  const isBot = !isGroup && (conversation.status === 'BOT' || conversation.category === 'FILA')
  const isAguardando = !isGroup && (conversation.category === 'AGUARDANDO' || conversation.status === 'WAITING')

  const accent = CATEGORY_ACCENT[conversation.category] ?? CATEGORY_ACCENT['ATENDIMENTO']
  const badge  = BADGE[conversation.category] ?? BADGE[conversation.status] ?? BADGE['OPEN']

  // For groups, prefix the preview with the sender's name
  const preview = isGroup && conversation.lastMessageSender
    ? `${conversation.lastMessageSender}: ${conversation.lastMessage ?? ''}`
    : (conversation.lastMessage ?? 'Sem mensagens')

  const showPhoto = !!conversation.contactAvatar && !imgError

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3.5 px-4 py-3.5 text-left border-b border-slate-100/80 transition-all border-l-[3px] ${
        isSelected
          ? `${accent.border} ${accent.selectedBg}`
          : 'border-l-transparent bg-white hover:bg-slate-50'
      }`}
    >
      {/* Avatar */}
      <div className={`relative flex-shrink-0 ${slaDotColor(conversation.lastMessageAt, hasUnread)} rounded-full`}>
        {showPhoto ? (
          <img
            src={conversation.contactAvatar!}
            alt={name}
            className="w-10 h-10 rounded-full object-cover shadow-sm"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center shadow-sm`}>
            <span className="text-white text-xs font-bold">{getInitials(name)}</span>
          </div>
        )}

        {/* Status badge overlay */}
        {isGroup ? (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
            <Users className="w-2 h-2 text-white" />
          </div>
        ) : isAguardando ? (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
        ) : isBot ? (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-violet-500 border-2 border-white flex items-center justify-center">
            <Bot className="w-2 h-2 text-white" />
          </div>
        ) : (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-slate-100">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-grow min-w-0">
        {/* Row 1: Name + time */}
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
            {name}
          </span>
          <span className="text-[11px] text-slate-400 font-medium flex-shrink-0 ml-2">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>

        {/* Row 2: Preview + badge + unread */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate flex-grow ${hasUnread ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
            {preview}
          </p>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold leading-none ${badge.cls}`}>
              {badge.text}
            </span>
            {hasUnread && (
              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[9px] bg-blue-600 text-white rounded-full font-bold leading-none">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
