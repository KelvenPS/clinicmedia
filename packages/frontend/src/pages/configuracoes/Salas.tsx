import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, MapPin, Clock, Users, CheckCircle, XCircle, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { Room, DoctorSecretary } from '../../types'
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

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  logradouro: z.string().optional(),
  cep: z.string().optional(),
  numero: z.string().optional(),
  cidade: z.string().optional(),
  daysOfWeek: z.array(z.number()).min(1, 'Selecione ao menos um dia'),
  startTime: z.string().min(1, 'Horário inicial obrigatório'),
  endTime: z.string().min(1, 'Horário final obrigatório'),
  secretaryIds: z.array(z.string()).optional(),
})

type FormData = z.infer<typeof schema>

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
      cep: room?.cep || '',
      numero: room?.numero || '',
      cidade: room?.cidade || '',
      daysOfWeek: room?.daysOfWeek || [1, 2, 3, 4, 5],
      startTime: room?.startTime || '07:00',
      endTime: room?.endTime || '18:00',
      secretaryIds: room?.secretaries?.map(s => s.secretaryId) || [],
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

      {/* Address fields */}
      <div className="space-y-3">
        <label className="label flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          Endereço
        </label>
        <div>
          <input
            {...register('logradouro')}
            className="input-field"
            placeholder="Logradouro (Rua, Av., Al...)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            {...register('cep')}
            className="input-field"
            placeholder="CEP"
            maxLength={9}
          />
          <input
            {...register('numero')}
            className="input-field"
            placeholder="Número"
          />
        </div>
        <div>
          <input
            {...register('cidade')}
            className="input-field"
            placeholder="Cidade / UF"
          />
        </div>
      </div>

      <div>
        <label className="label">Dias de atendimento *</label>
        <div className="flex gap-2 flex-wrap mt-1">
          {DAYS.map(d => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                watchDays?.includes(d.value)
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-blue-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {errors.daysOfWeek && <p className="text-xs text-red-500 mt-1">{errors.daysOfWeek.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Início do atendimento</label>
          <input {...register('startTime')} type="time" className="input-field" />
          {errors.startTime && <p className="text-xs text-red-500 mt-1">{errors.startTime.message}</p>}
        </div>
        <div>
          <label className="label">Fim do atendimento</label>
          <input {...register('endTime')} type="time" className="input-field" />
          {errors.endTime && <p className="text-xs text-red-500 mt-1">{errors.endTime.message}</p>}
        </div>
      </div>

      {secretaries.length > 0 && (
        <div>
          <label className="label">Secretária vinculada a esta sala</label>
          <div className="space-y-2 mt-1">
            {secretaries.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={watchSecIds.includes(s.secretary.id)}
                  onChange={() => toggleSecretary(s.secretary.id)}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">{s.secretary.name}</p>
                  <p className="text-xs text-slate-500">{s.secretary.email}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">A secretária vinculada verá apenas os horários desta sala na agenda.</p>
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

export default function Salas() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then(r => r.data),
  })

  const { data: team = [] } = useQuery<DoctorSecretary[]>({
    queryKey: ['team'],
    queryFn: () => api.get('/team').then(r => r.data),
  })

  const secretaries = team.filter(t => t.active)

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editRoom ? api.put(`/rooms/${editRoom.id}`, data) : api.post('/rooms', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success(editRoom ? 'Sala atualizada!' : 'Sala criada!')
      setModalOpen(false)
      setEditRoom(null)
    },
    onError: () => toast.error('Erro ao salvar sala'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/rooms/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rooms'] }); toast.success('Status alterado') },
  })

  const dayLabel = (days: number[]) =>
    DAYS.filter(d => days.includes(d.value)).map(d => d.label).join(', ')

  const addressLine = (room: Room) => {
    const parts = [room.logradouro, room.numero].filter(Boolean).join(', ')
    const city = room.cidade || ''
    return [parts, city].filter(Boolean).join(' — ') || null
  }

  return (
    <div className="max-w-3xl space-y-6 page-stagger">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Salas de Atendimento</h1>
          <p className="page-subtitle">Configure os locais onde você atende e vincule suas secretárias</p>
        </div>
        <button onClick={() => { setEditRoom(null); setModalOpen(true) }} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" />
          Nova Sala
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="card text-center py-12 animate-stagger-2">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3 animate-float" />
          <p className="text-slate-400">Nenhuma sala cadastrada</p>
          <button onClick={() => setModalOpen(true)} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
            Criar primeira sala
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => (
            <div key={room.id} className={`card flex items-center gap-4 ${!room.active ? 'opacity-60' : ''}`}>
              <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{room.name}</p>
                  {!room.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativa</span>}
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
                  {room.secretaries && room.secretaries.length > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Users className="w-3 h-3" />
                      {room.secretaries.map(s => s.secretary.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditRoom(room); setModalOpen(true) }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleMutation.mutate(room.id)}
                  className={`p-1.5 rounded-lg transition-colors ${room.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
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
        <p>• Cada sala tem seus próprios dias, horários e endereço de atendimento</p>
        <p>• Ao vincular uma secretária a uma sala, ela verá apenas os horários daquela sala na agenda</p>
        <p>• Planos de saúde podem ser vinculados a salas específicas para melhor organização</p>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditRoom(null) }}
        title={editRoom ? 'Editar Sala' : 'Nova Sala de Atendimento'}
        size="lg"
      >
        <RoomForm
          room={editRoom}
          secretaries={secretaries}
          onSubmit={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
