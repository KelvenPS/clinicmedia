import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Search, Phone, Mail, Edit2, Users, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import type { Patient } from '../types'
import Modal from '../components/ui/Modal'
import PatientForm from '../components/Patients/PatientForm'

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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Pacientes</h1>
          <p className="page-subtitle">Gerencie o cadastro de pacientes</p>
        </div>
        <button onClick={handleNew} className="btn-primary self-start">
          <Plus className="w-4 h-4" />
          Novo Paciente
        </button>
      </div>

      {/* Search + count */}
      <div className="card py-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone..."
              className="input-field pl-9 py-2"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Users className="w-4 h-4" />
            <span><strong className="text-slate-700">{patients.length}</strong> pacientes</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contato</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">CPF</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Idade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Consultas</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cadastro</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">Carregando...</td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-400">Nenhum paciente encontrado</p>
                  </td>
                </tr>
              ) : (
                patients.map(p => {
                  const initials = p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                  const age = p.birthDate ? differenceInYears(new Date(), parseISO(p.birthDate)) : null
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">{initials}</span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{p.name}</p>
                            {p.address && (
                              <p className="text-xs text-slate-400 truncate max-w-[160px]">{p.address}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            {p.phone}
                          </div>
                          {p.email && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{p.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">{p.cpf || '–'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {age !== null ? (
                          <>
                            <span className="font-medium">{age}</span>
                            <span className="text-slate-400"> anos</span>
                          </>
                        ) : '–'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-700 font-medium">{p._count?.appointments ?? 0}</span>
                          <span className="text-slate-400">consultas</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleEdit(p)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
