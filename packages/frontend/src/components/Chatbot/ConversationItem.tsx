import { MessageCircle } from 'lucide-react'
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

export default function ConversationItem({ conversation, isSelected, onClick }: Props) {
  const name = conversation.contactName ?? conversation.contactPhone
  const hasUnread = conversation.unreadCount > 0

  // Determine badge label and classes
  let badgeText = 'Aberto'
  let badgeClass = 'bg-[#e6f7ed] text-[#10b981]' // Aberto (green)

  if (conversation.status === 'WAITING' || conversation.category === 'AGUARDANDO') {
    badgeText = 'Aguardando'
    badgeClass = 'bg-[#fffbeb] text-[#d97706]' // Aguardando (amber)
  } else if (conversation.status === 'CLOSED') {
    badgeText = 'Finalizado'
    badgeClass = 'bg-[#f0f2f5] text-[#6b7280]' // Finalizado (grey/slate)
  } else if (conversation.status === 'BOT') {
    badgeText = 'Bot'
    badgeClass = 'bg-[#f3e8ff] text-[#7c3aed]' // Bot (violet)
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3.5 px-4 py-4 text-left border-b border-slate-100 transition-all ${
        isSelected
          ? 'bg-[#f4f7f6] border-l-[3px] border-l-[#10b981]'
          : 'bg-white hover:bg-slate-50 border-l-[3px] border-l-transparent'
      }`}
    >
      {/* Avatar with WhatsApp Badge overlay */}
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center shadow-sm`}>
          <span className="text-white text-xs font-bold">{getInitials(name)}</span>
        </div>
        
        {/* WhatsApp Icon Overlay */}
        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-slate-100">
          <MessageCircle className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
        </div>
      </div>

      {/* Info column */}
      <div className="flex-grow min-w-0">
        {/* Row 1: Name and Time */}
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm truncate font-semibold text-slate-800 ${hasUnread ? 'text-slate-900 font-bold' : ''}`}>
            {name}
          </span>
          <span className="text-[11px] text-slate-400 font-medium flex-shrink-0 ml-1">
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>

        {/* Row 2: Message preview and Status badge */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate text-slate-500 flex-grow ${hasUnread ? 'text-slate-800 font-medium' : ''}`}>
            {conversation.lastMessage ?? 'Sem mensagens'}
          </p>
          
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${badgeClass}`}>
              {badgeText}
            </span>
            {hasUnread && (
              <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[16px] text-center leading-none">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
