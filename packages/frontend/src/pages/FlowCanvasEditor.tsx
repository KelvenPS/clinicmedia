import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play, Square, MessageSquare, List, Bot, Users,
  Plus, Trash2, ChevronLeft, Save, Loader2, X, Zap,
} from 'lucide-react'

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
  initialNodes?: CanvasNode[]
  initialEdges?: CanvasEdge[]
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[]) => void
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
    label: 'Início', colorClass: 'text-emerald-700', bgClass: 'bg-emerald-100',
    borderClass: 'border-emerald-400', headerClass: 'bg-emerald-200',
    icon: <Play className="w-5 h-5" />, w: 64, baseH: 64,
    canHaveInput: false, canHaveOutput: true, isCircle: true,
  },
  end: {
    label: 'Fim', colorClass: 'text-red-700', bgClass: 'bg-red-100',
    borderClass: 'border-red-400', headerClass: 'bg-red-200',
    icon: <Square className="w-5 h-5" />, w: 64, baseH: 64,
    canHaveInput: true, canHaveOutput: false, isCircle: true,
  },
  message: {
    label: 'Mensagem', colorClass: 'text-blue-700', bgClass: 'bg-blue-50',
    borderClass: 'border-blue-300', headerClass: 'bg-blue-100',
    icon: <MessageSquare className="w-4 h-4" />, w: 200, baseH: 84,
    canHaveInput: true, canHaveOutput: true,
  },
  menu: {
    label: 'Menu', colorClass: 'text-orange-700', bgClass: 'bg-orange-50',
    borderClass: 'border-orange-300', headerClass: 'bg-orange-100',
    icon: <List className="w-4 h-4" />, w: 220, baseH: 80,
    extraHPerOption: 28, canHaveInput: true, canHaveOutput: true,
  },
  ai: {
    label: 'Agente IA', colorClass: 'text-purple-700', bgClass: 'bg-purple-50',
    borderClass: 'border-purple-300', headerClass: 'bg-purple-100',
    icon: <Bot className="w-4 h-4" />, w: 200, baseH: 84,
    canHaveInput: true, canHaveOutput: true,
  },
  queue: {
    label: 'Fila', colorClass: 'text-cyan-700', bgClass: 'bg-cyan-50',
    borderClass: 'border-cyan-300', headerClass: 'bg-cyan-100',
    icon: <Users className="w-4 h-4" />, w: 200, baseH: 84,
    canHaveInput: true, canHaveOutput: true,
  },
}

function nodeHeight(node: CanvasNode): number {
  const cfg = NODE_CFG[node.type]
  if (node.type === 'menu') {
    const optCount = node.data.options?.length ?? 2
    return cfg.baseH + optCount * (cfg.extraHPerOption ?? 0)
  }
  return cfg.baseH
}

// Port absolute positions on canvas
function inputPortPos(node: CanvasNode): { x: number; y: number } | null {
  const cfg = NODE_CFG[node.type]
  if (!cfg.canHaveInput) return null
  if (cfg.isCircle) return { x: node.x + 32, y: node.y }
  return { x: node.x + cfg.w / 2, y: node.y }
}

function outputPortPositions(node: CanvasNode): { x: number; y: number; portIndex: number; label?: string }[] {
  const cfg = NODE_CFG[node.type]
  if (!cfg.canHaveOutput) return []
  const h = nodeHeight(node)

  if (cfg.isCircle) {
    return [{ x: node.x + 32, y: node.y + 64, portIndex: 0 }]
  }

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
  const ctl = Math.max(60, Math.abs(dy) * 0.5)
  return `M ${x1} ${y1} C ${x1} ${y1 + ctl}, ${x2} ${y2 - ctl}, ${x2} ${y2}`
}

// ─── Canvas node ID generator ─────────────────────────────────────────────────

let _nodeCounter = 0
function genId(): string {
  return `node_${Date.now()}_${++_nodeCounter}`
}

// ─── Palette items ────────────────────────────────────────────────────────────

const PALETTE_ITEMS: { type: NodeType; desc: string }[] = [
  { type: 'start', desc: 'Ponto de entrada do fluxo' },
  { type: 'message', desc: 'Envia uma mensagem de texto' },
  { type: 'menu', desc: 'Apresenta opções ao usuário' },
  { type: 'ai', desc: 'Responde usando Agente de IA' },
  { type: 'queue', desc: 'Transfere para atendimento humano' },
  { type: 'end', desc: 'Encerra o fluxo' },
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
}

