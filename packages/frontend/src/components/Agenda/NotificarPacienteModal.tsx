import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Send, Loader2, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import Modal from '../ui/Modal'

interface NotifTemplate {
  id: string
  name: string
  message: string
  active: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  appointmentId: string
  patientName: string
  patientPhone?: string
}

export default function NotificarPacienteModal({ isOpen, onClose, appointmentId, patientName, patientPhone }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: templates = [], isLoading } = useQuery<NotifTemplate[]>({
    queryKey: ['light-notif-templates'],
    queryFn: () => api.get('/chatbot-light/notification-templates').then(r => r.data),
    enabled: isOpen,
  })

  // Busca preview com variáveis já resolvidas pelo backend
  const { data: previewData, isLoading: previewLoading } = useQuery<{ message: string }>({
    queryKey: ['notify-preview', appointmentId, selectedId],
    queryFn: () =>
      api.get(`/appointments/${appointmentId}/notify-preview`, { params: { templateId: selectedId } }).then(r => r.data),
    enabled: isOpen && !!selectedId,
    staleTime: 30_000,
  })

  const activeTemplates = templates.filter(t => t.active)

  const handleSend = async () => {
    if (!selectedId) {
      toast.error('Selecione uma notificação')
      return
    }
    setLoading(true)
    try {
      await api.post(`/appointments/${appointmentId}/notify-patient`, { templateId: selectedId })
      toast.success('Mensagem enviada via WhatsApp!')
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Erro ao enviar notificação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notificar Paciente" subtitle={patientName} size="md">
      <div className="space-y-4">
        {patientPhone && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <MessageSquare className="w-4 h-4 text-emerald-500" />
            Será enviado para <span className="font-medium text-slate-700">{patientPhone}</span> via WhatsApp
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        ) : activeTemplates.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Nenhuma notificação cadastrada</p>
            <p>Acesse <strong>Chatbot Light &rsaquo; Notificações</strong> para criar templates de mensagem.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="label">Escolha a notificação</label>
            {activeTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  selectedId === t.id
                    ? 'border-cyan-400 bg-cyan-50 ring-1 ring-cyan-300'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className={`w-3.5 h-3.5 flex-shrink-0 ${selectedId === t.id ? 'text-cyan-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-semibold ${selectedId === t.id ? 'text-cyan-800' : 'text-slate-800'}`}>{t.name}</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-1 pl-5 font-mono">{t.message}</p>
              </button>
            ))}
          </div>
        )}

        {/* Preview com variáveis reais resolvidas pelo backend */}
        {selectedId && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Pré-visualização</p>
              {previewLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </div>
            <div className="p-3">
              {previewLoading ? (
                <p className="text-xs text-slate-400 italic">Carregando...</p>
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {previewData?.message ?? '—'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !selectedId || activeTemplates.length === 0}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
