import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play, Square, MessageSquare, List, Bot, Users,
  Plus, Trash2, ChevronLeft, Save, Loader2, X, Zap,
  RotateCcw, Send,
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
  onSave: (name: string, nodes: CanvasNode[], edges: CanvasEdge[]) => void
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

  const [localFlowName, setLocalFlowName] = useState(flowName)

  // ── Simulator States ────────────────────────────────────────────────────────
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

  const handleStartSimulation = useCallback(() => {
    clearAllSimTimeouts()
    setSimMessages([])
    setSimIsTyping(false)
    setSimInputText('')
    setSimInputActive(false)

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
    <div className="flex flex-col h-screen w-full bg-slate-100 overflow-hidden font-sans">
      {/* ── Top Header ── */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 text-white flex-shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-semibold transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar à lista
          </button>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={localFlowName}
              onChange={(e) => setLocalFlowName(e.target.value)}
              className="bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-cyan-500 focus:outline-none px-1.5 py-0.5 min-w-[200px] rounded transition-all"
              placeholder="Nome do Fluxo"
            />
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider
              ${botType === 'AI_AGENT' ? 'bg-purple-900/60 text-purple-300 border border-purple-800' : 'bg-cyan-900/60 text-cyan-300 border border-cyan-800'}`}>
              {botType === 'AI_AGENT' ? 'Agente IA' : 'Light'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStartSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-all shadow-sm active:scale-95"
          >
            <Play className="w-3.5 h-3.5" /> Executar Simulação
          </button>
          <button
            onClick={() => onSave(localFlowName, nodes, edges)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            {isSaving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Salvar Fluxo</>
            )}
          </button>
        </div>
      </header>

      {/* ── Workspace 3-Panel Split ── */}
      <div className="flex-1 flex overflow-hidden relative w-full">
        {/* ── Left Sidebar (Actions / Properties) ── */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 shadow-sm z-10 overflow-hidden">
          {selectedNode ? (
            /* Properties Editor */
            <div className="flex flex-col h-full">
              <div className={`px-4 py-3 border-b border-slate-200 flex items-center justify-between ${NODE_CFG[selectedNode.type].headerClass}`}>
                <div className="flex items-center gap-2">
                  <span className={NODE_CFG[selectedNode.type].colorClass}>
                    {NODE_CFG[selectedNode.type].icon}
                  </span>
                  <span className={`text-xs font-bold ${NODE_CFG[selectedNode.type].colorClass}`}>
                    Propriedades: {NODE_CFG[selectedNode.type].label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <PropEditor node={selectedNode} onChange={updateNode} />
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-medium transition-all active:scale-[0.98]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remover nó
                </button>
              </div>
            </div>
          ) : (
            /* Node Palette */
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <p className="text-xs font-bold text-slate-700">Ações do Fluxo</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Clique para adicionar elementos no canvas</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {PALETTE_ITEMS.map(({ type, desc }) => {
                  const cfg = NODE_CFG[type]
                  return (
                    <button
                      key={type}
                      onClick={() => addNode(type)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${cfg.borderClass} ${cfg.bgClass}
                        hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all text-left group`}
                    >
                      <span className={`${cfg.colorClass} mt-0.5 flex-shrink-0 p-1.5 bg-white rounded-lg shadow-xs`}>
                        {cfg.icon}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${cfg.colorClass}`}>{cfg.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{desc}</p>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 flex-shrink-0 ml-auto mt-0.5 transition-colors" />
                    </button>
                  )
                })}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Como usar</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                    • <strong className="text-slate-600 font-bold">Clique</strong> no nó para adicionar.<br />
                    • <strong className="text-slate-600 font-bold">Arraste</strong> os nós para posicionar.<br />
                    • <strong className="text-slate-600 font-bold">Clique</strong> na porta (●) para conectar.<br />
                    • Selecione o nó e pressione <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px]">Del</kbd> para apagar.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Center Canvas Area ── */}
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

        {/* ── Right Panel: WhatsApp Mobile Simulator ── */}
        <div className="w-96 bg-slate-100 border-l border-slate-200 flex flex-col flex-shrink-0 shadow-sm items-center justify-center p-4 overflow-hidden select-none z-10">
          <div className="relative w-80 h-[580px] bg-slate-950 rounded-[36px] border-[8px] border-slate-900 shadow-2xl flex flex-col overflow-hidden ring-4 ring-slate-800/5">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-b-xl z-30 flex items-center justify-center">
              <div className="w-10 h-1 bg-slate-800 rounded-full mb-0.5" />
            </div>

            {/* Status Bar */}
            <div className="h-5 bg-[#008069] text-white/80 text-[9px] px-5 pt-1.5 flex justify-between items-center z-20">
              <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="flex items-center gap-1">
                <span>5G</span>
                <span className="w-3.5 h-1.5 border border-white/60 rounded-xs bg-white/80" />
              </div>
            </div>

            {/* WhatsApp Header */}
            <div className="bg-[#008069] px-3 py-2 flex items-center justify-between text-white shadow z-20 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-800 flex items-center justify-center text-xs font-bold border border-teal-700/50 shadow-xs text-white relative">
                  🤖
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-[#008069]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate max-w-[120px]">{localFlowName || 'Sem nome'}</p>
                  <span className="text-[9px] text-teal-100 flex items-center gap-1 font-medium">
                    <span className="w-1 h-1 bg-emerald-300 rounded-full animate-ping" />
                    Online
                  </span>
                </div>
              </div>

              {/* Reiniciar Teste */}
              <button
                onClick={handleStartSimulation}
                className="flex items-center gap-1 px-2.5 py-1 bg-teal-800 hover:bg-teal-700 border border-teal-700/30 rounded-full text-[9px] font-bold text-white transition-all shadow-xs active:scale-95"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Reiniciar
              </button>
            </div>

            {/* Chat Messages Log */}
            <div
              ref={simChatRef}
              className="flex-1 overflow-y-auto p-3 space-y-2 relative"
              style={{
                backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                backgroundSize: 'cover',
                backgroundColor: '#efeae2'
              }}
            >
              {/* Warning box */}
              <div className="mx-auto max-w-[200px] bg-amber-50/90 text-amber-900 border border-amber-200/40 text-[9px] rounded-lg p-1.5 text-center shadow-xs font-medium">
                Modo Simulação local. Crie conexões e clique em "Executar" para testar.
              </div>

              {simMessages.map((msg) => {
                if (msg.type === 'system') {
                  return (
                    <div key={msg.id} className="mx-auto max-w-[220px] bg-slate-200/90 text-slate-700 text-[9px] rounded-lg py-1 px-2 text-center shadow-xs font-semibold border border-slate-300/20">
                      {msg.text}
                    </div>
                  )
                }

                const isMe = msg.fromMe
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} w-full`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-2 text-[11px] shadow-xs relative leading-relaxed
                        ${isMe ? 'bg-[#d9fdd3] text-slate-800 rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none'}`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* Menu options buttons */}
                      {msg.options && msg.options.length > 0 && (
                        <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2">
                          {msg.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSelectMenuOption(idx, opt)}
                              className="w-full text-left px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 active:bg-slate-200 rounded-lg text-slate-700 transition-all font-semibold shadow-2xs flex items-center justify-between group"
                            >
                              <span>{opt}</span>
                              <span className="text-[8px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">{idx + 1}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="text-[8px] text-slate-400 text-right mt-1 font-medium">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {isMe && <span className="text-sky-500 ml-0.5">✓✓</span>}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {simIsTyping && (
                <div className="flex justify-start w-full">
                  <div className="bg-white rounded-lg rounded-tl-none py-1.5 px-2.5 text-xs shadow-xs border border-slate-200/20 flex items-center gap-1">
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Input Area */}
            <div className="bg-[#f0f2f5] p-2 flex items-center gap-2 border-t border-slate-200/50 z-20 flex-shrink-0">
              <div className="flex-1 bg-white rounded-full px-3 py-1 border border-slate-200 flex items-center shadow-2xs">
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
                  placeholder={simInputActive ? "Digite sua resposta..." : "Aguardando bot..."}
                  className="w-full text-xs text-slate-800 bg-transparent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                onClick={handleSendSimMessage}
                disabled={!simInputActive || !simInputText.trim()}
                className="w-7 h-7 rounded-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-slate-300 text-white flex items-center justify-center shadow-xs active:scale-95 transition-all flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
