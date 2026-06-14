import { MessageSquare } from 'lucide-react'
import { type Conversation } from '../../types/chatbot'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageComposer from './MessageComposer'
import QuickActionsBar from './QuickActionsBar'

interface Props {
  conversation: Conversation | null
  currentUserId: string
  showDetails: boolean
  onBack: () => void
  onToggleDetails: () => void
  onUpdateConversation: (updated: Conversation) => void
}

export default function ChatArea({
  conversation,
  currentUserId,
  showDetails,
  onBack,
  onToggleDetails,
  onUpdateConversation,
}: Props) {
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-20 h-20 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          <MessageSquare className="w-9 h-9 text-slate-350" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-600">Selecione uma conversa</p>
          <p className="text-sm text-slate-400 mt-1">Escolha um contato na lista para visualizar as mensagens</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[#efeae2] min-w-0 overflow-hidden relative">
      <ChatHeader
        conversation={conversation}
        currentUserId={currentUserId}
        showDetails={showDetails}
        onBack={onBack}
        onToggleDetails={onToggleDetails}
        onUpdateConversation={onUpdateConversation}
      />
      <MessageList conversationId={conversation.id} isGroup={conversation.isGroup} />
      <MessageComposer conversationId={conversation.id} />
      <QuickActionsBar
        conversation={conversation}
        currentUserId={currentUserId}
        onUpdate={onUpdateConversation}
      />
    </div>
  )
}
