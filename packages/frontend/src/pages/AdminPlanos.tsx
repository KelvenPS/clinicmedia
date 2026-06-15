import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CreditCard, Users, Search, Edit2, RotateCcw, CheckCircle2,
  AlertCircle, Clock, XCircle, Filter, ChevronDown, Shield,
  TrendingUp, Wallet,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import api from '../lib/api'
import Modal from '../components/ui/Modal'
import { PLAN_DISPLAY, PLAN_PRICES } from '../types'
import type { PlanKey } from '../types'

interface AdminDoctorRow {
  id: string
  name: string
  email: string
  specialty?: string | null
  createdAt: string
  _count: { patients: number; doctorAppointments: number }
  subscription?: {
    id: string
    plan: PlanKey
    billingCycle: string
    status: string
    trialEndsAt?: string | null
    currentPeriodEnd?: string | null
    cancelledAt?: string | null
    adminNote?: string | null
    createdAt: string
    payments: { amount: number; status: string; paidAt?: string | null; plan: string }[]
  } | null
}

const editSchema = z.object({
  plan:        z.enum(['TRIAL', 'PRO', 'PLUS', 'CLINIC', 'TELECONSULTA', 'TELECONSULTA_PRO']),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  status:      z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'EXPIRED']).optional(),
  adminNote:   z.string().optional(),
  extendDays:  z.coerce.number().int().min(1).max(365).optional(),
})
type EditForm = z.infer<typeof editSchema>

// ─── Status badge ─────────────────────────────────────────────────────────────

