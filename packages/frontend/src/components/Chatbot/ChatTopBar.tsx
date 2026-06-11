import { Menu, Bell, ChevronDown, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type ActivePanel, type ChatbotInstance } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  activePanel: ActivePanel
  onOpenMobileSidebar: () => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  userName: string
}

export default function ChatTopBar({
  activePanel,
  onOpenMobileSidebar,
  searchQuery,
  onSearchQueryChange,
  userName,
}: Props) {
  const { data: instance } = useQuery<ChatbotInstance>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
    refetchInterval: 30000,
  })

  const isConnected = instance?.status === 'CONNECTED'
  const isConnecting = instance?.status === 'CONNECTING'

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0 z-10">
      {/* Mobile Menu Toggle & Search Bar Area */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Bar - matches Imagem 1 */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar atendimentos, contatos..."
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Right Action Items - matches Imagem 1 */}
      <div className="flex items-center gap-4">
        {/* Connection/Status Dropdown Pill */}
        <div className="relative">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-[#eafaf1] text-[#0f7642] hover:bg-[#dff5e9] border border-[#bbf7d0] rounded-full text-xs font-semibold transition-all">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#10b981]' : isConnecting ? 'bg-[#f59e0b]' : 'bg-slate-400'}`} />
            <span>Online</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>

        {/* Notifications Icon with Badge */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
            3
          </span>
        </button>

        {/* User initials circle avatar */}
        <div className="w-8 h-8 bg-[#e2e8f0] border border-slate-300 rounded-full flex items-center justify-center flex-shrink-0 text-slate-600 font-bold text-xs shadow-sm">
          {initials || 'KP'}
        </div>
      </div>
    </header>
  )
}
