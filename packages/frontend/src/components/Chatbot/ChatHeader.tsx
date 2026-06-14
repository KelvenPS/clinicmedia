import { useState, useEffect } from 'react'
import { ArrowLeft, Star, MoreVertical, Users, RefreshCw } from 'lucide-react'
import { type Conversation, avatarGradient, getInitials } from '../../types/chatbot'
import api from '../../lib/api'

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
  onUpdateConversation,
}: Props) {
  const name = conversation.contactName ?? conversation.contactPhone
  const isGroup = conversation.isGroup || conversation.category === 'GRUPOS'
  const [imgError, setImgError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Reset imgError when conversation changes
  useEffect(() => {
    setImgError(false)
  }, [conversation.id])

  // Trigger avatar refresh in background when conversation is opened
  useEffect(() => {
    if (!conversation.contactAvatar) {
      api.post(`/chatbot/conversations/${conversation.id}/refresh-avatar`)
        .then(r => {
          if (r.data.avatarUrl) {
            onUpdateConversation({ ...conversation, contactAvatar: r.data.avatarUrl })
          }
        })
        .catch(() => {})
    }
  // Only on conversation change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  async function handleRefreshAvatar() {
    setRefreshing(true)
    try {
      const r = await api.post(`/chatbot/conversations/${conversation.id}/refresh-avatar`)
      if (r.data.avatarUrl) {
        setImgError(false)
        onUpdateConversation({ ...conversation, contactAvatar: r.data.avatarUrl })
      }
    } catch { /* ignore */ } finally {
      setRefreshing(false)
    }
  }

  // Badge styling
  let dotColor = 'bg-[#10b981]'
  let badgeText = 'Aberto'
  let badgeClass = 'bg-[#e6f7ed] text-[#10b981] border-[#bbf7d0]'

  if (isGroup) {
    dotColor = 'bg-emerald-500'
    badgeText = 'Grupo'
    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  } else if (conversation.status === 'WAITING' || conversation.category === 'AGUARDANDO') {
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

  const showPhoto = !!conversation.contactAvatar && !imgError

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0 z-10">
      {/* Contact Profile */}
      <div className="flex items-center gap-3.5 min-w-0">
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div
          onClick={onToggleDetails}
          className="flex items-center gap-3 cursor-pointer group"
        >
          {/* Avatar with photo */}
          <div className="relative flex-shrink-0">
            {showPhoto ? (
              <img
                src={conversation.contactAvatar!}
                alt={name}
                className="w-10 h-10 rounded-full object-cover shadow-sm transition-transform group-hover:scale-105"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105`}>
                {isGroup ? (
                  <Users className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-white text-xs font-bold">{getInitials(name)}</span>
                )}
              </div>
            )}
            {/* Refresh avatar button (appears on hover) */}
            <button
              onClick={e => { e.stopPropagation(); handleRefreshAvatar() }}
              className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              title="Atualizar foto"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Contact info */}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
              {name}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
              {isGroup ? `Grupo · ${conversation.contactPhone}` : conversation.contactPhone}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 border rounded-md text-[10px] font-bold ml-2 flex-shrink-0 ${badgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span>{badgeText}</span>
          <span className="opacity-60 text-[8px] ml-0.5">▼</span>
        </div>
      </div>

      {/* Actions */}
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
