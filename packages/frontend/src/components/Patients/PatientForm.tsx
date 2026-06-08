import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, CreditCard, ArrowRight } from 'lucide-react'
import api from '../../lib/api'
import type { Patient, HealthPlan } from '../../types'

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  phone: z.string().min(10, 'Telefone inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface PlanEntry {
  healthPlanId: string
  value: number | undefined
  walletNumber: string
}

interface Props {
  patient: Patient | null
  onSubmit: (data: FormData & { plans: PlanEntry[] }) => void
  loading: boolean
}

const typeLabel: Record<string, string> = {
  PARTICULAR: 'Particular',
  CONVENIO: 'Convênio',
  OUTROS: 'Outros',
}

export default function PatientForm({ patient, onSubmit, loading }: Props) {
  const [plans, setPlans] = useState<PlanEntry[]>([])

  const { data: healthPlans = [] } = useQuery<HealthPlan[]>({
    queryKey: ['health-plans'],
    queryFn: () => api.get('/health-plans').then(r => r.data),
  })

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (patient) {
      setValue('name', patient.name)
      setValue('phone', patient.phone)
      setValue('email', patient.email || '')
      setValue('cpf', patient.cpf || '')
      setValue('rg', patient.rg || '')
      setValue('address', patient.address || '')
      setValue('notes', patient.notes || '')
      if (patient.birthDate) setValue('birthDate', format(new Date(patient.birthDate), 'yyyy-MM-dd'))

      if (patient.patientPlans) {
        setPlans(patient.patientPlans.map(pp => ({
          healthPlanId: pp.healthPlanId,
          value: pp.value ?? undefined,
          walletNumber: pp.walletNumber || '',
        })))
      }
    }
  }, [patient, setValue])

  const addPlan = () => {
    setPlans(prev => [...prev, { healthPlanId: '', value: undefined, walletNumber: '' }])
  }

  const removePlan = (i: number) => {
    setPlans(prev => prev.filter((_, idx) => idx !== i))
  }

  const updatePlan = (i: number, field: keyof PlanEntry, value: string | number | undefined) => {
    setPlans(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const getPlanType = (planId: string) => healthPlans.find(p => p.id === planId)?.type || ''

  const getRepasse = (plan: PlanEntry): { base: number; repasse: number; discount: number } | null => {
    const hp = healthPlans.find(p => p.id === plan.healthPlanId)
    if (!hp) return null
    const discount = hp.discountPercent ?? 0
    const base = plan.value ?? hp.defaultValue ?? null
    if (base === null) return null
    return { base, repasse: base * (1 - discount / 100), discount }
  }

  const handleFormSubmit = (data: FormData) => {
    const validPlans = plans.filter(p => p.healthPlanId)
    onSubmit({ ...data, plans: validPlans })
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Personal data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Nome completo *</label>
          <input {...register('name')} className="input-field" placeholder="Nome do paciente" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Telefone *</label>
          <input {...register('phone')} className="input-field" placeholder="(11) 99999-0000" />
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label className="label">Email</label>
          <input {...register('email')} type="email" className="input-field" placeholder="email@exemplo.com" />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">CPF</label>
          <input {...register('cpf')} className="input-field font-mono" placeholder="000.000.000-00" />
        </div>

        <div>
          <label className="label">RG</label>
          <input {...register('rg')} className="input-field font-mono" placeholder="00.000.000-0" />
        </div>

        <div>
          <label className="label">Data de Nascimento</label>
          <input {...register('birthDate')} type="date" className="input-field" />
        </div>
      </div>

      <div>
        <label className="label">Endereço</label>
        <input {...register('address')} className="input-field" placeholder="Rua, número, bairro - Cidade/UF" />
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea {...register('notes')} rows={2} className="input-field resize-none" placeholder="Informações relevantes..." />
      </div>

      {/* Health plans section */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-slate-900 text-sm">Planos de Saúde</span>
            {plans.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{plans.length}</span>
            )}
          </div>
          <button
            type="button"
            onClick={addPlan}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar plano
          </button>
        </div>

        {plans.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <p className="text-sm text-slate-400">Nenhum plano vinculado</p>
            <button type="button" onClick={addPlan} className="text-blue-600 text-xs font-medium mt-1 hover:underline">
              + Vincular plano de saúde
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {plans.map((plan, i) => {
              const planType = getPlanType(plan.healthPlanId)
              const isConvenio = planType === 'CONVENIO'
              const repasseInfo = getRepasse(plan)

              return (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Plano</label>
                        <select
                          value={plan.healthPlanId}
                          onChange={e => updatePlan(i, 'healthPlanId', e.target.value)}
                          className="input-field text-sm"
                        >
                          <option value="">Selecione o plano</option>
                          {healthPlans.map(hp => (
                            <option key={hp.id} value={hp.id}>
                              {hp.name} ({typeLabel[hp.type]})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Valor (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={plan.value ?? ''}
                          onChange={e => updatePlan(i, 'value', e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="input-field text-sm"
                          placeholder="0,00"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removePlan(i)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-5 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {repasseInfo && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-1">
                        <span>R$ {repasseInfo.base.toFixed(2).replace('.', ',')}</span>
                        {repasseInfo.discount > 0 && (
                          <>
                            <span className="text-slate-400">−{repasseInfo.discount}%</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-emerald-700 font-medium">Valor de repasse</p>
                        <p className="text-sm font-bold text-emerald-800">
                          R$ {repasseInfo.repasse.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    </div>
                  )}

                  {isConvenio && (
                    <div>
                      <label className="label flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                        Número da Carteirinha
                      </label>
                      <input
                        type="text"
                        value={plan.walletNumber}
                        onChange={e => updatePlan(i, 'walletNumber', e.target.value)}
                        className="input-field text-sm font-mono"
                        placeholder="Número da carteira do convênio"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : patient ? 'Atualizar Paciente' : 'Cadastrar Paciente'}
      </button>
    </form>
  )
}