function PlanBadge({ plan, status }: { plan: PlanKey; status: string }) {
  const colors: Record<PlanKey, string> = {
    TRIAL:            'bg-slate-100  text-slate-700  border-slate-200',
    PRO:              'bg-blue-50    text-blue-700   border-blue-200',
    PLUS:             'bg-purple-50  text-purple-700 border-purple-200',
    CLINIC:           'bg-emerald-50 text-emerald-700 border-emerald-200',
    TELECONSULTA:     'bg-cyan-50    text-cyan-700   border-cyan-200',
    TELECONSULTA_PRO: 'bg-violet-50  text-violet-700 border-violet-200',
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${colors[plan] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {PLAN_DISPLAY[plan] ?? plan}
      {status === 'CANCELLED' && ' · Cancelado'}
      {status === 'EXPIRED'   && ' · Expirado'}
    </span>
  )
}

function TrialStatus({ trialEndsAt }: { trialEndsAt?: string | null }) {
  if (!trialEndsAt) return null
  const now = new Date()
  const end = new Date(trialEndsAt)
  const days = differenceInDays(end, now)

  if (now > end) return (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <XCircle className="w-3 h-3" /> Expirado
    </span>
  )
  return (
    <span className={`flex items-center gap-1 text-xs ${days <= 5 ? 'text-amber-600' : 'text-slate-500'}`}>
      <Clock className="w-3 h-3" />
      {days > 0 ? `${days}d restantes` : 'Último dia'}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPlanos() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState<string>('ALL')
  const [editDoctor, setEditDoctor] = useState<AdminDoctorRow | null>(null)

  const { data: doctors = [], isLoading } = useQuery<AdminDoctorRow[]>({
    queryKey: ['admin-subscriptions'],
    queryFn: () => api.get('/admin/subscriptions-overview').then(r => r.data),
  })

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { plan: 'TRIAL', billingCycle: 'MONTHLY', status: 'ACTIVE' },
  })

  const updateMutation = useMutation({
    mutationFn: ({ doctorId, data }: { doctorId: string; data: EditForm }) =>
      api.patch(`/subscriptions/admin/${doctorId}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      toast.success('Plano atualizado com sucesso!')
      setEditDoctor(null)
    },
    onError: () => toast.error('Erro ao atualizar plano'),
  })

  const resetTrialMutation = useMutation({
    mutationFn: ({ doctorId, days }: { doctorId: string; days: number }) =>
      api.post(`/subscriptions/admin/${doctorId}/reset-trial`, { days }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      toast.success('Trial resetado com sucesso!')
    },
    onError: () => toast.error('Erro ao resetar trial'),
  })

  const sendWarningsMutation = useMutation({
    mutationFn: () => api.post('/subscriptions/send-trial-warnings').then(r => r.data),
    onSuccess: (data: { sent: number; expired: number }) => {
      qc.invalidateQueries({ queryKey: ['admin-subscriptions'] })
      toast.success(`${data.sent} avisos enviados · ${data.expired} trials expirados atualizados`)
    },
    onError: () => toast.error('Erro ao enviar avisos'),
  })

  const openEdit = (doctor: AdminDoctorRow) => {
    setEditDoctor(doctor)
    editForm.reset({
      plan:        (doctor.subscription?.plan ?? 'TRIAL') as PlanKey,
      billingCycle: (doctor.subscription?.billingCycle as 'MONTHLY' | 'ANNUAL') ?? 'MONTHLY',
      status:      (doctor.subscription?.status as EditForm['status']) ?? 'ACTIVE',
      adminNote:   doctor.subscription?.adminNote ?? '',
    })
  }

  // Stats
  const stats = {
    total:        doctors.length,
    trial:        doctors.filter(d => d.subscription?.plan === 'TRIAL').length,
    active:       doctors.filter(d => d.subscription?.status === 'ACTIVE' && d.subscription?.plan !== 'TRIAL').length,
    expired:      doctors.filter(d => ['CANCELLED', 'EXPIRED'].includes(d.subscription?.status ?? '')).length,
    mrr:          doctors.reduce((acc, d) => {
      if (!d.subscription || d.subscription.plan === 'TRIAL') return acc
      if (['CANCELLED', 'EXPIRED', 'INACTIVE'].includes(d.subscription.status)) return acc
      const price = PLAN_PRICES[d.subscription.plan]?.monthly ?? 0
      return acc + (d.subscription.billingCycle === 'ANNUAL' ? price * 0.85 : price)
    }, 0),
  }

  // Filters
  const filtered = doctors.filter(d => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.email.toLowerCase().includes(search.toLowerCase())
    const matchPlan = filterPlan === 'ALL' || d.subscription?.plan === filterPlan || (!d.subscription && filterPlan === 'TRIAL')
    return matchSearch && matchPlan
  })

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-stagger-1">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-600" />
            Gestão de Planos
          </h1>
          <p className="page-subtitle">Administre as assinaturas de todos os médicos</p>
        </div>
        <button
          onClick={() => sendWarningsMutation.mutate()}
          disabled={sendWarningsMutation.isPending}
          className="btn-secondary self-start"
        >
          {sendWarningsMutation.isPending ? (
            <div className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" />
          )}
          Enviar avisos de trial
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-stagger-2">
        {[
          { label: 'Total médicos', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'Em trial', value: stats.trial, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          { label: 'Assinaturas ativas', value: stats.active, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'MRR estimado', value: `R$ ${stats.mrr.toFixed(0)}`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className="card flex items-center gap-3 py-4">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center border ${border} flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${color} tabular-nums`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card py-3 animate-stagger-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar médico por nome ou email..."
              className="input-field pl-9"
            />
          </div>
          <div className="relative flex-shrink-0">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value)}
              className="input-field pl-9 pr-8 appearance-none"
            >
              <option value="ALL">Todos os planos</option>
              <option value="TRIAL">Trial</option>
              <option value="PRO">Pro</option>
              <option value="PLUS">Plus</option>
              <option value="CLINIC">Clínica</option>
              <option value="TELECONSULTA">Teleconsulta</option>
              <option value="TELECONSULTA_PRO">Teleconsulta Pro</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden animate-stagger-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="table-head-cell">Médico</th>
                <th className="table-head-cell">Plano</th>
                <th className="table-head-cell hidden md:table-cell">Validade</th>
                <th className="table-head-cell hidden lg:table-cell">Pacientes</th>
                <th className="table-head-cell hidden lg:table-cell">Último pagto</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="table-cell" colSpan={6}>
                      <div className="flex gap-3 items-center py-1">
                        <div className="skeleton-circle w-9 h-9" />
                        <div className="flex-1 space-y-1.5">
                          <div className="skeleton-text w-1/3" />
                          <div className="skeleton-text w-1/4" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state py-12">
                      <Users className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-slate-400">Nenhum médico encontrado</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((doctor, idx) => {
                  const sub = doctor.subscription
                  const plan = (sub?.plan ?? 'TRIAL') as PlanKey
                  const lastPayment = sub?.payments?.[0]
                  const initials = doctor.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

                  return (
                    <tr
                      key={doctor.id}
                      className="table-row group"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm">{doctor.name}</p>
                            <p className="text-xs text-slate-400">{doctor.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="table-cell">
                        <div className="space-y-1">
                          <PlanBadge plan={plan} status={sub?.status ?? 'ACTIVE'} />
                          {plan === 'TRIAL' && <TrialStatus trialEndsAt={sub?.trialEndsAt} />}
                        </div>
                      </td>

                      <td className="table-cell hidden md:table-cell text-xs text-slate-500">
                        {sub?.currentPeriodEnd
                          ? format(new Date(sub.currentPeriodEnd), "d MMM yyyy", { locale: ptBR })
                          : sub?.trialEndsAt
                            ? `Trial até ${format(new Date(sub.trialEndsAt), "d MMM", { locale: ptBR })}`
                            : '—'}
                      </td>

                      <td className="table-cell hidden lg:table-cell">
                        <span className="text-sm font-semibold text-slate-700 tabular-nums">
                          {doctor._count.patients}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">pacientes</span>
                      </td>

                      <td className="table-cell hidden lg:table-cell">
                        {lastPayment ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              R$ {lastPayment.amount.toFixed(2).replace('.', ',')}
                            </p>
                            <p className="text-xs text-slate-400">
                              {lastPayment.paidAt
                                ? format(new Date(lastPayment.paidAt), "d MMM", { locale: ptBR })
                                : 'Pendente'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="table-cell">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(doctor)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar plano"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {plan === 'TRIAL' && (
                            <button
                              onClick={() => {
                                if (confirm(`Resetar trial de ${doctor.name} para 30 dias?`)) {
                                  resetTrialMutation.mutate({ doctorId: doctor.id, days: 30 })
                                }
                              }}
                              disabled={resetTrialMutation.isPending}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Resetar trial"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        isOpen={!!editDoctor}
        onClose={() => setEditDoctor(null)}
        title={`Plano de ${editDoctor?.name ?? ''}`}
        size="md"
      >
        {editDoctor && (
          <form
            onSubmit={editForm.handleSubmit(data => updateMutation.mutate({ doctorId: editDoctor.id, data }))}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {editDoctor.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{editDoctor.name}</p>
                <p className="text-xs text-slate-500">{editDoctor.email}</p>
              </div>
            </div>

            <div>
              <label className="label">Plano *</label>
              <select {...editForm.register('plan')} className="input-field">
                <option value="TRIAL">Período Gratuito (Trial)</option>
                <option value="PRO">Pro — R$ 89,90/mês</option>
                <option value="PLUS">Plus — R$ 109,90/mês</option>
                <option value="CLINIC">Clínica — R$ 159,90/mês</option>
                <option value="TELECONSULTA">Teleconsulta — R$ 199,90/mês</option>
                <option value="TELECONSULTA_PRO">Teleconsulta Pro — R$ 399,90/mês</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Ciclo</label>
                <select {...editForm.register('billingCycle')} className="input-field">
                  <option value="MONTHLY">Mensal</option>
                  <option value="ANNUAL">Anual</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select {...editForm.register('status')} className="input-field">
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="CANCELLED">Cancelado</option>
                  <option value="EXPIRED">Expirado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Estender período (dias)</label>
              <input
                {...editForm.register('extendDays')}
                type="number"
                min={1}
                max={365}
                className="input-field"
                placeholder="Ex: 30 para 1 mês extra"
              />
              <p className="text-xs text-slate-400 mt-1">Deixe em branco para usar o período padrão do plano</p>
            </div>

            <div>
              <label className="label">Nota para o médico (opcional)</label>
              <textarea
                {...editForm.register('adminNote')}
                rows={2}
                className="input-field resize-none"
                placeholder="Ex: Plano concedido como cortesia por 3 meses..."
              />
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setEditDoctor(null)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="btn-primary flex-1">
                {updateMutation.isPending ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...</>
                ) : (
                  <><CreditCard className="w-4 h-4" /> Salvar plano</>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
