import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Edit2, MapPin, Clock, Users, CheckCircle, XCircle, Building2,
  Wifi, WifiOff, QrCode, RefreshCw, Shield, Phone, History,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { Room, DoctorSecretary, RoomSecretary, RoomWhatsAppConnection, RoomPermissions } from '../../types'
import Modal from '../../components/ui/Modal'

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

const ROOM_PERM_LABELS: { key: keyof RoomPermissions; label: string; description: string }[] = [
  { key: 'canViewSchedule', label: 'Ver agenda', description: 'Visualizar agendamentos da sala' },
  { key: 'canManageWhatsapp', label: 'Gerenciar WhatsApp', description: 'Acesso ao painel WhatsApp da sala' },
  { key: 'canConnectWhatsapp', label: 'Conectar WhatsApp', description: 'Iniciar nova conexão via QR Code' },
  { key: 'canReconnectWhatsapp', label: 'Reconectar WhatsApp', description: 'Reestabelecer conexão existente' },
  { key: 'canDisconnectWhatsapp', label: 'Desconectar WhatsApp', description: 'Encerrar sessão ativa' },
  { key: 'canSendMessages', label: 'Enviar mensagens', description: 'Enviar mensagens via WhatsApp da sala' },
  { key: 'canUseTemplates', label: 'Usar templates', description: 'Utilizar templates liberados para a sala' },
  { key: 'canUseAutomaticMessages', label: 'Mensagens automáticas', description: 'Ver e acionar mensagens automáticas' },
  { key: 'canViewHistory', label: 'Ver histórico', description: 'Visualizar histórico de ações da sala' },
]

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  cep: z.string().optional(),
  numero: z.string().optional(),
  cidade: z.string().optional(),
  daysOfWeek: z.array(z.number()).min(1, 'Selecione ao menos um dia'),
  startTime: z.string().min(1, 'Horário inicial obrigatório'),
  endTime: z.string().min(1, 'Horário final obrigatório'),
  secretaryIds: z.array(z.string()).optional(),
})

type FormData = z.infer<typeof schema>
type TabId = 'dados' | 'equipe' | 'permissoes' | 'whatsapp' | 'historico'

// ─── WhatsApp Status Badge ────────────────────────────────────────────────────

function WhatsAppBadge({ connection }: { connection?: Room['whatsappConnection'] }) {
  if (!connection) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <WifiOff className="w-3 h-3" /> Sem conexão
      </span>
    )
  }
  const colors: Record<string, string> = {
    CONNECTED: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    CONNECTING: 'text-amber-600 bg-amber-50 border-amber-200',
    RECONNECTING: 'text-blue-600 bg-blue-50 border-blue-200',
    DISCONNECTED: 'text-slate-500 bg-slate-50 border-slate-200',
    QUARANTINED: 'text-red-600 bg-red-50 border-red-200',
  }
  const labels: Record<string, string> = {
    CONNECTED: 'Conectado', CONNECTING: 'Conectando...', RECONNECTING: 'Reconectando...', DISCONNECTED: 'Desconectado', QUARANTINED: 'Quarentena',
  }
  const cls = colors[connection.status] ?? colors.DISCONNECTED
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {connection.status === 'CONNECTED' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {labels[connection.status] ?? connection.status}
      {connection.phoneNumber && ` · ${connection.phoneNumber}`}
    </span>
  )
}

// ─── Room Form (Dados + Secretárias) ─────────────────────────────────────────

