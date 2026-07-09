import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Plus, Trash2, MessageSquare, Loader2, Play, Save, UploadCloud, X,
  GitBranch, PhoneCall, CalendarClock, Settings, Send, Layers, History, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import Modal from '../../components/ui/Modal'

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

interface Block {
  id: string
  type: string
  name: string
  orderIndex: number
  parentBlockId: string | null
  config: Record<string, any>
  isActive: boolean
}

interface ActionField { key: string; label: string; required: boolean }
interface SystemActionInfo { key: string; name: string; description: string; implemented: boolean; inputs: ActionField[]; outputs: ActionField[] }

const PALETTE: { type: string; label: string; hint: string; icon: typeof MessageSquare; category: string }[] = [
  { type: 'welcome', label: 'Boas-vindas', hint: 'Início da conversa, com gatilho', icon: MessageSquare, category: 'Mensagens' },
  { type: 'message', label: 'Mensagem simples', hint: 'Só envia texto', icon: MessageSquare, category: 'Mensagens' },
  { type: 'off_hours', label: 'Fora do horário', hint: 'Mensagem quando a clínica está fechada', icon: Clock, category: 'Mensagens' },
  { type: 'success_message', label: 'Mensagem de sucesso', hint: 'Destino do "sucesso" de uma ação', icon: CheckCircle2, category: 'Mensagens' },
  { type: 'error_message', label: 'Mensagem de erro', hint: 'Destino do "erro" de uma ação', icon: XCircle, category: 'Mensagens' },
  { type: 'menu', label: 'Menu fixo', hint: 'Opções numeradas com destino', icon: GitBranch, category: 'Menus' },
  { type: 'submenu', label: 'Submenu', hint: 'Mesmo comportamento do menu, aninhado', icon: GitBranch, category: 'Menus' },
  { type: 'menu_dynamic', label: 'Menu dinâmico', hint: 'Opções vindas de uma Ação do Sistema', icon: Layers, category: 'Menus' },
  { type: 'collect_data', label: 'Coletar dado', hint: 'Pergunta e salva numa variável', icon: CalendarClock, category: 'Coleta' },
  { type: 'confirm_data', label: 'Confirmar dados', hint: 'Pergunta sim/não com variáveis', icon: CheckCircle2, category: 'Coleta' },
  { type: 'system_action', label: 'Executar Ação do Sistema', hint: 'Chama uma ação técnica (sem mensagem)', icon: Settings, category: 'Sistema' },
  { type: 'condition', label: 'Condição', hint: 'Ramifica conforme uma variável', icon: GitBranch, category: 'Sistema' },
  { type: 'transfer', label: 'Transferir atendimento', hint: 'Encaminha para fila humana', icon: PhoneCall, category: 'Sistema' },
  { type: 'end', label: 'Encerrar conversa', hint: 'Finaliza o atendimento', icon: X, category: 'Sistema' },
]

const WAITING_TYPES = new Set(['menu', 'submenu', 'menu_dynamic', 'collect_data', 'confirm_data'])

function newBlock(type: string): Block {
  const label = PALETTE.find(p => p.type === type)?.label ?? type
  return { id: generateUUID(), type, name: label, orderIndex: 0, parentBlockId: null, config: type === 'menu' || type === 'submenu' ? { options: [] } : {}, isActive: true }
}

