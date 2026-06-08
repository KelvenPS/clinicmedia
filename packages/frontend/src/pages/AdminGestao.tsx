import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import api from '../lib/api'
import {
  Users,
  UserCheck,
  UserX,
  Stethoscope,
  Search,
  RefreshCw,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Shield,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Doctor {
  id: string
  name: string
  email: string
  specialty: string | null
  _count: { patients: number; doctorAppointments: number; doctorTeam: number }
}

interface Patient {
  id: string
  name: string
  phone: string
  email: string | null
  cpf: string | null
  doctorId: string | null
  createdAt: string
  doctor: { id: string; name: string; specialty: string | null } | null
  _count: { appointments: number }
}

interface Overview {
  totalPatients: number
  assignedPatients: number
  orphanPatients: number
  totalDoctors: number
  totalSecretaries: number
}

interface MigrateResult {
  total: number
  assigned: number
  unassigned: number
  message: string
}

interface PaginatedPatients {
  data: Patient[]
  total: number
  page: number
  totalPages: number
}

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

// ─── Hooks utilitários ────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 min-w-72">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium animate-fade-in ${
            t.type === 'success'
              ? 'bg-emerald-900/90 border-emerald-500/30 text-emerald-200'
              : 'bg-red-900/90 border-red-500/30 text-red-200'
          }`}
        >
          {t.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-white/5 animate-pulse">
      <div className="w-8 h-8 bg-slate-700 rounded-lg mb-3" />
      <div className="h-7 w-12 bg-slate-700 rounded mb-2" />
      <div className="h-3 w-20 bg-slate-700/60 rounded" />
    </div>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-300">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Tentar novamente
      </button>
    </div>
  )
}

// ─── Dropdown de atribuição ───────────────────────────────────────────────────

function AssignDropdown({
  patient,
  doctors,
  isPending,
  onAssign,
}: {
  patient: Patient
  doctors: Doctor[]
  isPending: boolean
  onAssign: (patientId: string, doctorId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        disabled={isPending}
        className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
        Atribuir
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 bg-slate-700 border border-white/10 rounded-xl shadow-2xl z-20 min-w-52 py-1 overflow-hidden"
          style={{ bottom: 'auto', top: '100%' }}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-xs text-slate-400 font-medium truncate max-w-44">{patient.name}</p>
          </div>
          <button
            onClick={() => { onAssign(patient.id, null); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-white/5 flex items-center gap-2 transition-colors"
          >
            <UserX className="w-3.5 h-3.5" />
            Remover atribuição
          </button>
          <div className="border-t border-white/10 my-1" />
          <div className="max-h-48 overflow-y-auto">
            {doctors.map(d => (
              <button
                key={d.id}
                onClick={() => { onAssign(patient.id, d.id); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-white/5 transition-colors ${
                  patient.doctorId === d.id ? 'text-blue-400 font-semibold' : 'text-slate-300'
                }`}
              >
                <span className="truncate max-w-36">{d.name}</span>
                {patient.doctorId === d.id && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Paginação ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  onChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
      <span className="text-xs text-slate-400">
        {start}–{end} de {total} pacientes
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Anterior
        </button>
        <span className="text-xs text-slate-500 px-1">
          Pág. {page}/{totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          Próximo
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminGestao() {
  const qc = useQueryClient()

  // Estado principal
  const [filter, setFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null)
  const [page, setPage] = useState(1)
  const [pendingPatientId, setPendingPatientId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounterRef = useRef(0)

  // Debounce search — 400ms
  const search = useDebounce(searchInput, 400)

  // Resetar página ao mudar filtro ou busca
  useEffect(() => { setPage(1) }, [filter, search])

  // ── Toast helpers ──
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastCounterRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Queries ──
  const {
    data: overview,
    isLoading: loadingOverview,
    isError: errorOverview,
    refetch: refetchOverview,
  } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => api.get<Overview>('/admin/overview').then((r: AxiosResponse<Overview>) => r.data),
  })

  const {
    data: doctors = [],
    isError: errorDoctors,
    refetch: refetchDoctors,
  } = useQuery<Doctor[]>({
    queryKey: ['admin-doctors'],
    queryFn: () => api.get<Doctor[]>('/admin/doctors').then((r: AxiosResponse<Doctor[]>) => r.data),
  })

  const {
    data: patientsResponse,
    isLoading: loadingPatients,
    isError: errorPatients,
    refetch: refetchPatients,
  } = useQuery<PaginatedPatients>({
    queryKey: ['admin-patients', filter, search, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter === 'orphans') params.set('orphans', 'true')
      else if (filter !== 'all') params.set('doctorId', filter)
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      return api.get<PaginatedPatients>(`/admin/patients?${params}`).then((r: AxiosResponse<PaginatedPatients>) => r.data)
    },
  })

  const patients = patientsResponse?.data ?? []
  const patientsTotal = patientsResponse?.total ?? 0

  // ── Mutations ──
  const migrateMutation = useMutation({
    mutationFn: () =>
      api.post<MigrateResult>('/admin/migrate-patients').then((r: AxiosResponse<MigrateResult>) => r.data),
    onSuccess: (data: MigrateResult) => {
      setMigrateResult(data)
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      qc.invalidateQueries({ queryKey: ['admin-patients'] })
      addToast('success', `Migração concluída — ${data.assigned} paciente(s) atribuído(s).`)
    },
    onError: () => {
      addToast('error', 'Falha ao migrar pacientes. Tente novamente.')
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ patientId, doctorId }: { patientId: string; doctorId: string | null }) =>
      api.patch(`/admin/patients/${patientId}/doctor`, { doctorId }),
    onMutate: ({ patientId }) => {
      setPendingPatientId(patientId)
    },
    onSuccess: (_data, { doctorId }) => {
      setPendingPatientId(null)
      qc.invalidateQueries({ queryKey: ['admin-patients'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      addToast(
        'success',
        doctorId ? 'Paciente atribuído com sucesso.' : 'Atribuição removida com sucesso.'
      )
    },
    onError: () => {
      setPendingPatientId(null)
      addToast('error', 'Falha ao atribuir paciente. Tente novamente.')
    },
  })

  const handleAssign = useCallback(
    (patientId: string, doctorId: string | null) => {
      assignMutation.mutate({ patientId, doctorId })
    },
    [assignMutation]
  )

  // ── Nome do filtro ativo para badge ──
  const activeFilterLabel =
    filter === 'all'
      ? null
      : filter === 'orphans'
      ? 'Sem médico'
      : doctors.find(d => d.id === filter)?.name ?? null

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ToastList toasts={toasts} onDismiss={dismissToast} />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Gestão de Dados</h1>
            <p className="text-sm text-slate-400">Controle de isolamento entre médicos e pacientes</p>
          </div>
        </div>

        {/* ── Stats cards ── */}
        {errorOverview ? (
          <ErrorBanner
            message="Não foi possível carregar o resumo. Verifique sua conexão."
            onRetry={refetchOverview}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {loadingOverview
              ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
              : [
                  { label: 'Total Pacientes', value: overview?.totalPatients ?? '—', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Atribuídos', value: overview?.assignedPatients ?? '—', icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: 'Sem médico', value: overview?.orphanPatients ?? '—', icon: UserX, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  { label: 'Médicos', value: overview?.totalDoctors ?? '—', icon: Stethoscope, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                  { label: 'Secretarias', value: overview?.totalSecretaries ?? '—', icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800 rounded-xl p-4 border border-white/5">
                    <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center mb-3`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                  </div>
                ))}
          </div>
        )}

        {/* ── Migration banner ── */}
        {(overview?.orphanPatients ?? 0) > 0 && !migrateResult && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  {overview?.orphanPatients} paciente(s) sem médico vinculado
                </p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Esses pacientes ficam invisíveis para todos os médicos. Migre automaticamente com base no histórico de agendamentos.
                </p>
              </div>
            </div>
            <button
              onClick={() => migrateMutation.mutate()}
              disabled={migrateMutation.isPending}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {migrateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Migrar automaticamente
            </button>
          </div>
        )}

        {/* ── Migration result ── */}
        {migrateResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-300">Migração concluída</p>
              <p className="text-xs text-emerald-400/70 mt-1">{migrateResult.message}</p>
              {migrateResult.unassigned > 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  {migrateResult.unassigned} paciente(s) ainda sem médico — use a tabela abaixo para atribuição manual.
                </p>
              )}
            </div>
            <button
              onClick={() => setMigrateResult(null)}
              className="opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        )}

        {/* ── Doctors section ── */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Stethoscope className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-white">Médicos Cadastrados</h2>
            <span className="ml-auto text-xs text-slate-500">{doctors.length} médico(s)</span>
          </div>

          {errorDoctors ? (
            <ErrorBanner
              message="Não foi possível carregar os médicos."
              onRetry={refetchDoctors}
            />
          ) : (
            <div className="bg-slate-800 rounded-xl border border-white/5 overflow-hidden">
              {doctors.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Nenhum médico cadastrado</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {doctors.map(doc => (
                    <div
                      key={doc.id}
                      className={`px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors ${
                        filter === doc.id ? 'bg-blue-600/5 border-l-2 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-400 text-xs font-bold">
                            {doc.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{doc.name}</p>
                          <p className="text-xs text-slate-400">
                            {doc.email}
                            {doc.specialty ? ` · ${doc.specialty}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="hidden sm:flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {doc._count.patients} pacientes
                        </span>
                        <span className="hidden md:flex items-center gap-1">
                          <Stethoscope className="w-3.5 h-3.5" />
                          {doc._count.doctorAppointments} consultas
                        </span>
                        <span className="hidden md:flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {doc._count.doctorTeam} secret.
                        </span>
                        <button
                          onClick={() => setFilter(prev => (prev === doc.id ? 'all' : doc.id))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            filter === doc.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          {filter === doc.id ? 'Filtrado' : 'Filtrar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Patients section ── */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Users className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Pacientes</h2>
            {activeFilterLabel && (
              <span className="flex items-center gap-1 bg-blue-600/20 text-blue-300 text-xs font-medium px-2 py-0.5 rounded-full">
                {activeFilterLabel}
                <button
                  onClick={() => setFilter('all')}
                  className="hover:text-white transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">{patientsTotal} resultado(s)</span>
          </div>

          <div className="bg-slate-800 rounded-xl border border-white/5 overflow-hidden">
            {/* Toolbar */}
            <div className="px-5 py-3 border-b border-white/5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <input
                  className="w-full bg-slate-700 text-sm text-white pl-9 pr-8 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Buscar paciente…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
              </div>
              <select
                className="bg-slate-700 text-sm text-slate-300 px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 transition-colors"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="orphans">Sem médico</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Body */}
            {errorPatients ? (
              <div className="p-6">
                <ErrorBanner
                  message="Não foi possível carregar os pacientes."
                  onRetry={refetchPatients}
                />
              </div>
            ) : loadingPatients ? (
              <div className="divide-y divide-white/5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between animate-pulse">
                    <div className="space-y-2">
                      <div className="h-3.5 w-36 bg-slate-700 rounded" />
                      <div className="h-2.5 w-52 bg-slate-700/60 rounded" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-24 bg-slate-700/60 rounded" />
                      <div className="h-6 w-16 bg-slate-700 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : patientsTotal === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Nenhum paciente encontrado</p>
                {(search || filter !== 'all') && (
                  <button
                    onClick={() => { setSearchInput(''); setFilter('all') }}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/5">
                  {patients.map(p => (
                    <div
                      key={p.id}
                      className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.phone}
                          {p.cpf ? ` · CPF: ${p.cpf}` : ''}
                          {' · '}
                          {p._count.appointments} consulta(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {p.doctor ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1 max-w-36 truncate">
                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{p.doctor.name}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            Sem médico
                          </span>
                        )}
                        <AssignDropdown
                          patient={p}
                          doctors={doctors}
                          isPending={pendingPatientId === p.id}
                          onAssign={handleAssign}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination
                  page={page}
                  total={patientsTotal}
                  pageSize={PAGE_SIZE}
                  onChange={setPage}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
