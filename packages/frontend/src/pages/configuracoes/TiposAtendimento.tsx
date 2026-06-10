import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Stethoscope, DollarSign, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { AppointmentType } from '../../types'
import Modal from '../../components/ui/Modal'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  baseValue: z.coerce.number().min(0).optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

function TypeForm({
  apptType,
  onSubmit,
  loading,
}: {
  apptType: AppointmentType | null
  onSubmit: (d: FormData) => void
  loading: boolean
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: apptType?.name || '',
      baseValue: apptType?.baseValue ?? '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="label">Nome do Tipo *</label>
        <input
          {...register('name')}
          className="input-field"
          placeholder="Ex: Consulta, Retorno, Exame, Avaliação..."
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5 text-slate-500" />
          Valor Base (R$)
        </label>
        <input
          {...register('baseValue')}
          type="number"
          step="0.01"
          min="0"
          className="input-field"
          placeholder="0,00"
        />
        <p className="text-xs text-slate-400 mt-1">
          Valor padrão para este tipo de atendimento. O desconto do plano do paciente será aplicado automaticamente.
        </p>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
        <p className="font-medium mb-1">Como funciona o cálculo automático:</p>
        <p>Ao agendar uma consulta, o valor base será descontado pelo percentual do plano de saúde do paciente, gerando o valor de repasse automaticamente.</p>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : apptType ? 'Atualizar Tipo' : 'Criar Tipo de Atendimento'}
      </button>
    </form>
  )
}

export default function TiposAtendimento() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editType, setEditType] = useState<AppointmentType | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { data: types = [] } = useQuery<AppointmentType[]>({
    queryKey: ['appointment-types-all'],
    queryFn: () => api.get('/appointment-types/all').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editType
        ? api.put(`/appointment-types/${editType.id}`, data)
        : api.post('/appointment-types', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-types-all'] })
      qc.invalidateQueries({ queryKey: ['appointment-types'] })
      toast.success(editType ? 'Tipo atualizado!' : 'Tipo criado!')
      setModalOpen(false)
      setEditType(null)
    },
    onError: () => toast.error('Erro ao salvar tipo de atendimento'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/appointment-types/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-types-all'] })
      toast.success('Status alterado')
    },
  })

  const displayed = showAll ? types : types.filter(t => t.active)

  const handleNew = () => { setEditType(null); setModalOpen(true) }
  const handleEdit = (t: AppointmentType) => { setEditType(t); setModalOpen(true) }

  return (
    <div className="max-w-3xl space-y-6 page-stagger">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Tipos de Atendimento</h1>
          <p className="page-subtitle">Cadastre os tipos de consulta com seus valores base</p>
        </div>
        <button onClick={handleNew} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" />
          Novo Tipo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card flex items-center gap-3 py-4 bg-blue-50 animate-stagger-1">
          <Stethoscope className="w-8 h-8 text-blue-600" />
          <div>
            <p className="text-2xl font-bold text-blue-600">{types.length}</p>
            <p className="text-xs text-slate-500">Total de tipos</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 py-4 bg-emerald-50 animate-stagger-2">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
          <div>
            <p className="text-2xl font-bold text-emerald-600">{types.filter(t => t.active).length}</p>
            <p className="text-xs text-slate-500">Tipos ativos</p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">
            {displayed.length} tipos {!showAll && 'ativos'}
          </h2>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {showAll ? 'Mostrar apenas ativos' : 'Mostrar todos'}
          </button>
        </div>

        {displayed.length === 0 ? (
          <div className="text-center py-12">
            <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400">Nenhum tipo cadastrado</p>
            <button onClick={handleNew} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
              Criar primeiro tipo
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayed.map(t => (
              <div
                key={t.id}
                className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${!t.active ? 'opacity-60' : ''}`}
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{t.name}</p>
                    {!t.active && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  {t.baseValue != null && t.baseValue > 0 ? (
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      Valor base: <span className="font-semibold text-slate-700">R$ {t.baseValue.toFixed(2).replace('.', ',')}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-0.5">Sem valor base definido</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(t)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate(t.id)}
                    className={`p-1.5 rounded-lg transition-colors ${t.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    title={t.active ? 'Desativar' : 'Ativar'}
                  >
                    {t.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card bg-amber-50 border-amber-200">
        <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <Stethoscope className="w-4 h-4" />
          Como usar os Tipos de Atendimento
        </h3>
        <ul className="text-sm text-amber-800 space-y-1.5">
          <li>• Cadastre os tipos de consulta praticados (Consulta, Retorno, Exame, etc.)</li>
          <li>• Defina o valor base de cada tipo de atendimento</li>
          <li>• Na agenda, ao selecionar o tipo, o valor é preenchido automaticamente</li>
          <li>• O desconto do plano de saúde do paciente é aplicado sobre o valor base</li>
          <li>• Ao concluir o atendimento, o valor de repasse é lançado automaticamente no financeiro</li>
        </ul>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditType(null) }}
        title={editType ? 'Editar Tipo de Atendimento' : 'Novo Tipo de Atendimento'}
      >
        <TypeForm
          apptType={editType}
          onSubmit={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
