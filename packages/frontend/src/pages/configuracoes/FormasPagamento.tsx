import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Wallet, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { PaymentMethod } from '../../types'
import Modal from '../../components/ui/Modal'

const PAYMENT_TYPES = [
  { value: 'PIX', label: 'Pix', icon: '⚡', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito', icon: '💳', color: 'text-blue-700', bg: 'bg-blue-50' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de Débito', icon: '🏦', color: 'text-cyan-700', bg: 'bg-cyan-50' },
  { value: 'DINHEIRO', label: 'Dinheiro', icon: '💵', color: 'text-green-700', bg: 'bg-green-50' },
  { value: 'CHEQUE', label: 'Cheque', icon: '📝', color: 'text-amber-700', bg: 'bg-amber-50' },
  { value: 'TRANSFERENCIA', label: 'Transferência', icon: '🔄', color: 'text-purple-700', bg: 'bg-purple-50' },
  { value: 'OUTROS', label: 'Outros', icon: '💰', color: 'text-slate-700', bg: 'bg-slate-50' },
]

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CHEQUE', 'DINHEIRO', 'TRANSFERENCIA', 'OUTROS']),
  instructions: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function PaymentForm({ method, onSubmit, loading }: {
  method: PaymentMethod | null
  onSubmit: (d: FormData) => void
  loading: boolean
}) {
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: method?.name || '',
      type: method?.type || 'PIX',
      instructions: method?.instructions || '',
    },
  })

  const watchType = watch('type')
  const selected = PAYMENT_TYPES.find(t => t.value === watchType)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Nome *</label>
        <input {...register('name')} className="input-field" placeholder="Ex: Pix pessoal, Maquininha Cielo..." />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label">Tipo de pagamento *</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {PAYMENT_TYPES.map(t => (
            <label
              key={t.value}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${watchType === t.value ? `${t.bg} border-current ${t.color}` : 'border-slate-200 hover:border-slate-300'}`}
            >
              <input {...register('type')} type="radio" value={t.value} className="sr-only" />
              <span className="text-lg">{t.icon}</span>
              <span className={`text-xs font-medium ${watchType === t.value ? t.color : 'text-slate-600'}`}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Instruções / Dados para pagamento</label>
        <textarea
          {...register('instructions')}
          rows={3}
          className="input-field resize-none"
          placeholder={
            watchType === 'PIX' ? 'Ex: Chave Pix: 11999990000 (CPF ou email)' :
            watchType === 'CARTAO_CREDITO' ? 'Ex: Aceitamos até 12x sem juros' :
            'Instruções para o paciente realizar o pagamento...'
          }
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : method ? 'Atualizar Forma de Pagamento' : 'Adicionar Forma de Pagamento'}
      </button>
    </form>
  )
}

export default function FormasPagamento() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editMethod, setEditMethod] = useState<PaymentMethod | null>(null)

  const { data: methods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: () => api.get('/payment-methods').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editMethod ? api.put(`/payment-methods/${editMethod.id}`, data) : api.post('/payment-methods', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-methods'] })
      toast.success(editMethod ? 'Atualizado!' : 'Forma de pagamento adicionada!')
      setModalOpen(false)
      setEditMethod(null)
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/payment-methods/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-methods'] }); toast.success('Status alterado') },
  })

  return (
    <div className="max-w-2xl space-y-6 animate-page-enter">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Formas de Pagamento</h1>
          <p className="page-subtitle">Configure como você recebe dos pacientes</p>
        </div>
        <button onClick={() => { setEditMethod(null); setModalOpen(true) }} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="card text-center py-12 animate-stagger-2">
          <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3 animate-float" />
          <p className="text-slate-400">Nenhuma forma de pagamento cadastrada</p>
          <button onClick={() => setModalOpen(true)} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
            Adicionar primeira forma
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {methods.map(m => {
              const tc = PAYMENT_TYPES.find(t => t.value === m.type)!
              return (
                <div key={m.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${!m.active ? 'opacity-60' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${tc.bg}`}>
                    {tc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{m.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                      {!m.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativo</span>}
                    </div>
                    {m.instructions && <p className="text-xs text-slate-500 mt-0.5 truncate">{m.instructions}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditMethod(m); setModalOpen(true) }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(m.id)}
                      className={`p-1.5 rounded-lg transition-colors ${m.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      {m.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditMethod(null) }}
        title={editMethod ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
      >
        <PaymentForm method={editMethod} onSubmit={(d) => saveMutation.mutate(d)} loading={saveMutation.isPending} />
      </Modal>
    </div>
  )
}
