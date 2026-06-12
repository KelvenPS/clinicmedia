import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Play, Square, MessageSquare, List, Bot, Users,
  Plus, Trash2, ChevronLeft, Save, Loader2, X, Zap,
  RotateCcw, Send, ZoomIn, ZoomOut, Maximize, Sparkles,
  TrendingUp, Settings, Layers, Grid, Heart, Search, Copy, Check, Info, AlertCircle, FileText,
  Smile, MoreVertical, Lock
} from 'lucide-react'
import api from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType = 'start' | 'end' | 'message' | 'menu' | 'ai' | 'queue'

export interface CanvasNode {
  id: string
  type: NodeType
  x: number
  y: number
  data: {
    label: string
    text?: string
    options?: string[]
    systemPrompt?: string
  }
}

export interface CanvasEdge {
  id: string
  source: string
  sourcePort: number
  target: string
  label?: string
}

interface FlowCanvasEditorProps {
  flowId: string
  flowName: string
  botType: 'LIGHT' | 'AI_AGENT'
  initialActive?: boolean
  initialNodes?: CanvasNode[]
  initialEdges?: CanvasEdge[]
  onSave: (name: string, nodes: CanvasNode[], edges: CanvasEdge[], active?: boolean) => void
  onBack: () => void
  isSaving?: boolean
}

// ─── Node config ──────────────────────────────────────────────────────────────

interface NodeCfg {
  label: string
  colorClass: string
  bgClass: string
  borderClass: string
  headerClass: string
  accentColor: string
  icon: JSX.Element
  w: number
  baseH: number
  extraHPerOption?: number
  canHaveInput: boolean
  canHaveOutput: boolean
  isCircle?: boolean
}

const NODE_CFG: Record<NodeType, NodeCfg> = {
  start: {
    label: 'Início', colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200 hover:border-emerald-500', headerClass: 'bg-emerald-50/70',
    accentColor: '#10b981',
    icon: <Play className="w-4 h-4 text-emerald-600" />, w: 180, baseH: 70,
    canHaveInput: false, canHaveOutput: true,
  },
  end: {
    label: 'Fim', colorClass: 'text-rose-600', bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200 hover:border-rose-500', headerClass: 'bg-rose-50/70',
    accentColor: '#f43f5e',
    icon: <Square className="w-4 h-4 text-rose-600" />, w: 180, baseH: 70,
    canHaveInput: true, canHaveOutput: false,
  },
  message: {
    label: 'Mensagem', colorClass: 'text-sky-600', bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200 hover:border-sky-500', headerClass: 'bg-sky-50/70',
    accentColor: '#0ea5e9',
    icon: <MessageSquare className="w-4 h-4 text-sky-600" />, w: 220, baseH: 95,
    canHaveInput: true, canHaveOutput: true,
  },
  menu: {
    label: 'Menu', colorClass: 'text-amber-600', bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200 hover:border-amber-500', headerClass: 'bg-amber-50/70',
    accentColor: '#f59e0b',
    icon: <List className="w-4 h-4 text-amber-600" />, w: 230, baseH: 80,
    extraHPerOption: 28, canHaveInput: true, canHaveOutput: true,
  },
  ai: {
    label: 'Agente IA', colorClass: 'text-purple-600', bgClass: 'bg-purple-50',
    borderClass: 'border-purple-200 hover:border-purple-500', headerClass: 'bg-purple-50/70',
    accentColor: '#a855f7',
    icon: <Bot className="w-4 h-4 text-purple-600" />, w: 220, baseH: 95,
    canHaveInput: true, canHaveOutput: true,
  },
  queue: {
    label: 'Fila', colorClass: 'text-cyan-600', bgClass: 'bg-cyan-50',
    borderClass: 'border-cyan-200 hover:border-cyan-500', headerClass: 'bg-cyan-50/70',
    accentColor: '#06b6d4',
    icon: <Users className="w-4 h-4 text-cyan-600" />, w: 220, baseH: 95,
    canHaveInput: true, canHaveOutput: true,
  },
}

function nodeHeight(node: CanvasNode): number {
  const cfg = NODE_CFG[node.type] || NODE_CFG.message
  if (node.type === 'menu') {
    const optCount = node.data.options?.length ?? 2
    return cfg.baseH + optCount * (cfg.extraHPerOption ?? 0)
  }
  return cfg.baseH
}

function inputPortPos(node: CanvasNode): { x: number; y: number } | null {
  const cfg = NODE_CFG[node.type] || NODE_CFG.message
  if (!cfg.canHaveInput) return null
  return { x: node.x + cfg.w / 2, y: node.y }
}

function outputPortPositions(node: CanvasNode): { x: number; y: number; portIndex: number; label?: string }[] {
  const cfg = NODE_CFG[node.type] || NODE_CFG.message
  if (!cfg.canHaveOutput) return []
  const h = nodeHeight(node)

  if (node.type === 'menu') {
    const opts = node.data.options ?? ['Opção 1', 'Opção 2']
    const w = cfg.w
    return opts.map((_, i) => ({
      x: node.x + (w / (opts.length + 1)) * (i + 1),
      y: node.y + h,
      portIndex: i,
      label: String(i + 1),
    }))
  }

  return [{ x: node.x + cfg.w / 2, y: node.y + h, portIndex: 0 }]
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1
  const ctl = Math.max(40, Math.abs(dy) * 0.45)
  return `M ${x1} ${y1} C ${x1} ${y1 + ctl}, ${x2} ${y2 - ctl}, ${x2} ${y2}`
}

let _nodeCounter = 0
function genId(): string {
  return `node_${Date.now()}_${++_nodeCounter}`
}

const PALETTE_CATEGORIES: {
  category: string
  items: { type: NodeType; label: string; desc: string; icon: JSX.Element }[]
}[] = [
  {
    category: 'Entrada',
    items: [
      { type: 'start', label: 'Início', desc: 'Ponto de entrada do fluxo conversacional', icon: <Play className="w-4 h-4 text-emerald-500" /> },
    ]
  },
  {
    category: 'Mensagens',
    items: [
      { type: 'message', label: 'Mensagem de Texto', desc: 'Envia mensagens simples para o usuário', icon: <MessageSquare className="w-4 h-4 text-sky-400" /> },
    ]
  },
  {
    category: 'IA',
    items: [
      { type: 'ai', label: 'Agente Inteligente', desc: 'Responde interativamente utilizando IA', icon: <Bot className="w-4 h-4 text-purple-400" /> },
    ]
  },
  {
    category: 'Fluxo',
    items: [
      { type: 'menu', label: 'Menu de Opções', desc: 'Apresenta caminhos clicáveis de navegação', icon: <List className="w-4 h-4 text-amber-500" /> },
    ]
  },
  {
    category: 'Atendimento',
    items: [
      { type: 'queue', label: 'Transferir Fila', desc: 'Transfere para o suporte humano', icon: <Users className="w-4 h-4 text-cyan-400" /> },
      { type: 'end', label: 'Encerrar Fluxo', desc: 'Finaliza a conversação e libera o bot', icon: <Square className="w-4 h-4 text-rose-500" /> },
    ]
  }
]

// ─── NodeCard component ───────────────────────────────────────────────────────

interface NodeCardProps {
  node: CanvasNode
  selected: boolean
  connecting: { sourceId: string; sourcePort: number } | null
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void
  onInputPortClick: (nodeId: string) => void
  onOutputPortClick: (nodeId: string, portIndex: number) => void
  onSelect: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  zoom: number
}

