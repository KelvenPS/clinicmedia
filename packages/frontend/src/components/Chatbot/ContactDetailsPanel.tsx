import { useState } from 'react'
import { ChevronUp, MoreVertical, Pencil, Copy, Plus, Search, Send, ChevronRight } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import {
  type Conversation,
  type Template,
  avatarGradient,
  getInitials,
} from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  conversation: Conversation
  onClose: () => void
  onSwitchToTemplates: () => void
}

export default function ContactDetailsPanel({ conversation, onClose, onSwitchToTemplates }: Props) {
  const queryClient = useQueryClient()
  const name = conversation.contactName ?? conversation.contactPhone
  const [templateSearch, setTemplateSearch] = useState('')

  // Fetch templates for quick templates section
  const { data: templates } = useQuery<Template[]>({
    queryKey: ['chatbot-templates'],
    queryFn: () => api.get('/chatbot/templates').then(r => r.data),
    retry: 1,
  })

  // Send quick template message
  const sendMsgMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/chatbot/conversations/${conversation.id}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-messages', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
    },
  })

  // Copy phone number to clipboard
  const handleCopyPhone = () => {
    navigator.clipboard.writeText(conversation.contactPhone)
  }

  // Send quick template helper
  const handleSendQuickMsg = (content: string) => {
    if (sendMsgMutation.isPending) return
    sendMsgMutation.mutate(content)
  }

  // Filter templates by search input
  const filteredTemplates = (templates ?? []).filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(templateSearch.toLowerCase())
  ).slice(0, 3)

  // Default mock fallback templates if none exist on API
  const defaultQuickTemplates = [
    { id: '1', name: 'Boas-vindas', description: 'Mensagem de boas-vindas para novos contatos', content: 'Olá! Seja muito bem-vindo. Como posso te ajudar hoje?' },
    { id: '2', name: 'Planos', description: 'Informações sobre os planos disponíveis', content: 'Temos excelentes planos de atendimento! Segue o link com todas as opções: [Ver planos]' },
    { id: '3', name: 'Encerramento', description: 'Mensagem de encerramento do atendimento', content: 'Ficamos felizes em ajudar! Seu atendimento foi encerrado. Qualquer dúvida, estamos à disposição.' }
  ]

  const templatesToDisplay = filteredTemplates.length > 0 
    ? filteredTemplates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description ?? 'Ações e respostas rápidas',
        content: t.description ?? `Olá! Referente ao template ${t.name}.`
      }))
    : defaultQuickTemplates.filter(t => 
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.description.toLowerCase().includes(templateSearch.toLowerCase())
      )

  return (
    <div className="w-80 xl:w-[350px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col h-full overflow-y-auto select-none">
      {/* Contato Header - matches Imagem 1 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
        <span className="text-slate-800 font-bold text-sm">Contato</span>
        <div className="flex items-center gap-3 text-slate-400">
          <button onClick={onClose} className="hover:text-slate-600 transition-colors">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button className="hover:text-slate-600 transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profile Card - matches Imagem 1 */}
      <div className="flex flex-col items-center p-5 border-b border-slate-100">
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center shadow-md mb-3`}>
          <span className="text-white text-lg font-bold">{getInitials(name)}</span>
        </div>
        
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-bold text-slate-800 truncate max-w-[180px]">{name}</h4>
          <button className="text-slate-400 hover:text-slate-600 transition-all p-0.5">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-slate-500 font-medium">{conversation.contactPhone}</span>
          <button 
            onClick={handleCopyPhone} 
            title="Copiar telefone"
            className="text-slate-400 hover:text-slate-600 transition-all p-0.5"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>

        <span className="text-[11px] text-slate-400 truncate max-w-[220px]">
          {conversation.contactName 
            ? `${conversation.contactName.toLowerCase().replace(/\s+/g, '.')}@email.com` 
            : 'contato@email.com'}
        </span>
      </div>

      {/* Tags Section - matches Imagem 1 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h5 className="text-slate-700 font-bold text-xs mb-3">Tags</h5>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] px-2.5 py-1 rounded-md text-[11px] font-semibold">
            Cliente
          </span>
          <span className="bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] px-2.5 py-1 rounded-md text-[11px] font-semibold">
            Interesse - Planos
          </span>
          <span className="bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] px-2.5 py-1 rounded-md text-[11px] font-semibold">
            WhatsApp
          </span>
          <button className="w-6.5 h-6.5 bg-[#eff6ff] text-[#2563eb] border border-[#dbeafe] hover:bg-blue-100 rounded-full flex items-center justify-center transition-all">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Informações Table - matches Imagem 1 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h5 className="text-slate-700 font-bold text-xs">Informações</h5>
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Primeiro contato</span>
            <span className="text-slate-700 font-semibold">12/05/2024</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Último contato</span>
            <span className="text-slate-700 font-semibold">Hoje, 09:42</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Atendimentos</span>
            <span className="text-slate-700 font-semibold">5</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Origem</span>
            <span className="text-slate-700 font-semibold">WhatsApp</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Responsável</span>
            <span className="text-slate-700 font-semibold">Kellen Pereira</span>
          </div>
        </div>
      </div>

      {/* Templates rápidos - matches Imagem 1 */}
      <div className="px-5 py-4 flex-grow">
        <div className="flex items-center justify-between mb-3.5">
          <h5 className="text-slate-700 font-bold text-xs">Templates rápidos</h5>
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Search templates input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={templateSearch}
            onChange={e => setTemplateSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 placeholder-slate-400"
          />
        </div>

        {/* Template Cards List */}
        <div className="space-y-2.5">
          {templatesToDisplay.map(tpl => (
            <div
              key={tpl.id}
              className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl hover:shadow-xs transition-all"
            >
              <div className="min-w-0 pr-2">
                <h6 className="text-xs font-bold text-slate-800 truncate">{tpl.name}</h6>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate leading-tight">{tpl.description}</p>
              </div>
              <button
                onClick={() => handleSendQuickMsg(tpl.content)}
                disabled={sendMsgMutation.isPending}
                className="w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Link to view all templates */}
        <button
          onClick={onSwitchToTemplates}
          className="w-full flex items-center justify-center gap-1.5 mt-4 py-2 text-xs font-semibold text-blue-600 hover:text-blue-700 rounded-lg transition-all"
        >
          <span>Ver todos templates</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
