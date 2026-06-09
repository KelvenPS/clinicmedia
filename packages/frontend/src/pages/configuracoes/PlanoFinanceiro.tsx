import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, CreditCard, Users, CheckCircle, XCircle, Percent, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { HealthPlan } from '../../types'
import Modal from '../../components/ui/Modal'

const PLAN_TYPES = [
  {
    value: 'PARTICULAR',
    label: 'Particular',
    description: 'Atendimento sem convênio',
    icon: '💳',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
  },
  {
    value: 'CONVENIO',
    label: 'Convênio',
    description: 'Plano de saúde / convênio médico',
    icon: '🏥',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  {
    value: 'OUTROS',
    label: 'Outros',
    description: 'Tipo personalizado de plano',
    icon: '✨',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-300',
  },
]

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  type: z.enum(['PARTICULAR', 'CONVENIO', 'OUTROS']),
  customTypeName: z.string().optional(),
  description: z.string().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  defaultValue: z.coerce.number().min(0).optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

function PlanForm({ plan, onSubmit, loading }: { plan: HealthPlan | null; onSubmit: (d: FormData) => void; loading: boolean }) {
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: plan?.name || '',
      type: plan?.type || 'PARTICULAR',
      customTypeName: plan?.customTypeName || '',
      description: plan?.description || '',
      discountPercent: plan?.discountPercent ?? '',
      defaultValue: plan?.defaultValue ?? '',
    },
  })

  const watchType = watch('type')
  const selectedType = PLAN_TYPES.find(t => t.value === watchType)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <label className="label">Nome do Plano *</label>
        <input
          {...register('name')}
          className="input-field"
          placeholder="Ex: Unimed Empresarial, Particular Premium..."
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      {/* Type selection as visual cards */}
      <div>
        <label className="label mb-2">Tipo de Plano *</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PLAN_TYPES.map(type => (
            <label
              key={type.value}
              className={`relative flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${watchType === type.value ? `${type.border} ${type.bg}` : 'border-slate-200 hover:border-slate-300'}`}
            >
              <input {...register('type')} type="radio" value={type.value} className="sr-only" />
              <span className="text-2xl mb-1">{type.icon}</span>
              <span className={`text-sm font-semibold ${watchType === type.value ? type.color : 'text-slate-600'}`}>{type.label}</span>
              <span className="text-xs text-slate-400 text-center mt-0.5 leading-tight">{type.description}</span>
              {watchType === type.value && (
                <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center ${type.border.replace('border-', 'bg-')}`}>
                  <div className="w-2 h-2 bg-white rounded-full" />
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Custom type name (for OUTROS) */}
      {watchType === 'OUTROS' && (
        <div>
          <label className="label">Nome do Tipo Personalizado</label>
          <input
            {...register('customTypeName')}
            className="input-field"
            placeholder="Ex: Cooperativa Médica, IPO, DPVAT..."
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-slate-500" />
            Valor Padrão (R$)
          </label>
          <input
            {...register('defaultValue')}
            type="number"
            step="0.01"
            min="0"
            className="input-field"
            placeholder="0,00"
          />
          <p className="text-xs text-slate-400 mt-1">Valor base da consulta neste plano</p>
        </div>

        <div>
          <label className="label flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-slate-500" />
            Desconto (%)
          </label>
          <div className="relative">
            <input
              {...register('discountPercent')}
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="input-field pr-8"
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Percentual de desconto do plano</p>
        </div>
      </div>

      {/* CONVENIO extra info */}
      {watchType === 'CONVENIO' && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-start gap-2">
          <CreditCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>No cadastro do paciente, você pode informar o número da carteirinha para este convênio.</p>
        </div>
      )}

      <div>
        <label className="label">Descrição do Plano</label>
        <textarea
          {...register('description')}
          rows={3}
          className="input-field resize-none"
          placeholder="Descreva as coberturas, procedimentos aceitos, observações importantes..."
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : plan ? 'Atualizar Plano' : 'Criar Plano de Saúde'}
      </button>
    </form>
  )
}

const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
  PARTICULAR: { label: 'Particular', color: 'text-blue-700', bg: 'bg-blue-100' },
  CONVENIO: { label: 'Convênio', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  OUTROS: { label: 'Outros', color: 'text-purple-700', bg: 'bg-purple-100' },
}

export default function PlanoFinanceiro() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<HealthPlan | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { data: plans = [] } = useQuery<HealthPlan[]>({
    queryKey: ['health-plans-all'],
    queryFn: () => api.get('/health-plans/all').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editPlan ? api.put(`/health-plans/${editPlan.id}`, data) : api.post('/health-plans', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health-plans-all'] })
      qc.invalidateQueries({ queryKey: ['health-plans'] })
      toast.success(editPlan ? 'Plano atualizado!' : 'Plano criado!')
      setModalOpen(false)
      setEditPlan(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao salvar plano')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/health-plans/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['health-plans-all'] })
      toast.success('Status do plano alterado')
    },
  })

  const displayedPlans = showAll ? plans : plans.filter(p => p.active)
  const stats = {
    total: plans.length,
    active: plans.filter(p => p.active).length,
    convenio: plans.filter(p => p.type === 'CONVENIO').length,
    totalPatients: plans.reduce((acc, p) => acc + (p._count?.patientPlans ?? 0), 0),
  }

  const handleNew = () => { setEditPlan(null); setModalOpen(true) }
  const handleEdit = (p: HealthPlan) => { setEditPlan(p); setModalOpen(true) }

  return (
    <div className="max-w-3xl space-y-6 animate-page-enter">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Planos de Saúde</h1>
          <p className="page-subtitle">Cadastre convênios e formas de atendimento</p>
        </div>
        <button onClick={handleNew} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" />
          Novo Plano
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total de Planos', value: stats.total, icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Planos Ativos', value: stats.active, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Convênios', value: stats.convenio, icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Vínculos', value: stats.totalPatients, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }, idx) => (
          <div key={label} className={`card flex items-center gap-3 py-4 ${bg} animate-stagger-${idx+1}`}>
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Plans list */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">
            {displayedPlans.length} planos {!showAll && 'ativos'}
          </h2>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {showAll ? 'Mostrar apenas ativos' : 'Mostrar todos'}
          </button>
        </div>

        {displayedPlans.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400">Nenhum plano cadastrado</p>
            <button onClick={handleNew} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
              Criar primeiro plano
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedPlans.map(plan => {
              const tc = typeConfig[plan.type] || typeConfig.OUTROS
              return (
                <div key={plan.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${!plan.active ? 'opacity-60' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tc.bg}`}>
                    <CreditCard className={`w-5 h-5 ${tc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{plan.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tc.bg} ${tc.color}`}>
                        {plan.customTypeName || tc.label}
                      </span>
                      {!plan.active && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativo</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {plan.defaultValue != null && plan.defaultValue > 0 && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          R$ {plan.defaultValue.toFixed(2)}
                        </span>
                      )}
                      {plan.discountPercent != null && plan.discountPercent > 0 && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <Percent className="w-3 h-3" />
                          {plan.discountPercent}% desconto
                        </span>
                      )}
                      {plan.description && (
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{plan.description}</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{plan._count?.patientPlans ?? 0} pacientes vinculados</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(plan)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(plan.id)}
                      className={`p-1.5 rounded-lg transition-colors ${plan.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                      title={plan.active ? 'Desativar' : 'Ativar'}
                    >
                      {plan.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Como usar os Planos de Saúde
        </h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          <li>• Cadastre todos os convênios e formas de pagamento que sua clínica aceita</li>
          <li>• Defina o valor padrão e o percentual de desconto por plano</li>
          <li>• No cadastro do paciente, vincule os planos com número da carteirinha (Convênio)</li>
          <li>• Tipos personalizados: use "Outros" e defina o nome do tipo</li>
        </ul>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditPlan(null) }}
        title={editPlan ? 'Editar Plano de Saúde' : 'Novo Plano de Saúde'}
        size="lg"
      >
        <PlanForm
          plan={editPlan}
          onSubmit={(data) => saveMutation.mutate(data as unknown as FormData)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
