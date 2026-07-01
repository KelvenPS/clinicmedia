import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus, Search, Phone, Mail, Edit2, Users, Calendar, UserCircle2,
  AlertTriangle, CheckCircle2, Clock, UserX, CheckCheck, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { Patient, PatientStatus } from '../types'
import Modal from '../components/ui/Modal'
import PatientForm from '../components/Patients/PatientForm'
import { SkeletonTable } from '../components/ui/SkeletonCard'
import PageHeader from '../components/ui/PageHeader'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PatientStatus, string> = {
  PRE_CADASTRO: 'Pré-cadastro',
  ATIVO: 'Ativo',
  INCOMPLETO: 'Incompleto',
  INATIVO: 'Inativo',
}

const STATUS_COLORS: Record<PatientStatus, string> = {
  PRE_CADASTRO: 'bg-amber-100 text-amber-700 border-amber-200',
  ATIVO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INCOMPLETO: 'bg-orange-100 text-orange-700 border-orange-200',
  INATIVO: 'bg-slate-100 text-slate-500 border-slate-200',
}

function calcProgress(p: Patient): number {
  const fields = [p.name, p.phone, p.email, p.birthDate, p.cpf, p.rg, p.address, p.responsibleName]
  const filled = fields.filter(Boolean).length
  return Math.round((filled / fields.length) * 100)
}

