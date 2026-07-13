import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Zap, Lock, RotateCcw, Users2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import Modal from '../components/ui/Modal'

interface DoctorSubscriptionRow {
  id: string
  name: string
  email: string
  specialty: string | null
  createdAt: string
  _count: { doctorTeam: number }
  subscription: {
    status: string
    trialEndsAt: string | null
    currentPeriodEndsAt: string | null
    lastPaymentAt: string | null
    blockedAt: string | null
    canceledAt: string | null
    adminNote: string | null
    updatedAt: string
  } | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  TRIAL: { label: 'Trial', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  ACTIVE: { label: 'Ativa', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PENDING_PAYMENT: { label: 'Pag. pendente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAST_DUE: { label: 'Atrasada', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  CANCELED: { label: 'Cancelada', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  BLOCKED: { label: 'Bloqueada', color: 'bg-red-50 text-red-700 border-red-200' },
}

export default function AdminPlanos() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [grantTarget, setGrantTarget] = useState<DoctorSubscriptionRow | null>(null)
  const [blockTarget, setBlockTarget] = useState<DoctorSubscriptionRow | null>(null)
  const [unlimited, setUnlimited] = useState(true)
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')

  const { data: doctors = [], isLoading } = useQuery<DoctorSubscriptionRow[]>({
    queryKey: ['admin-subscriptions'],
    queryFn: () => api.get('/admin/subscriptions').then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })

  const grantMutation = useMutation({
    mutationFn: (doctorId: string) =>
      api.post(`/admin/subscriptions/${doctorId}/grant`, { unlimited, days: unlimited ? undefined : days, note: note || undefined }),
    onSuccess: () => {
      toast.success('Acesso liberado')
      setGrantTarget(null)
      setNote('')
      invalidate()
    },
    onError: () => toast.error('Não foi possível liberar o acesso'),
  })

  const blockMutation = useMutation({
    mutationFn: (doctorId: string) => api.post(`/admin/subscriptions/${doctorId}/block`, { note: note || undefined }),
    onSuccess: () => {
      toast.success('Acesso bloqueado')
      setBlockTarget(null)
      setNote('')
      invalidate()
    },
    onError: () => toast.error('Não foi possível bloquear o acesso'),
  })

  const resetTrialMutation = useMutation({
    mutationFn: (doctorId: string) => api.post(`/admin/subscriptions/${doctorId}/reset-trial`, {}),
    onSuccess: () => {
      toast.success('Trial de 7 dias reiniciado')
      invalidate()
    },
    onError: () => toast.error('Não foi possível resetar o trial'),
  })

  const filtered = doctors.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) || d.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-page-enter">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Gestão de Planos</h1>
        <p className="text-sm text-slate-400">
          Libere, bloqueie ou reinicie o trial de qualquer médico manualmente — libera automaticamente toda a equipe vinculada.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="input-field w-full pl-9"
        />
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3">Médico</th>
              <th className="px-4 py-3">Equipe</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3">Nota admin</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum médico encontrado</td></tr>
            )}
            {filtered.map(doctor => {
              const status = doctor.subscription?.status ?? 'BLOCKED'
              const statusInfo = STATUS_LABEL[status] ?? STATUS_LABEL.BLOCKED
              const validUntil = doctor.subscription?.currentPeriodEndsAt ?? doctor.subscription?.trialEndsAt

              return (
                <tr key={doctor.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{doctor.name}</p>
                    <p className="text-xs text-slate-400">{doctor.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Users2 className="w-3.5 h-3.5" />
                      {doctor._count.doctorTeam}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {validUntil ? format(new Date(validUntil), "d MMM yyyy", { locale: ptBR }) : 'Sem prazo'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate" title={doctor.subscription?.adminNote ?? ''}>
                    {doctor.subscription?.adminNote ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => { setGrantTarget(doctor); setUnlimited(true); setDays(30); setNote('') }}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        title="Liberar acesso"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => resetTrialMutation.mutate(doctor.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Resetar trial (7 dias)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setBlockTarget(doctor); setNote('') }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Bloquear acesso"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!grantTarget}
        onClose={() => setGrantTarget(null)}
        title={`Liberar acesso — ${grantTarget?.name ?? ''}`}
        subtitle="Isso libera automaticamente toda a equipe vinculada a este médico."
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setGrantTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={() => grantTarget && grantMutation.mutate(grantTarget.id)}
              disabled={grantMutation.isPending}
              className="btn-primary"
            >
              Liberar acesso
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} />
            Sem prazo de expiração (grandfathering)
          </label>
          {!unlimited && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Dias de acesso</label>
              <input type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} className="input-field w-full" />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Nota (opcional — ex.: "usuário de teste")</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} className="input-field w-full" rows={2} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        title={`Bloquear acesso — ${blockTarget?.name ?? ''}`}
        subtitle="Isso bloqueia automaticamente toda a equipe vinculada a este médico."
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setBlockTarget(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={() => blockTarget && blockMutation.mutate(blockTarget.id)}
              disabled={blockMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
            >
              Bloquear acesso
            </button>
          </div>
        }
      >
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Motivo (opcional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} className="input-field w-full" rows={2} />
        </div>
      </Modal>
    </div>
  )
}
