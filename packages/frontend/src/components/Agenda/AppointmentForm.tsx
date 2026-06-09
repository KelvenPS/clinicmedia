import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Trash2, ArrowRight, Info } from 'lucide-react'
import type { Appointment, User, Patient, AuthUser, AppointmentType } from '../../types'

const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 40, label: '40 min' },
  { value: 50, label: '50 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h 30min' },
]

const schema = z.object({
  patientId: z.string().min(1, 'Selecione um paciente'),
  doctorId: z.string().min(1, 'Selecione um médico'),
  title: z.string().min(2, 'Título muito curto'),
  date: z.string().min(1, 'Data obrigatória'),
  duration: z.coerce.number().min(15),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  type: z.string().optional(),
  value: z.coerce.number().optional(),
  notes: z.string().optional(),
  isBlocked: z.boolean().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  appointment: Appointment | null
  defaultDate?: Date
  doctors: User[]
  patients: Patient[]
  appointmentTypes: AppointmentType[]
  currentUser: AuthUser | null
  onSubmit: (data: FormData) => void
  onDelete?: () => void
  loading: boolean
}

export default function AppointmentForm({
  appointment,
  defaultDate,
  doctors,
  patients,
  appointmentTypes,
  currentUser,
  onSubmit,
  onDelete,
  loading,
}: Props) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'SCHEDULED',
      duration: 50,
      doctorId: currentUser?.role === 'DOCTOR' ? currentUser.id : '',
      isBlocked: false,
    },
  })

  const watchPatient = watch('patientId')
  const watchType = watch('type')
  const watchValue = watch('value')
  const watchBlocked = watch('isBlocked')

  useEffect(() => {
    if (appointment) {
      setValue('patientId', appointment.patientId)
      setValue('doctorId', appointment.doctorId)
      setValue('title', appointment.title)
      setValue('date', format(new Date(appointment.date), "yyyy-MM-dd'T'HH:mm"))
      setValue('duration', appointment.duration)
      setValue('status', appointment.status)
      setValue('type', appointment.type || '')
      setValue('value', appointment.value || undefined)
      setValue('notes', appointment.notes || '')
      setValue('isBlocked', appointment.isBlocked ?? false)
    } else if (defaultDate) {
      setValue('date', format(defaultDate, "yyyy-MM-dd'T'HH:mm"))
    } else {
      const now = new Date()
      now.setMinutes(0, 0, 0)
      setValue('date', format(now, "yyyy-MM-dd'T'HH:mm"))
    }
  }, [appointment, defaultDate, setValue])

  // Auto-fill doctorId for SECRETARY: they can only schedule for their linked doctor.
  // If there's exactly one available doctor in the list, pre-select and lock the field.
  useEffect(() => {
    if (!appointment && currentUser?.role === 'SECRETARY' && doctors.length === 1) {
      setValue('doctorId', doctors[0].id)
    }
  }, [doctors, currentUser, appointment, setValue])

  const selectedPatient = patients.find(p => p.id === watchPatient)
  const primaryPlan = selectedPatient?.patientPlans?.[0]
  const selectedAppType = appointmentTypes.find(t => t.name === watchType)

  useEffect(() => {
    if (selectedPatient && !appointment) {
      setValue('title', `Consulta - ${selectedPatient.name}`)
    }
  }, [selectedPatient, appointment, setValue])

  // Auto-calculate value when type or patient changes
  useEffect(() => {
    if (!appointment && selectedAppType?.baseValue) {
      const discount = primaryPlan?.healthPlan?.discountPercent ?? 0
      const calculated = selectedAppType.baseValue * (1 - discount / 100)
      setValue('value', Math.round(calculated * 100) / 100)
    }
  }, [watchType, watchPatient, selectedAppType, primaryPlan, appointment, setValue])

  // Info to show repasse calculation
  const repasseInfo = (() => {
    if (!selectedAppType?.baseValue) return null
    const discount = primaryPlan?.healthPlan?.discountPercent ?? 0
    const repasse = selectedAppType.baseValue * (1 - discount / 100)
    return { base: selectedAppType.baseValue, discount, repasse: Math.round(repasse * 100) / 100 }
  })()

  const fmt = (v: number) => v.toFixed(2).replace('.', ',')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Doctor block toggle — visible only to doctors */}
      {currentUser?.role === 'DOCTOR' && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${watchBlocked ? 'bg-amber-50 border-amber-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
          onClick={() => setValue('isBlocked', !watchBlocked)}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${watchBlocked ? 'bg-amber-100' : 'bg-slate-200'}`}>
            <span className="text-lg">{watchBlocked ? '🔒' : '🔓'}</span>
          </div>
          <div className="flex-1">
            <p className={`font-semibold text-sm ${watchBlocked ? 'text-amber-800' : 'text-slate-700'}`}>
              {watchBlocked ? 'Horário Bloqueado' : 'Bloquear Horário'}
            </p>
            <p className="text-xs text-slate-500">
              {watchBlocked
                ? 'Secretária verá este slot como "Bloqueado"'
                : 'Clique para bloquear este horário para a secretária'
              }
            </p>
          </div>
          <input {...register('isBlocked')} type="checkbox" className="sr-only" />
          <div className={`w-10 h-6 rounded-full relative transition-colors ${watchBlocked ? 'bg-amber-500' : 'bg-slate-300'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${watchBlocked ? 'left-4' : 'left-0.5'}`} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Paciente *</label>
          <select {...register('patientId')} className="input-field">
            <option value="">Selecione o paciente</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {errors.patientId && <p className="text-xs text-red-500 mt-1">{errors.patientId.message}</p>}
        </div>

        <div>
          <label className="label">Profissional *</label>
          <select
            {...register('doctorId')}
            className="input-field"
            disabled={
              currentUser?.role === 'DOCTOR' ||
              (currentUser?.role === 'SECRETARY' && doctors.length <= 1)
            }
          >
            <option value="">Selecione</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}{d.specialty ? ` — ${d.specialty}` : ''}
              </option>
            ))}
          </select>
          {errors.doctorId && <p className="text-xs text-red-500 mt-1">{errors.doctorId.message}</p>}
        </div>
      </div>

      <div>
        <label className="label">Título da consulta *</label>
        <input {...register('title')} className="input-field" placeholder="Ex: Consulta de rotina" />
        {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Data e Hora *</label>
          <input {...register('date')} type="datetime-local" className="input-field" />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
        </div>

        <div>
          <label className="label">Duração</label>
          <select {...register('duration')} className="input-field">
            {DURATIONS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Tipo</label>
          <select {...register('type')} className="input-field">
            <option value="">Selecione</option>
            {appointmentTypes.length > 0
              ? appointmentTypes.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))
              : ['Consulta', 'Retorno', 'Avaliação', 'Sessão', 'Exame', 'Procedimento'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))
            }
          </select>
        </div>

        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input-field">
            <option value="SCHEDULED">Agendado</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="COMPLETED">Concluído</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="NO_SHOW">Faltou</option>
          </select>
        </div>

        <div>
          <label className="label">Valor (R$)</label>
          <input
            {...register('value')}
            type="number"
            step="0.01"
            min="0"
            className="input-field"
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Repasse info */}
      {repasseInfo && !watchBlocked && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div className="flex-1 text-xs text-emerald-700 flex items-center gap-2 flex-wrap">
            <span className="font-medium">{selectedAppType!.name}</span>
            <span className="text-emerald-500">R$ {fmt(repasseInfo.base)}</span>
            {repasseInfo.discount > 0 && (
              <>
                <span className="text-emerald-500">−{repasseInfo.discount}%</span>
                {primaryPlan?.healthPlan?.name && (
                  <span className="text-emerald-500">({primaryPlan.healthPlan.name})</span>
                )}
                <ArrowRight className="w-3 h-3 text-emerald-400" />
              </>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-emerald-600">Valor de repasse</p>
            <p className="text-sm font-bold text-emerald-800">R$ {fmt(repasseInfo.repasse)}</p>
          </div>
        </div>
      )}

      {/* Plan info when no appointment type has base value */}
      {!repasseInfo && primaryPlan?.healthPlan?.discountPercent && watchValue && watchValue > 0 && !watchBlocked && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 text-xs text-blue-700">
            <span>Plano: <strong>{primaryPlan.healthPlan.name}</strong> · {primaryPlan.healthPlan.discountPercent}% desconto</span>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-blue-600">Valor de repasse</p>
            <p className="text-sm font-bold text-blue-800">
              R$ {fmt(Math.round(watchValue * (1 - (primaryPlan.healthPlan.discountPercent ?? 0) / 100) * 100) / 100)}
            </p>
          </div>
        </div>
      )}

      <div>
        <label className="label">Observações</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="input-field resize-none"
          placeholder="Anotações sobre a consulta..."
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Salvando...
            </span>
          ) : appointment ? 'Atualizar Consulta' : 'Agendar Consulta'}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="btn-danger">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  )
}