export default function BlockBuilderPanel({ chatbotId }: { chatbotId: string }) {
  const qc = useQueryClient()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [pendencias, setPendencias] = useState<{ type: string; blockId: string; message: string }[] | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const seeded = useState(() => ({ done: false }))[0]

  const { data: draft, isLoading } = useQuery({
    queryKey: ['chatbot-block-draft', chatbotId],
    queryFn: () => api.get(`/chatbot-light/chatbots/${chatbotId}/builder/draft`).then(r => r.data),
  })

  const { data: actions = [] } = useQuery<SystemActionInfo[]>({
    queryKey: ['chatbot-light-actions'],
    queryFn: () => api.get('/chatbot-light/actions').then(r => r.data),
    staleTime: 60 * 60 * 1000,
  })

  useEffect(() => {
    if (draft && !seeded.done) {
      setBlocks((draft.blocks ?? []).map((b: any) => ({ ...b, config: b.config ?? {} })))
      seeded.done = true
    }
  }, [draft, seeded])

  const saveDraftMutation = useMutation({
    mutationFn: () => api.put(`/chatbot-light/chatbots/${chatbotId}/builder/draft`, {
      blocks: blocks.map((b, i) => ({ ...b, orderIndex: i })),
    }).then(r => r.data),
    onSuccess: () => { toast.success('Rascunho salvo'); qc.invalidateQueries({ queryKey: ['chatbot-block-draft', chatbotId] }) },
    onError: () => toast.error('Erro ao salvar rascunho'),
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      await saveDraftMutation.mutateAsync()
      return api.post(`/chatbot-light/chatbots/${chatbotId}/builder/publish`).then(r => r.data)
    },
    onSuccess: () => {
      toast.success('Publicado! O chatbot já está usando esta versão.')
      qc.invalidateQueries({ queryKey: ['chatbot-block-draft', chatbotId] })
    },
    onError: (err: any) => {
      const list = err?.response?.data?.errors
      if (Array.isArray(list) && list.length > 0) setPendencias(list)
      else toast.error(err?.response?.data?.message || 'Erro ao publicar')
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setBlocks(prev => {
      const oldIndex = prev.findIndex(b => b.id === active.id)
      const newIndex = prev.findIndex(b => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const addBlock = (type: string) => {
    const block = newBlock(type)
    setBlocks(prev => [...prev, block])
    setSelectedId(block.id)
  }

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  const updateConfig = (id: string, patch: Record<string, any>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, config: { ...b.config, ...patch } } : b))
  }

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const selected = blocks.find(b => b.id === selectedId) ?? null

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">Construtor de Blocos</span>
          {draft?.hasPublishedVersion && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
              Publicado (v{draft.publishedVersionNumber})
            </span>
          )}
          <button onClick={() => setTemplatesOpen(true)} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1 ml-2">
            <Layers className="w-3.5 h-3.5" /> Inserir modelo pronto
          </button>
          <button onClick={() => setLegacyOpen(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> Mensagens herdadas
          </button>
          <button onClick={() => setActionsOpen(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <Settings className="w-3.5 h-3.5" /> Ações do Sistema
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTestOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
            <Play className="w-3.5 h-3.5" /> Testar
          </button>
          <button onClick={() => saveDraftMutation.mutate()} disabled={saveDraftMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            <Save className="w-3.5 h-3.5" /> Salvar rascunho
          </button>
          <button onClick={() => { if (confirm('Publicar esta versão? O chatbot passará a usar imediatamente estes blocos.')) publishMutation.mutate() }} disabled={publishMutation.isPending} className="btn-primary text-sm">
            <UploadCloud className="w-3.5 h-3.5" /> Publicar
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0">
          <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-slate-50/60 p-3 overflow-y-auto scrollbar-none">
            {['Mensagens', 'Menus', 'Coleta', 'Sistema'].map(cat => (
              <div key={cat} className="mb-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 px-1">{cat}</p>
                <div className="space-y-1.5">
                  {PALETTE.filter(p => p.category === cat).map(p => (
                    <button
                      key={p.type}
                      onClick={() => addBlock(p.type)}
                      className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
                    >
                      <p.icon className="w-4 h-4 text-cyan-600 flex-shrink-0 mt-0.5" />
                      <span>
                        <span className="block text-xs font-semibold text-slate-800">{p.label}</span>
                        <span className="block text-[11px] text-slate-400">{p.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0 bg-[#e5ddd5] flex flex-col">
            <div className="px-4 py-2.5 bg-[#075e54] text-white text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Conversa (ordem de execução)
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                {blocks.map(b => (
                  <BlockCard key={b.id} block={b} isSelected={selectedId === b.id} onSelect={() => setSelectedId(b.id)} onRemove={() => removeBlock(b.id)} />
                ))}
              </SortableContext>
              {blocks.length === 0 && (
                <p className="text-xs text-slate-500 text-center mt-8">Clique num bloco da biblioteca à esquerda para começar a montar a conversa.</p>
              )}
            </div>
          </div>

          <BlockConfigPanel
            block={selected}
            blocks={blocks}
            actions={actions}
            onUpdate={patch => selected && updateBlock(selected.id, patch)}
            onUpdateConfig={patch => selected && updateConfig(selected.id, patch)}
          />
        </div>
      </DndContext>

      {pendencias && (
        <Modal isOpen onClose={() => setPendencias(null)} title="Não é possível publicar ainda" subtitle="Resolva as pendências abaixo antes de publicar." size="md">
          <ul className="space-y-2">
            {pendencias.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-600 flex-shrink-0">⚠</span> {p.message}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {actionsOpen && <ActionsCatalogModal chatbotId={chatbotId} actions={actions} onClose={() => setActionsOpen(false)} />}
      {templatesOpen && <TemplatesModal chatbotId={chatbotId} onClose={() => setTemplatesOpen(false)} onApplied={() => { qc.invalidateQueries({ queryKey: ['chatbot-block-draft', chatbotId] }); seeded.done = false }} />}
      {legacyOpen && <LegacyMessagesModal chatbotId={chatbotId} onClose={() => setLegacyOpen(false)} onConverted={() => { qc.invalidateQueries({ queryKey: ['chatbot-block-draft', chatbotId] }); seeded.done = false }} />}
      {testOpen && <BlockTestDrawer chatbotId={chatbotId} onClose={() => setTestOpen(false)} />}
    </div>
  )
}

function BlockCard({ block, isSelected, onSelect, onRemove }: { block: Block; isSelected: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const paletteItem = PALETTE.find(p => p.type === block.type)
  const Icon = paletteItem?.icon ?? MessageSquare

  const preview = block.type === 'welcome' || block.type === 'off_hours'
    ? `Gatilhos: ${block.config.triggers || '—'}`
    : block.type === 'menu' || block.type === 'submenu'
      ? `${(block.config.options ?? []).length} opção(ões)`
      : block.type === 'system_action'
        ? `Ação: ${block.config.actionKey || 'não selecionada'}`
        : (block.config.message || block.config.question || '')

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`max-w-[90%] flex items-start gap-2 p-2.5 rounded-2xl bg-white shadow border-2 cursor-pointer transition-colors ${
        isSelected ? 'border-cyan-400' : 'border-transparent hover:border-slate-200'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button {...attributes} {...listeners} onClick={e => e.stopPropagation()} className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </button>
      <Icon className="w-4 h-4 text-cyan-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide">{paletteItem?.label ?? block.type}</p>
        <p className="text-sm font-medium text-slate-800 truncate">{block.name}</p>
        {preview && <p className="text-[11px] text-slate-400 truncate">{preview}</p>}
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove() }} className="text-slate-300 hover:text-red-500 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function BlockTargetSelect({ value, onChange, blocks, label }: { value: string | undefined; onChange: (v: string) => void; blocks: Block[]; label: string }) {
  return (
    <div>
      <label className="label text-[11px] mb-0.5">{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className="input-field text-sm py-1.5">
        <option value="">— Selecionar bloco —</option>
        {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  )
}

function BlockConfigPanel({ block, blocks, actions, onUpdate, onUpdateConfig }: {
  block: Block | null
  blocks: Block[]
  actions: SystemActionInfo[]
  onUpdate: (patch: Partial<Block>) => void
  onUpdateConfig: (patch: Record<string, any>) => void
}) {
  if (!block) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-400">Selecione um bloco no canvas para configurar.</p>
      </div>
    )
  }

  const otherBlocks = blocks.filter(b => b.id !== block.id)
  const cfg = block.config

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white p-4 overflow-y-auto scrollbar-none space-y-4">
      <div>
        <label className="label text-xs mb-1">Nome do bloco</label>
        <input value={block.name} onChange={e => onUpdate({ name: e.target.value })} className="input-field text-sm" />
      </div>

      {(block.type === 'welcome' || block.type === 'off_hours') && (
        <>
          <div>
            <label className="label text-xs mb-1">Gatilhos (palavras-chave)</label>
            <input value={cfg.triggers ?? ''} onChange={e => onUpdateConfig({ triggers: e.target.value })} placeholder="oi, olá, menu" className="input-field text-sm" />
          </div>
          <div>
            <label className="label text-xs mb-1">Mensagem</label>
            <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={4} className="input-field text-sm resize-none" />
          </div>
          <BlockTargetSelect label="Próximo bloco" value={cfg.nextBlockId} onChange={v => onUpdateConfig({ nextBlockId: v })} blocks={otherBlocks} />
        </>
      )}

      {(block.type === 'message' || block.type === 'success_message' || block.type === 'error_message') && (
        <>
          <div>
            <label className="label text-xs mb-1">Mensagem</label>
            <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={4} className="input-field text-sm resize-none" placeholder="Use {variavel} para inserir dados coletados" />
          </div>
          <BlockTargetSelect label="Próximo bloco" value={cfg.nextBlockId} onChange={v => onUpdateConfig({ nextBlockId: v })} blocks={otherBlocks} />
        </>
      )}

      {(block.type === 'menu' || block.type === 'submenu') && (
        <MenuConfig cfg={cfg} onUpdateConfig={onUpdateConfig} otherBlocks={otherBlocks} />
      )}

      {block.type === 'menu_dynamic' && (
        <MenuDynamicConfig cfg={cfg} onUpdateConfig={onUpdateConfig} otherBlocks={otherBlocks} actions={actions} />
      )}

      {block.type === 'collect_data' && (
        <CollectDataConfig cfg={cfg} onUpdateConfig={onUpdateConfig} otherBlocks={otherBlocks} />
      )}

      {block.type === 'confirm_data' && (
        <>
          <div>
            <label className="label text-xs mb-1">Mensagem (pode usar variáveis)</label>
            <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={4} className="input-field text-sm resize-none" />
          </div>
          <BlockTargetSelect label='Se responder "1 / Sim"' value={cfg.yesBlockId} onChange={v => onUpdateConfig({ yesBlockId: v })} blocks={otherBlocks} />
          <BlockTargetSelect label='Se responder "2 / Não"' value={cfg.noBlockId} onChange={v => onUpdateConfig({ noBlockId: v })} blocks={otherBlocks} />
        </>
      )}

      {block.type === 'system_action' && (
        <SystemActionConfig cfg={cfg} onUpdateConfig={onUpdateConfig} otherBlocks={otherBlocks} actions={actions} />
      )}

      {block.type === 'condition' && (
        <>
          <div>
            <label className="label text-xs mb-1">Variável</label>
            <input value={cfg.variable ?? ''} onChange={e => onUpdateConfig({ variable: e.target.value })} placeholder="ex: convenioId" className="input-field text-sm" />
          </div>
          <div>
            <label className="label text-xs mb-1">Operador</label>
            <select value={cfg.operator ?? 'exists'} onChange={e => onUpdateConfig({ operator: e.target.value })} className="input-field text-sm">
              <option value="exists">Existe / preenchida</option>
              <option value="eq">Igual a</option>
              <option value="neq">Diferente de</option>
            </select>
          </div>
          {cfg.operator !== 'exists' && (
            <div>
              <label className="label text-xs mb-1">Valor de comparação</label>
              <input value={cfg.value ?? ''} onChange={e => onUpdateConfig({ value: e.target.value })} className="input-field text-sm" />
            </div>
          )}
          <BlockTargetSelect label="Se verdadeiro" value={cfg.trueBlockId} onChange={v => onUpdateConfig({ trueBlockId: v })} blocks={otherBlocks} />
          <BlockTargetSelect label="Se falso" value={cfg.falseBlockId} onChange={v => onUpdateConfig({ falseBlockId: v })} blocks={otherBlocks} />
        </>
      )}

      {(block.type === 'transfer' || block.type === 'end') && (
        <div>
          <label className="label text-xs mb-1">Mensagem (opcional)</label>
          <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={3} className="input-field text-sm resize-none" />
        </div>
      )}
    </div>
  )
}

function MenuConfig({ cfg, onUpdateConfig, otherBlocks }: { cfg: any; onUpdateConfig: (p: any) => void; otherBlocks: Block[] }) {
  const options: any[] = cfg.options ?? []
  const update = (i: number, patch: any) => {
    const next = options.map((o, idx) => idx === i ? { ...o, ...patch } : o)
    onUpdateConfig({ options: next })
  }
  const add = () => onUpdateConfig({ options: [...options, { number: options.length + 1, label: '', triggers: String(options.length + 1), nextBlockId: '' }] })
  const remove = (i: number) => onUpdateConfig({ options: options.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, number: idx + 1 })) })

  return (
    <>
      <div>
        <label className="label text-xs mb-1">Mensagem do menu</label>
        <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={3} className="input-field text-sm resize-none" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label text-xs mb-0">Opções</label>
          <button onClick={add} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 flex items-center gap-1"><Plus className="w-3 h-3" /> Adicionar</button>
        </div>
        {options.map((opt, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-2.5 space-y-1.5 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <input value={opt.label} onChange={e => update(i, { label: e.target.value })} placeholder={`Opção ${i + 1}`} className="input-field text-sm py-1 flex-1" />
              <button onClick={() => remove(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <input value={opt.triggers} onChange={e => update(i, { triggers: e.target.value })} placeholder="Quando digitar (ex: 1, sim)" className="input-field text-sm py-1 font-mono" />
            <select value={opt.nextBlockId ?? ''} onChange={e => update(i, { nextBlockId: e.target.value })} className="input-field text-sm py-1">
              <option value="">— Destino: nenhum (⚠) —</option>
              {otherBlocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      <BlockTargetSelect label="Bloco de fallback (esgotar tentativas)" value={cfg.fallbackBlockId} onChange={v => onUpdateConfig({ fallbackBlockId: v })} blocks={otherBlocks} />
    </>
  )
}

function MenuDynamicConfig({ cfg, onUpdateConfig, otherBlocks, actions }: { cfg: any; onUpdateConfig: (p: any) => void; otherBlocks: Block[]; actions: SystemActionInfo[] }) {
  return (
    <>
      <div>
        <label className="label text-xs mb-1">Mensagem</label>
        <textarea value={cfg.message ?? ''} onChange={e => onUpdateConfig({ message: e.target.value })} rows={2} className="input-field text-sm resize-none" />
      </div>
      <div>
        <label className="label text-xs mb-1">Fonte das opções (Ação do Sistema)</label>
        <select value={cfg.actionKey ?? ''} onChange={e => onUpdateConfig({ actionKey: e.target.value })} className="input-field text-sm">
          <option value="">— Selecionar ação —</option>
          {actions.filter(a => a.implemented).map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label text-xs mb-1">Salvar escolha em (variável)</label>
        <input value={cfg.saveTo ?? ''} onChange={e => onUpdateConfig({ saveTo: e.target.value })} placeholder="ex: servicoId" className="input-field text-sm" />
      </div>
      <div>
        <label className="label text-xs mb-1">Salvar rótulo em (opcional)</label>
        <input value={cfg.saveLabelTo ?? ''} onChange={e => onUpdateConfig({ saveLabelTo: e.target.value })} placeholder="ex: servicoNome" className="input-field text-sm" />
      </div>
      <BlockTargetSelect label="Próximo bloco" value={cfg.nextBlockId} onChange={v => onUpdateConfig({ nextBlockId: v })} blocks={otherBlocks} />
      <BlockTargetSelect label="Bloco de erro (sem opções disponíveis)" value={cfg.errorBlockId} onChange={v => onUpdateConfig({ errorBlockId: v })} blocks={otherBlocks} />
    </>
  )
}

function CollectDataConfig({ cfg, onUpdateConfig, otherBlocks }: { cfg: any; onUpdateConfig: (p: any) => void; otherBlocks: Block[] }) {
  return (
    <>
      <div>
        <label className="label text-xs mb-1">Pergunta</label>
        <textarea value={cfg.question ?? ''} onChange={e => onUpdateConfig({ question: e.target.value })} rows={2} className="input-field text-sm resize-none" />
      </div>
      <div>
        <label className="label text-xs mb-1">Salvar resposta em (variável)</label>
        <input value={cfg.saveTo ?? ''} onChange={e => onUpdateConfig({ saveTo: e.target.value })} placeholder="ex: nome" className="input-field text-sm" />
      </div>
      <div>
        <label className="label text-xs mb-1">Tipo de dado</label>
        <select value={cfg.dataType ?? 'texto'} onChange={e => onUpdateConfig({ dataType: e.target.value })} className="input-field text-sm">
          <option value="texto">Texto</option>
          <option value="telefone">Telefone</option>
          <option value="cpf">CPF</option>
          <option value="data">Data</option>
          <option value="numero">Número</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={cfg.validation?.required !== false} onChange={e => onUpdateConfig({ validation: { ...cfg.validation, required: e.target.checked } })} />
        Obrigatório
      </label>
      <BlockTargetSelect label="Próximo bloco (resposta válida)" value={cfg.nextBlockId} onChange={v => onUpdateConfig({ nextBlockId: v })} blocks={otherBlocks} />
      <BlockTargetSelect label="Bloco de erro (resposta inválida)" value={cfg.errorBlockId} onChange={v => onUpdateConfig({ errorBlockId: v })} blocks={otherBlocks} />
    </>
  )
}

function SystemActionConfig({ cfg, onUpdateConfig, otherBlocks, actions }: { cfg: any; onUpdateConfig: (p: any) => void; otherBlocks: Block[]; actions: SystemActionInfo[] }) {
  const action = actions.find(a => a.key === cfg.actionKey)
  const inputsMap = cfg.inputsMap ?? {}

  return (
    <div className="space-y-3">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ação do sistema (sem mensagem)</p>
        <div>
          <label className="label text-[11px] mb-0.5">Ação *</label>
          <select value={cfg.actionKey ?? ''} onChange={e => onUpdateConfig({ actionKey: e.target.value, inputsMap: {} })} className="input-field text-sm py-1.5">
            <option value="">— Selecionar ação —</option>
            {actions.filter(a => a.implemented).map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          {action && <p className="text-[10px] text-slate-400 mt-1">{action.description}</p>}
        </div>

        {action && action.inputs.map(input => (
          <div key={input.key}>
            <label className="label text-[11px] mb-0.5">{input.label}{input.required ? ' *' : ''}</label>
            <input
              value={inputsMap[input.key] ?? ''}
              onChange={e => onUpdateConfig({ inputsMap: { ...inputsMap, [input.key]: e.target.value } })}
              placeholder={`{nomeDaVariavel} ou valor fixo`}
              className="input-field text-sm py-1.5 font-mono"
            />
          </div>
        ))}
        {action && (
          <p className="text-[10px] text-slate-400">
            Saídas disponíveis após sucesso: {action.outputs.map(o => `{${o.key}}`).join(', ')}
          </p>
        )}
      </div>
      <BlockTargetSelect label="Se sucesso, ir para" value={cfg.successBlockId} onChange={v => onUpdateConfig({ successBlockId: v })} blocks={otherBlocks} />
      <BlockTargetSelect label="Se erro, ir para" value={cfg.errorBlockId} onChange={v => onUpdateConfig({ errorBlockId: v })} blocks={otherBlocks} />
    </div>
  )
}

// ─── Modais auxiliares ──────────────────────────────────────────────────────

// Tela operacional das Ações do Sistema: só nome/descrição/entradas/saídas +
// testar com dados fictícios. Sem nenhum campo de mensagem — quem manda
// mensagem é sempre um bloco do Construtor, nunca uma ação.
function ActionsCatalogModal({ chatbotId, actions, onClose }: { chatbotId: string; actions: SystemActionInfo[]; onClose: () => void }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [testInputs, setTestInputs] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const runTest = async (action: SystemActionInfo) => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/chatbot-light/chatbots/${chatbotId}/actions/${action.key}/test`, { input: testInputs }).then(r => r.data)
      setTestResult(res)
    } catch (err: any) {
      setTestResult({ success: false, error: err?.response?.data?.message || 'Erro ao testar ação' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Ações do Sistema" subtitle="Operações técnicas — recebem entradas, executam algo no sistema, retornam dados ou erro. Nunca mandam mensagem ao paciente." size="lg">
      <div className="space-y-2">
        {actions.map(a => {
          const isOpen = expandedKey === a.key
          return (
            <div key={a.key} className={`border rounded-xl overflow-hidden ${a.implemented ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
              <button
                onClick={() => { setExpandedKey(isOpen ? null : a.key); setTestResult(null); setTestInputs({}) }}
                className="w-full text-left p-3 flex items-center justify-between"
                disabled={!a.implemented}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.description}</p>
                </div>
                {!a.implemented && <span className="text-[10px] text-slate-400 font-semibold">Em breve</span>}
              </button>
              {isOpen && (
                <div className="p-3 border-t border-slate-100 bg-slate-50/60 space-y-3">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Entradas</p>
                    <div className="space-y-1.5">
                      {a.inputs.map(inp => (
                        <input
                          key={inp.key}
                          value={testInputs[inp.key] ?? ''}
                          onChange={e => setTestInputs(prev => ({ ...prev, [inp.key]: e.target.value }))}
                          placeholder={`${inp.label}${inp.required ? ' *' : ''}`}
                          className="input-field text-sm py-1.5"
                        />
                      ))}
                      {a.inputs.length === 0 && <p className="text-xs text-slate-400">Sem entradas.</p>}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">Saídas: {a.outputs.map(o => o.key).join(', ') || '—'}</p>
                  <button onClick={() => runTest(a)} disabled={testing} className="btn-primary text-xs">
                    {testing ? 'Testando...' : 'Testar com esses dados'}
                  </button>
                  {testResult && (
                    <pre className={`text-[11px] p-2 rounded-lg overflow-x-auto ${testResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function TemplatesModal({ chatbotId, onClose, onApplied }: { chatbotId: string; onClose: () => void; onApplied: () => void }) {
  const { data: templates = [] } = useQuery<{ key: string; label: string; description: string; implemented: boolean }[]>({
    queryKey: ['chatbot-block-templates'],
    queryFn: () => api.get('/chatbot-light/builder/templates').then(r => r.data),
  })
  const applyMutation = useMutation({
    mutationFn: (key: string) => api.post(`/chatbot-light/chatbots/${chatbotId}/builder/templates/${key}/apply`).then(r => r.data),
    onSuccess: () => { toast.success('Modelo inserido no rascunho'); onApplied(); onClose() },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao aplicar modelo'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Inserir modelo pronto" subtitle="Cria blocos visíveis no rascunho — não mexe no que já está publicado." size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map(t => (
          <div key={t.key} className={`border rounded-xl p-4 ${t.implemented ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
            <p className="font-semibold text-sm text-slate-900">{t.label}</p>
            <p className="text-xs text-slate-500 mt-1 mb-3">{t.description}</p>
            <button
              disabled={!t.implemented || applyMutation.isPending}
              onClick={() => applyMutation.mutate(t.key)}
              className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:opacity-40"
            >
              {t.implemented ? 'Inserir no rascunho' : 'Em breve'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function LegacyMessagesModal({ chatbotId, onClose, onConverted }: { chatbotId: string; onClose: () => void; onConverted: () => void }) {
  const { data: messages = [], isLoading } = useQuery<{ key: string; configName: string; field: string; text: string; status: string }[]>({
    queryKey: ['chatbot-legacy-messages', chatbotId],
    queryFn: () => api.get(`/chatbot-light/chatbots/${chatbotId}/legacy/messages`).then(r => r.data),
  })
  const convertMutation = useMutation({
    mutationFn: (key: string) => api.post(`/chatbot-light/chatbots/${chatbotId}/legacy/messages/${encodeURIComponent(key)}/convert`).then(r => r.data),
    onSuccess: () => { toast.success('Convertido em bloco — revise e conecte no canvas'); onConverted() },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao converter'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Mensagens herdadas" subtitle="Mensagens que hoje vivem dentro de uma Ação do Sistema legada (não rodam mais se este chatbot estiver em modo Construtor de Blocos)." size="lg">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /></div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nenhuma mensagem legada encontrada para este chatbot.</p>
      ) : (
        <div className="space-y-2">
          {messages.map(m => (
            <div key={m.key} className="border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">{m.configName} · {m.field}</p>
                <p className="text-sm text-slate-600 truncate">{m.text}</p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.status === 'migrated' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {m.status === 'migrated' ? 'Convertida' : 'Mensagem herdada'}
                </span>
              </div>
              <button
                disabled={m.status === 'migrated' || convertMutation.isPending}
                onClick={() => convertMutation.mutate(m.key)}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:opacity-40 flex-shrink-0"
              >
                Transformar em bloco
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

interface TestBubble { sender: 'bot' | 'user'; text: string; source?: { blockType: string; blockName: string } }

function BlockTestDrawer({ chatbotId, onClose }: { chatbotId: string; onClose: () => void }) {
  const [sessionToken] = useState(() => generateUUID())
  const [messages, setMessages] = useState<TestBubble[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const sendMutation = useMutation({
    mutationFn: (text: string) => api.post(`/chatbot-light/chatbots/${chatbotId}/builder/simulate`, { sessionToken, message: text }).then(r => r.data),
    onMutate: (text: string) => { setMessages(prev => [...prev, { sender: 'user', text }]); setSending(true) },
    onSuccess: (result: { botMessages: { text: string; source: { blockType: string; blockName: string } }[] }) => {
      setMessages(prev => [...prev, ...result.botMessages.map(m => ({ sender: 'bot' as const, text: m.text, source: m.source }))])
    },
    onError: () => toast.error('Erro ao simular mensagem'),
    onSettled: () => setSending(false),
  })

  const handleClose = () => {
    api.delete(`/chatbot-light/chatbots/${chatbotId}/builder/simulate/${sessionToken}`).catch(() => {})
    onClose()
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    sendMutation.mutate(text)
  }

  const toggle = (i: number) => setExpanded(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-bold text-slate-900">Testar conversa</p>
          <p className="text-[11px] text-slate-400">Simula o rascunho de blocos — não envia WhatsApp real nem afeta o publicado.</p>
        </div>
        <button onClick={handleClose} className="btn-icon"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 bg-[#e5ddd5]">
        {messages.length === 0 && <p className="text-xs text-slate-500 text-center mt-8">Digite qualquer mensagem para simular o início da conversa.</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.sender === 'bot' ? '' : 'flex justify-end'}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow ${m.sender === 'bot' ? 'bg-white text-slate-800 rounded-tl-sm' : 'bg-emerald-100 text-slate-800 rounded-tr-sm'}`}>
              {m.text}
            </div>
            {m.sender === 'bot' && m.source && (
              <div className="mt-0.5">
                <button onClick={() => toggle(i)} className="text-[10px] text-cyan-700 hover:underline">{expanded.has(i) ? 'Ocultar origem' : 'Ver origem'}</button>
                {expanded.has(i) && <p className="text-[10px] text-slate-500 mt-0.5">Bloco: {m.source.blockName} ({m.source.blockType})</p>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-slate-100 flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSend() }} placeholder="Digite uma mensagem..." className="input-field text-sm flex-1" />
        <button onClick={handleSend} disabled={sending} className="btn-icon bg-cyan-600 text-white hover:bg-cyan-700"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  )
}
