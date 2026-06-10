import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Search, Phone, Mail, Edit2, Users, Calendar, UserCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { Patient } from '../types'
import Modal from '../components/ui/Modal'
import PatientForm from '../components/Patients/PatientForm'
import { SkeletonTable } from '../components/ui/SkeletonCard'
import PageHeader from '../components/ui/PageHeader'

export default function Pacientes() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [search, setSearch] = useState('')

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ['patients', search],
    queryFn: () => api.get('/patients', { params: search ? { search } : {} }).then(r => r.data),
  })

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
                <th className="table-head-cell hidden lg:table-cell">CPF</th>
                <th className="table-head-cell">Idade</th>
                <th className="table-head-cell">Consultas</th>
                <th className="table-head-cell hidden md:table-cell">Cadastro</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <SkeletonTable rows={6} cols={6} />
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={7}>
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
                  return (
                    <tr
                      key={p.id}
                      className="table-row group cursor-pointer"
                      style={{ animationDelay: `${idx * 0.03}s` }}
                      onClick={() => handleEdit(p)}
                    >
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600
                                          flex items-center justify-center flex-shrink-0
                                          shadow-sm shadow-blue-400/20
                                          group-hover:shadow-blue-400/40 transition-shadow duration-200">
                            <span className="text-white text-xs font-bold">{initials}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 text-sm group-hover:text-blue-700 transition-colors duration-150">
                              {p.name}
                            </p>
                            {p.address && (
                              <p className="text-xs text-slate-400 truncate max-w-[160px]">{p.address}</p>
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
                        <button
                          onClick={() => handleEdit(p)}
                          className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50
                                     rounded-lg transition-all duration-150 active:scale-90"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
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
            return (
              <div
                key={p.id}
                className="card-hover flex items-center gap-3 py-4"
                style={{ animationDelay: `${idx * 0.04}s` }}
                onClick={() => handleEdit(p)}
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-400/30">
                  <span className="text-white text-sm font-bold">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {p.phone}
                    </p>
                    {age !== null && (
                      <span className="text-xs text-slate-400">· {age} anos</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {p._count?.appointments ?? 0} consultas
                  </span>
                  <Edit2 className="w-3.5 h-3.5 text-slate-300" />
                </div>
              </div>
            )
          })
        )}
      </div>

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
    </div>
  )
}
