import { useState } from 'react'
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
} from 'lucide-react'

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

export default function AdminGestao() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null)

  const { data: overview } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => api.get<Overview>('/admin/overview').then((r: AxiosResponse<Overview>) => r.data),
  })

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ['admin-doctors'],
    queryFn: () => api.get<Doctor[]>('/admin/doctors').then((r: AxiosResponse<Doctor[]>) => r.data),
  })

  const { data: patients = [], isLoading: loadingPatients } = useQuery<Patient[]>({
    queryKey: ['admin-patients', filter, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter === 'orphans') params.set('orphans', 'true')
      else if (filter !== 'all') params.set('doctorId', filter)
      if (search) params.set('search', search)
      return api.get<Patient[]>(`/admin/patients?${params}`).then((r: AxiosResponse<Patient[]>) => r.data)
    },
  })

  const migrateMutation = useMutation({
    mutationFn: () => api.post<MigrateResult>('/admin/migrate-patients').then((r: AxiosResponse<MigrateResult>) => r.data),
    onSuccess: (data: MigrateResult) => {
      setMigrateResult(data)
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
      qc.invalidateQueries({ queryKey: ['admin-patients'] })
    },
  })

  const assignMutation = useMutation({
    mutationFn: ({ patientId, doctorId }: { patientId: string; doctorId: string | null }) =>
      api.patch(`/admin/patients/${patientId}/doctor`, { doctorId }),
    onSuccess: () => {
      setAssigningId(null)
      qc.invalidateQueries({ queryKey: ['admin-patients'] })
      qc.invalidateQueries({ queryKey: ['admin-overview'] })
    },
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Gestão de Dados</h1>
          <p className="text-sm text-slate-400">Controle de isolamento entre médicos e pacientes</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
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

      {/* Migration Banner */}
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
            <RefreshCw className={`w-4 h-4 ${migrateMutation.isPending ? 'animate-spin' : ''}`} />
            Migrar automaticamente
          </button>
        </div>
      )}

      {/* Migration Result */}
      {migrateResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Migração concluída</p>
            <p className="text-xs text-emerald-400/70 mt-1">{migrateResult.message}</p>
            {migrateResult.unassigned > 0 && (
              <p className="text-xs text-amber-400 mt-1">
                {migrateResult.unassigned} paciente(s) ainda sem médico — use a tabela abaixo para atribuição manual.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Doctors Summary */}
      <div className="bg-slate-800 rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Médicos Cadastrados</h2>
        </div>
        <div className="divide-y divide-white/5">
          {doctors.map(doc => (
            <div key={doc.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-400 text-xs font-bold">
                    {doc.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{doc.name}</p>
                  <p className="text-xs text-slate-400">{doc.email}{doc.specialty ? ` · ${doc.specialty}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {doc._count.patients} pacientes
                </span>
                <span className="flex items-center gap-1">
                  <Stethoscope className="w-3.5 h-3.5" />
                  {doc._count.doctorAppointments} consultas
                </span>
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  {doc._count.doctorTeam} secretaria(s)
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
      </div>

      {/* Patients Table */}
      <div className="bg-slate-800 rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-white flex-1">Pacientes</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="bg-slate-700 text-sm text-white pl-9 pr-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 w-56"
              placeholder="Buscar paciente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="bg-slate-700 text-sm text-slate-300 px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none"
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

        {loadingPatients ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Nenhum paciente encontrado</div>
        ) : (
          <div className="divide-y divide-white/5">
            {patients.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.phone}{p.cpf ? ` · CPF: ${p.cpf}` : ''} · {p._count.appointments} consulta(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.doctor ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {p.doctor.name}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Sem médico
                    </span>
                  )}

                  <div className="relative">
                    <button
                      onClick={() => setAssigningId(prev => (prev === p.id ? null : p.id))}
                      className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Atribuir <ChevronDown className="w-3 h-3" />
                    </button>
                    {assigningId === p.id && (
                      <div className="absolute right-0 top-full mt-1 bg-slate-700 border border-white/10 rounded-lg shadow-xl z-10 min-w-48 py-1">
                        <button
                          onClick={() => assignMutation.mutate({ patientId: p.id, doctorId: null })}
                          className="w-full text-left px-3 py-2 text-xs text-amber-400 hover:bg-white/5"
                        >
                          Remover atribuição
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        {doctors.map(d => (
                          <button
                            key={d.id}
                            onClick={() => assignMutation.mutate({ patientId: p.id, doctorId: d.id })}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 ${
                              p.doctorId === d.id ? 'text-blue-400 font-medium' : 'text-slate-300'
                            }`}
                          >
                            {d.name}{p.doctorId === d.id ? ' ✓' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
