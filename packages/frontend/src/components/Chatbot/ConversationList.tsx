import { MessageSquare, SlidersHorizontal, Search, MoreVertical } from 'lucide-react'
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
}

export default function ConversationList({
  selectedId,
  onSelect,
  category,
  onCategoryChange,
  searchQuery,
}: Props) {
  const queryClient = useQueryClient()

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

  const countTodos = allConversations?.length ?? 0
  const countAguardando = allConversations?.filter(c => c.category === 'AGUARDANDO').length ?? 0
  const countFila = allConversations?.filter(c => c.category === 'FILA').length ?? 0

  const readMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot/conversations/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] }),
  })

  const filtered = (conversations ?? []).filter(c =>
    (c.contactName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contactPhone.includes(searchQuery)
  )

  function handleSelect(conv: Conversation) {
    onSelect(conv)
    if (conv.unreadCount > 0) readMutation.mutate(conv.id)
  }

  const tabs: { key: ConversationCategory; label: string; count: number }[] = [
    { key: 'TODOS', label: 'Todos', count: countTodos },
    { key: 'AGUARDANDO', label: 'Aguardando', count: countAguardando },
    { key: 'FILA', label: 'Filas', count: countFila },
  ]

  return (
    <div className="w-full lg:w-80 xl:w-[360px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      {/* Title Header with Icons - matches Imagem 1 */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
        <h2 className="text-[#1e293b] font-bold text-lg">Atendimentos</h2>
        <div className="flex items-center gap-3.5 text-slate-500">
          <button className="hover:text-slate-800 transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button className="hover:text-slate-800 transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <button className="hover:text-slate-800 transition-colors">
            <MoreVertical className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Tabs list - matches Imagem 1 */}
      <div className="flex border-b border-slate-150 flex-shrink-0 px-4">
        {tabs.map(tab => {
          const isActive = category === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onCategoryChange(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 border-b-2 font-medium text-xs transition-all relative ${
                isActive
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none ${
                isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Conversation Cards List */}
      <div className="flex-1 overflow-y-auto">
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