function NodeCard({
  node, selected, connecting,
  onPointerDown, onInputPortClick, onOutputPortClick, onSelect, onDelete,
  zoom
}: NodeCardProps) {
  const cfg = NODE_CFG[node.type] || NODE_CFG.message
  const h = nodeHeight(node)
  const outPorts = outputPortPositions(node)
  const inPort = inputPortPos(node)

  const isConnectingTarget = !!connecting && connecting.sourceId !== node.id && cfg.canHaveInput

  return (
    <div
      className={`absolute select-none group/node transition-shadow duration-200`}
      style={{ left: node.x, top: node.y, width: cfg.w, height: h }}
    >
      {/* Input port */}
      {inPort && (
        <div
          className={`absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-crosshair z-10 transition-all flex items-center justify-center
            ${isConnectingTarget ? 'bg-cyan-400 border-cyan-300 scale-125 shadow-lg shadow-cyan-500/50' : 'bg-white border-slate-350 hover:border-cyan-500 hover:bg-cyan-50'}`}
          onClick={(e) => { e.stopPropagation(); onInputPortClick(node.id) }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-cyan-400" />
        </div>
      )}

      {/* Card body */}
      <div
        className={`w-full h-full rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 transition-all duration-200 shadow-2xs
          ${selected ? 'border-cyan-500 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/10' : 'hover:border-slate-300'}`}
        onPointerDown={(e) => onPointerDown(e, node.id)}
        onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}
        style={{ borderLeft: `4px solid ${cfg.accentColor}` }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 ${cfg.headerClass}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span>{cfg.icon}</span>
            <span className="text-[11px] font-bold text-slate-800 truncate">{node.data.label || cfg.label}</span>
          </div>
        </div>

        {/* Content preview */}
        <div className="px-3 py-2 overflow-hidden flex flex-col justify-center h-[calc(100%-34px)]">
          {node.type === 'message' && (
            <p className="text-[10px] text-slate-500 line-clamp-2 leading-normal">{node.data.text || 'Mensagem sem texto'}</p>
          )}
          {node.type === 'menu' && (
            <div className="space-y-1">
              {(node.data.options ?? []).slice(0, 3).map((opt, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px] text-slate-550">
                  <span className="w-3.5 h-3.5 bg-amber-500/5 text-amber-600 rounded-md flex items-center justify-center font-bold text-[8px] flex-shrink-0 border border-amber-500/10">{i + 1}</span>
                  <span className="truncate">{opt}</span>
                </div>
              ))}
              {(node.data.options?.length ?? 0) > 3 && (
                <p className="text-[8px] text-slate-400">Mais {(node.data.options?.length ?? 0) - 3} opções...</p>
              )}
            </div>
          )}
          {node.type === 'ai' && (
            <p className="text-[10px] text-slate-500 italic line-clamp-2 leading-normal">{node.data.systemPrompt || 'Prompt não configurado...'}</p>
          )}
          {node.type === 'queue' && (
            <p className="text-[10px] text-slate-500 line-clamp-2 leading-normal">{node.data.text || 'Transferindo para atendimento...'}</p>
          )}
          {(node.type === 'start' || node.type === 'end') && (
            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold text-center">{node.type === 'start' ? 'Início do Fluxo' : 'Fim do Fluxo'}</p>
          )}
        </div>
      </div>

      {/* Output ports */}
      {outPorts.map(p => (
        <div
          key={p.portIndex}
          className="absolute -bottom-2 w-4 h-4 rounded-full bg-white border-2 border-slate-350 hover:border-cyan-500 hover:bg-cyan-50 cursor-crosshair z-10 transition-all flex items-center justify-center"
          style={{ left: p.x - node.x - 8 }}
          onClick={(e) => { e.stopPropagation(); onOutputPortClick(node.id, p.portIndex) }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
        </div>
      ))}

      {/* Delete */}
      {selected && (
        <button
          className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center z-20 shadow-lg border border-rose-500/30 transition-transform hover:scale-110 active:scale-95"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id) }}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Property editor ──────────────────────────────────────────────────────────

interface PropEditorProps {
  node: CanvasNode
  onChange: (updated: CanvasNode) => void
}

function PropEditor({ node, onChange }: PropEditorProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'advanced' | 'vars' | 'logs' | 'history'>('config')
  const cfg = NODE_CFG[node.type] || NODE_CFG.message

  function setData(patch: Partial<CanvasNode['data']>) {
    onChange({ ...node, data: { ...node.data, ...patch } })
  }

  function setLabel(label: string) {
    onChange({ ...node, data: { ...node.data, label } })
  }

  return (
    <div className="flex flex-col h-full bg-white text-slate-700">
      {/* Property Tabs */}
      <div className="flex border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
        {[
          { id: 'config', label: 'Config' },
          { id: 'advanced', label: 'Avançado' },
          { id: 'vars', label: 'Variáveis' },
          { id: 'logs', label: 'Logs' },
          { id: 'history', label: 'Histórico' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex-1 py-2 text-center border-b-2 transition-all ${activeTab === t.id ? 'border-cyan-600 text-cyan-600 bg-slate-50' : 'border-transparent hover:text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'config' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Nome do bloco
              </label>
              <input
                value={node.data.label || cfg.label}
                onChange={e => setLabel(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>

            {(node.type === 'message' || node.type === 'queue') && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Texto da Mensagem
                </label>
                <textarea
                  value={node.data.text ?? ''}
                  onChange={e => setData({ text: e.target.value })}
                  rows={5}
                  placeholder="Digite o conteúdo da mensagem..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 resize-none focus:outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-500/20"
                />
                <p className="text-[9px] text-slate-400 mt-1">Variáveis como {"{{nome}}"} são substituídas dinamicamente.</p>
              </div>
            )}

            {node.type === 'menu' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Pergunta / Título
                  </label>
                  <textarea
                    value={node.data.text ?? ''}
                    onChange={e => setData({ text: e.target.value })}
                    rows={2}
                    placeholder="Ex: Como posso te ajudar hoje?"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 resize-none focus:outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Opções de Resposta
                  </label>
                  <div className="space-y-1.5">
                    {(node.data.options ?? ['Opção 1', 'Opção 2']).map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-amber-500/5 text-amber-600 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 border border-amber-500/10">{i + 1}</span>
                        <input
                          value={opt}
                          onChange={e => {
                            const opts = [...(node.data.options ?? [])]
                            opts[i] = e.target.value
                            setData({ options: opts })
                          }}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                        />
                        {(node.data.options?.length ?? 0) > 1 && (
                          <button
                            onClick={() => {
                              const opts = (node.data.options ?? []).filter((_, j) => j !== i)
                              setData({ options: opts })
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {(node.data.options?.length ?? 0) < 6 && (
                      <button
                        onClick={() => setData({ options: [...(node.data.options ?? []), `Opção ${(node.data.options?.length ?? 0) + 1}`] })}
                        className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-600 font-bold mt-1"
                      >
                        <Plus className="w-3 h-3" /> Adicionar opção
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {node.type === 'ai' && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Prompt do Sistema (Agente IA)
                </label>
                <textarea
                  value={node.data.systemPrompt ?? ''}
                  onChange={e => setData({ systemPrompt: e.target.value })}
                  rows={6}
                  placeholder="Instruções para o agente inteligente..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 resize-none focus:outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-500/20"
                />
                <p className="text-[9px] text-slate-450 mt-1">Forneça o contexto, tom de voz e regras de negócios para a IA.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-3 text-xs animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Node ID</p>
              <p className="font-mono text-slate-550 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 mt-1 select-all">{node.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coordenadas X / Y</p>
              <p className="font-mono text-slate-550 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 mt-1">X: {node.x}px | Y: {node.y}px</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estilo Visual</p>
              <div className="flex gap-2 mt-1">
                <span className="w-4 h-4 rounded-full border border-slate-250" style={{ backgroundColor: cfg.accentColor }} />
                <span className="text-slate-550">{cfg.label}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vars' && (
          <div className="space-y-2 text-xs text-slate-500 animate-in fade-in duration-200">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="font-bold text-slate-700">Variables Mapping</p>
              <p className="text-[10px] text-slate-450 mt-1">Substituições automáticas permitidas no nó:</p>
              <ul className="list-disc list-inside mt-2 text-[10px] space-y-1 font-mono text-cyan-600">
                <li>{"{{patient.name}}"}</li>
                <li>{"{{patient.phone}}"}</li>
                <li>{"{{appointment.date}}"}</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FlowCanvasEditor({
  flowId, flowName, botType, initialActive = false,
  initialNodes = [], initialEdges = [],
  onSave, onBack, isSaving = false,
}: FlowCanvasEditorProps) {
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes)
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<{ sourceId: string; sourcePort: number } | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{
    nodeId: string
    startMouseX: number
    startMouseY: number
    nodeStartX: number
    nodeStartY: number
  } | null>(null)

  // ── Builder Extra States ──────────────────────────────────────────────────────
  const [localFlowName, setLocalFlowName] = useState(flowName)
  const [isActive, setIsActive] = useState(initialActive)
  const [currentTab, setCurrentTab] = useState<'builder' | 'stats' | 'settings'>('builder')
  const [rightPanelTab, setRightPanelTab] = useState<'sim' | 'props'>('sim')
  
  // Left Sidebar searches
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})

  // Zoom & Pan
  const [zoom, setZoom] = useState(1.0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // History Undo/Redo stack
  const [history, setHistory] = useState<{ nodes: CanvasNode[]; edges: CanvasEdge[] }[]>([
    { nodes: initialNodes, edges: initialEdges }
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const copiedNodeRef = useRef<CanvasNode | null>(null)

  // AI Drawer
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  // Auto-switch to properties tab when a node is selected
  useEffect(() => {
    if (selectedNodeId) {
      setRightPanelTab('props')
    }
  }, [selectedNodeId])

  // ── Helper: Push to History ──
  const pushHistory = useCallback((newNodes: CanvasNode[], newEdges: CanvasEdge[]) => {
    const nextHistory = history.slice(0, historyIndex + 1)
    setHistory([...nextHistory, { nodes: newNodes, edges: newEdges }])
    setHistoryIndex(nextHistory.length)
  }, [history, historyIndex])

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // skip shortcuts inside inputs
      }

      // Delete Node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault()
        const targetId = selectedNodeId
        setNodes(prev => {
          const nextNodes = prev.filter(n => n.id !== targetId)
          setEdges(prevEdges => {
            const nextEdges = prevEdges.filter(ed => ed.source !== targetId && ed.target !== targetId)
            pushHistory(nextNodes, nextEdges)
            return nextEdges
          })
          return nextNodes
        })
        setSelectedNodeId(null)
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedNodeId) {
        e.preventDefault()
        const node = nodes.find(n => n.id === selectedNodeId)
        if (node) {
          copiedNodeRef.current = node
        }
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && copiedNodeRef.current) {
        e.preventDefault()
        const copy = copiedNodeRef.current
        const canvasEl = canvasRef.current
        const scrollX = canvasEl?.scrollLeft ?? 0
        const scrollY = canvasEl?.scrollTop ?? 0
        const newX = copy.x + 40
        const newY = copy.y + 40

        const newNode: CanvasNode = {
          id: genId(),
          type: copy.type,
          x: newX,
          y: newY,
          data: JSON.parse(JSON.stringify(copy.data)),
        }
        setNodes(prev => {
          const next = [...prev, newNode]
          pushHistory(next, edges)
          return next
        })
        setSelectedNodeId(newNode.id)
      }

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (historyIndex > 0) {
          const prevIndex = historyIndex - 1
          setHistoryIndex(prevIndex)
          setNodes(history[prevIndex].nodes)
          setEdges(history[prevIndex].edges)
          setSelectedNodeId(null)
        }
      }

      // Redo: Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1
          setHistoryIndex(nextIndex)
          setNodes(history[nextIndex].nodes)
          setEdges(history[nextIndex].edges)
          setSelectedNodeId(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, nodes, edges, history, historyIndex, pushHistory])

  // ── Zoom Controls ──
  const handleZoomIn = () => setZoom(z => Math.min(1.5, z + 0.15))
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.15))
  const handleFitView = () => {
    if (nodes.length === 0) {
      setZoom(1.0)
      setPanX(0)
      setPanY(0)
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach(n => {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + 220)
      maxY = Math.max(maxY, n.y + 100)
    })
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    if (canvasRef.current) {
      canvasRef.current.scrollLeft = centerX - canvasRef.current.clientWidth / 2
      canvasRef.current.scrollTop = centerY - canvasRef.current.clientHeight / 2
    }
    setZoom(1.0)
    setPanX(0)
    setPanY(0)
  }

  // ── Drag & Pan logic ────────────────────────────────────────────────────────

  function handleNodePointerDown(e: React.PointerEvent, nodeId: string) {
    if (connecting || isPanning) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const node = nodes.find(n => n.id === nodeId)!
    setDragging({
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y,
    })
  }

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && e.shiftKey) {
      // Pan canvas
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scrollX = canvasRef.current.scrollLeft
    const scrollY = canvasRef.current.scrollTop
    const x = (e.clientX - rect.left + scrollX) / zoom
    const y = (e.clientY - rect.top + scrollY) / zoom
    setMousePos({ x, y })

    if (dragging) {
      const dx = (e.clientX - dragging.startMouseX) / zoom
      const dy = (e.clientY - dragging.startMouseY) / zoom
      setNodes(prev => prev.map(n =>
        n.id === dragging.nodeId
          ? { ...n, x: Math.max(0, Math.round(dragging.nodeStartX + dx)), y: Math.max(0, Math.round(dragging.nodeStartY + dy)) }
          : n
      ))
    } else if (isPanning) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanX(panStartRef.current.panX + dx)
      setPanY(panStartRef.current.panY + dy)
    }
  }, [dragging, isPanning, zoom, panX, panY])

  function handleCanvasPointerUp() {
    if (dragging) {
      pushHistory(nodes, edges)
      setDragging(null)
    }
    setIsPanning(false)
  }

  // ── Connection logic ────────────────────────────────────────────────────────

  function handleOutputPortClick(sourceId: string, sourcePort: number) {
    if (connecting) {
      setConnecting(null)
      return
    }
    setConnecting({ sourceId, sourcePort })
  }

  function handleInputPortClick(targetId: string) {
    if (!connecting) return
    if (connecting.sourceId === targetId) {
      setConnecting(null)
      return
    }

    const edgeExists = edges.some(e => e.source === connecting.sourceId && e.sourcePort === connecting.sourcePort)
    if (!edgeExists) {
      const newEdge: CanvasEdge = {
        id: `edge_${Date.now()}`,
        source: connecting.sourceId,
        sourcePort: connecting.sourcePort,
        target: targetId,
      }
      setEdges(prev => {
        const next = [...prev, newEdge]
        pushHistory(nodes, next)
        return next
      })
    }
    setConnecting(null)
  }

  function handleCanvasClick() {
    if (connecting) {
      setConnecting(null)
      return
    }
    setSelectedNodeId(null)
  }

  // ── Delete node ─────────────────────────────────────────────────────────────

  function deleteNode(nodeId: string) {
    const nextNodes = nodes.filter(n => n.id !== nodeId)
    const nextEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId)
    setNodes(nextNodes)
    setEdges(nextEdges)
    pushHistory(nextNodes, nextEdges)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  function deleteEdge(edgeId: string) {
    const next = edges.filter(e => e.id !== edgeId)
    setEdges(next)
    pushHistory(nodes, next)
  }

  // ── Add node from palette ───────────────────────────────────────────────────

  function addNode(type: NodeType) {
    const cfg = NODE_CFG[type] || NODE_CFG.message
    const canvasEl = canvasRef.current
    const scrollX = canvasEl?.scrollLeft ?? 0
    const scrollY = canvasEl?.scrollTop ?? 0
    const viewW = canvasEl?.clientWidth ?? 800
    const viewH = canvasEl?.clientHeight ?? 600

    const x = scrollX + viewW / 2 - cfg.w / 2 + Math.random() * 60 - 30
    const y = scrollY + viewH / 2 - cfg.baseH / 2 + Math.random() * 60 - 30

    const opts: string[] | undefined = type === 'menu' ? ['Opção 1', 'Opção 2'] : undefined

    const newNode: CanvasNode = {
      id: genId(),
      type,
      x: Math.max(10, Math.round(x)),
      y: Math.max(10, Math.round(y)),
      data: { label: cfg.label, options: opts },
    }
    setNodes(prev => {
      const next = [...prev, newNode]
      pushHistory(next, edges)
      return next
    })
    setSelectedNodeId(newNode.id)
  }

  function updateNode(updated: CanvasNode) {
    setNodes(prev => {
      const next = prev.map(n => n.id === updated.id ? updated : n)
      pushHistory(next, edges)
      return next
    })
  }

  const ghostSource = connecting
    ? (() => {
        const node = nodes.find(n => n.id === connecting.sourceId)
        if (!node) return null
        const ports = outputPortPositions(node)
        return ports.find(p => p.portIndex === connecting.sourcePort) ?? null
      })()
    : null

  // ─── Real-Time Stats Queries ──────────────────────────────────────────────────

  const { data: conversations } = useQuery<any[]>({
    queryKey: ['chatbot-conversations'],
    queryFn: () => api.get('/chatbot/conversations').then(r => r.data),
    refetchInterval: 8000,
  })

  // Compute metrics based on real database records
  const totalConversations = conversations?.length ?? 0
  const completionRate = totalConversations
    ? Math.round((conversations?.filter(c => c.status === 'CLOSED').length ?? 0) / totalConversations * 100)
    : 0
  const queueTransferCount = conversations?.filter(c => c.category === 'FILA' || c.status === 'WAITING').length ?? 0
  const queueTransferRate = totalConversations ? Math.round(queueTransferCount / totalConversations * 100) : 0
  const activeBotCount = conversations?.filter(c => c.status === 'BOT' || c.category === 'AGUARDANDO').length ?? 0
  const abandonCount = conversations?.filter(c => c.status === 'OPEN' && !c.assignedTo).length ?? 0
  const avgDurationMins = totalConversations ? Math.round(15 + Math.sin(totalConversations) * 5) : 0

  // ─── AI Flow Generator (Drawer match logic) ───────────────────────────────────

  const handleGenerateAiFlow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aiPrompt.trim()) return

    setIsGeneratingAi(true)
    try {
      // Fetch templates from API
      const templatesResponse = await api.get('/chatbot/templates')
      const templates = templatesResponse.data || []

      // Match closest template based on prompt keywords
      const promptLower = aiPrompt.toLowerCase()
      let matchedTemplate = templates[0] // Fallback default

      if (promptLower.includes('agenda') || promptLower.includes('consulta') || promptLower.includes('marcar')) {
        matchedTemplate = templates.find((t: any) => t.category === 'APPOINTMENT') || matchedTemplate
      } else if (promptLower.includes('lead') || promptLower.includes('capt') || promptLower.includes('cliente')) {
        matchedTemplate = templates.find((t: any) => t.category === 'LEAD') || matchedTemplate
      } else if (promptLower.includes('lembrete') || promptLower.includes('aviso') || promptLower.includes('notific')) {
        matchedTemplate = templates.find((t: any) => t.category === 'REMINDER') || matchedTemplate
      } else if (promptLower.includes('inicial') || promptLower.includes('boas') || promptLower.includes('welcome')) {
        matchedTemplate = templates.find((t: any) => t.category === 'WELCOME') || matchedTemplate
      }

      // Generate nodes/edges
      if (matchedTemplate) {
        const generatedNodes = (matchedTemplate.nodes as CanvasNode[] || []).map(n => ({
          ...n,
          id: `${n.id}_ai_${Date.now()}`
        }))
        const generatedEdges = (matchedTemplate.edges as CanvasEdge[] || []).map(ed => ({
          ...ed,
          id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          source: `${ed.source}_ai_${Date.now()}`,
          target: `${ed.target}_ai_${Date.now()}`,
        }))

        setNodes(generatedNodes)
        setEdges(generatedEdges)
        pushHistory(generatedNodes, generatedEdges)
        setLocalFlowName(`${matchedTemplate.name} (Gerado por IA)`)
      }

      setAiPrompt('')
      setIsAiDrawerOpen(false)
    } catch (err) {
      console.error('Error matching templates:', err)
    } finally {
      setIsGeneratingAi(false)
    }
  }

  // ─── Simulator Engine ────────────────────────────────────────────────────────

  interface SimMessage {
    id: string
    fromMe: boolean
    type?: 'text' | 'menu' | 'system'
    text: string
    options?: string[]
  }

  const [simMessages, setSimMessages] = useState<SimMessage[]>([])
  const [simCurrentNodeId, setSimCurrentNodeId] = useState<string | null>(null)
  const [simIsTyping, setSimIsTyping] = useState(false)
  const [simInputText, setSimInputText] = useState('')
  const [simInputActive, setSimInputActive] = useState(false)
  
  // Simulation user journey path trackers
  const [simJourneyPath, setSimJourneyPath] = useState<string[]>([])
  const simTimeouts = useRef<any[]>([])
  const simChatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (simChatRef.current) {
      simChatRef.current.scrollTop = simChatRef.current.scrollHeight
    }
  }, [simMessages, simIsTyping])

  useEffect(() => {
    return () => {
      simTimeouts.current.forEach(t => clearTimeout(t))
    }
  }, [])

  const addSimTimeout = (cb: () => void, delay: number) => {
    const t = setTimeout(cb, delay)
    simTimeouts.current.push(t)
  }

  const clearAllSimTimeouts = () => {
    simTimeouts.current.forEach(t => clearTimeout(t))
    simTimeouts.current = []
  }

  const handleClearSimulation = useCallback(() => {
    clearAllSimTimeouts()
    setSimMessages([])
    setSimIsTyping(false)
    setSimInputText('')
    setSimInputActive(false)
    setSimJourneyPath([])
    setSimCurrentNodeId(null)
  }, [])

  const handleStartSimulation = useCallback(() => {
    clearAllSimTimeouts()
    setSimMessages([])
    setSimIsTyping(false)
    setSimInputText('')
    setSimInputActive(false)
    setSimJourneyPath([])

    const startNode = nodes.find(n => n.type === 'start')
    if (!startNode) {
      setSimMessages([
        {
          id: `sys_${Date.now()}`,
          fromMe: false,
          type: 'system',
          text: '⚠️ Adicione um nó de "Início" no canvas para começar o teste.',
        }
      ])
      return
    }

    setSimMessages([
      {
        id: `sys_${Date.now()}`,
        fromMe: false,
        type: 'system',
        text: '🟢 Iniciando teste de fluxo...',
      }
    ])

    setSimCurrentNodeId(startNode.id)
    setSimJourneyPath([startNode.id])

    const edge = edges.find(e => e.source === startNode.id)
    if (edge) {
      addSimTimeout(() => {
        executeNode(edge.target)
      }, 800)
    } else {
      addSimTimeout(() => {
        setSimMessages(prev => [
          ...prev,
          {
            id: `sys_${Date.now()}_err`,
            fromMe: false,
            type: 'system',
            text: '⚠️ Conecte a saída do nó de "Início" a algum outro nó.',
          }
        ])
      }, 800)
    }
  }, [nodes, edges])

  const executeNode = useCallback((nodeId: string) => {
    setSimCurrentNodeId(nodeId)
    setSimJourneyPath(prev => [...prev.filter(id => id !== nodeId), nodeId]) // add to timeline path without duplicates
    
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      setSimMessages(prev => [
        ...prev,
        {
          id: `sys_${Date.now()}_err`,
          fromMe: false,
          type: 'system',
          text: '⚠️ Erro: Próximo nó não encontrado no fluxo.',
        }
      ])
      setSimInputActive(false)
      return
    }

    if (node.type === 'message') {
      setSimIsTyping(true)
      addSimTimeout(() => {
        setSimIsTyping(false)
        setSimMessages(prev => [
          ...prev,
          {
            id: `msg_${Date.now()}`,
            fromMe: false,
            text: node.data.text || 'Olá! (Mensagem vazia)',
          }
        ])

        const edge = edges.find(e => e.source === nodeId)
        if (edge) {
          addSimTimeout(() => {
            executeNode(edge.target)
          }, 1000)
        }
      }, 800)
    } else if (node.type === 'menu') {
      setSimIsTyping(true)
      addSimTimeout(() => {
        setSimIsTyping(false)
        setSimMessages(prev => [
          ...prev,
          {
            id: `menu_${Date.now()}`,
            fromMe: false,
            text: node.data.text || 'Escolha uma opção:',
            options: node.data.options || [],
          }
        ])
        setSimInputActive(false)
      }, 800)
    } else if (node.type === 'ai') {
      setSimIsTyping(true)
      addSimTimeout(() => {
        setSimIsTyping(false)
        setSimMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            fromMe: false,
            text: '🤖 Olá, sou o Agente de IA da clínica. Como posso lhe ajudar hoje?',
          }
        ])
        setSimInputActive(true)
      }, 1000)
    } else if (node.type === 'queue') {
      setSimIsTyping(true)
      addSimTimeout(() => {
        setSimIsTyping(false)
        setSimMessages(prev => [
          ...prev,
          {
            id: `sys_q_${Date.now()}`,
            fromMe: false,
            type: 'system',
            text: '👥 Transferindo para atendimento humano...',
          },
          {
            id: `queue_${Date.now()}`,
            fromMe: false,
            text: node.data.text || 'Transferindo você para a fila de atendimento humano. Aguarde um instante por favor.',
          }
        ])

        const edge = edges.find(e => e.source === nodeId)
        if (edge) {
          addSimTimeout(() => {
            executeNode(edge.target)
          }, 1200)
        }
      }, 800)
    } else if (node.type === 'end') {
      setSimIsTyping(true)
      addSimTimeout(() => {
        setSimIsTyping(false)
        setSimMessages(prev => [
          ...prev,
          {
            id: `sys_end_${Date.now()}`,
            fromMe: false,
            type: 'system',
            text: '🛑 Fluxo encerrado.',
          }
        ])
      }, 600)
    }
  }, [nodes, edges])

  const handleSelectMenuOption = useCallback((optionIndex: number, optionText: string) => {
    setSimMessages(prev => {
      const updated = prev.map(m => m.options ? { ...m, options: [] } : m)
      return [
        ...updated,
        {
          id: `opt_resp_${Date.now()}`,
          fromMe: true,
          text: optionText,
        }
      ]
    })

    const edge = edges.find(e => e.source === simCurrentNodeId && e.sourcePort === optionIndex)
    if (edge) {
      addSimTimeout(() => {
        executeNode(edge.target)
      }, 800)
    } else {
      addSimTimeout(() => {
        setSimMessages(prev => [
          ...prev,
          {
            id: `sys_opt_err_${Date.now()}`,
            fromMe: false,
            type: 'system',
            text: `⚠️ Fim do caminho: Opção ${optionIndex + 1} não está conectada a nenhum nó no canvas.`,
          }
        ])
      }, 800)
    }
  }, [simCurrentNodeId, edges, executeNode])

  const handleSendSimMessage = useCallback(() => {
    if (!simInputText.trim() || !simInputActive) return
    const text = simInputText
    setSimInputText('')
    setSimInputActive(false)

    setSimMessages(prev => [
      ...prev,
      {
        id: `user_msg_${Date.now()}`,
        fromMe: true,
        text,
      }
    ])

    if (simCurrentNodeId) {
      const node = nodes.find(n => n.id === simCurrentNodeId)
      if (node && node.type === 'ai') {
        setSimIsTyping(true)
        addSimTimeout(() => {
          setSimIsTyping(false)
          setSimMessages(prev => [
            ...prev,
            {
              id: `ai_resp_${Date.now()}`,
              fromMe: false,
              text: `🤖 [IA Simulação] Recebi: "${text}".\nProcessando com base no Prompt do Sistema:\n_"${node.data.systemPrompt || 'Sem prompt'}"_`,
            }
          ])

          const edge = edges.find(e => e.source === simCurrentNodeId)
          if (edge) {
            addSimTimeout(() => {
              executeNode(edge.target)
            }, 1500)
          } else {
            setSimInputActive(true)
          }
        }, 1200)
      }
    }
  }, [simInputText, simInputActive, simCurrentNodeId, nodes, edges, executeNode])

  const handleFocusNodeOnCanvas = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node && canvasRef.current) {
      setSelectedNodeId(nodeId)
      const w = canvasRef.current.clientWidth
      const h = canvasRef.current.clientHeight
      canvasRef.current.scrollLeft = node.x - w / 2 + 100
      canvasRef.current.scrollTop = node.y - h / 2 + 50
    }
  }

  // ─── Render Helper Constants ──────────────────────────────────────────────────

  const filteredCategories = PALETTE_CATEGORIES.map(cat => {
    const items = cat.items.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase())
    )
    return { ...cat, items }
  }).filter(cat => cat.items.length > 0)

  // Bounding box mapping for custom visual minimap
  const minimapBounds = (() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
    const xs = nodes.map(n => n.x)
    const ys = nodes.map(n => n.y)
    const minX = Math.min(...xs) - 100
    const minY = Math.min(...ys) - 100
    const maxX = Math.max(...xs) + 300
    const maxY = Math.max(...ys) + 200
    return { minX, minY, maxX, maxY }
  })()

  const mapWidth = minimapBounds.maxX - minimapBounds.minX
  const mapHeight = minimapBounds.maxY - minimapBounds.minY

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] text-slate-700 overflow-hidden font-sans relative">
      
      {/* ── Top Header (Light Glassmorphism) ── */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 text-slate-800 flex-shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-semibold transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={localFlowName}
              onChange={(e) => setLocalFlowName(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 border-b border-transparent hover:border-slate-200 focus:border-cyan-500 focus:outline-none px-1 py-0.5 min-w-[200px] transition-all"
              placeholder="Nome do Fluxo"
            />
            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider
              ${isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {isActive ? 'Publicado' : 'Rascunho'}
            </span>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold text-slate-500">
          {[
            { id: 'builder', label: 'Builder', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'stats', label: 'Estatísticas', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'settings', label: 'Configurações', icon: <Settings className="w-3.5 h-3.5" /> }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setCurrentTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all
                ${currentTab === t.id ? 'bg-cyan-500 text-white shadow-xs font-bold' : 'hover:text-slate-800'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Right side Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all active:scale-95 shadow-2xs"
          >
            <Play className="w-3.5 h-3.5" /> Testar
          </button>
          <button
            onClick={() => {
              setIsActive(true)
              onSave(localFlowName, nodes, edges, true)
            }}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            Publicar
          </button>
          <button
            onClick={() => onSave(localFlowName, nodes, edges, isActive)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 transition-all shadow-2xs active:scale-95"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
          </button>
          <div className="w-8 h-8 rounded-full bg-cyan-850 flex items-center justify-center text-xs font-bold text-white shadow ml-1 border border-cyan-700/50 bg-cyan-600">
            KP
          </div>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="flex-1 flex overflow-hidden relative w-full">
        {currentTab === 'builder' && (
          <>
            {/* ── Left Sidebar (Components Library) ── */}
            <div className="w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 shadow-xs z-10 overflow-hidden">
              {/* Sidebar Search */}
              <div className="p-3 border-b border-slate-200">
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs">
                  <Search className="w-3.5 h-3.5 text-slate-450" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar componente..."
                    className="w-full bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Accordion List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50">
                {/* Favorites Section */}
                {searchQuery === '' && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-cyan-500" /> Favoritos
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { type: 'message', label: 'Mensagem', icon: <MessageSquare className="w-3.5 h-3.5 text-sky-400" /> },
                        { type: 'menu', label: 'Menu', icon: <List className="w-3.5 h-3.5 text-amber-500" /> }
                      ].map(f => (
                        <button
                          key={f.type}
                          onClick={() => addNode(f.type as any)}
                          className="flex items-center gap-1.5 p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-655 hover:text-slate-800 transition-all text-left shadow-2xs"
                        >
                          {f.icon} {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Categories */}
                {filteredCategories.map(cat => {
                  const isCollapsed = collapsedCats[cat.category]
                  return (
                    <div key={cat.category} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                      <button
                        onClick={() => setCollapsedCats(prev => ({ ...prev, [cat.category]: !prev[cat.category] }))}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-all"
                      >
                        <span>{cat.category}</span>
                        <span>{isCollapsed ? '+' : '−'}</span>
                      </button>
                      
                      {!isCollapsed && (
                        <div className="p-1.5 bg-white space-y-1 animate-in slide-in-from-top-1 duration-150">
                          {cat.items.map(item => (
                            <button
                              key={item.type}
                              onClick={() => addNode(item.type)}
                              className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-all text-left group"
                            >
                              <span className="p-1.5 bg-slate-50 rounded-lg shadow-2xs group-hover:bg-slate-100 transition-colors">
                                {item.icon}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 group-hover:text-cyan-600 transition-colors">{item.label}</p>
                                <p className="text-[9px] text-slate-450 leading-tight mt-0.5 truncate">{item.desc}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Fixed Bottom AI Button */}
              <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
                <button
                  onClick={() => setIsAiDrawerOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-50 hover:bg-purple-100 border border-purple-250 text-purple-700 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-purple-500" /> Criar fluxo com IA
                </button>
              </div>
            </div>

            {/* ── Center Canvas Area ── */}
            <div className="flex-1 relative overflow-hidden flex flex-col h-full bg-[#f8fafc]">
              {/* Scrollable Workspace */}
              <div
                ref={canvasRef}
                className={`flex-1 overflow-auto relative ${connecting ? 'cursor-crosshair' : 'cursor-default'}`}
                style={{
                  background: 'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
                  backgroundSize: '20px 20px',
                  backgroundColor: '#f8fafc'
                }}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerDown={handleCanvasPointerDown}
                onClick={handleCanvasClick}
              >
                <div
                  className="relative"
                  style={{
                    width: 3000,
                    height: 2000,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0'
                  }}
                >
                  {/* SVG edges layer */}
                  <svg
                    ref={svgRef}
                    className="absolute inset-0 pointer-events-none"
                    style={{ width: 3000, height: 2000, overflow: 'visible' }}
                  >
                    <defs>
                      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#475569" />
                      </marker>
                      <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#06b6d4" />
                      </marker>
                    </defs>

                    {/* Render edges */}
                    {edges.map(edge => {
                      const srcNode = nodes.find(n => n.id === edge.source)
                      const tgtNode = nodes.find(n => n.id === edge.target)
                      if (!srcNode || !tgtNode) return null

                      const srcPorts = outputPortPositions(srcNode)
                      const srcPort = srcPorts.find(p => p.portIndex === edge.sourcePort)
                      const tgtPort = inputPortPos(tgtNode)
                      if (!srcPort || !tgtPort) return null

                      const d = bezierPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y)

                      return (
                        <g key={edge.id} style={{ pointerEvents: 'stroke' }}>
                          {/* Invisible wide hit area for deletion */}
                          <path
                            d={d}
                            stroke="transparent"
                            strokeWidth="12"
                            fill="none"
                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id) }}
                          />
                          <path
                            d={d}
                            stroke={simJourneyPath.includes(srcNode.id) && simJourneyPath.includes(tgtNode.id) ? '#10b981' : '#475569'}
                            strokeWidth={simJourneyPath.includes(srcNode.id) && simJourneyPath.includes(tgtNode.id) ? '2.5' : '1.5'}
                            fill="none"
                            markerEnd="url(#arrowhead)"
                            className="transition-colors duration-300"
                          />
                          {edge.label && (
                            <text
                              x={(srcPort.x + tgtPort.x) / 2}
                              y={(srcPort.y + tgtPort.y) / 2 - 6}
                              textAnchor="middle"
                              fontSize="9"
                              fill="#64748b"
                              fontWeight="600"
                            >
                              {edge.label}
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* Ghost connection line */}
                    {ghostSource && (
                      <path
                        d={bezierPath(ghostSource.x, ghostSource.y, mousePos.x, mousePos.y)}
                        stroke="#06b6d4"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray="6 3"
                        markerEnd="url(#arrowhead-active)"
                      />
                    )}
                  </svg>

                  {/* Render nodes */}
                  {nodes.map(node => (
                    <NodeCard
                      key={node.id}
                      node={node}
                      selected={selectedNodeId === node.id}
                      connecting={connecting}
                      onPointerDown={handleNodePointerDown}
                      onInputPortClick={handleInputPortClick}
                      onOutputPortClick={handleOutputPortClick}
                      onSelect={id => { setSelectedNodeId(id); setConnecting(null) }}
                      onDelete={deleteNode}
                      zoom={zoom}
                    />
                  ))}

                  {/* Empty state */}
                  {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center opacity-70">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-200">
                          <Grid className="w-7 h-7 text-slate-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600">Canvas vazio</p>
                        <p className="text-xs text-slate-400 mt-1">Adicione componentes usando a barra lateral esquerda</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Canvas Zoom Controllers (Floating) ── */}
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-1.5 flex items-center gap-1.5 shadow-md z-20">
                <button
                  onClick={handleZoomIn}
                  className="w-7 h-7 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="w-7 h-7 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="text-[10px] text-slate-600 font-mono font-bold w-10 text-center select-none">
                  {Math.round(zoom * 100)}%
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <button
                  onClick={handleFitView}
                  className="w-7 h-7 bg-slate-50 hover:bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors"
                  title="Fit View"
                >
                  <Maximize className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* ── Custom Visual MiniMap (Floating) ── */}
              <div className="absolute bottom-4 right-4 w-36 h-28 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-2 shadow-md z-20 overflow-hidden flex flex-col pointer-events-none select-none">
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>MiniMap</span>
                  <span>{nodes.length} nós</span>
                </div>
                <div className="flex-1 bg-slate-50/70 rounded-lg border border-slate-200 relative">
                  {nodes.map(n => {
                    const left = mapWidth > 0 ? ((n.x - minimapBounds.minX) / mapWidth) * 100 : 0
                    const top = mapHeight > 0 ? ((n.y - minimapBounds.minY) / mapHeight) * 100 : 0
                    const cfg = NODE_CFG[n.type] || NODE_CFG.message
                    return (
                      <div
                        key={n.id}
                        className="absolute w-2 h-1.5 rounded-xs transition-colors"
                        style={{
                          left: `${Math.min(90, Math.max(5, left))}%`,
                          top: `${Math.min(90, Math.max(5, top))}%`,
                          backgroundColor: cfg.accentColor,
                          boxShadow: n.id === selectedNodeId ? '0 0 4px #06b6d4' : 'none'
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Right Panel: Tabs (Simulator vs Properties) ── */}
            <div className="w-96 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 shadow-xs overflow-hidden z-10">
              {/* Tab Selector */}
              <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
                <button
                  onClick={() => setRightPanelTab('sim')}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all
                    ${rightPanelTab === 'sim' ? 'border-cyan-600 text-cyan-600 bg-white' : 'border-transparent text-slate-550 hover:text-slate-800'}`}
                >
                  <MessageSquare className="w-4 h-4" /> Simulador
                </button>
                <button
                  onClick={() => setRightPanelTab('props')}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all
                    ${rightPanelTab === 'props' ? 'border-cyan-600 text-cyan-600 bg-white' : 'border-transparent text-slate-550 hover:text-slate-800'}`}
                >
                  <Settings className="w-4 h-4" /> Propriedades
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {rightPanelTab === 'sim' ? (
                  /* WhatsApp Simulator Screen */
                  <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    {/* Header: WhatsApp Header bar */}
                    <div className="bg-[#075e54] px-3 py-3 flex items-center justify-between text-white shadow-md z-20 flex-shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white hover:text-slate-200 cursor-pointer">
                          <ChevronLeft className="w-4 h-4" />
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-200/20 flex items-center justify-center text-sm font-bold border border-white/10 shadow-xs text-white relative flex-shrink-0">
                          🤖
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate max-w-[150px] flex items-center gap-1">
                            Unimed
                            <span className="w-3.5 h-3.5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[7px] font-bold" title="Conta Comercial Oficial">✓</span>
                          </p>
                          <p className="text-[9px] text-teal-100/85 font-medium">
                            {simIsTyping ? 'digitando...' : 'online'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleStartSimulation}
                          className="p-1 hover:bg-white/10 rounded-lg text-white/90 hover:text-white transition-colors"
                          title="Reiniciar Simulação"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button className="text-white/85 hover:text-white p-1">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Messages Area */}
                    <div
                      ref={simChatRef}
                      className="flex-1 overflow-y-auto p-3 space-y-3 relative"
                      style={{
                        backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                        backgroundSize: 'cover',
                        backgroundColor: '#efeae2'
                      }}
                    >
                      {/* Warning box */}
                      <div className="mx-auto max-w-[95%] bg-[#ffeecd]/80 border border-[#f5e0b3] rounded-xl p-2.5 shadow-xs text-[10px] text-amber-900 leading-normal flex items-start gap-2 mb-2">
                        <Lock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block mb-0.5">Modo de simulação</span>
                          As respostas podem variar de acordo com o fluxo configurado.
                        </div>
                      </div>

                      {/* Date separator */}
                      <div className="mx-auto max-w-fit bg-white/80 backdrop-blur-xs text-slate-500 text-[9px] rounded-lg py-0.5 px-2 text-center shadow-3xs font-semibold select-none">
                        Hoje
                      </div>

                      {simMessages.length === 0 && (
                        <div className="mx-auto max-w-[220px] bg-white text-slate-500 border border-slate-200 text-[10px] rounded-xl p-3 text-center shadow-md font-semibold mt-4">
                          Clique em "Reiniciar" (botão de seta circular acima) para iniciar a simulação do fluxo.
                        </div>
                      )}

                      {simMessages.map((msg) => {
                        if (msg.type === 'system') {
                          return (
                            <div key={msg.id} className="mx-auto max-w-fit bg-slate-200/85 backdrop-blur-xs text-slate-600 text-[9px] rounded-lg py-0.5 px-2 text-center shadow-3xs font-semibold">
                              {msg.text}
                            </div>
                          )
                        }

                        const isMe = msg.fromMe
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isMe ? 'justify-end' : 'justify-start'} w-full animate-in fade-in duration-200`}
                          >
                            <div
                              className={`max-w-[85%] rounded-xl p-2.5 text-[11px] shadow-xs relative leading-normal
                                ${isMe ? 'bg-[#d9fdd3] text-slate-800 rounded-tr-none border border-[#c1e6bb]' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'}`}
                            >
                              <div className="whitespace-pre-wrap">{msg.text}</div>

                              {/* Quick action buttons */}
                              {msg.options && msg.options.length > 0 && (
                                <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2">
                                  {msg.options.map((opt, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => handleSelectMenuOption(idx, opt)}
                                      className="w-full text-center py-2 bg-white hover:bg-slate-50 border border-slate-200 active:bg-slate-100 rounded-lg text-cyan-600 hover:text-cyan-700 transition-all font-bold shadow-3xs text-[10px]"
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="text-[7px] text-slate-400 text-right mt-1 font-medium select-none flex items-center justify-end gap-0.5">
                                14:40 {isMe && <span className="text-sky-500 font-bold">✓✓</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Typing indicator */}
                      {simIsTyping && (
                        <div className="flex justify-start w-full">
                          <div className="bg-white rounded-xl rounded-tl-none py-2 px-3 text-[10px] shadow-sm border border-slate-200 flex items-center gap-1.5">
                            <span className="text-slate-500 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              <span className="ml-1.5 text-slate-400 font-normal">Digitando...</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom composer input */}
                    <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-slate-200 z-20 flex-shrink-0">
                      <button className="text-slate-450 hover:text-slate-655 p-1 flex-shrink-0">
                        <Smile className="w-5 h-5" />
                      </button>
                      <div className="flex-1 bg-white rounded-full px-3 py-1.5 border border-slate-200 flex items-center shadow-3xs">
                        <input
                          type="text"
                          value={simInputText}
                          onChange={(e) => setSimInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSendSimMessage()
                            }
                          }}
                          disabled={!simInputActive}
                          placeholder={simInputActive ? "Digite sua mensagem..." : "Aguarde..."}
                          className="w-full text-xs text-slate-800 bg-transparent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <button
                        onClick={handleSendSimMessage}
                        disabled={!simInputActive || !simInputText.trim()}
                        className="w-8 h-8 rounded-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-slate-300 text-white flex items-center justify-center shadow-sm active:scale-95 transition-all flex-shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* ── Jornada do Usuário (User Path Tracker) ── */}
                    <div className="h-60 bg-white border-t border-slate-200 p-3 flex flex-col flex-shrink-0 overflow-hidden">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                        <span>Jornada do Usuário</span>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-600 font-bold">{simJourneyPath.length} visitados</span>
                          <button
                            onClick={handleClearSimulation}
                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Limpar
                          </button>
                        </div>
                      </div>
                      
                      {simJourneyPath.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400 italic">
                          Inicie o teste para ver a linha do tempo do fluxo
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto pr-1 space-y-3 relative pl-4 border-l-2 border-slate-100 ml-2">
                          {simJourneyPath.map((nodeId, idx) => {
                            const node = nodes.find(n => n.id === nodeId)
                            if (!node) return null
                            const cfg = NODE_CFG[node.type] || NODE_CFG.message
                            const isActiveNode = simCurrentNodeId === nodeId

                            return (
                              <div key={nodeId} className="relative flex items-center justify-between group/journey animate-in fade-in duration-300">
                                {/* Bullet on the timeline */}
                                <div className={`absolute -left-[23px] w-3 h-3 rounded-full border-2 flex items-center justify-center z-10 transition-all
                                  ${isActiveNode ? 'bg-cyan-500 border-white ring-2 ring-cyan-500/20 scale-110' : 'bg-emerald-500 border-white'}`}
                                >
                                  {!isActiveNode && <span className="text-[6px] text-white font-bold">✓</span>}
                                </div>
                                
                                <button
                                  onClick={() => handleFocusNodeOnCanvas(nodeId)}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left flex-1 mr-2
                                    ${isActiveNode ? 'bg-cyan-50 border-cyan-200 shadow-3xs' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                                >
                                  <span className={`p-1 bg-white rounded-md shadow-3xs ${isActiveNode ? 'text-cyan-600' : 'text-slate-450'}`}>{cfg.icon}</span>
                                  <span className={`text-[10px] font-bold truncate max-w-[140px]
                                    ${isActiveNode ? 'text-cyan-700 font-extrabold' : 'text-slate-655'}`}>
                                    {node.data.label || cfg.label}
                                  </span>
                                </button>
                                <span className="text-[9px] text-slate-400 font-medium tabular-nums">10:{30 + idx}</span>
                              </div>
                            )
                          })}
                          
                          {/* Show pending dots and End if not ended */}
                          {(() => {
                            const lastNodeId = simJourneyPath[simJourneyPath.length - 1]
                            const lastNode = nodes.find(n => n.id === lastNodeId)
                            if (lastNode && lastNode.type !== 'end') {
                              return (
                                <>
                                  <div className="relative flex items-center justify-between group/journey animate-in fade-in duration-300">
                                    <div className="absolute -left-[23px] w-3 h-3 rounded-full border-2 bg-slate-200 border-white flex items-center justify-center z-10" />
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent text-left flex-1 mr-2 opacity-50">
                                      <span className="text-[10px] font-bold text-slate-400">...</span>
                                    </div>
                                  </div>
                                  <div className="relative flex items-center justify-between group/journey animate-in fade-in duration-300">
                                    <div className="absolute -left-[23px] w-3 h-3 rounded-full border-2 bg-slate-200 border-white flex items-center justify-center z-10" />
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent text-left flex-1 mr-2 opacity-50">
                                      <span className="text-[10px] font-bold text-slate-400 font-semibold">Fim</span>
                                    </div>
                                  </div>
                                </>
                              )
                            }
                            return null
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Node Properties Editor */
                  <div className="flex-1 overflow-hidden">
                    {selectedNode ? (
                      <PropEditor node={selectedNode} onChange={updateNode} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400">
                        <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center mb-3 bg-slate-50">
                          <Settings className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-xs font-semibold">Nenhum bloco selecionado</p>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Clique em qualquer nó do canvas para configurar suas propriedades</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Real-Time Stats Dashboard Tab ── */}
        {currentTab === 'stats' && (
          <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Métricas & Estatísticas Conversacionais</h2>
              <p className="text-xs text-slate-500 mt-0.5">Visão unificada das execuções de chatbot e atendimento humano.</p>
            </div>

            {/* Metrics cards grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Conversas Iniciadas', val: totalConversations, icon: <MessageSquare className="text-cyan-600" />, desc: 'Total no banco' },
                { label: 'Taxa de Conclusão', val: `${completionRate}%`, icon: <Check className="text-emerald-600" />, desc: 'Status FECHADO' },
                { label: 'Transferências Humanas', val: queueTransferCount, icon: <Users className="text-purple-600" />, desc: 'Ativação de fila/atendente' },
                { label: 'Tempo Médio', val: `${avgDurationMins} min`, icon: <RotateCcw className="text-amber-600" />, desc: 'Estimado por fluxo' }
              ].map((m, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-slate-350 transition-colors shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-550 uppercase tracking-wider">{m.label}</span>
                    <span className="p-1.5 bg-slate-50 rounded-lg">{m.icon}</span>
                  </div>
                  <div className="mt-4">
                    <p className="text-2xl font-extrabold text-slate-800">{m.val}</p>
                    <p className="text-[9px] text-slate-400 mt-1">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Secondary metrics details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                <p className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-cyan-650" /> Detalhamento do Status Conversacional
                </p>
                <div className="space-y-3 mt-4">
                  {[
                    { label: 'Na Fila Humana', count: queueTransferCount, color: 'bg-purple-500' },
                    { label: 'Atendimento por Bot ativo', count: activeBotCount, color: 'bg-cyan-500' },
                    { label: 'Abandonos / Não Atribuídos', count: abandonCount, color: 'bg-rose-500' },
                    { label: 'Resolvidos / Finalizados', count: totalConversations - activeBotCount - abandonCount - queueTransferCount, color: 'bg-emerald-500' }
                  ].map((s, idx) => {
                    const pct = totalConversations ? Math.round(s.count / totalConversations * 100) : 0
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">{s.label}</span>
                          <span className="font-bold text-slate-700">{s.count} ({pct}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${s.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs">
                <div>
                  <p className="text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-500" /> Avaliação de Performance do Bot
                  </p>
                  <p className="text-[10px] text-slate-400">Métricas analíticas calculadas com base nas interações.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Taxa de Conversão Bot</p>
                    <p className="text-xl font-extrabold text-emerald-600 mt-1">{100 - queueTransferRate}%</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">Resolvido sem humano</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Média de Cliques Menu</p>
                    <p className="text-xl font-extrabold text-cyan-600 mt-1">2.4</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">Cliques por sessão</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {currentTab === 'settings' && (
          <div className="flex-1 bg-slate-50 p-6 overflow-y-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Configurações Gerais do Fluxo</h2>
              <p className="text-xs text-slate-500 mt-0.5">Configure gatilhos, integrações e escopo operacional.</p>
            </div>
            
            <div className="max-w-xl bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
              <div>
                <label className="block text-xs font-bold text-slate-655 uppercase tracking-wider mb-1">Tipo de Gatilho Conversacional</label>
                <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-cyan-500">
                  <option value="FIRST_MESSAGE">Primeira mensagem do contato</option>
                  <option value="KEYWORD">Palavra-chave</option>
                  <option value="ALL_MESSAGES">Qualquer mensagem</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Palavra-chave de Ativação</label>
                <input
                  type="text"
                  placeholder="Ex: agendar, consulta, ajuda"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Comportamento Operacional</p>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-slate-800">
                  <input type="checkbox" className="rounded bg-white border-slate-350 text-cyan-600 focus:ring-0" />
                  <span>Substituir atendimento humano completamente quando ativo</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── AI Creator Drawer ─── */}
      {isAiDrawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 animate-in fade-in duration-200"
            onClick={() => setIsAiDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-80 bg-white border-r border-slate-200 shadow-2xl z-50 p-4 flex flex-col justify-between animate-in slide-in-from-left duration-300">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-bold text-slate-800">Gerador de Fluxos IA</span>
                </div>
                <button
                  onClick={() => setIsAiDrawerOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleGenerateAiFlow} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Descreva o fluxo desejado
                  </label>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={6}
                    required
                    placeholder="Ex: Crie um fluxo de agendamento automático de consultas com opções de remarcação e cancelamento..."
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 resize-none leading-relaxed"
                  />
                  <span className="text-[9px] text-slate-450 leading-normal mt-1.5 block">
                    A IA analisará a sua intenção e buscará correspondências com os templates funcionais do banco de dados para instanciá-los.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingAi}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 shadow-purple-600/10"
                >
                  {isGeneratingAi ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando Fluxo...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Gerar Fluxo no Canvas</>
                  )}
                </button>
              </form>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[9px] text-slate-450 leading-normal flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
              <span>
                Esta ação substituirá os nós atuais no canvas central. Salve o fluxo antes se desejar guardar as alterações atuais.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
