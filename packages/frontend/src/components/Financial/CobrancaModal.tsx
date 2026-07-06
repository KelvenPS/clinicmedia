import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DollarSign, CreditCard, HeartPulse } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { Appointment, PaymentMethod } from '../../types'
import Modal from '../ui/Modal'

interface Props {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment
  discountPercent?: number
  onCharged: () => void
}

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function CobrancaModal({
  isOpen,
  onClose,
  appointment,
  discountPercent = 0,
  onCharged,
}: Props) {
  const [valor, setValor] = useState<number>(appointment.value ?? 0)
  const [selectedMethodId, setSelectedMethodId] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const repasseValue = Math.floor(valor * (1 - discountPercent / 100) * 100) / 100

  const { data: methods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['financial-payment-methods'],
    queryFn: () => api.get('/financial/payment-methods').then(r => r.data),
    enabled: isOpen,
  })

  const selectedMethod = methods.find(m => m.id === selectedMethodId)

  const planName = appointment.patient.patientPlans?.[0]?.healthPlan?.name

  const handleSubmit = async () => {
    if (valor <= 0) {
      toast.error('Informe um valor válido')
      return
    }
    setLoading(true)
    try {
      await api.post(`/appointments/${appointment.id}/charge`, {
        amount: valor,
        repasseValue,
        paymentMethodId:   selectedMethodId || undefined,
        paymentMethodName: selectedMethod?.name || undefined,
        notes:             notes || undefined,
      })
      toast.success('Lançado no financeiro!')
      onCharged()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      if (msg === 'Este agendamento já foi cobrado') {
        toast.error('Este agendamento já foi cobrado')
      } else {
        toast.error('Erro ao lançar cobrança')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cobrar Consulta"
      subtitle={appointment.patient.name}
      size="md"
    >
      <div className="space-y-5">
        {/* Info card */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Tipo</span>
            <span className="font-medium text-slate-800">{appointment.type || 'Consulta'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Data</span>
            <span className="font-medium text-slate-800">
              {format(new Date(appointment.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Paciente</span>
            <span className="font-medium text-slate-800">{appointment.patient.name}</span>
          </div>
          {planName && (
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500">
                <HeartPulse className="w-3.5 h-3.5" />
                Convênio
              </span>
              <span className="font-medium text-blue-700">{planName}</span>
            </div>
          )}
        </div>

        {/* Valor cobrado */}
        <div>
          <label className="label flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            Valor cobrado (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={valor}
            onChange={e => setValor(parseFloat(e.target.value) || 0)}
            className="input-field text-lg font-semibold"
            placeholder="0,00"
          />
        </div>

        {/* Repasse calculado */}
        {discountPercent > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-sm text-emerald-700">
              Repasse médico ({100 - discountPercent}%)
            </span>
            <span className="text-base font-bold text-emerald-800">{currency(repasseValue)}</span>
          </div>
        )}

        {/* Forma de pagamento */}
        <div>
          <label className="label flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
            Forma de pagamento
          </label>
          <select
            value={selectedMethodId}
            onChange={e => setSelectedMethodId(e.target.value)}
            className="input-field"
          >
            <option value="">Não informado</option>
            {methods.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Observações */}
        <div>
          <label className="label">Observações (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="input-field resize-none"
            placeholder="Informações adicionais sobre este pagamento..."
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || valor <= 0}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Lançando...
            </>
          ) : (
            <>
              <DollarSign className="w-4 h-4" />
              Lançar no Financeiro — {currency(valor)}
            </>
          )}
        </button>
      </div>
    </Modal>
  )
}
