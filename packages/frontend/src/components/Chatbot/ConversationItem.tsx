import { MessageCircle } from 'lucide-react'
import {
  type Conversation,
  categoryColors,
  categoryLabels,
  avatarGradient,
  getInitials,
  formatTime,
} from '../../types/chatbot'
import AttendanceStatusBadge from './AttendanceStatusBadge'

interface Props {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
}

export default function ConversationItem({ conversation, isSelected, onClick }: Props) {
  const name = conversation.contactName ?? conversation.contactPhone
  const hasUnread = conversation.unreadCount > 0

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-3 text-left border-b border-slate-100 transition-all hover:bg-slate-50 ${
        isSelected ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : 'border-l-[3px] border-l-transparent'
      }`}
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
        <span className="text-white text-xs font-bold">{getInitials(name)}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
            {name}
          </span>
          <span className="text-[11px] text-slate-400 flex-shrink-0 ml-1">{formatTime(conversation.lastMessageAt)}</span>
        </div>

        <p className={`text-xs truncate mb-1 ${hasUnread ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
          {conversation.lastMessage ?? ''}
        </p>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            {/* WhatsApp channel indicator */}
            <span className="flex items-center gap-0.5">
              <MessageCircle className="w-3 h-3 text-emerald-500" />
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${categoryColors[conversation.category]}`}>
              {categoryLabels[conversation.category]}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <AttendanceStatusBadge status={conversation.status} />
            {hasUnread && (
              <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
