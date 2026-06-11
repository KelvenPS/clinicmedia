import { useState } from 'react'
import type { ReactNode } from 'react'
import { Search, MessageSquare, Clock, ListFilter, Users } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type Conversation, type ConversationCategory } from '../../types/chatbot'
import api from '../../lib/api'
import ConversationItem from './ConversationItem'

interface Props {
  selectedId: string | null
  onSelect: (conv: Conversation) => void
  category: ConversationCategory
  onCategoryChange: (cat: ConversationCategory) => void
}

const TABS: { key: ConversationCategory; label: string; icon: ReactNode }[] = [
  { key: 'TODOS', label: 'Todos', icon: <ListFilter className="w-3.5 h-3.5" /> },
  { key: 'ATENDIMENTO', label: 'Atend.', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: 'AGUARDANDO', label: 'Aguard.', icon: <Clock className="w-3.5 h-3.5" /> },
  { key: 'FILA', label: 'Fila', icon: <ListFilter className="w-3.5 h-3.5" /> },
  { key: 'GRUPOS', label: 'Grupos', icon: <Users className="w-3.5 h-3.5" /> },
]

export default function ConversationList({ selectedId, onSelect, category, onCategoryChange }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', category],
    queryFn: () =>
      api.get(`/chatbot/conversations${category !== 'TODOS' ? `?category=${category}` : ''}`).then(r => r.data),
    retry: 1,
    refetchInterval: 8000,
  })

  const readMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot/conversations/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] }),
  })

  const filtered = (conversations ?? []).filter(c =>
    (c.contactName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    c.contactPhone.includes(search)
  )

  const totalUnread = (conversations ?? []).reduce((acc, c) => acc + c.unreadCount, 0)

  function handleSelect(conv: Conversation) {
    onSelect(conv)
    if (conv.unreadCount > 0) readMutation.mutate(conv.id)
  }

  return (
    <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar contato ou número..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => onCategoryChange(tab.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
              category === tab.key
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'TODOS' && totalUnread > 0 && (
              <span className={`text-[10px] px-1 rounded-full font-bold ml-0.5 ${category === tab.key ? 'bg-white/30 text-white' : 'bg-blue-500 text-white'}`}>
                {totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3 border-b border-slate-100 animate-pulse">
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
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Nenhuma conversa</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {search ? 'Nenhum resultado para sua busca' : 'As conversas aparecerão aqui'}
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
