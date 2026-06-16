import { Menu, Bell, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type ActivePanel, type ChatbotInstance } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  activePanel: ActivePanel
  onOpenMobileSidebar: () => void
  userName: string
}

export default function ChatTopBar({
  onOpenMobileSidebar,
  userName,
}: Props) {
  const { data: instance } = useQuery<ChatbotInstance>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
    refetchInterval: 30000,
  })

  // Fetch real unread notification count
  const { data: unreadNotif } = useQuery<{ count: number }>({
    queryKey: ['unread-notifications'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data),
    retry: 1,
    refetchInterval: 10000, // Refetch every 10s
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
      {/* Mobile Menu Toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right Action Items - matches Imagem 1 */}
      <div className="flex items-center gap-4">
        {/* Connection/Status Dropdown Pill */}
        <div className="relative">
          <button
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              isConnected
                ? 'bg-[#eafaf1] text-[#0f7642] hover:bg-[#dff5e9] border-[#bbf7d0]'
                : isConnecting
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#10b981]' : isConnecting ? 'bg-[#f59e0b]' : 'bg-slate-400'}`} />
            <span>{isConnected ? 'Online' : isConnecting ? 'Conectando' : 'Offline'}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>

        {/* Notifications Icon with Dynamic Badge */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
          <Bell className="w-5 h-5" />
          {unreadNotif && unreadNotif.count > 0 && (
            <span className="absolute top-1 right-1 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
              {unreadNotif.count > 99 ? '99+' : unreadNotif.count}
            </span>
          )}
        </button>

        {/* User initials circle avatar */}
        <div className="w-8 h-8 bg-[#e2e8f0] border border-slate-300 rounded-full flex items-center justify-center flex-shrink-0 text-slate-600 font-bold text-xs shadow-sm">
          {initials || 'KP'}
        </div>
      </div>
    </header>
  )
}