function RoomForm({ room, secretaries, onSubmit, loading }: {
  room: Room | null
  secretaries: DoctorSecretary[]
  onSubmit: (d: FormData) => void
  loading: boolean
}) {
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: room?.name || '',
      logradouro: room?.logradouro || '',
      bairro: (room as any)?.bairro || '',
      cep: room?.cep || '',
      numero: room?.numero || '',
      cidade: room?.cidade || '',
      daysOfWeek: room?.daysOfWeek?.length ? room.daysOfWeek : [1, 2, 3, 4, 5],
      startTime: room?.startTime || '07:00',
      endTime: room?.endTime || '18:00',
      secretaryIds: room?.secretaries?.filter(s => s.active).map(s => s.secretaryId) || [],
    },
  })

  const watchDays = watch('daysOfWeek')
  const watchSecIds = watch('secretaryIds') || []

  const toggleDay = (day: number) => {
    const current = watchDays || []
    setValue('daysOfWeek', current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort())
  }

  const toggleSecretary = (id: string) => {
    setValue('secretaryIds', watchSecIds.includes(id) ? watchSecIds.filter(s => s !== id) : [...watchSecIds, id])
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="label">Nome da Sala / Local *</label>
        <input {...register('name')} className="input-field" placeholder="Ex: Consultório 1, Sala Norte..." />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      <div className="space-y-3">
        <label className="label flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-400" /> Endereço
        </label>
        <input {...register('logradouro')} className="input-field" placeholder="Logradouro (Rua, Av., Al...)" />
        <div className="grid grid-cols-2 gap-3">
          <input {...register('numero')} className="input-field" placeholder="Número" />
          <input {...register('bairro')} className="input-field" placeholder="Bairro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input {...register('cep')} className="input-field" placeholder="CEP" maxLength={9} />
          <input {...register('cidade')} className="input-field" placeholder="Cidade / UF" />
        </div>
      </div>

      <div>
        <label className="label">Dias de atendimento *</label>
        <div className="flex gap-2 flex-wrap mt-1">
          {DAYS.map(d => (
            <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                watchDays?.includes(d.value)
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-blue-300'
              }`}
            >{d.label}</button>
          ))}
        </div>
        {errors.daysOfWeek && <p className="text-xs text-red-500 mt-1">{errors.daysOfWeek.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Início do atendimento</label>
          <input {...register('startTime')} type="time" className="input-field" />
        </div>
        <div>
          <label className="label">Fim do atendimento</label>
          <input {...register('endTime')} type="time" className="input-field" />
        </div>
      </div>

      {secretaries.length > 0 && (
        <div>
          <label className="label">Secretárias vinculadas</label>
          <div className="space-y-2 mt-1">
            {secretaries.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={watchSecIds.includes(s.secretary.id)}
                  onChange={() => toggleSecretary(s.secretary.id)} className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{s.secretary.name}</p>
                  <p className="text-xs text-slate-500">{s.secretary.email}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Configure as permissões individuais na aba Permissões após salvar.</p>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : room ? 'Atualizar Sala' : 'Criar Sala'}
      </button>
    </form>
  )
}

// ─── Aba Permissões ───────────────────────────────────────────────────────────

function PermissionsTab({ room }: { room: Room }) {
  const qc = useQueryClient()

  const { data: roomUsers = [], isLoading } = useQuery<RoomSecretary[]>({
    queryKey: ['room-users', room.id],
    queryFn: () => api.get(`/rooms/${room.id}/users`).then(r => r.data),
  })

  const updatePermMutation = useMutation({
    mutationFn: ({ userId, perms }: { userId: string; perms: Partial<RoomPermissions> }) =>
      api.put(`/rooms/${room.id}/users/${userId}/permissions`, perms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-users', room.id] })
      toast.success('Permissões salvas!')
    },
    onError: () => toast.error('Erro ao salvar permissões'),
  })

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/rooms/${room.id}/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-users', room.id] })
      toast.success('Secretária desvinculada da sala')
    },
    onError: () => toast.error('Erro ao desvincular secretária'),
  })

  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">Carregando...</div>
  if (roomUsers.length === 0) {
    return (
      <div className="py-8 text-center">
        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Nenhuma secretária vinculada a esta sala.</p>
        <p className="text-slate-400 text-xs mt-1">Vincule secretárias na aba Dados e gerencie as permissões aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {roomUsers.filter(u => u.active).map(u => (
        <div key={u.id} className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4 bg-slate-50">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 font-bold text-sm">
                {u.secretary.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm">{u.secretary.name}</p>
              <p className="text-xs text-slate-500">{u.secretary.email}</p>
            </div>
            <button
              onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <Shield className="w-3.5 h-3.5" />
              Permissões
              {expandedUser === u.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {expandedUser === u.id && (
            <div className="p-4 border-t border-slate-100 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Permissões para esta sala</p>
              <div className="grid grid-cols-1 gap-2">
                {ROOM_PERM_LABELS.map(({ key, label, description }) => {
                  const current = u[key as keyof RoomSecretary] as boolean
                  return (
                    <label key={key} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={current}
                        onChange={(e) => updatePermMutation.mutate({ userId: u.secretaryId, perms: { [key]: e.target.checked } })}
                        className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500">{description}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => removeUserMutation.mutate(u.secretaryId)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Remover desta sala
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Aba WhatsApp ─────────────────────────────────────────────────────────────

function WhatsAppTab({ room }: { room: Room }) {
  const qc = useQueryClient()

  const { data: waStatus, isLoading } = useQuery<RoomWhatsAppConnection>({
    queryKey: ['room-wa-status', room.id],
    queryFn: () => api.get(`/rooms/${room.id}/whatsapp/status`).then(r => r.data),
    refetchInterval: (query) => {
      const s = (query.state.data as RoomWhatsAppConnection | undefined)?.status
      if (s === 'CONNECTING' || s === 'RECONNECTING') return 2000
      return 15000
    },
  })

  const connectMutation = useMutation({
    mutationFn: () => api.post(`/rooms/${room.id}/whatsapp/connect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-wa-status', room.id] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Aguardando QR Code...')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message || 'Erro ao conectar'),
  })

  const reconnectMutation = useMutation({
    mutationFn: () => api.post(`/rooms/${room.id}/whatsapp/reconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-wa-status', room.id] })
      toast.success('Reconectando...')
    },
    onError: () => toast.error('Erro ao reconectar'),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post(`/rooms/${room.id}/whatsapp/disconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-wa-status', room.id] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('WhatsApp desconectado')
    },
    onError: () => toast.error('Erro ao desconectar'),
  })

  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">Carregando...</div>

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Status da conexão</p>
          <WhatsAppBadge connection={waStatus as Room['whatsappConnection']} />
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
            <img src={waStatus.qrCode} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border-4 border-white shadow-md" />
          ) : (
            <div className="w-52 h-52 flex flex-col items-center justify-center bg-white rounded-xl border-4 border-white shadow-md gap-2">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-amber-600 text-center">Gerando novo QR Code...</p>
            </div>
          )}
          <p className="text-xs text-amber-600">Abra o WhatsApp → Menu → Dispositivos vinculados → Vincular dispositivo</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {(!waStatus || waStatus.status === 'DISCONNECTED') && (
          <button
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <Wifi className="w-4 h-4" />
            {connectMutation.isPending ? 'Conectando...' : 'Conectar WhatsApp'}
          </button>
        )}

        {waStatus && waStatus.status !== 'DISCONNECTED' && (
          <button
            onClick={() => reconnectMutation.mutate()}
            disabled={reconnectMutation.isPending}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${reconnectMutation.isPending ? 'animate-spin' : ''}`} />
            Reconectar
          </button>
        )}

        {waStatus?.status === 'CONNECTED' && (
          <button
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            <WifiOff className="w-4 h-4" />
            {disconnectMutation.isPending ? 'Desconectando...' : 'Desconectar'}
          </button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold text-blue-900">Como funciona</p>
        <p>• Cada sala pode ter sua própria conexão WhatsApp independente</p>
        <p>• Mensagens automáticas serão enviadas pelo número desta sala</p>
        <p>• Gerencie na aba Permissões quem pode conectar/desconectar</p>
      </div>
    </div>
  )
}

// ─── Aba Histórico ────────────────────────────────────────────────────────────

function HistoryTab({ room }: { room: Room }) {
  const { data, isLoading } = useQuery<{ logs: { id: string; action: string; description?: string; createdAt: string }[]; total: number }>({
    queryKey: ['room-audit', room.id],
    queryFn: () => api.get(`/rooms/${room.id}/audit`).then(r => r.data),
  })

  const actionLabels: Record<string, string> = {
    ROOM_CREATE: '🏠 Sala criada',
    ROOM_UPDATE: '✏️ Sala atualizada',
    WHATSAPP_CONNECT: '🔗 WhatsApp conectado',
    WHATSAPP_RECONNECT: '🔄 WhatsApp reconectado',
    WHATSAPP_DISCONNECT: '🔌 WhatsApp desconectado',
    ROOM_PERMISSIONS_UPDATE: '🔒 Permissões atualizadas',
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400 text-sm">Carregando...</div>
  if (!data?.logs.length) {
    return (
      <div className="py-8 text-center">
        <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Nenhuma ação registrada ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {data.logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">{actionLabels[log.action] ?? log.action}</p>
            {log.description && <p className="text-xs text-slate-500 mt-0.5">{log.description}</p>}
          </div>
          <p className="text-xs text-slate-400 flex-shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Modal de edição com abas ─────────────────────────────────────────────────

function RoomDetailModal({ room, secretaries, onClose }: {
  room: Room
  secretaries: DoctorSecretary[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabId>('dados')

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => api.put(`/rooms/${room.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Sala atualizada!')
      setTab('dados')
    },
    onError: () => toast.error('Erro ao atualizar sala'),
  })

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'dados', label: 'Dados', icon: Building2 },
    { id: 'equipe', label: 'Equipe', icon: Users },
    { id: 'permissoes', label: 'Permissões', icon: Shield },
    { id: 'whatsapp', label: 'WhatsApp', icon: Wifi },
    { id: 'historico', label: 'Histórico', icon: History },
  ]

  return (
    <Modal isOpen onClose={onClose} title={`Sala: ${room.name}`} size="lg">
      <div className="flex gap-1 mb-5 border-b border-slate-100 -mx-1 px-1 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'dados' && (
        <RoomForm room={room} secretaries={secretaries} onSubmit={d => saveMutation.mutate(d)} loading={saveMutation.isPending} />
      )}
      {tab === 'equipe' && <PermissionsTab room={room} />}
      {tab === 'permissoes' && <PermissionsTab room={room} />}
      {tab === 'whatsapp' && <WhatsAppTab room={room} />}
      {tab === 'historico' && <HistoryTab room={room} />}
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Salas() {
  const qc = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [detailRoom, setDetailRoom] = useState<Room | null>(null)

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then(r => r.data),
  })

  const { data: team = [] } = useQuery<DoctorSecretary[]>({
    queryKey: ['team'],
    queryFn: () => api.get('/team').then(r => r.data),
  })

  const secretaries = team.filter(t => t.active)

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/rooms', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Sala criada!')
      setCreateModalOpen(false)
    },
    onError: () => toast.error('Erro ao criar sala'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/rooms/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Status alterado')
    },
  })

  const dayLabel = (days: number[]) =>
    DAYS.filter(d => days.includes(d.value)).map(d => d.label).join(', ')

  const addressLine = (room: Room) => {
    const parts = [room.logradouro, room.numero, (room as any).bairro].filter(Boolean).join(', ')
    const city = room.cidade || ''
    return [parts, city].filter(Boolean).join(' — ') || null
  }

  return (
    <div className="max-w-3xl space-y-6 page-stagger">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Clínica</h1>
          <p className="page-subtitle">Configure locais, equipe, permissões e WhatsApp por sala</p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" /> Nova Sala
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="card text-center py-12 animate-stagger-2">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3 animate-float" />
          <p className="text-slate-400">Nenhuma sala cadastrada</p>
          <button onClick={() => setCreateModalOpen(true)} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
            Criar primeira sala
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <div key={room.id} className={`card flex items-start gap-4 ${!room.active ? 'opacity-60' : ''}`}>
              <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900">{room.name}</p>
                  {!room.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativa</span>}
                  <WhatsAppBadge connection={room.whatsappConnection} />
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                  {addressLine(room) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {addressLine(room)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {room.startTime} – {room.endTime}
                  </span>
                  <span>{dayLabel(room.daysOfWeek)}</span>
                  {room.secretaries && room.secretaries.filter(s => s.active).length > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Users className="w-3 h-3" />
                      {room.secretaries.filter(s => s.active).map(s => s.secretary.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setDetailRoom(room)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Configurar sala"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate(room.id)}
                  className={`p-1.5 rounded-lg transition-colors ${room.active
                    ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                  }`}
                  title={room.active ? 'Desativar' : 'Ativar'}
                >
                  {room.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card bg-blue-50 border-blue-200 text-sm text-blue-700 space-y-1">
        <p className="font-semibold text-blue-900">Como funciona</p>
        <p>• Cada sala tem seus próprios dias, horários, endereço e WhatsApp</p>
        <p>• Vincule secretárias e configure permissões individuais por sala</p>
        <p>• Mensagens automáticas respeitam a conexão WhatsApp da sala</p>
      </div>

      {/* Modal criar sala */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nova Sala de Atendimento" size="lg">
        <RoomForm room={null} secretaries={secretaries} onSubmit={d => createMutation.mutate(d)} loading={createMutation.isPending} />
      </Modal>

      {/* Modal detalhes/edição com abas */}
      {detailRoom && (
        <RoomDetailModal
          room={detailRoom}
          secretaries={secretaries}
          onClose={() => setDetailRoom(null)}
        />
      )}
    </div>
  )
}
