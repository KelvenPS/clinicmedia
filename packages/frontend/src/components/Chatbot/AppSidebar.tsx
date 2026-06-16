import { Zap, ArrowLeft, MessageSquare, Clock, ListFilter, Users, ClipboardList, GitBranch, Settings, ChevronDown, UsersRound, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { type ActivePanel, type ConversationCategory, type Conversation, type ChatbotInstance } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  activePanel: ActivePanel
  onSelectPanel: (panel: ActivePanel) => void
  onSelectCategory: (cat: ConversationCategory) => void
  userName: string
  userRole: string
  userSpecialty?: string | null
}

export default function AppSidebar({
  activePanel,
  onSelectPanel,
  onSelectCategory,
  userName,
  userRole,
  userSpecialty,
}: Props) {
  const navigate = useNavigate()

  const { data: instance } = useQuery<ChatbotInstance | null>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
    refetchInterval: 10_000,
  })
  const isConnected = instance?.status === 'CONNECTED'

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['chatbot-conversations', 'TODOS'],
    queryFn: () => api.get('/chatbot/conversations').then(r => r.data),
    retry: 1,
    refetchInterval: 15000,
  })

  // Calculate counts based on categories
  const countAtendimento = (conversations ?? []).filter(c => c.category === 'ATENDIMENTO').length
  const countAguardando = (conversations ?? []).filter(c => c.category === 'AGUARDANDO').length
  const countFila = (conversations ?? []).filter(c => c.category === 'FILA').length
  const countGrupos = (conversations ?? []).filter(c => c.category === 'GRUPOS').length

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <aside className="w-60 bg-[#0b1420] flex flex-col h-full flex-shrink-0 text-slate-300">
      {/* Top Header / Logo + Voltar ao Menu Principal */}
      <div className="px-6 py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm tracking-wide leading-tight">ChatBot IA</h1>
              <p className="text-slate-500 text-xs font-normal">Plataforma</p>
            </div>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Back Button matching "Voltar ao Menu Principal" */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg text-xs font-semibold transition-all duration-150 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao Menu Principal</span>
        </button>

        {!isConnected && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <WifiOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-[10.5px] text-amber-300 leading-tight">
              WhatsApp desconectado — exibindo histórico
            </p>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {/* Categories / Lists */}
        <button
          onClick={() => {
            onSelectPanel('atendimento')
            onSelectCategory('ATENDIMENTO')
          }}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
            activePanel === 'atendimento' && (conversations ?? []).length > 0 && countAtendimento > 0
              ? 'text-white'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <MessageSquare className="w-5 h-5 flex-shrink-0" />
            <span>Atendimentos</span>
          </div>
          {countAtendimento > 0 && (
            <span className="bg-[#10b981] text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {countAtendimento}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            onSelectPanel('atendimento')
            onSelectCategory('AGUARDANDO')
          }}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <div className="flex items-center gap-3.5">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <span>Aguardando</span>
          </div>
          {countAguardando > 0 && (
            <span className="bg-[#10b981] text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {countAguardando}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            onSelectPanel('atendimento')
            onSelectCategory('FILA')
          }}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <div className="flex items-center gap-3.5">
            <ListFilter className="w-5 h-5 flex-shrink-0" />
            <span>Filas</span>
          </div>
          {countFila > 0 && (
            <span className="bg-[#f59e0b] text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {countFila}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            onSelectPanel('atendimento')
            onSelectCategory('GRUPOS')
          }}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <div className="flex items-center gap-3.5">
            <UsersRound className="w-5 h-5 flex-shrink-0" />
            <span>Grupos</span>
          </div>
          {countGrupos > 0 && (
            <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {countGrupos}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            onSelectPanel('atendimento')
            onSelectCategory('TODOS')
          }}
          className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <Users className="w-5 h-5 flex-shrink-0" />
          <span className="flex-grow text-left">Todos</span>
        </button>

        {/* Ferramentas Group */}
        <div className="pt-6 border-t border-white/5 mt-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-4 mb-3">Ferramentas</p>
          
          <button
            onClick={() => onSelectPanel('templates')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
              activePanel === 'templates'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <ClipboardList className="w-5 h-5 flex-shrink-0" />
            <span className="flex-grow text-left">Templates</span>
          </button>

          <button
            onClick={() => onSelectPanel('fluxos')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
              activePanel === 'fluxos'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <GitBranch className="w-5 h-5 flex-shrink-0" />
            <span className="flex-grow text-left">Criar Fluxo</span>
          </button>

          <button
            onClick={() => onSelectPanel('configuracoes')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 ${
              activePanel === 'configuracoes'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className="flex-grow text-left">Configurações</span>
          </button>
        </div>
      </nav>

      {/* User Footer Profile */}
      <div className="border-t border-white/5 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-600 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-xs shadow-md shadow-cyan-600/10">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">{userName}</p>
            <p className="text-slate-500 text-[10px] font-normal truncate mt-0.5">{userSpecialty || userRole || 'Médico'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
