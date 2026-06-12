import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, CreditCard, Users, CheckCircle, XCircle, Percent, DollarSign, Info, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { HealthPlan, Room } from '../../types'
import Modal from '../../components/ui/Modal'

const PLAN_TYPES = [
  {
    value: 'PARTICULAR',
    label: 'Particular',
    description: 'Sem convênio',
    icon: '💳',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
  },
  {
    value: 'CONVENIO',
    label: 'Convênio',
    description: 'Plano de saúde',
    icon: '🏥',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
  },
  {
    value: 'OUTROS',
    label: 'Outros',
    description: 'Tipo personalizado',
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
  roomId: z.string().optional().nullable(),
})

type FormData = z.infer<typeof schema>

function PlanForm({ plan, rooms, onSubmit, loading }: { plan: HealthPlan | null; rooms: Room[]; onSubmit: (d: FormData) => void; loading: boolean }) {
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: plan?.name || '',
      type: plan?.type || 'PARTICULAR',
      customTypeName: plan?.customTypeName || '',
      description: plan?.description || '',
      discountPercent: plan?.discountPercent ?? '',
      defaultValue: plan?.defaultValue ?? '',
      roomId: plan?.roomId || '',
    },
  })

  const watchType = watch('type')

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

      <div>
        <label className="label mb-2">Tipo de Plano *</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PLAN_TYPES.map(type => (
            <label
              key={type.value}
              className={`relative flex flex-col items-center p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                watchType === type.value
                  ? `${type.border} ${type.bg} shadow-sm`
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input {...register('type')} type="radio" value={type.value} className="sr-only" />
              <span className="text-2xl mb-1.5">{type.icon}</span>
              <span className={`text-sm font-semibold ${watchType === type.value ? type.color : 'text-slate-600'}`}>
                {type.label}
              </span>
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
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
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
          <p className="text-xs text-slate-400 mt-1">Valor base da consulta</p>
        </div>

        <div>
          <label className="label flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 text-slate-400" />
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
          <p className="text-xs text-slate-400 mt-1">Percentual de desconto</p>
        </div>
      </div>

      {watchType === 'CONVENIO' && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-start gap-2">
          <CreditCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>No cadastro do paciente, você pode informar o número da carteirinha para este convênio.</p>
        </div>
      )}

      {rooms.length > 0 && (
        <div>
          <label className="label flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            Sala vinculada
          </label>
          <select {...register('roomId')} className="input-field">
            <option value="">Sem sala vinculada (todas as salas)</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}{r.cidade ? ` — ${r.cidade}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            Selecione a sala onde este plano é aceito. O paciente verá a sala ao escolher este plano.
          </p>
        </div>
      )}

      <div>
        <label className="label">Descrição do Plano</label>
        <textarea
          {...register('description')}
          rows={3}
          className="input-field resize-none"
          placeholder="Coberturas, procedimentos aceitos, observações..."
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

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  PARTICULAR: { label: 'Particular', color: 'text-blue-700', bg: 'bg-blue-100', icon: '💳' },
  CONVENIO: { label: 'Convênio', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: '🏥' },
  OUTROS: { label: 'Outros', color: 'text-purple-700', bg: 'bg-purple-100', icon: '✨' },
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

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms').then(r => r.data),
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
    <div className="max-w-3xl space-y-6 page-stagger">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="animate-stagger-1">
          <h1 className="page-title">Planos de Saúde</h1>
          <p className="page-subtitle">Cadastre convênios e formas de atendimento</p>
        </div>
        <button onClick={handleNew} className="btn-primary self-start animate-stagger-1">
          <Plus className="w-4 h-4" />
          Novo Plano
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-stagger-2">
        {[
          { label: 'Total', value: stats.total, icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'Ativos', value: stats.active, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Convênios', value: stats.convenio, icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
          { label: 'Vínculos', value: stats.totalPatients, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className="card flex items-center gap-3 py-4">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center border ${border} flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${color} tabular-nums`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Plans list */}
      <div className="card p-0 overflow-hidden animate-stagger-3">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            {displayedPlans.length > 0 && (
              <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold tabular-nums">
                {displayedPlans.length}
              </span>
            )}
            Planos {!showAll && 'ativos'}
          </h2>
          {plans.length > 0 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
            >
              {showAll ? 'Apenas ativos' : 'Ver todos'}
            </button>
          )}
        </div>

        {displayedPlans.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-float">
              <CreditCard className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">Nenhum plano cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">Comece criando um plano de atendimento</p>
            <button onClick={handleNew} className="mt-4 btn-primary text-sm">
              <Plus className="w-3.5 h-3.5" />
              Criar primeiro plano
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedPlans.map((plan, idx) => {
              const tc = typeConfig[plan.type] || typeConfig.OUTROS
              return (
                <div
                  key={plan.id}
                  className={`flex items-center gap-4 px-5 py-4 group hover:bg-slate-50 transition-colors duration-150 ${!plan.active ? 'opacity-60' : ''}`}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${tc.bg}`}>
                    {tc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors duration-150">
                        {plan.name}
                      </p>
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
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {plan._count?.patientPlans ?? 0} vínculos
                      </span>
                      {plan.room && (
                        <span className="text-xs text-indigo-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {plan.room.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
                  {/* Mobile always-visible actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 sm:hidden">
                    <button
                      onClick={() => handleEdit(plan)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="card bg-blue-50 border-blue-200 animate-stagger-4">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center border border-blue-200">
            <Info className="w-3.5 h-3.5 text-blue-600" />
          </div>
          Como usar os Planos de Saúde
        </h3>
        <ul className="text-sm text-blue-700 space-y-2">
          {[
            'Cadastre todos os convênios e formas de atendimento que sua clínica aceita',
            'Defina o valor padrão e o percentual de desconto por plano',
            'No cadastro do paciente, vincule os planos com número da carteirinha (Convênio)',
            'Tipos personalizados: use "Outros" e defina o nome do tipo',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
              {item}
            </li>
          ))}
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
          rooms={rooms}
          onSubmit={(data) => saveMutation.mutate(data as unknown as FormData)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
