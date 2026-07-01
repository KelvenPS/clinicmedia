/**
 * MinhasSalas.tsx — Visão operacional da secretária
 * Exibe apenas as salas nas quais a secretária foi vinculada.
 * Permite gerenciar WhatsApp da sala conforme permissões concedidas.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, MapPin, Clock, Wifi, WifiOff, QrCode, RefreshCw,
  Phone, History, Shield, MessageSquare, ChevronRight, ArrowLeft,
  Users, CheckCircle, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { Room, RoomWhatsAppConnection, RoomPermissions } from '../types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MyRoom extends Room {
  myPermissions: RoomPermissions
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

function dayLabel(days: number[]) {
  return DAYS.filter(d => days.includes(d.value)).map(d => d.label).join(', ')
}

function addressLine(room: Room) {
  const parts = [room.logradouro, room.numero].filter(Boolean).join(', ')
  const city = room.cidade || ''
  return [parts, city].filter(Boolean).join(' — ') || null
}

// ─── WhatsApp Status ──────────────────────────────────────────────────────────

function WaBadge({ status }: { status?: string }) {
  if (!status || status === 'DISCONNECTED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
        <WifiOff className="w-3 h-3" /> Desconectado
      </span>
    )
  }
  const map: Record<string, { cls: string; label: string }> = {
    CONNECTED: { cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Conectado' },
    CONNECTING: { cls: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Conectando...' },
    RECONNECTING: { cls: 'text-blue-700 bg-blue-50 border-blue-200', label: 'Reconectando...' },
    QUARANTINED: { cls: 'text-red-700 bg-red-50 border-red-200', label: 'Quarentena' },
  }
  const m = map[status] ?? map.CONNECTED
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>
      <Wifi className="w-3 h-3" /> {m.label}
    </span>
  )
}

// ─── Painel de WhatsApp da sala ───────────────────────────────────────────────

function WhatsAppPanel({ room, perms }: { room: MyRoom; perms: RoomPermissions }) {
  const qc = useQueryClient()

  const { data: waStatus, isLoading } = useQuery<RoomWhatsAppConnection>({
    queryKey: ['my-room-wa', room.id],
    queryFn: () => api.get(`/my/rooms/${room.id}/whatsapp/status`).then(r => r.data),
    // Fast poll while connecting/reconnecting, slow poll otherwise so the page
    // stays live without hammering the server when idle or connected.
    refetchInterval: (query) => {
      const s = (query.state.data as RoomWhatsAppConnection | undefined)?.status
      if (s === 'CONNECTING' || s === 'RECONNECTING') return 2000
      return 15000
    },
  })

  const connectMutation = useMutation({
    mutationFn: () => api.post(`/my/rooms/${room.id}/whatsapp/connect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-room-wa', room.id] })
      toast.success('Aguardando QR Code...')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message || 'Erro ao conectar'),
  })

  const reconnectMutation = useMutation({
    mutationFn: () => api.post(`/my/rooms/${room.id}/whatsapp/reconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-room-wa', room.id] })
      toast.success('Reconectando...')
    },
    onError: () => toast.error('Erro ao reconectar'),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post(`/my/rooms/${room.id}/whatsapp/disconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-room-wa', room.id] })
      toast.success('WhatsApp desconectado')
    },
    onError: () => toast.error('Erro ao desconectar'),
  })

  if (!perms.canManageWhatsapp) {
    return (
      <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
        <Shield className="w-4 h-4" />
        <span>Você não tem permissão para gerenciar o WhatsApp desta sala.</span>
      </div>
    )
  }

  if (isLoading) return <div className="py-4 text-center text-slate-400 text-sm">Carregando...</div>

  return (
    <div className="space-y-4">
      {/* Status atual */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Status WhatsApp</span>
          <WaBadge status={waStatus?.status} />
        </div>
        {waStatus?.phoneNumber && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone className="w-4 h-4 text-slate-400" />
            {waStatus.displayName && <span className="font-medium">{waStatus.displayName}</span>}
            <span className="text-slate-400">·</span>
            <span>{waStatus.phoneNumber}</span>
          </div>
        )}
        {waStatus?.connectedAt && (
          <p className="text-xs text-slate-400">
            Conectado em {new Date(waStatus.connectedAt).toLocaleString('pt-BR')}
          </p>
        )}
        {waStatus?.lastSyncAt && (
          <p className="text-xs text-slate-400">
            Última sincronização: {new Date(waStatus.lastSyncAt).toLocaleString('pt-BR')}
          </p>
        )}
      </div>

      {/* Reconectando */}
      {waStatus?.status === 'RECONNECTING' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Reconectando WhatsApp...</p>
            <p className="text-xs text-blue-600 mt-0.5">A sessão está sendo restaurada automaticamente. Aguarde alguns instantes.</p>
          </div>
        </div>
      )}

      {/* QR Code */}
      {waStatus?.status === 'CONNECTING' && (
        <div className="flex flex-col items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <QrCode className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">Escaneie o QR Code no WhatsApp</p>
          {waStatus.qrCode && (!waStatus.qrCodeExpiresAt || new Date(waStatus.qrCodeExpiresAt) > new Date()) ? (
            <img src={waStatus.qrCode} alt="QR Code WhatsApp" className="w-48 h-48 rounded-xl border-4 border-white shadow-md" />
          ) : (
            <div className="w-48 h-48 flex flex-col items-center justify-center bg-white rounded-xl border-4 border-white shadow-md gap-2">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-amber-600 text-center">Gerando novo QR Code...</p>
            </div>
          )}
          <p className="text-xs text-amber-600 text-center">Abra o WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {perms.canConnectWhatsapp && (!waStatus || waStatus.status === 'DISCONNECTED') && (
          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Wifi className="w-4 h-4" />
            {connectMutation.isPending ? 'Conectando...' : 'Conectar WhatsApp'}
          </button>
        )}

        {perms.canReconnectWhatsapp && waStatus && waStatus.status !== 'DISCONNECTED' && (
          <button
            onClick={() => reconnectMutation.mutate()}
            disabled={reconnectMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${reconnectMutation.isPending ? 'animate-spin' : ''}`} />
            Reconectar
          </button>
        )}

        {perms.canDisconnectWhatsapp && waStatus?.status === 'CONNECTED' && (
          <button
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            <WifiOff className="w-4 h-4" />
            {disconnectMutation.isPending ? 'Desconectando...' : 'Desconectar'}
          </button>
        )}

        {!perms.canConnectWhatsapp && !perms.canReconnectWhatsapp && !perms.canDisconnectWhatsapp && (
          <p className="text-sm text-slate-400">Você pode visualizar o status, mas não tem permissão para alterar a conexão.</p>
        )}
      </div>
    </div>
  )
}

// ─── Detalhe da sala ──────────────────────────────────────────────────────────

type DetailTab = 'whatsapp' | 'historico'

function RoomDetail({ room, onBack }: { room: MyRoom; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('whatsapp')
  const perms = room.myPermissions

  const { data: history } = useQuery<{ logs: { id: string; action: string; description?: string; createdAt: string }[] }>({
    queryKey: ['my-room-history', room.id],
    queryFn: () => api.get(`/my/rooms/${room.id}/history`).then(r => r.data),
    enabled: tab === 'historico' && perms.canViewHistory,
  })

  const actionLabels: Record<string, string> = {
    WHATSAPP_CONNECT: '🔗 WhatsApp conectado',
    WHATSAPP_RECONNECT: '🔄 WhatsApp reconectado',
    WHATSAPP_DISCONNECT: '🔌 WhatsApp desconectado',
    ROOM_UPDATE: '✏️ Sala atualizada',
    ROOM_PERMISSIONS_UPDATE: '🔒 Permissões atualizadas',
  }

  const addr = addressLine(room)

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-slate-900">{room.name}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500">
            {addr && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {addr}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {room.startTime} – {room.endTime}</span>
            <span>{dayLabel(room.daysOfWeek)}</span>
          </div>
        </div>
        <WaBadge status={room.whatsappConnection?.status} />
      </div>

      {/* Resumo de permissões */}
      <div className="card bg-blue-50 border-blue-200 p-3">
        <p className="text-xs font-semibold text-blue-900 mb-2">Minhas permissões nesta sala</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'canViewSchedule', label: 'Ver agenda' },
            { key: 'canManageWhatsapp', label: 'Gerenciar WhatsApp' },
            { key: 'canConnectWhatsapp', label: 'Conectar WhatsApp' },
            { key: 'canSendMessages', label: 'Enviar mensagens' },
            { key: 'canUseTemplates', label: 'Usar templates' },
            { key: 'canViewHistory', label: 'Ver histórico' },
          ].map(({ key, label }) => {
            const has = perms[key as keyof RoomPermissions]
            return (
              <span key={key} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                has ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}>
                {has ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-100">
        {[
          { id: 'whatsapp' as DetailTab, label: 'WhatsApp', icon: Wifi, visible: perms.canManageWhatsapp },
          { id: 'historico' as DetailTab, label: 'Histórico', icon: History, visible: perms.canViewHistory },
        ].filter(t => t.visible).map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo das abas */}
      {tab === 'whatsapp' && <WhatsAppPanel room={room} perms={perms} />}

      {tab === 'historico' && (
        <div className="space-y-2">
          {!perms.canViewHistory ? (
            <div className="py-6 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" /> Sem permissão para ver histórico
            </div>
          ) : !history?.logs.length ? (
            <div className="py-6 text-center">
              <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Nenhuma ação registrada.</p>
            </div>
          ) : (
            history.logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{actionLabels[log.action] ?? log.action}</p>
                  {log.description && <p className="text-xs text-slate-500 mt-0.5">{log.description}</p>}
                </div>
                <p className="text-xs text-slate-400 flex-shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function MinhasSalas() {
  const [selectedRoom, setSelectedRoom] = useState<MyRoom | null>(null)

  const { data: rooms = [], isLoading } = useQuery<MyRoom[]>({
    queryKey: ['my-rooms'],
    queryFn: () => api.get('/my/rooms').then(r => r.data),
  })

  if (selectedRoom) {
    return (
      <div className="max-w-2xl space-y-4">
        <RoomDetail room={selectedRoom} onBack={() => setSelectedRoom(null)} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6 page-stagger">
      <div className="animate-stagger-1">
        <h1 className="page-title">Minhas Salas</h1>
        <p className="page-subtitle">Salas nas quais você está vinculada como responsável</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="card text-center py-12 animate-stagger-2">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3 animate-float" />
          <p className="text-slate-500 font-medium">Nenhuma sala vinculada</p>
          <p className="text-slate-400 text-sm mt-1">
            O médico responsável precisa vincular você a uma sala nas configurações.
          </p>
        </div>
      ) : (
        <div className="space-y-3 animate-stagger-2">
          {rooms.map(room => {
            const perms = room.myPermissions
            const waStatus = room.whatsappConnection?.status

            return (
              <div key={room.id}
                className={`card hover:border-blue-200 transition-colors cursor-pointer group ${!room.active ? 'opacity-60' : ''}`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{room.name}</p>
                      {!room.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativa</span>}
                      <WaBadge status={waStatus} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                      {addressLine(room) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {addressLine(room)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {room.startTime} – {room.endTime}
                      </span>
                      <span>{dayLabel(room.daysOfWeek)}</span>
                    </div>

                    {/* Mini badge de permissões */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {perms.canManageWhatsapp && (
                        <span className="flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-full">
                          <MessageSquare className="w-2.5 h-2.5" /> WhatsApp
                        </span>
                      )}
                      {perms.canViewSchedule && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">
                          <Users className="w-2.5 h-2.5" /> Agenda
                        </span>
                      )}
                      {perms.canUseTemplates && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">
                          <MessageSquare className="w-2.5 h-2.5" /> Templates
                        </span>
                      )}
                    </div>

                    {/* Botão conectar WhatsApp no card (se tiver permissão e estiver desconectado) */}
                    {perms.canConnectWhatsapp && (!waStatus || waStatus === 'DISCONNECTED') && (
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedRoom(room) }}
                        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <Wifi className="w-3 h-3" /> Conectar WhatsApp
                      </button>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 flex-shrink-0 mt-1 transition-colors" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card bg-blue-50 border-blue-200 text-sm text-blue-700 space-y-1 animate-stagger-3">
        <p className="font-semibold text-blue-900">Minhas Salas</p>
        <p>• Aqui você vê apenas as salas nas quais foi vinculada pelo médico responsável</p>
        <p>• As ações disponíveis dependem das permissões configuradas para você</p>
        <p>• Em caso de dúvidas, entre em contato com o responsável da clínica</p>
      </div>
    </div>
  )
}
