import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Search,
  Plus,
  ClipboardList,
  User,
  ChevronRight,
  FileText,
  Stethoscope,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Patient, User as UserType, GroupedMedicalRecord, MedicalRecord } from '../types'
import Modal from '../components/ui/Modal'

const recordTypeConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  ANAMNESE: { label: 'Anamnese', color: 'text-blue-700', bg: 'bg-blue-100', icon: '📋' },
  EVOLUCAO: { label: 'Evolução', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: '📈' },
  PRESCRICAO: { label: 'Prescrição', color: 'text-purple-700', bg: 'bg-purple-100', icon: '💊' },
  EXAME: { label: 'Exame', color: 'text-amber-700', bg: 'bg-amber-100', icon: '🔬' },
  ATESTADO: { label: 'Atestado', color: 'text-red-700', bg: 'bg-red-100', icon: '📄' },
  OUTROS: { label: 'Outros', color: 'text-slate-700', bg: 'bg-slate-100', icon: '📝' },
}

const schema = z.object({
  patientId: z.string().min(1, 'Selecione um paciente'),
  doctorId: z.string().min(1, 'Selecione um médico'),
  type: z.enum(['ANAMNESE', 'EVOLUCAO', 'PRESCRICAO', 'EXAME', 'ATESTADO', 'OUTROS']),
  title: z.string().min(2, 'Título obrigatório'),
  content: z.string().min(10, 'Conteúdo muito curto'),
  date: z.string(),
})

type FormData = z.infer<typeof schema>

function RecordCard({ record, onDelete, canDelete }: { record: MedicalRecord; onDelete: () => void; canDelete: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const tc = recordTypeConfig[record.type] || recordTypeConfig.OUTROS

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xl flex-shrink-0">{tc.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 text-sm">{record.title}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.bg} ${tc.color}`}>
              {tc.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {format(new Date(record.date), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50">
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{record.content}</p>
          {canDelete && (
            <div className="flex justify-end mt-3">
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir registro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecordForm({
  defaultPatientId,
  patients,
  doctors,
  currentUser,
  onSubmit,
  loading,
}: {
  defaultPatientId?: string
  patients: Patient[]
  doctors: UserType[]
  currentUser: { id: string; role: string } | null
  onSubmit: (data: FormData) => void
  loading: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      patientId: defaultPatientId || '',
      doctorId: currentUser?.role === 'DOCTOR' ? currentUser.id : '',
      type: 'EVOLUCAO',
      date: format(new Date(), 'yyyy-MM-dd'),
      title: '',
      content: '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Paciente *</label>
          <select {...register('patientId')} className="input-field">
            <option value="">Selecione</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.patientId && <p className="text-xs text-red-500 mt-1">{errors.patientId.message}</p>}
        </div>
        <div>
          <label className="label">Médico *</label>
          <select {...register('doctorId')} className="input-field" disabled={currentUser?.role === 'DOCTOR'}>
            <option value="">Selecione</option>
            {doctors.map(d => <option key={d.id} value={d.id}>Dr(a). {d.name}</option>)}
          </select>
          {errors.doctorId && <p className="text-xs text-red-500 mt-1">{errors.doctorId.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo *</label>
          <select {...register('type')} className="input-field">
            {Object.entries(recordTypeConfig).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Data</label>
          <input {...register('date')} type="date" className="input-field" />
        </div>
      </div>

      <div>
        <label className="label">Título *</label>
        <input {...register('title')} className="input-field" placeholder="Ex: Consulta de retorno, Anamnese inicial..." />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="label">Conteúdo / Descrição *</label>
        <textarea
          {...register('content')}
          rows={6}
          className="input-field resize-none"
          placeholder="Descreva o atendimento, sintomas, diagnóstico, orientações..."
        />
        {errors.content && <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>}
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : 'Salvar Prontuário'}
      </button>
    </form>
  )
}

export default function Prontuario() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['patients', search],
    queryFn: () => api.get('/patients', { params: search ? { search } : {} }).then(r => r.data),
  })

  const { data: doctors = [] } = useQuery<UserType[]>({
    queryKey: ['doctors'],
    queryFn: () => api.get('/doctors').then(r => r.data),
  })

  const { data: grouped = [] } = useQuery<GroupedMedicalRecord[]>({
    queryKey: ['prontuario', selectedPatient?.id],
    queryFn: () => api.get(`/medical-records/by-patient/${selectedPatient!.id}`).then(r => r.data),
    enabled: !!selectedPatient,
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/medical-records', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prontuario'] })
      toast.success('Prontuário registrado!')
      setModalOpen(false)
    },
    onError: () => toast.error('Erro ao salvar prontuário'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/medical-records/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prontuario'] })
      toast.success('Registro removido')
    },
  })

  const totalRecords = grouped.reduce((acc, g) => acc + g.records.length, 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Prontuário Eletrônico</h1>
          <p className="page-subtitle">Registros médicos organizados por paciente</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Novo Registro
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" style={{ minHeight: '600px' }}>
        {/* Patient list */}
        <div className="card p-0 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar paciente..."
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {patients.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">Nenhum paciente encontrado</div>
            ) : (
              patients.map(p => {
                const isSelected = selectedPatient?.id === p.id
                const initials = p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-100 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-900'}`}>{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.phone}</p>
                    </div>
                    {isSelected && <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Records panel */}
        <div className="xl:col-span-2 card p-0 overflow-hidden flex flex-col">
          {!selectedPatient ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <ClipboardList className="w-14 h-14 text-slate-200 mb-4" />
              <p className="text-slate-400 font-medium">Selecione um paciente</p>
              <p className="text-slate-400 text-sm">para visualizar seu prontuário</p>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-bold">
                        {selectedPatient.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{selectedPatient.name}</p>
                      <p className="text-xs text-slate-500">{selectedPatient.phone} · {totalRecords} registros</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setModalOpen(true)}
                    className="btn-primary text-xs py-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Registro
                  </button>
                </div>
              </div>

              {/* Records grouped by doctor */}
              <div className="overflow-y-auto flex-1 p-5 space-y-6">
                {grouped.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400">Nenhum prontuário registrado</p>
                    <button
                      onClick={() => setModalOpen(true)}
                      className="text-blue-600 text-sm font-medium mt-2 hover:underline"
                    >
                      Criar primeiro registro
                    </button>
                  </div>
                ) : (
                  grouped.map(group => (
                    <div key={group.doctor.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <Stethoscope className="w-4 h-4 text-blue-600" />
                        <h3 className="font-semibold text-slate-900">Dr(a). {group.doctor.name}</h3>
                        {group.doctor.specialty && (
                          <span className="text-xs text-slate-400">· {group.doctor.specialty}</span>
                        )}
                        <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {group.records.length} registro{group.records.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-2 pl-6 border-l-2 border-blue-100">
                        {group.records.map(record => (
                          <RecordCard
                            key={record.id}
                            record={record}
                            canDelete={user?.role === 'ADMIN' || user?.role === 'DOCTOR'}
                            onDelete={() => deleteMutation.mutate(record.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Registro de Prontuário"
        size="lg"
      >
        <RecordForm
          defaultPatientId={selectedPatient?.id}
          patients={patients}
          doctors={doctors}
          currentUser={user}
          onSubmit={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
        />
      </Modal>
    </div>
  )
}
