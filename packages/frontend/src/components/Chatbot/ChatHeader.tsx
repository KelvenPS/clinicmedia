import { ArrowLeft, Star, MoreVertical } from 'lucide-react'
import { type Conversation, avatarGradient, getInitials } from '../../types/chatbot'

interface Props {
  conversation: Conversation
  currentUserId: string
  showDetails: boolean
  onBack: () => void
  onToggleDetails: () => void
  onUpdateConversation: (updated: Conversation) => void
}

export default function ChatHeader({
  conversation,
  onBack,
  onToggleDetails,
}: Props) {
  const name = conversation.contactName ?? conversation.contactPhone

  // Determine badge styling matching Imagem 1
  let dotColor = 'bg-[#10b981]' // Aberto (green)
  let badgeText = 'Aberto'
  let badgeClass = 'bg-[#e6f7ed] text-[#10b981] border-[#bbf7d0]'

  if (conversation.status === 'WAITING' || conversation.category === 'AGUARDANDO') {
    dotColor = 'bg-[#d97706]'
    badgeText = 'Aguardando'
    badgeClass = 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]'
  } else if (conversation.status === 'CLOSED') {
    dotColor = 'bg-[#6b7280]'
    badgeText = 'Finalizado'
    badgeClass = 'bg-[#f0f2f5] text-[#6b7280] border-slate-200'
  } else if (conversation.status === 'BOT') {
    dotColor = 'bg-[#7c3aed]'
    badgeText = 'Bot'
    badgeClass = 'bg-[#f3e8ff] text-[#7c3aed] border-[#e9d5ff]'
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0 z-10">
      {/* Contact Profile and Status - matches Imagem 1 */}
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Back Button for mobile */}
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Clickable Header Info to toggle details panel */}
        <div
          onClick={onToggleDetails}
          className="flex items-center gap-3 cursor-pointer group"
        >
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-102`}>
            <span className="text-white text-xs font-bold">{getInitials(name)}</span>
          </div>

          {/* Contact Text Info */}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
              {name}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
              {conversation.contactPhone}
            </p>
          </div>
        </div>

        {/* Status Dropdown/Pill Badge */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-md text-[10px] font-bold ml-2 flex-shrink-0 ${badgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span>{badgeText}</span>
          <span className="opacity-60 text-[8px] ml-0.5">▼</span>
        </div>
      </div>

      {/* Header Actions - matches Imagem 1 */}
      <div className="flex items-center gap-2.5 text-slate-400">
        <button className="p-2 hover:text-amber-500 hover:bg-slate-50 rounded-full transition-all">
          <Star className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={onToggleDetails}
          className="p-2 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-all"
        >
          <MoreVertical className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  )
}