function NodeCard({
  node, selected, connecting,
  onPointerDown, onInputPortClick, onOutputPortClick, onSelect, onDelete,
}: NodeCardProps) {
  const cfg = NODE_CFG[node.type]
  const h = nodeHeight(node)
  const outPorts = outputPortPositions(node)
  const inPort = inputPortPos(node)

  const isConnectingTarget = !!connecting && connecting.sourceId !== node.id && cfg.canHaveInput

  if (cfg.isCircle) {
    return (
      <div
        className={`absolute select-none`}
        style={{ left: node.x, top: node.y, width: 64, height: 64 }}
      >
        {/* Input port */}
        {inPort && (
          <div
            className={`absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-crosshair z-10 transition-all
              ${isConnectingTarget ? 'bg-cyan-400 border-cyan-600 scale-125' : 'bg-white border-slate-400 hover:border-cyan-500 hover:bg-cyan-100'}`}
            style={{ pointerEvents: isConnectingTarget ? 'auto' : 'auto' }}
            onClick={(e) => { e.stopPropagation(); onInputPortClick(node.id) }}
          />
        )}

        {/* Circle body */}
        <div
          className={`w-16 h-16 rounded-full ${cfg.bgClass} border-2 ${selected ? 'border-cyan-500 shadow-lg shadow-cyan-200' : cfg.borderClass}
            flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-md`}
          onPointerDown={(e) => onPointerDown(e, node.id)}
          onClick={() => onSelect(node.id)}
        >
          <span className={cfg.colorClass}>{cfg.icon}</span>
          <span className={`text-[10px] font-bold mt-0.5 ${cfg.colorClass}`}>{cfg.label}</span>
        </div>

        {/* Output ports */}
        {outPorts.map(p => (
          <div
            key={p.portIndex}
            className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-slate-400 hover:border-cyan-500 hover:bg-cyan-100 cursor-crosshair z-10 transition-all"
            onClick={(e) => { e.stopPropagation(); onOutputPortClick(node.id, p.portIndex) }}
          />
        ))}

        {/* Delete */}
        {selected && (
          <button
            className="absolute -top-3 -right-3 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center z-20 shadow"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id) }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`absolute select-none`}
      style={{ left: node.x, top: node.y, width: cfg.w, height: h }}
    >
      {/* Input port */}
      {inPort && (
        <div
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-crosshair z-10 transition-all
            ${isConnectingTarget ? 'bg-cyan-400 border-cyan-600 scale-125' : 'bg-white border-slate-400 hover:border-cyan-500 hover:bg-cyan-100'}`}
          onClick={(e) => { e.stopPropagation(); onInputPortClick(node.id) }}
        />
      )}

      {/* Card body */}
      <div
        className={`w-full h-full rounded-xl ${cfg.bgClass} border-2 ${selected ? 'border-cyan-500 shadow-lg shadow-cyan-200' : cfg.borderClass}
          flex flex-col overflow-hidden cursor-pointer transition-all hover:shadow-md`}
        onPointerDown={(e) => onPointerDown(e, node.id)}
        onClick={() => onSelect(node.id)}
      >
        {/* Header */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${cfg.headerClass} border-b ${cfg.borderClass}`}>
          <span className={cfg.colorClass}>{cfg.icon}</span>
          <span className={`text-xs font-bold ${cfg.colorClass}`}>{node.data.label || cfg.label}</span>
        </div>

        {/* Content preview */}
        <div className="flex-1 px-2.5 py-1.5 overflow-hidden">
          {node.type === 'message' && (
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{node.data.text || 'Sem texto'}</p>
          )}
          {node.type === 'menu' && (
            <div className="space-y-0.5">
              {(node.data.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="w-4 h-4 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                  <span className="truncate">{opt}</span>
                </div>
              ))}
            </div>
          )}
          {node.type === 'ai' && (
            <p className="text-xs text-slate-500 italic line-clamp-2">{node.data.systemPrompt || 'Prompt do agente IA...'}</p>
          )}
          {node.type === 'queue' && (
            <p className="text-xs text-slate-600 line-clamp-2">{node.data.text || 'Transferindo para atendimento humano...'}</p>
          )}
        </div>
      </div>

      {/* Output ports */}
      {outPorts.map(p => (
        <div
          key={p.portIndex}
          className="absolute -bottom-2.5 w-4 h-4 rounded-full bg-white border-2 border-slate-400 hover:border-cyan-500 hover:bg-cyan-100 cursor-crosshair z-10 transition-all flex items-center justify-center"
          style={{ left: p.x - node.x - 8 }}
          onClick={(e) => { e.stopPropagation(); onOutputPortClick(node.id, p.portIndex) }}
        >
          {p.label && <span className="text-[8px] font-bold text-slate-600">{p.label}</span>}
        </div>
      ))}

      {/* Delete */}
      {selected && (
        <button
          className="absolute -top-3 -right-3 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center z-20 shadow"
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
  const cfg = NODE_CFG[node.type]

  function setData(patch: Partial<CanvasNode['data']>) {
    onChange({ ...node, data: { ...node.data, ...patch } })
  }

  function setLabel(label: string) {
    onChange({ ...node, data: { ...node.data, label } })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Nome do nó
        </label>
        <input
          value={node.data.label || cfg.label}
          onChange={e => setLabel(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
        />
      </div>

      {(node.type === 'message' || node.type === 'queue') && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Mensagem
          </label>
          <textarea
            value={node.data.text ?? ''}
            onChange={e => setData({ text: e.target.value })}
            rows={4}
            placeholder="Digite a mensagem que será enviada..."
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
          />
          {node.type === 'message' && (
            <p className="text-[10px] text-slate-400 mt-1">Use {'{{nome}}'}, {'{{data}}'}, {'{{hora}}'} para variáveis.</p>
          )}
        </div>
      )}

      {node.type === 'menu' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Pergunta / Texto
          </label>
          <textarea
            value={node.data.text ?? ''}
            onChange={e => setData({ text: e.target.value })}
            rows={2}
            placeholder="Digite a pergunta do menu..."
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 mb-2"
          />
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Opções (máx. 5)
          </label>
          {(node.data.options ?? ['Opção 1', 'Opção 2']).map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
              <input
                value={opt}
                onChange={e => {
                  const opts = [...(node.data.options ?? [])]
                  opts[i] = e.target.value
                  setData({ options: opts })
                }}
                placeholder={`Opção ${i + 1}`}
                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              {(node.data.options?.length ?? 0) > 1 && (
                <button
                  onClick={() => {
                    const opts = (node.data.options ?? []).filter((_, j) => j !== i)
                    setData({ options: opts })
                  }}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {(node.data.options?.length ?? 0) < 5 && (
            <button
              onClick={() => setData({ options: [...(node.data.options ?? []), `Opção ${(node.data.options?.length ?? 0) + 1}`] })}
              className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium mt-1"
            >
              <Plus className="w-3 h-3" /> Adicionar opção
            </button>
          )}
        </div>
      )}

      {node.type === 'ai' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Prompt do Sistema (IA)
          </label>
          <textarea
            value={node.data.systemPrompt ?? ''}
            onChange={e => setData({ systemPrompt: e.target.value })}
            rows={5}
            placeholder="Você é um assistente de saúde da clínica XYZ. Responda com educação e encaminhe o paciente para agendamento quando necessário..."
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
          />
          <p className="text-[10px] text-slate-400 mt-1">Instruções de comportamento do agente de IA.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main canvas editor ───────────────────────────────────────────────────────

export default function FlowCanvasEditor({
  flowId: _flowId, flowName, botType,
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

  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  // ── Drag logic ──────────────────────────────────────────────────────────────

  function handleNodePointerDown(e: React.PointerEvent, nodeId: string) {
    if (connecting) return
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

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scrollX = canvasRef.current.scrollLeft
    const scrollY = canvasRef.current.scrollTop
    const x = e.clientX - rect.left + scrollX
    const y = e.clientY - rect.top + scrollY
    setMousePos({ x, y })

    if (dragging) {
      const dx = e.clientX - dragging.startMouseX
      const dy = e.clientY - dragging.startMouseY
      setNodes(prev => prev.map(n =>
        n.id === dragging.nodeId
          ? { ...n, x: Math.max(0, dragging.nodeStartX + dx), y: Math.max(0, dragging.nodeStartY + dy) }
          : n
      ))
    }
  }, [dragging])

  function handleCanvasPointerUp() {
    setDragging(null)
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

    // Avoid duplicate edges from same source port
    const edgeExists = edges.some(e => e.source === connecting.sourceId && e.sourcePort === connecting.sourcePort)
    if (!edgeExists) {
      const newEdge: CanvasEdge = {
        id: `edge_${Date.now()}`,
        source: connecting.sourceId,
        sourcePort: connecting.sourcePort,
        target: targetId,
      }
      setEdges(prev => [...prev, newEdge])
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
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  function deleteEdge(edgeId: string) {
    setEdges(prev => prev.filter(e => e.id !== edgeId))
  }

  // ── Add node from palette ───────────────────────────────────────────────────

  function addNode(type: NodeType) {
    const cfg = NODE_CFG[type]
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
    setNodes(prev => [...prev, newNode])
    setSelectedNodeId(newNode.id)
  }

  // ── Update node data ────────────────────────────────────────────────────────

  function updateNode(updated: CanvasNode) {
    setNodes(prev => prev.map(n => n.id === updated.id ? updated : n))
  }

  // ── ESC to cancel connection ────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setConnecting(null)
        setSelectedNodeId(null)
      }
      if (e.key === 'Delete' && selectedNodeId) {
        deleteNode(selectedNodeId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeId])

  // ── Compute ghost line source position ─────────────────────────────────────

  const ghostSource = connecting
    ? (() => {
        const node = nodes.find(n => n.id === connecting.sourceId)
        if (!node) return null
        const ports = outputPortPositions(node)
        return ports.find(p => p.portIndex === connecting.sourcePort) ?? null
      })()
    : null

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      {/* ── Left Palette ── */}
      <div className="w-52 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 shadow-sm">
        {/* Header */}
        <div className="px-3 py-3 border-b border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar à lista
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
              ${botType === 'AI_AGENT' ? 'bg-purple-100' : 'bg-cyan-100'}`}>
              {botType === 'AI_AGENT' ? <Bot className="w-4 h-4 text-purple-600" /> : <Zap className="w-4 h-4 text-cyan-600" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{flowName}</p>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
                ${botType === 'AI_AGENT' ? 'bg-purple-100 text-purple-600' : 'bg-cyan-100 text-cyan-600'}`}>
                {botType === 'AI_AGENT' ? 'Agente IA' : 'Light'}
              </span>
            </div>
          </div>
        </div>

        {/* Nodes palette */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Adicionar Nó</p>
          <div className="space-y-1.5">
            {PALETTE_ITEMS.map(({ type, desc }) => {
              const cfg = NODE_CFG[type]
              return (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg border ${cfg.borderClass} ${cfg.bgClass}
                    hover:shadow-sm transition-all text-left group`}
                >
                  <span className={`${cfg.colorClass} mt-0.5 flex-shrink-0`}>{cfg.icon}</span>
                  <div>
                    <p className={`text-xs font-bold ${cfg.colorClass}`}>{cfg.label}</p>
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{desc}</p>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 flex-shrink-0 ml-auto mt-0.5 transition-colors" />
                </button>
              )
            })}
          </div>

          {/* Instructions */}
          <div className="mt-4 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              <strong className="text-slate-500">Clique</strong> em um nó para adicioná-lo.<br />
              <strong className="text-slate-500">Arraste</strong> os nós para posicioná-los.<br />
              <strong className="text-slate-500">Clique</strong> na porta (●) para conectar.<br />
              <strong className="text-slate-500">Delete</strong> para remover o nó selecionado.
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => onSave(nodes, edges)}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-4 h-4" /> Salvar Fluxo</>
            )}
          </button>
        </div>
      </div>

      {/* ── Canvas Area ── */}
      <div
        ref={canvasRef}
        className={`flex-1 overflow-auto relative ${connecting ? 'cursor-crosshair' : 'cursor-default'}`}
        style={{ background: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundColor: '#f1f5f9' }}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onClick={handleCanvasClick}
      >
        <div className="relative" style={{ width: 3000, height: 2000 }}>
          {/* SVG edges layer */}
          <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: 3000, height: 2000, overflow: 'visible' }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
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
                  {/* Invisible wide hit area */}
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
                    stroke="#64748b"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    strokeDasharray="none"
                  />
                  {edge.label && (
                    <text
                      x={(srcPort.x + tgtPort.x) / 2}
                      y={(srcPort.y + tgtPort.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#94a3b8"
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
            />
          ))}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center opacity-40">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-500">Canvas vazio</p>
                <p className="text-xs text-slate-400 mt-1">Adicione nós pelo painel esquerdo</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Property Panel ── */}
      {selectedNode && (
        <div className="w-60 bg-white border-l border-slate-200 flex flex-col flex-shrink-0 shadow-sm">
          <div className={`px-3 py-3 border-b border-slate-200 ${NODE_CFG[selectedNode.type].headerClass}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={NODE_CFG[selectedNode.type].colorClass}>{NODE_CFG[selectedNode.type].icon}</span>
                <span className={`text-xs font-bold ${NODE_CFG[selectedNode.type].colorClass}`}>
                  {NODE_CFG[selectedNode.type].label}
                </span>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <PropEditor node={selectedNode} onChange={updateNode} />
          </div>
          <div className="p-3 border-t border-slate-200">
            <button
              onClick={() => deleteNode(selectedNode.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-medium transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover nó
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
