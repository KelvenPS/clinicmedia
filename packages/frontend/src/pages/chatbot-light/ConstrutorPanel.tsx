import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Plus, Trash2, MessageSquare, Loader2, Play, Save, UploadCloud,
  Undo2, X, GitBranch, PhoneCall, CalendarClock, Settings, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import Modal from '../../components/ui/Modal'
import {
  FLUXO_ACTIONS, FLUXO_QUEUES, SystemActionsPanel,
  type FluxoOption, type LightFluxo, type FluxoActionType, type SystemActionConfig,
} from '../ChatbotLight'

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

interface VariableEntry { key: string; label: string; category: string; description?: string }

interface BuilderDoc {
  id: string
  chatbotId: string | null
  name: string
  description: string | null
  maxAttempts: number
  fallbackMessage: string
  active: boolean
  status: 'DRAFT' | 'PUBLISHED'
  hasDraftChanges: boolean
  lastPublishedAt: string | null
  live: { keywords: string; welcomeMessage: string; options: FluxoOption[] }
  draft: { keywords: string; welcomeMessage: string; options: FluxoOption[] }
  systemActionConfigs: SystemActionConfig[]
  subFlows: { id: string; name: string; active: boolean }[]
}

type SelectedBlock = { type: 'welcome' } | { type: 'option'; id: string }

// Blocos que podem ser arrastados da biblioteca para dentro da conversa —
// cada um cria uma nova opção de menu já com o actionType correspondente.
const PALETTE_ITEMS: { actionType: FluxoActionType; label: string; hint: string; icon: typeof MessageSquare }[] = [
  { actionType: 'SEND_MESSAGE', label: 'Resposta simples', hint: 'Envia uma mensagem e encerra', icon: MessageSquare },
  { actionType: 'OPEN_MENU', label: 'Submenu', hint: 'Abre outro fluxo/menu', icon: GitBranch },
  { actionType: 'SYSTEM_ACTION', label: 'Ação do sistema', hint: 'Agendar, confirmar, capturar dados...', icon: Settings },
  { actionType: 'START_LEAD_CAPTURE', label: 'Coletar dados', hint: 'Pré-agendamento (nome e telefone)', icon: CalendarClock },
  { actionType: 'TRANSFER_QUEUE', label: 'Transferir atendimento', hint: 'Encaminha para uma fila humana', icon: PhoneCall },
  { actionType: 'END_CHAT', label: 'Encerrar conversa', hint: 'Finaliza o atendimento', icon: X },
]

function newOption(actionType: FluxoActionType, number: number): FluxoOption {
  return {
    id: generateUUID(),
    number,
    label: '',
    triggers: String(number),
    response: '',
    actionType,
    queueId: null,
    nextFlowId: null,
    systemAction: null,
    systemActionKey: null,
    systemActionConfigId: null,
    transitionMessage: null,
  }
}

export default function ConstrutorPanel({ chatbotId }: { chatbotId: string }) {
  const qc = useQueryClient()

  const { data: fluxos = [], isLoading: loadingFluxos } = useQuery<LightFluxo[]>({
    queryKey: ['light-fluxos', chatbotId],
    queryFn: () => api.get('/chatbot-light/fluxos', { params: { chatbotId } }).then(r => r.data),
  })

  const [fluxoId, setFluxoId] = useState<string | null>(null)
  useEffect(() => {
    if (!fluxoId && fluxos.length > 0) setFluxoId(fluxos[0].id)
  }, [fluxos, fluxoId])

  const createFlowMutation = useMutation({
    mutationFn: () => api.post('/chatbot-light/fluxos', {
      chatbotId,
      name: `Novo fluxo ${fluxos.length + 1}`,
      keywords: 'oi, ola, olá, menu',
      welcomeMessage: 'Olá, {nome}! Seja bem-vindo(a). Como posso te ajudar?',
      options: [],
    }).then(r => r.data),
    onSuccess: (created: LightFluxo) => {
      qc.invalidateQueries({ queryKey: ['light-fluxos', chatbotId] })
      setFluxoId(created.id)
      toast.success('Fluxo criado — arraste blocos para montar a conversa')
    },
    onError: () => toast.error('Erro ao criar fluxo'),
  })

  if (loadingFluxos) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
  }

  if (!fluxoId) {
    return (
      <div className="p-10 text-center">
        <GitBranch className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 font-medium text-sm mb-1">Nenhum fluxo criado ainda</p>
        <p className="text-slate-400 text-xs mb-5">Crie o primeiro fluxo para começar a montar a conversa arrastando blocos.</p>
        <button onClick={() => createFlowMutation.mutate()} disabled={createFlowMutation.isPending} className="btn-primary text-sm mx-auto">
          <Plus className="w-4 h-4" /> Criar primeiro fluxo
        </button>
      </div>
    )
  }

  return (
    <FlowBuilder
      key={fluxoId}
      chatbotId={chatbotId}
      fluxoId={fluxoId}
      fluxos={fluxos}
      onSelectFlow={setFluxoId}
      onCreateFlow={() => createFlowMutation.mutate()}
      creatingFlow={createFlowMutation.isPending}
    />
  )
}