function StatusBadge({ status }: { status: PatientStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[status]}`}>
      {status === 'PRE_CADASTRO' && <AlertTriangle className="w-3 h-3" />}
      {status === 'ATIVO' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'INCOMPLETO' && <Clock className="w-3 h-3" />}
      {status === 'INATIVO' && <UserX className="w-3 h-3" />}
      {STATUS_LABELS[status]}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums w-8 text-right">{value}%</span>
    </div>
  )
}

// ─── Complete Registration Modal ──────────────────────────────────────────────

function CompleteRegistrationModal({
  patient,
  onSuccess,
  onClose,
}: {
  patient: Patient
  onSuccess: () => void
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    email: patient.email ?? '',
    birthDate: patient.birthDate ? patient.birthDate.substring(0, 10) : '',
    cpf: patient.cpf ?? '',
    rg: patient.rg ?? '',
    address: patient.address ?? '',
    responsibleName: patient.responsibleName ?? '',
    responsiblePhone: patient.responsiblePhone ?? '',
    notes: patient.notes ?? '',
  })

  const pending = [
    !patient.email && 'E-mail',
    !patient.birthDate && 'Data de nascimento',
    !patient.cpf && 'CPF',
    !patient.rg && 'RG',
    !patient.address && 'Endereço',
  ].filter(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post(`/patients/${patient.id}/complete-registration`, {
        ...form,
        email: form.email || undefined,
        cpf: form.cpf || undefined,
        birthDate: form.birthDate || undefined,
      })
      toast.success('Cadastro finalizado! Paciente agora ATIVO.')
      onSuccess()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      toast.error(error.response?.data?.message || 'Erro ao finalizar cadastro')
    } finally {
      setSaving(false)
    }
  }

  const progress = calcProgress(patient)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">Cadastro incompleto — {progress}% preenchido</p>
        </div>
        <ProgressBar value={progress} />
        {pending.length > 0 && (
          <p className="text-xs text-amber-700">Campos pendentes: {pending.join(', ')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">E-mail</label>
          <input className="input-field" type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
        </div>
        <div>
          <label className="label">Nascimento</label>
          <input className="input-field" type="date" value={form.birthDate}
            onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
        </div>
        <div>
          <label className="label">CPF</label>
          <input className="input-field" value={form.cpf}
            onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="label">RG</label>
          <input className="input-field" value={form.rg}
            onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} placeholder="RG" />
        </div>
      </div>
      <div>
        <label className="label">Endereço</label>
        <input className="input-field" value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro..." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Responsável</label>
          <input className="input-field" value={form.responsibleName}
            onChange={e => setForm(f => ({ ...f, responsibleName: e.target.value }))} placeholder="Nome do responsável" />
        </div>
        <div>
          <label className="label">Tel. responsável</label>
          <input className="input-field" value={form.responsiblePhone}
            onChange={e => setForm(f => ({ ...f, responsiblePhone: e.target.value }))} placeholder="(11) 99999-9999" />
        </div>
      </div>
      <div>
        <label className="label">Observações</label>
        <textarea className="input-field resize-none" rows={2} value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? 'Finalizando...' : (
            <><CheckCheck className="w-4 h-4" /> Finalizar Cadastro</>
          )}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
      </div>
    </form>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterKey = 'TODOS' | PatientStatus

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'ATIVO', label: 'Ativos' },
  { key: 'PRE_CADASTRO', label: 'Pré-cadastro' },
  { key: 'INCOMPLETO', label: 'Incompletos' },
  { key: 'INATIVO', label: 'Inativos' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Pacientes() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [completePatient, setCompletePatient] = useState<Patient | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterKey>('TODOS')

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ['patients', search, statusFilter],
    queryFn: () => api.get('/patients', {
      params: {
        ...(search ? { search } : {}),
        ...(statusFilter !== 'TODOS' ? { status: statusFilter } : {}),
      },
    }).then(r => r.data),
  })

  const counts = useMemo(() => {
    const all = patients
    return {
      PRE_CADASTRO: all.filter(p => p.status === 'PRE_CADASTRO').length,
      INCOMPLETO: all.filter(p => p.status === 'INCOMPLETO').length,
    }
  }, [patients])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editPatient ? api.put(`/patients/${editPatient.id}`, data) : api.post('/patients', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] })
      toast.success(editPatient ? 'Paciente atualizado!' : 'Paciente cadastrado!')
      setModalOpen(false)
      setEditPatient(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao salvar paciente')
    },
  })

  const handleEdit = (p: Patient) => { setEditPatient(p); setModalOpen(true) }
  const handleNew = () => { setEditPatient(null); setModalOpen(true) }

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Pacientes"
        subtitle="Gerencie o cadastro de pacientes"
        actions={
          <button onClick={handleNew} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo Paciente
          </button>
        }
      />

      {/* ── Status filter tabs ── */}
      <div className="card py-3 px-4">
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {tab.label}
              {tab.key === 'PRE_CADASTRO' && counts.PRE_CADASTRO > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'PRE_CADASTRO' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {counts.PRE_CADASTRO}
                </span>
              )}
              {tab.key === 'INCOMPLETO' && counts.INCOMPLETO > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === 'INCOMPLETO' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'
                }`}>
                  {counts.INCOMPLETO}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search + count ── */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="input-field pl-9"
              autoComplete="off"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full
                           bg-slate-200 hover:bg-slate-300 flex items-center justify-center
                           transition-colors duration-150 text-slate-500"
              >
                <span className="text-xs leading-none">×</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50
                          px-3 py-2 rounded-xl border border-slate-200 flex-shrink-0">
            <Users className="w-4 h-4 text-slate-400" />
            <span>
              <strong className="text-slate-800 font-bold tabular-nums">{patients.length}</strong>
              {' '}paciente{patients.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Desktop Table ── */}
      <div className="card p-0 overflow-hidden hidden sm:block animate-stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="table-head-cell">Paciente</th>
                <th className="table-head-cell">Contato</th>
                <th className="table-head-cell hidden lg:table-cell">Status</th>
                <th className="table-head-cell hidden lg:table-cell">CPF</th>
                <th className="table-head-cell">Idade</th>
                <th className="table-head-cell">Consultas</th>
                <th className="table-head-cell hidden md:table-cell">Cadastro</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-0">
                    <SkeletonTable rows={6} cols={7} />
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 animate-float">
                        <Users className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-slate-600 font-semibold">Nenhum paciente encontrado</p>
                      <p className="text-slate-400 text-sm mt-1">
                        {search ? `Sem resultados para "${search}"` : 'Comece cadastrando um paciente'}
                      </p>
                      {!search && (
                        <button onClick={handleNew} className="mt-4 btn-primary text-xs">
                          <Plus className="w-3.5 h-3.5" />
                          Cadastrar Paciente
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                patients.map((p, idx) => {
                  const initials = p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                  const age = p.birthDate ? differenceInYears(new Date(), parseISO(p.birthDate)) : null
                  const isPreCad = p.status === 'PRE_CADASTRO' || p.status === 'INCOMPLETO'
                  const progress = isPreCad ? calcProgress(p) : null
                  return (
                    <tr
                      key={p.id}
                      className="table-row group cursor-pointer"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                      onClick={() => handleEdit(p)}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm
                            ${isPreCad
                              ? 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-400/20'
                              : 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-400/20'
                            }`}>
                            <span className="text-white text-xs font-bold">{initials}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700 transition-colors duration-150">
                                {p.name}
                              </p>
                            </div>
                            {isPreCad && progress !== null && (
                              <div className="w-32 mt-1">
                                <ProgressBar value={progress} />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                            {p.phone}
                          </div>
                          {p.email && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Mail className="w-3 h-3 text-slate-300 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{p.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="table-cell hidden lg:table-cell">
                        <StatusBadge status={p.status ?? 'ATIVO'} />
                      </td>
                      <td className="table-cell font-mono text-slate-500 text-xs hidden lg:table-cell">
                        {p.cpf || '–'}
                      </td>
                      <td className="table-cell">
                        {age !== null ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                            {age} anos
                          </span>
                        ) : '–'}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-300" />
                          <span className="font-bold text-slate-700 tabular-nums">{p._count?.appointments ?? 0}</span>
                          <span className="text-slate-400 text-xs">consultas</span>
                        </div>
                      </td>
                      <td className="table-cell text-slate-400 text-xs hidden md:table-cell tabular-nums">
                        {format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {isPreCad && (
                            <button
                              onClick={() => setCompletePatient(p)}
                              className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all flex items-center gap-1"
                              title="Finalizar cadastro"
                            >
                              <CheckCheck className="w-3 h-3" />
                              Finalizar
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(p)}
                            className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-150 active:scale-90"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* ── Mobile Cards ── */}
      <div className="sm:hidden space-y-3 animate-stagger-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-3 py-4" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="skeleton-circle w-12 h-12 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-text w-3/4" />
                <div className="skeleton-text w-1/2" />
              </div>
            </div>
          ))
        ) : patients.length === 0 ? (
          <div className="card empty-state">
            <UserCircle2 className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">Nenhum paciente encontrado</p>
            {!search && (
              <button onClick={handleNew} className="mt-3 btn-primary text-xs">
                <Plus className="w-3.5 h-3.5" />
                Cadastrar
              </button>
            )}
          </div>
        ) : (
          patients.map((p, idx) => {
            const initials = p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
            const age = p.birthDate ? differenceInYears(new Date(), parseISO(p.birthDate)) : null
            const isPreCad = p.status === 'PRE_CADASTRO' || p.status === 'INCOMPLETO'
            const progress = isPreCad ? calcProgress(p) : null
            return (
              <div
                key={p.id}
                className="card-hover"
                style={{ animationDelay: `${idx * 0.04}s` }}
                onClick={() => handleEdit(p)}
              >
                <div className="flex items-start gap-3 py-1">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                    isPreCad
                      ? 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-400/30'
                      : 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-400/30'
                  }`}>
                    <span className="text-white text-sm font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                      <StatusBadge status={p.status ?? 'ATIVO'} />
                    </div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {p.phone}
                      {age !== null && <span className="ml-1">· {age} anos</span>}
                    </p>
                    {isPreCad && progress !== null && (
                      <div className="mt-2 w-full">
                        <ProgressBar value={progress} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {p._count?.appointments ?? 0}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                </div>
                {isPreCad && (
                  <div className="mt-2 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setCompletePatient(p)}
                      className="w-full text-center text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg py-1.5 transition-all flex items-center justify-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Finalizar Cadastro
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Edit/New Modal ── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditPatient(null) }}
        title={editPatient ? 'Editar Paciente' : 'Novo Paciente'}
        size="lg"
      >
        <PatientForm
          patient={editPatient}
          onSubmit={(data) => saveMutation.mutate(data as Record<string, unknown>)}
          loading={saveMutation.isPending}
        />
      </Modal>

      {/* ── Complete Registration Modal ── */}
      <Modal
        isOpen={!!completePatient}
        onClose={() => setCompletePatient(null)}
        title={`Finalizar Cadastro — ${completePatient?.name}`}
        size="lg"
      >
        {completePatient && (
          <CompleteRegistrationModal
            patient={completePatient}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['patients'] })
              setCompletePatient(null)
            }}
            onClose={() => setCompletePatient(null)}
          />
        )}
      </Modal>
    </div>
  )
}
