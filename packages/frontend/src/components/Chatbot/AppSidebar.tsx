import { ArrowLeft, Zap, MessageSquare, Clock, ListFilter, Users, ClipboardList, GitBranch, Settings, ChevronRight, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { type ActivePanel, type ConversationCategory, type Conversation } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  activePanel: ActivePanel
  onSelectPanel: (panel: ActivePanel) => void
  onSelectCategory: (cat: ConversationCategory) => void
  userName: string
  userRole: string
}

const TOOLS: { key: ActivePanel; icon: React.ReactNode; label: string }[] = [
  { key: 'templates', icon: <ClipboardList className="w-5 h-5" />, label: 'Templates' },
  { key: 'fluxos', icon: <GitBranch className="w-5 h-5" />, label: 'Criar Fluxo' },
  { key: 'configuracoes', icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
]

import type { ReactNode } from 'react'

export default function AppSidebar({ activePanel, onSelectPanel, onSelectCategory, userName, userRole }: Props) {
  const navigate = useNavigate()

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', 'TODOS'],
    queryFn: () => api.get('/chatbot/conversations').then(r => r.data),
    retry: 1,
    refetchInterval: 15000,
  })

  const totalUnread = (conversations ?? []).reduce((acc, c) => acc + c.unreadCount, 0)

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <aside className="w-56 bg-slate-900 flex flex-col h-full flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium mb-4 transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao sistema
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/30">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">ClinIQ</h1>
            <p className="text-cyan-400 text-xs font-medium">Chatbot IA</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-3">Atendimento</p>

        {/* Atendimento principal */}
        <button
          onClick={() => onSelectPanel('atendimento')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
            activePanel === 'atendimento'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-700/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <MessageSquare className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 text-left">Atendimento</span>
          {totalUnread > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              activePanel === 'atendimento' ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
            }`}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          {activePanel === 'atendimento' && <ChevronRight className="w-4 h-4 opacity-50" />}
        </button>

        {/* Sub-filtros */}
        <div className="pl-4 pt-0.5 space-y-0.5">
          {([
            { key: 'AGUARDANDO' as ConversationCategory, label: 'Aguardando', color: 'bg-amber-400', textColor: 'text-amber-400' },
            { key: 'FILA' as ConversationCategory, label: 'Fila', color: 'bg-violet-400', textColor: 'text-violet-400' },
            { key: 'GRUPOS' as ConversationCategory, label: 'Grupos', color: 'bg-emerald-400', textColor: 'text-emerald-400' },
          ] as { key: ConversationCategory; label: string; color: string; textColor: string }[]).map(sub => (
            <button
              key={sub.key}
              onClick={() => { onSelectPanel('atendimento'); onSelectCategory(sub.key) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${sub.color}`} />
              {sub.label}
            </button>
          ))}
        </div>

        {/* Ferramentas */}
        <div className="border-t border-white/10 mt-4 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-3">Ferramentas</p>
          {TOOLS.map(item => (
            <button
              key={item.key}
              onClick={() => onSelectPanel(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                activePanel === item.key
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-700/20'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {activePanel === item.key && <ChevronRight className="w-4 h-4 opacity-50" />}
            </button>
          ))}
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Bot className="w-3 h-3 text-cyan-400" />
              <span className="text-cyan-400 text-[10px]">{userRole}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
