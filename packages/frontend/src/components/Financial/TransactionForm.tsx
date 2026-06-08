import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import type { Transaction, User, AuthUser } from '../../types'

const schema = z.object({
  doctorId: z.string().min(1, 'Selecione um médico'),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Valor deve ser positivo'),
  description: z.string().min(2, 'Descrição muito curta'),
  date: z.string().min(1, 'Data obrigatória'),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']),
  category: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  transaction: Transaction | null
  doctors: User[]
  currentUser: AuthUser | null
  onSubmit: (data: FormData) => void
  loading: boolean
}

const CATEGORIES = {
  INCOME: ['Consulta', 'Retorno', 'Exame', 'Procedimento', 'Plano de Saúde', 'Outros'],
  EXPENSE: ['Material', 'Equipamento', 'Aluguel', 'Salário', 'Impostos', 'Marketing', 'Outros'],
}

export default function TransactionForm({ transaction, doctors, currentUser, onSubmit, loading }: Props) {
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'INCOME',
      status: 'PENDING',
      doctorId: currentUser?.role === 'DOCTOR' ? currentUser.id : '',
    },
  })

  const watchType = watch('type')

  useEffect(() => {
    if (transaction) {
      setValue('doctorId', transaction.doctorId)
      setValue('type', transaction.type)
      setValue('amount', transaction.amount)
      setValue('description', transaction.description)
      setValue('date', format(new Date(transaction.date), 'yyyy-MM-dd'))
      setValue('status', transaction.status)
      setValue('category', transaction.category || '')
    } else {
      setValue('date', format(new Date(), 'yyyy-MM-dd'))
    }
  }, [transaction, setValue])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo *</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {[
              { value: 'INCOME', label: 'Receita', active: 'bg-emerald-500 text-white' },
              { value: 'EXPENSE', label: 'Despesa', active: 'bg-red-500 text-white' },
            ].map(({ value, label, active }) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue('type', value as 'INCOME' | 'EXPENSE')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${watchType === value ? active : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Valor (R$) *</label>
          <input
            {...register('amount')}
            type="number"
            step="0.01"
            min="0"
            className="input-field"
            placeholder="0,00"
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
        </div>
      </div>

      {currentUser?.role === 'ADMIN' && (
        <div>
          <label className="label">Médico *</label>
          <select {...register('doctorId')} className="input-field">
            <option value="">Selecione o médico</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>Dr(a). {d.name}</option>
            ))}
          </select>
          {errors.doctorId && <p className="text-xs text-red-500 mt-1">{errors.doctorId.message}</p>}
        </div>
      )}

      <div>
        <label className="label">Descrição *</label>
        <input {...register('description')} className="input-field" placeholder="Ex: Consulta - João Silva" />
        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Data *</label>
          <input {...register('date')} type="date" className="input-field" />
          {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date.message}</p>}
        </div>

        <div>
          <label className="label">Categoria</label>
          <select {...register('category')} className="input-field">
            <option value="">Selecione</option>
            {CATEGORIES[watchType]?.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Status *</label>
        <select {...register('status')} className="input-field">
          <option value="PENDING">Pendente</option>
          <option value="PAID">Pago</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : transaction ? 'Atualizar Transação' : 'Adicionar Transação'}
      </button>
    </form>
  )
}
