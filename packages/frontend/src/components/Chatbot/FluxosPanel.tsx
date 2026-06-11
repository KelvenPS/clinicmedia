import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Trash2, ToggleLeft, ToggleRight, GitBranch, Layers, Loader2, X,
  MonitorSmartphone, Bot,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type Flow,
  type TriggerType,
  type BotType,
  triggerLabels,
} from '../../types/chatbot'
import api from '../../lib/api'

interface Props {
  onOpenCanvas: (flow: Flow) => void
}

const TRIGGER_COLORS: Record<string, string> = {
  KEYWORD: 'bg-blue-500/10 text-blue-600 border-blue-200',
  ALL_MESSAGES: 'bg-slate-500/10 text-slate-600 border-slate-200',
  FIRST_MESSAGE: 'bg-violet-500/10 text-violet-600 border-violet-200',
  AFTER_HOURS: 'bg-amber-500/10 text-amber-600 border-amber-200',
}

const BOT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  LIGHT: { label: 'Light', color: 'bg-cyan-100 text-cyan-700' },
  AI_AGENT: { label: 'Agente IA', color: 'bg-purple-100 text-purple-700' },
}

export default function FluxosPanel({ onOpenCanvas }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger: 'FIRST_MESSAGE' as TriggerType,
    triggerValue: '',
    botType: 'LIGHT' as BotType,
  })
  const queryClient = useQueryClient()

  const { data: flows, isLoading } = useQuery<Flow[]>({
    queryKey: ['chatbot-flows'],
    queryFn: () => api.get('/chatbot/flows').then(r => r.data),
    retry: 1,
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/chatbot/flows', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] })
      setShowModal(false)
      setForm({ name: '', description: '', trigger: 'FIRST_MESSAGE', triggerValue: '', botType: 'LIGHT' })
      onOpenCanvas(res.data as Flow)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/chatbot/flows/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chatbot/flows/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] }),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    createMutation.mutate(form)
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Meus Fluxos</h2>
          <p className="text-sm text-slate-500 mt-1">Crie e gerencie fluxos de automação para seu chatbot.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> Novo Fluxo
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <GitBranch className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">Nenhum fluxo criado</p>
            <p className="text-xs text-slate-400 mt-1">Crie seu primeiro fluxo de automação</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Criar Fluxo
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Fluxo</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Tipo</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Gatilho</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Execuções</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flows.map(flow => {
                const btCfg = BOT_TYPE_CONFIG[flow.botType] ?? BOT_TYPE_CONFIG.LIGHT
                return (
                  <tr key={flow.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{flow.name}</p>
                      {flow.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{flow.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${btCfg.color}`}>
                        {btCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border inline-flex w-fit ${TRIGGER_COLORS[flow.trigger] ?? ''}`}>
                          {triggerLabels[flow.trigger] ?? flow.trigger}
                        </span>
                        {flow.triggerValue && (
                          <span className="text-xs text-slate-400 font-mono">"{flow.triggerValue}"</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-slate-700">{flow.executions.toLocaleString('pt-BR')}</span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => toggleMutation.mutate(flow.id)}
                        disabled={toggleMutation.isPending}
                        className="flex items-center gap-2 text-xs font-medium"
                      >
                        {flow.active
                          ? <><ToggleRight className="w-5 h-5 text-emerald-500" /><span className="text-emerald-600">Ativo</span></>
                          : <><ToggleLeft className="w-5 h-5 text-slate-400" /><span className="text-slate-400">Inativo</span></>
                        }
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => onOpenCanvas(flow)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-all"
                        >
                          <Layers className="w-3.5 h-3.5" /> Canvas
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(flow.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-800">Novo Fluxo</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure e acesse o canvas para construir o fluxo</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome do Fluxo <span className="text-red-500">*</span></label>
                <input
                  type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Agendamento automático"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Descreva o objetivo deste fluxo..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Chatbot</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, botType: 'LIGHT' }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-left ${form.botType === 'LIGHT' ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <MonitorSmartphone className={`w-6 h-6 ${form.botType === 'LIGHT' ? 'text-cyan-600' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-xs font-bold ${form.botType === 'LIGHT' ? 'text-cyan-700' : 'text-slate-600'}`}>Chatbot Light</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Menus, botões e opções</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, botType: 'AI_AGENT' }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-left ${form.botType === 'AI_AGENT' ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Bot className={`w-6 h-6 ${form.botType === 'AI_AGENT' ? 'text-purple-600' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-xs font-bold ${form.botType === 'AI_AGENT' ? 'text-purple-700' : 'text-slate-600'}`}>Agente IA</p>
                      <p className="text-[10px] text-slate-400 leading-tight">Respostas inteligentes com IA</p>
                    </div>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gatilho de Ativação</label>
                <select
                  value={form.trigger}
                  onChange={e => setForm(f => ({ ...f, trigger: e.target.value as TriggerType }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 bg-white"
                >
                  <option value="FIRST_MESSAGE">Primeira mensagem</option>
                  <option value="KEYWORD">Palavra-chave</option>
                  <option value="ALL_MESSAGES">Todas as mensagens</option>
                  <option value="AFTER_HOURS">Fora do horário</option>
                </select>
              </div>
              {form.trigger === 'KEYWORD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Palavra-chave</label>
                  <input
                    type="text" value={form.triggerValue}
                    onChange={e => setForm(f => ({ ...f, triggerValue: e.target.value }))}
                    placeholder="Ex: agendar, consulta, olá..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  type="submit" disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  {createMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                    : 'Criar e Abrir Canvas'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
