import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, X, Calendar, CheckCircle, DollarSign, Info, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import type { Notification } from '../types'

const TYPE_ICONS: Record<string, React.ElementType> = {
  INFO: Info,
  SUCCESS: CheckCircle,
  WARNING: AlertTriangle,
  ALERT: AlertTriangle,
}

const TYPE_COLORS: Record<string, string> = {
  INFO: 'text-blue-600 bg-blue-50',
  SUCCESS: 'text-emerald-600 bg-emerald-50',
  WARNING: 'text-amber-600 bg-amber-50',
  ALERT: 'text-red-600 bg-red-50',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ['notifications-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data),
    refetchInterval: 30000,
  })

  const readOneMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const readAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClick = (n: Notification) => {
    if (!n.read) readOneMutation.mutate(n.id)
    if (n.link) { navigate(n.link); setOpen(false) }
  }

  const count = unread?.count ?? 0

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">
              Notificações {count > 0 && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full ml-1">{count} novas</span>}
            </h3>
            {count > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] || Info
                const colors = TYPE_COLORS[n.type] || TYPE_COLORS.INFO
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
                    onClick={() => handleClick(n)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colors}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-900 ${!n.read ? 'font-semibold' : ''}`}>{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />}
                    <button
                      onClick={e => { e.stopPropagation(); deleteMutation.mutate(n.id) }}
                      className="p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
