import { Menu, Bot, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { type ActivePanel, type ChatbotInstance } from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  activePanel: ActivePanel
  onOpenMobileSidebar: () => void
}

const PANEL_LABELS: Record<ActivePanel, string> = {
  atendimento: 'Atendimento',
  templates: 'Templates',
  fluxos: 'Criar Fluxo',
  configuracoes: 'Configurações',
}

export default function ChatTopBar({ activePanel, onOpenMobileSidebar }: Props) {
  const { data: instance, isLoading } = useQuery<ChatbotInstance>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
    refetchInterval: 30000,
  })

  const isConnected = instance?.status === 'CONNECTED'
  const isConnecting = instance?.status === 'CONNECTING'

  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center gap-3 flex-shrink-0 shadow-sm">
      <button
        onClick={onOpenMobileSidebar}
        className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-lg flex items-center justify-center">
          <Bot className="w-4 h-4 text-cyan-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{PANEL_LABELS[activePanel]}</h2>
          <p className="text-xs text-slate-400">Chatbot IA — ClinIQ Pro</p>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Instance status */}
        {!isLoading && (
          <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
            isConnected
              ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
              : isConnecting
              ? 'text-amber-600 bg-amber-50 border-amber-200'
              : 'text-slate-500 bg-slate-50 border-slate-200'
          }`}>
            {isConnected ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><Wifi className="w-3 h-3" /><span className="hidden sm:inline">Online</span></>
            ) : isConnecting ? (
              <><Loader2 className="w-3 h-3 animate-spin" /><span className="hidden sm:inline">Conectando</span></>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /><WifiOff className="w-3 h-3" /><span className="hidden sm:inline">Offline</span></>
            )}
          </span>
        )}
        <span className="text-xs bg-cyan-500/10 text-cyan-600 border border-cyan-200 px-2.5 py-1 rounded-full font-medium">
          BETA
        </span>
      </div>
    </div>
  )
}