function FlowBuilder({ chatbotId, fluxoId, fluxos, onSelectFlow, onCreateFlow, creatingFlow }: {
  chatbotId: string
  fluxoId: string
  fluxos: LightFluxo[]
  onSelectFlow: (id: string) => void
  onCreateFlow: () => void
  creatingFlow: boolean
}) {
  const qc = useQueryClient()

  const { data: doc, isLoading } = useQuery<BuilderDoc>({
    queryKey: ['light-fluxo-builder', fluxoId],
    queryFn: () => api.get(`/chatbot-light/fluxos/${fluxoId}/builder`).then(r => r.data),
  })

  const { data: variableRegistry = [] } = useQuery<VariableEntry[]>({
    queryKey: ['chatbot-light-variable-registry'],
    queryFn: () => api.get('/chatbot-light/variable-registry').then(r => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data: actionConfigs = [] } = useQuery<SystemActionConfig[]>({
    queryKey: ['light-system-actions-configs', chatbotId],
    queryFn: () => api.get('/chatbot-light/system-actions', { params: { chatbotId } }).then(r => r.data),
  })

  const [keywords, setKeywords] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [options, setOptions] = useState<FluxoOption[]>([])
  const [selected, setSelected] = useState<SelectedBlock>({ type: 'welcome' })
  const [testOpen, setTestOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [systemActionsModalOpen, setSystemActionsModalOpen] = useState(false)
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (!doc || seededFor.current === doc.id) return
    setKeywords(doc.draft.keywords)
    setWelcomeMessage(doc.draft.welcomeMessage)
    setOptions(doc.draft.options ?? [])
    setSelected({ type: 'welcome' })
    seededFor.current = doc.id
  }, [doc])

  const patchBuilderCache = (patch: Partial<BuilderDoc>) => {
    qc.setQueryData<BuilderDoc | undefined>(['light-fluxo-builder', fluxoId], old => old ? { ...old, ...patch } : old)
  }

  const saveDraftMutation = useMutation({
    mutationFn: () => api.put(`/chatbot-light/fluxos/${fluxoId}/draft`, { keywords, welcomeMessage, options }).then(r => r.data),
    onSuccess: () => {
      patchBuilderCache({ hasDraftChanges: true, status: 'DRAFT', draft: { keywords, welcomeMessage, options } })
      toast.success('Rascunho salvo')
    },
    onError: () => toast.error('Erro ao salvar rascunho'),
  })

  const [pendencias, setPendencias] = useState<string[] | null>(null)

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/chatbot-light/fluxos/${fluxoId}/publish`).then(r => r.data),
    onSuccess: (updated: LightFluxo) => {
      patchBuilderCache({
        hasDraftChanges: false,
        status: 'PUBLISHED',
        lastPublishedAt: updated.lastPublishedAt ?? new Date().toISOString(),
        live: { keywords: updated.keywords, welcomeMessage: updated.welcomeMessage, options: updated.options },
      })
      qc.invalidateQueries({ queryKey: ['light-fluxos', chatbotId] })
      toast.success('Publicado! O chatbot já está usando esta versão.')
    },
    onError: (err: any) => {
      const list = err?.response?.data?.pendencias
      if (Array.isArray(list) && list.length > 0) {
        setPendencias(list)
      } else {
        toast.error(err?.response?.data?.message || 'Erro ao publicar')
      }
    },
  })

  const discardMutation = useMutation({
    mutationFn: () => api.post(`/chatbot-light/fluxos/${fluxoId}/discard-draft`).then(r => r.data),
    onSuccess: (updated: LightFluxo) => {
      setKeywords(updated.keywords)
      setWelcomeMessage(updated.welcomeMessage)
      setOptions((updated.options as unknown as FluxoOption[]) ?? [])
      setSelected({ type: 'welcome' })
      patchBuilderCache({
        hasDraftChanges: false,
        status: 'PUBLISHED',
        draft: { keywords: updated.keywords, welcomeMessage: updated.welcomeMessage, options: updated.options },
      })
      toast.success('Rascunho descartado — voltou para a última versão publicada')
    },
    onError: () => toast.error('Erro ao descartar rascunho'),
  })

  const settingsMutation = useMutation({
    mutationFn: (data: { name: string; description: string; maxAttempts: number; fallbackMessage: string; active: boolean }) =>
      api.put(`/chatbot-light/fluxos/${fluxoId}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['light-fluxos', chatbotId] })
      qc.invalidateQueries({ queryKey: ['light-fluxo-builder', fluxoId] })
      setSettingsOpen(false)
      toast.success('Configurações do fluxo salvas')
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  })

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const [activePaletteItem, setActivePaletteItem] = useState<typeof PALETTE_ITEMS[number] | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    if (id.startsWith('palette-')) {
      const actionType = id.replace('palette-', '') as FluxoActionType
      setActivePaletteItem(PALETTE_ITEMS.find(p => p.actionType === actionType) ?? null)
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActivePaletteItem(null)
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith('palette-')) {
      const actionType = activeId.replace('palette-', '') as FluxoActionType
      setOptions(prev => {
        const created = newOption(actionType, prev.length + 1)
        const dropIndex = prev.findIndex(o => o.id === overId)
        const next = dropIndex === -1 ? [...prev, created] : [...prev.slice(0, dropIndex), created, ...prev.slice(dropIndex)]
        setSelected({ type: 'option', id: created.id })
        return next.map((o, i) => ({ ...o, number: i + 1 }))
      })
      return
    }

    if (activeId !== overId) {
      setOptions(prev => {
        const oldIndex = prev.findIndex(o => o.id === activeId)
        const newIndex = prev.findIndex(o => o.id === overId)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex).map((o, i) => ({ ...o, number: i + 1 }))
      })
    }
  }

  const updateOption = (id: string, patch: Partial<FluxoOption>) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }

  const removeOption = (id: string) => {
    setOptions(prev => prev.filter(o => o.id !== id).map((o, i) => ({ ...o, number: i + 1 })))
    setSelected(s => (s.type === 'option' && s.id === id) ? { type: 'welcome' } : s)
  }

  if (isLoading || !doc) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
  }

  const selectedOption = selected.type === 'option' ? options.find(o => o.id === selected.id) ?? null : null

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={fluxoId}
            onChange={e => onSelectFlow(e.target.value)}
            className="input-field text-sm py-1.5 max-w-[220px]"
          >
            {fluxos.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button onClick={onCreateFlow} disabled={creatingFlow} className="btn-icon" title="Novo fluxo">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="btn-icon" title="Configurações do fluxo">
            <Settings className="w-4 h-4" />
          </button>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            doc.hasDraftChanges
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {doc.hasDraftChanges ? 'Alterações pendentes' : 'Publicado'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTestOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Testar
          </button>
          <button
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Salvar rascunho
          </button>
          {doc.hasDraftChanges && (
            <button
              onClick={() => { if (confirm('Descartar alterações não publicadas e voltar para a última versão publicada?')) discardMutation.mutate() }}
              disabled={discardMutation.isPending}
              className="btn-icon" title="Descartar rascunho"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => { if (confirm('Publicar esta versão? O chatbot passará a usar imediatamente estas mensagens e opções.')) publishMutation.mutate() }}
            disabled={publishMutation.isPending}
            className="btn-primary text-sm"
          >
            <UploadCloud className="w-3.5 h-3.5" /> Publicar
          </button>
        </div>
      </div>

      {/* ── 3 colunas ────────────────────────────────────────────────────── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          <BlockLibrary />

          <ConversationCanvas
            welcomeMessage={welcomeMessage}
            options={options}
            selected={selected}
            onSelect={setSelected}
            onRemoveOption={removeOption}
            actionConfigs={actionConfigs}
            fluxos={fluxos}
          />

          <BlockConfigPanel
            selected={selected}
            keywords={keywords}
            welcomeMessage={welcomeMessage}
            onKeywordsChange={setKeywords}
            onWelcomeMessageChange={setWelcomeMessage}
            selectedOption={selectedOption}
            onUpdateOption={updateOption}
            variableRegistry={variableRegistry}
            fluxos={fluxos.filter(f => f.id !== fluxoId)}
            actionConfigs={actionConfigs}
            onManageSystemActions={() => setSystemActionsModalOpen(true)}
          />
        </div>

        <DragOverlay>
          {activePaletteItem && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-cyan-300 shadow-lg text-sm font-medium text-slate-700">
              <activePaletteItem.icon className="w-4 h-4 text-cyan-600" /> {activePaletteItem.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {settingsOpen && (
        <FlowSettingsModal
          fluxo={fluxos.find(f => f.id === fluxoId)!}
          onClose={() => setSettingsOpen(false)}
          onSave={data => settingsMutation.mutate(data)}
          saving={settingsMutation.isPending}
        />
      )}

      {systemActionsModalOpen && (
        <Modal isOpen onClose={() => setSystemActionsModalOpen(false)} title="Ações do Sistema" size="xl">
          <SystemActionsPanel chatbotId={chatbotId} />
        </Modal>
      )}

      {pendencias && (
        <Modal isOpen onClose={() => setPendencias(null)} title="Não é possível publicar ainda" subtitle="Resolva as pendências abaixo antes de publicar este fluxo." size="md">
          <ul className="space-y-2">
            {pendencias.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-600 flex-shrink-0">⚠</span> {p}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {testOpen && (
        <TestDrawer chatbotId={chatbotId} fluxoId={fluxoId} onClose={() => setTestOpen(false)} />
      )}
    </div>
  )
}

// ─── Left column: block library ────────────────────────────────────────────

function DraggablePaletteItem({ item }: { item: typeof PALETTE_ITEMS[number] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `palette-${item.actionType}` })
  const Icon = item.icon
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined }}
      className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <Icon className="w-4 h-4 text-cyan-600 flex-shrink-0 mt-0.5" />
      <span>
        <span className="block text-xs font-semibold text-slate-800">{item.label}</span>
        <span className="block text-[11px] text-slate-400">{item.hint}</span>
      </span>
    </button>
  )
}

function BlockLibrary() {
  return (
    <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-slate-50/60 p-3 overflow-y-auto scrollbar-none">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2 px-1">Arraste para a conversa</p>
      <div className="space-y-2">
        {PALETTE_ITEMS.map(item => <DraggablePaletteItem key={item.actionType} item={item} />)}
      </div>
      <p className="text-[11px] text-slate-400 mt-4 px-1 leading-relaxed">
        Arraste um bloco para dentro da conversa ao lado para adicionar uma opção de menu, ou solte sobre uma opção existente para inserir antes dela.
      </p>
    </div>
  )
}

// ─── Center column: WhatsApp-style conversation canvas ─────────────────────

// Resolve pra onde uma opção realmente aponta — substitui o rótulo genérico
// do actionType (ex: "Enviar apenas mensagem") por informação que reflete o
// que vai executar de verdade, e sinaliza quando falta configurar o destino.
function describeDestination(option: FluxoOption, actionConfigs: SystemActionConfig[], fluxos: LightFluxo[]): { label: string; warn: boolean } {
  switch (option.actionType) {
    case 'SEND_MESSAGE':
      return { label: 'Mensagem simples', warn: false }
    case 'TRANSFER_QUEUE': {
      const q = FLUXO_QUEUES.find(q => q.value === option.queueId)
      return q ? { label: `Transfere para: ${q.label}`, warn: false } : { label: 'Sem fila selecionada', warn: true }
    }
    case 'OPEN_MENU': {
      const f = fluxos.find(f => f.id === option.nextFlowId)
      return f ? { label: `Submenu: ${f.name}`, warn: false } : { label: 'Sem submenu selecionado', warn: true }
    }
    case 'SYSTEM_ACTION': {
      const cfg = actionConfigs.find(c => c.id === option.systemActionConfigId)
      return cfg ? { label: `Ação do sistema: ${cfg.name}`, warn: false } : { label: 'Sem configuração vinculada', warn: true }
    }
    case 'END_CHAT':
      return { label: 'Encerra a conversa', warn: false }
    case 'START_LEAD_CAPTURE':
      return { label: 'Coleta dados (pré-agendamento)', warn: false }
    case 'START_PLAN_SCHEDULING':
      return { label: 'Inicia agendamento por plano/serviço', warn: false }
    default:
      return { label: option.actionType, warn: false }
  }
}

function SortableOptionBubble({ option, isSelected, onSelect, onRemove, actionConfigs, fluxos }: {
  option: FluxoOption
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  actionConfigs: SystemActionConfig[]
  fluxos: LightFluxo[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const destination = describeDestination(option, actionConfigs, fluxos)

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
        isSelected ? 'border-cyan-400 bg-cyan-50/60 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-cyan-700 bg-cyan-100 px-1.5 rounded">{option.number}</span>
          <span className="text-sm font-medium text-slate-800 truncate">{option.label || 'Sem título'}</span>
        </div>
        <p className={`text-[11px] mt-0.5 ${destination.warn ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {destination.warn ? '⚠ ' : ''}{destination.label}
        </p>
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove() }} className="text-slate-300 hover:text-red-500 p-1" title="Remover">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ConversationCanvas({ welcomeMessage, options, selected, onSelect, onRemoveOption, actionConfigs, fluxos }: {
  welcomeMessage: string
  options: FluxoOption[]
  selected: SelectedBlock
  onSelect: (b: SelectedBlock) => void
  onRemoveOption: (id: string) => void
  actionConfigs: SystemActionConfig[]
  fluxos: LightFluxo[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-dropzone' })

  return (
    <div className="flex-1 min-w-0 bg-[#e5ddd5] flex flex-col">
      <div className="px-4 py-2.5 bg-[#075e54] text-white text-sm font-medium flex items-center gap-2">
        <MessageSquare className="w-4 h-4" /> Preview do WhatsApp
      </div>
      <div ref={setNodeRef} className={`flex-1 overflow-y-auto p-4 space-y-3 ${isOver ? 'ring-2 ring-cyan-400 ring-inset' : ''}`}>
        {/* Boas-vindas */}
        <div
          onClick={() => onSelect({ type: 'welcome' })}
          className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white shadow cursor-pointer border-2 transition-colors ${
            selected.type === 'welcome' ? 'border-cyan-400' : 'border-transparent hover:border-slate-200'
          }`}
        >
          <p className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide mb-1">Boas-vindas</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{welcomeMessage || 'Configure a mensagem de boas-vindas →'}</p>
        </div>

        {/* Menu (opções) */}
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white shadow border-2 border-transparent p-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-1.5 pt-1 pb-1.5">Menu de opções</p>
          <SortableContext items={options.map(o => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {options.map(opt => (
                <SortableOptionBubble
                  key={opt.id}
                  option={opt}
                  isSelected={selected.type === 'option' && selected.id === opt.id}
                  onSelect={() => onSelect({ type: 'option', id: opt.id })}
                  onRemove={() => onRemoveOption(opt.id)}
                  actionConfigs={actionConfigs}
                  fluxos={fluxos}
                />
              ))}
            </div>
          </SortableContext>
          {options.length === 0 && (
            <p className="text-xs text-slate-400 italic px-2 py-3 text-center">Arraste um bloco da biblioteca até aqui para criar a primeira opção</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Right column: block configuration ─────────────────────────────────────

function VariableChips({ registry, onInsert }: { registry: VariableEntry[]; onInsert: (token: string) => void }) {
  if (registry.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {registry.map(v => (
        <button
          key={v.key}
          type="button"
          title={v.description}
          onClick={() => onInsert(`{${v.key}}`)}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100"
        >
          {`{${v.key}}`}
        </button>
      ))}
    </div>
  )
}

function BlockConfigPanel({
  selected, keywords, welcomeMessage, onKeywordsChange, onWelcomeMessageChange,
  selectedOption, onUpdateOption, variableRegistry, fluxos, actionConfigs, onManageSystemActions,
}: {
  selected: SelectedBlock
  keywords: string
  welcomeMessage: string
  onKeywordsChange: (v: string) => void
  onWelcomeMessageChange: (v: string) => void
  selectedOption: FluxoOption | null
  onUpdateOption: (id: string, patch: Partial<FluxoOption>) => void
  variableRegistry: VariableEntry[]
  fluxos: LightFluxo[]
  actionConfigs: SystemActionConfig[]
  onManageSystemActions: () => void
}) {
  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white p-4 overflow-y-auto scrollbar-none">
      {selected.type === 'welcome' && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-800">Boas-vindas</p>
          <div>
            <label className="label text-xs mb-1">Quando o paciente enviar (palavras-chave)</label>
            <input
              value={keywords}
              onChange={e => onKeywordsChange(e.target.value)}
              placeholder="oi, olá, bom dia, agendar"
              className="input-field text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">Separe as palavras por vírgula.</p>
          </div>
          <div>
            <label className="label text-xs mb-1">Mensagem de boas-vindas</label>
            <textarea
              value={welcomeMessage}
              onChange={e => onWelcomeMessageChange(e.target.value)}
              rows={5}
              className="input-field text-sm resize-none"
            />
            <VariableChips registry={variableRegistry} onInsert={token => onWelcomeMessageChange(`${welcomeMessage}${welcomeMessage && !welcomeMessage.endsWith(' ') ? ' ' : ''}${token}`)} />
          </div>
        </div>
      )}

      {selected.type === 'option' && selectedOption && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-800">Opção {selectedOption.number}</p>

          <div>
            <label className="label text-xs mb-1">Texto da opção *</label>
            <input
              value={selectedOption.label}
              onChange={e => onUpdateOption(selectedOption.id, { label: e.target.value })}
              className="input-field text-sm"
              placeholder="Ex: Confirmar consulta"
            />
          </div>

          <div>
            <label className="label text-xs mb-1">Quando o paciente digitar *</label>
            <input
              value={selectedOption.triggers}
              onChange={e => onUpdateOption(selectedOption.id, { triggers: e.target.value })}
              className="input-field text-sm font-mono"
              placeholder={`Ex: ${selectedOption.number}, confirmar, sim`}
            />
          </div>

          <div>
            <label className="label text-xs mb-1">
              {selectedOption.actionType === 'SYSTEM_ACTION' ? 'Mensagem antes de iniciar a ação *' : 'Resposta do bot *'}
            </label>
            <textarea
              value={selectedOption.response}
              onChange={e => onUpdateOption(selectedOption.id, { response: e.target.value })}
              rows={3}
              className="input-field text-sm resize-none"
            />
            <VariableChips
              registry={variableRegistry}
              onInsert={token => onUpdateOption(selectedOption.id, {
                response: `${selectedOption.response}${selectedOption.response && !selectedOption.response.endsWith(' ') ? ' ' : ''}${token}`,
              })}
            />
          </div>

          <div>
            <label className="label text-xs mb-1">Ação após resposta *</label>
            <select
              value={selectedOption.actionType}
              onChange={e => onUpdateOption(selectedOption.id, {
                actionType: e.target.value as FluxoActionType,
                queueId: null, nextFlowId: null, systemAction: null,
                systemActionKey: null, systemActionConfigId: null, transitionMessage: null,
              })}
              className="input-field text-sm"
            >
              {FLUXO_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {selectedOption.actionType === 'TRANSFER_QUEUE' && (
            <div>
              <label className="label text-xs mb-1">Fila de destino *</label>
              <select
                value={selectedOption.queueId ?? ''}
                onChange={e => onUpdateOption(selectedOption.id, { queueId: e.target.value || null })}
                className="input-field text-sm"
              >
                <option value="">— Selecionar fila —</option>
                {FLUXO_QUEUES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
          )}

          {selectedOption.actionType === 'OPEN_MENU' && (
            <div>
              <label className="label text-xs mb-1">Submenu (fluxo) *</label>
              <select
                value={selectedOption.nextFlowId ?? ''}
                onChange={e => onUpdateOption(selectedOption.id, { nextFlowId: e.target.value || null })}
                className="input-field text-sm"
              >
                <option value="">— Selecionar fluxo —</option>
                {fluxos.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {selectedOption.actionType === 'SYSTEM_ACTION' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ação do sistema</p>
                <button onClick={onManageSystemActions} className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1">
                  <Settings className="w-3 h-3" /> Gerenciar
                </button>
              </div>
              <div>
                <label className="label text-[11px] mb-0.5">Tipo de ação *</label>
                <select
                  value={selectedOption.systemActionKey ?? ''}
                  onChange={e => onUpdateOption(selectedOption.id, { systemActionKey: e.target.value || null, systemActionConfigId: null })}
                  className="input-field text-sm py-1.5"
                >
                  <option value="">— Selecionar Ação —</option>
                  <option value="SCHEDULE_APPOINTMENT">Agendar consulta</option>
                  <option value="CONFIRM_APPOINTMENT">Confirmar consulta</option>
                  <option value="CANCEL_APPOINTMENT" disabled>Cancelar consulta (Em breve)</option>
                  <option value="SEND_PAYMENT_LINK" disabled>Enviar link de pagamento (Em breve)</option>
                  <option value="SEND_EVALUATION_FORM" disabled>Enviar formulário de avaliação (Em breve)</option>
                  <option value="UPDATE_PATIENT" disabled>Atualizar cadastro do paciente (Em breve)</option>
                </select>
              </div>
              <div>
                <label className="label text-[11px] mb-0.5">Configuração da ação *</label>
                <select
                  value={selectedOption.systemActionConfigId ?? ''}
                  onChange={e => onUpdateOption(selectedOption.id, { systemActionConfigId: e.target.value || null })}
                  className="input-field text-sm py-1.5"
                  disabled={!selectedOption.systemActionKey}
                >
                  <option value="">— Selecionar Configuração —</option>
                  {actionConfigs.filter(c => c.actionKey === selectedOption.systemActionKey && c.active).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedOption.systemActionKey && actionConfigs.filter(c => c.actionKey === selectedOption.systemActionKey).length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">Nenhuma configuração encontrada — clique em "Gerenciar" para criar uma.</p>
                )}
              </div>
              <div>
                <label className="label text-[11px] mb-0.5">Mensagem de transição (opcional)</label>
                <textarea
                  value={selectedOption.transitionMessage ?? ''}
                  onChange={e => onUpdateOption(selectedOption.id, { transitionMessage: e.target.value })}
                  rows={2}
                  className="input-field text-sm resize-none"
                  placeholder="Ex: Perfeito! Vamos iniciar seu agendamento..."
                />
              </div>
            </div>
          )}

          {selectedOption.actionType === 'START_LEAD_CAPTURE' && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CalendarClock className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-700">
                O chatbot coletará o nome e telefone do paciente e registrará o interesse em <strong>Pré-Agendamentos</strong>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Flow settings modal (name/description/fallback — salvos imediatamente) ─

function FlowSettingsModal({ fluxo, onClose, onSave, saving }: {
  fluxo: LightFluxo
  onClose: () => void
  onSave: (data: { name: string; description: string; maxAttempts: number; fallbackMessage: string; active: boolean }) => void
  saving: boolean
}) {
  const [name, setName] = useState(fluxo.name)
  const [description, setDescription] = useState(fluxo.description ?? '')
  const [maxAttempts, setMaxAttempts] = useState(fluxo.maxAttempts)
  const [fallbackMessage, setFallbackMessage] = useState(fluxo.fallbackMessage)
  const [active, setActive] = useState(fluxo.active)

  return (
    <Modal isOpen onClose={onClose} title="Configurações do fluxo" subtitle="Essas configurações são salvas imediatamente (não passam pelo rascunho/publicação)." size="md">
      <div className="space-y-4">
        <div>
          <label className="label text-xs mb-1">Nome do fluxo</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field text-sm" />
        </div>
        <div>
          <label className="label text-xs mb-1">Descrição</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className="input-field text-sm" />
        </div>
        <div className="flex gap-4">
          <div className="w-40">
            <label className="label text-xs mb-1">Tentativas inválidas</label>
            <input type="number" min={1} max={10} value={maxAttempts} onChange={e => setMaxAttempts(parseInt(e.target.value) || 3)} className="input-field text-sm" />
          </div>
          <div className="flex-1">
            <label className="label text-xs mb-1">Mensagem de fallback</label>
            <textarea value={fallbackMessage} onChange={e => setFallbackMessage(e.target.value)} rows={2} className="input-field text-sm resize-none" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="label mb-0 text-xs">Fluxo ativo</label>
          <button onClick={() => setActive(a => !a)} className={`text-xs font-semibold px-3 py-1 rounded-full border ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {active ? 'Ativo' : 'Inativo'}
          </button>
        </div>
        <button
          onClick={() => onSave({ name, description, maxAttempts, fallbackMessage, active })}
          disabled={saving}
          className="btn-primary w-full"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Test drawer (simula com o rascunho, useDraft: true) ───────────────────

// Espelha MessageSource de chatbot-light-simulator.ts (backend) — granularidade
// por turno: quando um turno manda várias bolhas (ex: opção "Ação do sistema"
// que dispara mensagem de transição + a primeira pergunta do agendamento),
// todas compartilham a mesma origem.
interface MessageSource {
  type: string
  label: string
  detail?: string | null
}

interface TestBubble { sender: 'bot' | 'user'; text: string; source?: MessageSource }

function TestDrawer({ chatbotId, fluxoId, onClose }: { chatbotId: string; fluxoId: string; onClose: () => void }) {
  const [sessionToken] = useState(() => generateUUID())
  const [messages, setMessages] = useState<TestBubble[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api.post('/chatbot-light/simulate', { sessionToken, message: text, chatbotId, fluxoId, useDraft: true }).then(r => r.data),
    onMutate: (text: string) => {
      setMessages(prev => [...prev, { sender: 'user', text }])
      setSending(true)
    },
    onSuccess: (result: { botMessages: string[]; source?: MessageSource }) => {
      setMessages(prev => [...prev, ...result.botMessages.map(text => ({ sender: 'bot' as const, text, source: result.source }))])
    },
    onError: () => toast.error('Erro ao simular mensagem'),
    onSettled: () => setSending(false),
  })

  const handleClose = () => {
    api.delete(`/chatbot-light/simulate/${sessionToken}`).catch(() => {})
    onClose()
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    sendMutation.mutate(text)
  }

  const toggleExpanded = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-bold text-slate-900">Testar conversa</p>
          <p className="text-[11px] text-slate-400">Simulação com o rascunho deste fluxo — não afeta o chatbot publicado.</p>
        </div>
        <button onClick={handleClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 bg-[#e5ddd5]">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500 text-center mt-8">Digite qualquer mensagem para simular o início deste fluxo.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.sender === 'bot' ? '' : 'flex justify-end'}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow ${
              m.sender === 'bot' ? 'bg-white text-slate-800 rounded-tl-sm' : 'bg-emerald-100 text-slate-800 rounded-tr-sm'
            }`}>
              {m.text}
            </div>
            {m.sender === 'bot' && m.source && (
              <div className="mt-0.5">
                <button onClick={() => toggleExpanded(i)} className="text-[10px] text-cyan-700 hover:underline">
                  {expanded.has(i) ? 'Ocultar origem' : 'Ver origem'}
                </button>
                {expanded.has(i) && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {m.source.label}{m.source.detail ? ` · ${m.source.detail}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-100 flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
          placeholder="Digite uma mensagem..."
          className="input-field text-sm flex-1"
        />
        <button onClick={handleSend} disabled={sending} className="btn-icon bg-cyan-600 text-white hover:bg-cyan-700">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
