import { ArrowLeft, Phone, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { type Conversation, avatarGradient, getInitials } from '../../types/chatbot'
import AttendanceStatusBadge from './AttendanceStatusBadge'
import QuickActionsBar from './QuickActionsBar'

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
  currentUserId,
  showDetails,
  onBack,
  onToggleDetails,
  onUpdateConversation,
}: Props) {
  const name = conversation.contactName ?? conversation.contactPhone

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-4 py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
      {/* Back (mobile) */}
      <button
        onClick={onBack}
        className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
        <span className="text-white text-xs font-bold">{getInitials(name)}</span>
      </div>

      {/* Contact info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
          <AttendanceStatusBadge status={conversation.status} />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 truncate">{conversation.contactPhone}</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="hidden md:flex">
        <QuickActionsBar
          conversation={conversation}
          currentUserId={currentUserId}
          onUpdate={onUpdateConversation}
        />
      </div>

      {/* Toggle details panel */}
      <button
        onClick={onToggleDetails}
        title={showDetails ? 'Ocultar detalhes' : 'Ver detalhes do contato'}
        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg flex-shrink-0 transition-colors"
      >
        {showDetails
          ? <PanelRightClose className="w-4 h-4" />
          : <PanelRightOpen className="w-4 h-4" />
        }
      </button>
    </div>
  )
}
