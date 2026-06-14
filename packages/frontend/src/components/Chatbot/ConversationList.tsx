import { useState, type ReactNode } from 'react'
import { MessageSquare, Search, Users } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type Conversation, type ConversationCategory } from '../../types/chatbot'
import api from '../../lib/api'
import ConversationItem from './ConversationItem'

interface Props {
  selectedId: string | null
  onSelect: (conv: Conversation) => void
  category: ConversationCategory
  onCategoryChange: (cat: ConversationCategory) => void
  searchQuery: string
  onSearchQueryChange?: (query: string) => void
}

export default function ConversationList({
  selectedId,
  onSelect,
  category,
  onCategoryChange,
  searchQuery,
  onSearchQueryChange,
}: Props) {
  const queryClient = useQueryClient()
  const [showSearch, setShowSearch] = useState(false)

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', category],
    queryFn: () =>
      api.get(`/chatbot/conversations${category !== 'TODOS' ? `?category=${category}` : ''}`).then(r => r.data),
    retry: 1,
    refetchInterval: 8000,
  })

  // We query all conversations once to count categories
  const { data: allConversations } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', 'TODOS'],
    queryFn: () => api.get('/chatbot/conversations').then(r => r.data),
    retry: 1,
    refetchInterval: 15000,
  })

  const countTodos = allConversations?.filter(c => c.category !== 'GRUPOS').length ?? 0
  const countAguardando = allConversations?.filter(c => c.category === 'AGUARDANDO').length ?? 0
  const countFila = allConversations?.filter(c => c.category === 'FILA').length ?? 0
  const countGrupos = allConversations?.filter(c => c.category === 'GRUPOS').length ?? 0

  const readMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot/conversations/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] }),
  })

  const filtered = (conversations ?? []).filter(c => {
    // TODOS tab excludes groups (groups are only shown in GRUPOS tab)
    if (category === 'TODOS' && c.category === 'GRUPOS') return false
    const matchesSearch =
      (c.contactName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contactPhone.includes(searchQuery)
    return matchesSearch
  })

  function handleSelect(conv: Conversation) {
    onSelect(conv)
    if (conv.unreadCount > 0) readMutation.mutate(conv.id)
  }

  // Unread totals per tab for attention indicators
  const unreadAguardando = allConversations?.filter(c => c.category === 'AGUARDANDO' && c.unreadCount > 0).length ?? 0
  const unreadFila = allConversations?.filter(c => c.category === 'FILA' && c.unreadCount > 0).length ?? 0
  const unreadGrupos = allConversations?.filter(c => c.category === 'GRUPOS' && c.unreadCount > 0).length ?? 0

  const tabs: {
    key: ConversationCategory
    label: string
    count: number
    activeBorder: string
    activeText: string
    activeBadge: string
    alertCount?: number
    icon?: ReactNode
  }[] = [
    {
      key: 'TODOS',
      label: 'Todos',
      count: countTodos,
      activeBorder: 'border-blue-600',
      activeText: 'text-blue-600',
      activeBadge: 'bg-blue-50 text-blue-600',
    },
    {
      key: 'AGUARDANDO',
      label: 'Aguardando',
      count: countAguardando,
      activeBorder: 'border-amber-500',
      activeText: 'text-amber-600',
      activeBadge: 'bg-amber-50 text-amber-600',
      alertCount: unreadAguardando,
    },
    {
      key: 'FILA',
      label: 'Fila',
      count: countFila,
      activeBorder: 'border-violet-600',
      activeText: 'text-violet-600',
      activeBadge: 'bg-violet-50 text-violet-600',
      alertCount: unreadFila,
    },
    {
      key: 'GRUPOS',
      label: 'Grupos',
      count: countGrupos,
      activeBorder: 'border-emerald-500',
      activeText: 'text-emerald-600',
      activeBadge: 'bg-emerald-50 text-emerald-600',
      alertCount: unreadGrupos,
      icon: <Users className="w-3 h-3" />,
    },
  ]

  return (
    <div className="w-full lg:w-80 xl:w-[360px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      {/* Title Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[#1e293b] font-bold text-lg">Atendimentos</h2>
          {unreadAguardando > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full leading-none animate-pulse">
              {unreadAguardando} novo{unreadAguardando > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSearch(prev => !prev)}
          className={`p-1.5 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-all ${
            showSearch ? 'text-blue-600 bg-slate-50' : 'text-slate-500'
          }`}
        >
          <Search className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Search Input */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar contato..."
              value={searchQuery}
              onChange={e => onSearchQueryChange?.(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 placeholder-slate-400"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-150 flex-shrink-0 px-2">
        {tabs.map(tab => {
          const isActive = category === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onCategoryChange(tab.key)}
              className={`relative flex items-center gap-1.5 px-2.5 py-3 border-b-2 font-medium text-xs transition-all ${
                isActive
                  ? `${tab.activeBorder} ${tab.activeText} font-semibold`
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                isActive ? tab.activeBadge : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
              {/* Pulse dot for unread alerts on inactive tab */}
              {!isActive && (tab.alertCount ?? 0) > 0 && (
                <span className="absolute top-2 right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          )
        })}
      </div>

      {/* Conversation Cards List */}
      <div className="flex-grow overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-55 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-6 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-slate-350" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Nenhuma conversa</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {searchQuery ? 'Nenhum resultado para sua busca' : 'As conversas aparecerão aqui'}
              </p>
            </div>
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => handleSelect(conv)}
            />
          ))
        )}
      </div>
    </div>
  )
}
