import { useState, useEffect } from 'react'
import { X, Phone, User, Tag, FileText, Loader2, Save, ChevronRight } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import {
  type Conversation,
  type Template,
  avatarGradient,
  getInitials,
  categoryLabels,
  templateCategoryLabels,
  templateIcons,
} from '../../types/chatbot'
import api from '../../lib/api'
import AttendanceStatusBadge from './AttendanceStatusBadge'

interface Props {
  conversation: Conversation
  onClose: () => void
  onSwitchToTemplates: () => void
}

export default function ContactDetailsPanel({ conversation, onClose, onSwitchToTemplates }: Props) {
  const queryClient = useQueryClient()
  const name = conversation.contactName ?? conversation.contactPhone

  const [notes, setNotes] = useState(conversation.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  useEffect(() => {
    setNotes(conversation.notes ?? '')
    setNotesDirty(false)
  }, [conversation.id, conversation.notes])

  const saveNotesMutation = useMutation({
    mutationFn: () =>
      api.put(`/chatbot/conversations/${conversation.id}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
      setNotesDirty(false)
    },
  })

  const { data: templates } = useQuery<Template[]>({
    queryKey: ['chatbot-templates'],
    queryFn: () => api.get('/chatbot/templates').then(r => r.data),
    retry: 1,
  })

  const quickTemplates = (templates ?? []).slice(0, 4)

  return (
    <div className="w-72 xl:w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <p className="text-sm font-semibold text-slate-700">Detalhes do contato</p>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Avatar + Nome */}
      <div className="flex flex-col items-center gap-2 px-4 py-5 border-b border-slate-100">
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center shadow-md`}>
          <span className="text-white text-lg font-bold">{getInitials(name)}</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-800">{name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{conversation.contactPhone}</p>
        </div>
        <AttendanceStatusBadge status={conversation.status} size="md" />
      </div>

      {/* Informações */}
      <div className="px-4 py-4 border-b border-slate-100 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Informações</p>

        <div className="flex items-start gap-2.5">
          <Phone className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Telefone</p>
            <p className="text-xs font-medium text-slate-700">{conversation.contactPhone}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Tag className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Categoria</p>
            <p className="text-xs font-medium text-slate-700">{categoryLabels[conversation.category]}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Responsável</p>
            <p className="text-xs font-medium text-slate-700">
              {conversation.assignedTo ? `ID: ${conversation.assignedTo.slice(0, 8)}…` : 'Não atribuído'}
            </p>
          </div>
        </div>
      </div>

      {/* Notas internas */}
      <div className="px-4 py-4 border-b border-slate-100 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Notas internas
          </p>
          {notesDirty && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              Não salvo
            </span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); setNotesDirty(true) }}
          placeholder="Adicione observações internas sobre este contato..."
          rows={3}
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
        {notesDirty && (
          <button
            onClick={() => saveNotesMutation.mutate()}
            disabled={saveNotesMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all"
          >
            {saveNotesMutation.isPending
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>
              : <><Save className="w-3 h-3" /> Salvar nota</>
            }
          </button>
        )}
      </div>

      {/* Templates rápidos */}
      <div className="px-4 py-4 flex-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Templates rápidos</p>
        {quickTemplates.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum template cadastrado</p>
        ) : (
          <div className="space-y-2">
            {quickTemplates.map(tpl => (
              <button
                key={tpl.id}
                onClick={onSwitchToTemplates}
                className="w-full flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition-all group"
              >
                <span className="text-base leading-none mt-0.5">{templateIcons[tpl.category]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{tpl.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{templateCategoryLabels[tpl.category]}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onSwitchToTemplates}
          className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all"
        >
          Ver todos os templates <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
