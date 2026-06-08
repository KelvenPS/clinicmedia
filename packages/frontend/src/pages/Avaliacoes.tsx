import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, LineChart, Line, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Brain, Search, Plus, Printer, Save, Trash2, ChevronDown, ChevronUp,
  User, CheckCircle2, X, BarChart2, MessageSquare, TrendingUp, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Patient, Assessment } from '../types'

// ─── Test type ────────────────────────────────────────────────────────────────

type AvalType = 'WISC_IV' | 'WAIS_III' | 'WASI' | 'RAVLT' | 'COGNITIVA'

// ─── Wechsler configurations ─────────────────────────────────────────────────

interface SubtestDef { key: string; label: string; supplemental?: boolean }
interface GroupDef {
  index: string; label: string; shortLabel: string; color: string
  subtests: SubtestDef[]
}
interface WechslerConfig {
  kind: 'wechsler'
  label: string; fullName: string; ageRange: string
  scoreRange: [number, number]; scoreLabel: string
  groups: GroupDef[]; mainComposites: string[]
}

const INDEX_HEX: Record<string, string> = {
  ICV: '#3b82f6', IOP: '#8b5cf6', IMO: '#10b981', IVP: '#f59e0b',
  QIV: '#3b82f6', QIE: '#8b5cf6', QIT: '#06b6d4',
}

const WISC_IV: WechslerConfig = {
  kind: 'wechsler', label: 'WISC-IV',
  fullName: 'Escala de Inteligência Wechsler para Crianças (4ª Ed.)',
  ageRange: '6–16 anos', scoreRange: [1, 19], scoreLabel: 'Pont. Escalar',
  groups: [
    {
      index: 'ICV', label: 'Compreensão Verbal', shortLabel: 'ICV', color: 'blue',
      subtests: [
        { key: 'SE', label: 'Semelhanças' },
        { key: 'VO', label: 'Vocabulário' },
        { key: 'CM', label: 'Compreensão' },
        { key: 'IN', label: 'Informação', supplemental: true },
        { key: 'RP', label: 'Raciocínio c/ Palavras', supplemental: true },
      ],
    },
    {
      index: 'IOP', label: 'Organização Perceptual', shortLabel: 'IOP', color: 'purple',
      subtests: [
        { key: 'CU', label: 'Cubos' },
        { key: 'CF', label: 'Conceitos Figurativos' },
        { key: 'RM', label: 'Raciocínio Matricial' },
        { key: 'CmF', label: 'Completar Figuras', supplemental: true },
      ],
    },
    {
      index: 'IMO', label: 'Memória Operacional', shortLabel: 'IMO', color: 'emerald',
      subtests: [
        { key: 'DI', label: 'Dígitos' },
        { key: 'SL', label: 'Seq. Números-Letras' },
        { key: 'AR', label: 'Aritmética', supplemental: true },
      ],
    },
    {
      index: 'IVP', label: 'Velocidade de Processamento', shortLabel: 'IVP', color: 'amber',
      subtests: [
        { key: 'CD', label: 'Código' },
        { key: 'PS', label: 'Procurar Símbolos' },
        { key: 'CA', label: 'Cancelamento', supplemental: true },
      ],
    },
  ],
  mainComposites: ['ICV', 'IOP', 'IMO', 'IVP', 'QIT'],
}

const WAIS_III: WechslerConfig = {
  kind: 'wechsler', label: 'WAIS-III',
  fullName: 'Escala de Inteligência Wechsler para Adultos (3ª Ed.)',
  ageRange: '16–89 anos', scoreRange: [1, 19], scoreLabel: 'Pont. Escalar',
  groups: [
    {
      index: 'ICV', label: 'Compreensão Verbal', shortLabel: 'ICV', color: 'blue',
      subtests: [
        { key: 'VO', label: 'Vocabulário' }, { key: 'SE', label: 'Semelhanças' },
        { key: 'IN', label: 'Informação' },  { key: 'CM', label: 'Compreensão' },
      ],
    },
    {
      index: 'IOP', label: 'Organização Perceptual', shortLabel: 'IOP', color: 'purple',
      subtests: [
        { key: 'CmF', label: 'Completar Figuras' }, { key: 'CU', label: 'Cubos' },
        { key: 'RM', label: 'Raciocínio Matricial' }, { key: 'AF', label: 'Arranjo de Figuras' },
      ],
    },
    {
      index: 'IMO', label: 'Memória Operacional', shortLabel: 'IMO', color: 'emerald',
      subtests: [
        { key: 'AR', label: 'Aritmética' }, { key: 'DI', label: 'Dígitos' },
        { key: 'SL', label: 'Seq. Letras-Números' },
      ],
    },
    {
      index: 'IVP', label: 'Velocidade de Processamento', shortLabel: 'IVP', color: 'amber',
      subtests: [{ key: 'CD', label: 'Código' }, { key: 'PS', label: 'Procurar Símbolos' }],
    },
    {
      index: 'QIE_extra', label: 'QI Execução (adicionais)', shortLabel: 'QIE+', color: 'slate',
      subtests: [{ key: 'AO', label: 'Armar Objetos', supplemental: true }],
    },
  ],
  mainComposites: ['ICV', 'IOP', 'IMO', 'IVP', 'QIV', 'QIE', 'QIT'],
}

const WASI_CFG: WechslerConfig = {
  kind: 'wechsler', label: 'WASI',
  fullName: 'Escala Wechsler Abreviada de Inteligência',
  ageRange: '6–89 anos', scoreRange: [20, 80], scoreLabel: 'Escore T',
  groups: [
    {
      index: 'QIV', label: 'QI Verbal', shortLabel: 'QIV', color: 'blue',
      subtests: [{ key: 'VO', label: 'Vocabulário' }, { key: 'SE', label: 'Semelhanças' }],
    },
    {
      index: 'QIE', label: 'QI de Execução', shortLabel: 'QIE', color: 'purple',
      subtests: [{ key: 'CU', label: 'Cubos' }, { key: 'RM', label: 'Raciocínio Matricial' }],
    },
  ],
  mainComposites: ['QIV', 'QIE', 'QIT'],
}

// ─── RAVLT ────────────────────────────────────────────────────────────────────

const RAVLT_TRIALS = [
  { key: 'A1', label: 'A1', phase: 'learn' as const },
  { key: 'A2', label: 'A2', phase: 'learn' as const },
  { key: 'A3', label: 'A3', phase: 'learn' as const },
  { key: 'A4', label: 'A4', phase: 'learn' as const },
  { key: 'A5', label: 'A5', phase: 'learn' as const },
  { key: 'B1', label: 'B1', phase: 'interf' as const },
  { key: 'A6', label: 'A6', phase: 'recall' as const },
  { key: 'A7', label: 'A7', phase: 'delay' as const },
]

function calcRAVLT(s: Record<string, number | null>) {
  const g = (k: string): number | null => (s[k] as number | null) ?? null
  const [a1,a2,a3,a4,a5,b1,a6,a7] = ['A1','A2','A3','A4','A5','B1','A6','A7'].map(g)
  const total = [a1,a2,a3,a4,a5].every(v => v !== null) ? (a1!+a2!+a3!+a4!+a5!) : null
  const alt = total !== null && a1 !== null ? total - 5 * a1 : null
  const itp = b1 !== null && a1 !== null && a1 > 0 ? +(b1 / a1).toFixed(2) : null
  const itr = a6 !== null && a5 !== null && a5 > 0 ? +(a6 / a5).toFixed(2) : null
  const ve  = a7 !== null && a6 !== null && a6 > 0 ? +(a7 / a6).toFixed(2) : null
  const pr  = a7 !== null && a5 !== null && a5 > 0 ? +((a7 / a5) * 100).toFixed(1) : null
  const rec = g('REC'); const fp = g('FP')
  const netRec = rec !== null && fp !== null ? rec - fp : null
  return { TOTAL: total, ALT: alt, ITP: itp, ITR: itr, VE: ve, PR: pr, NET_REC: netRec }
}

// ─── Cognitiva (neuropsych battery) ──────────────────────────────────────────

const COGNITIVA_GROUPS = [
  {
    index: 'EXEC', label: 'Funções Executivas', shortLabel: 'Exec.', color: 'blue',
    tests: [
      { key: 'TMT_A', label: 'Trilhas A (segundos)', note: 'menor = melhor' },
      { key: 'TMT_B', label: 'Trilhas B (segundos)', note: 'menor = melhor' },
      { key: 'VF_ANIMAIS', label: 'Fluência Semântica – Animais (60s)', note: 'palavras' },
      { key: 'VF_F', label: 'Fluência Fonológica – Letra F (60s)', note: 'palavras' },
      { key: 'VF_A', label: 'Fluência Fonológica – Letra A (60s)', note: 'palavras' },
      { key: 'VF_S', label: 'Fluência Fonológica – Letra S (60s)', note: 'palavras' },
    ],
  },
  {
    index: 'MEM', label: 'Memória', shortLabel: 'Mem.', color: 'emerald',
    tests: [
      { key: 'SPAN_FW', label: 'Span Dígitos Direto', note: 'dígitos' },
      { key: 'SPAN_BW', label: 'Span Dígitos Inverso', note: 'dígitos' },
      { key: 'REY_COPY', label: 'Figura de Rey – Cópia', note: '/36 pontos' },
      { key: 'REY_IMMED', label: 'Figura de Rey – Memória Imediata', note: '/36 pontos' },
      { key: 'REY_DELAY', label: 'Figura de Rey – Memória Tardia', note: '/36 pontos' },
    ],
  },
  {
    index: 'GLOBAL', label: 'Triagem Global', shortLabel: 'Global', color: 'amber',
    tests: [
      { key: 'MMSE', label: 'MEEM / MMSE', note: '/30 pontos' },
      { key: 'MOCA', label: 'MoCA', note: '/30 pontos' },
      { key: 'CDT', label: 'Teste do Relógio (CDT)', note: '/10 pontos' },
    ],
  },
]

// ─── Classification ───────────────────────────────────────────────────────────

const CLS_SCALED = [
  { min: 17, label: 'Muito Superior', hex: '#7c3aed', tw: 'bg-violet-100 text-violet-800' },
  { min: 14, label: 'Superior',       hex: '#2563eb', tw: 'bg-blue-100 text-blue-800' },
  { min: 12, label: 'Médio Superior', hex: '#0891b2', tw: 'bg-cyan-100 text-cyan-800' },
  { min: 8,  label: 'Médio',          hex: '#059669', tw: 'bg-emerald-100 text-emerald-800' },
  { min: 6,  label: 'Médio Inferior', hex: '#ca8a04', tw: 'bg-yellow-100 text-yellow-800' },
  { min: 4,  label: 'Limítrofe',      hex: '#ea580c', tw: 'bg-orange-100 text-orange-800' },
  { min: 1,  label: 'Extrem. Baixo',  hex: '#dc2626', tw: 'bg-red-100 text-red-800' },
]

const CLS_WASI_T = [
  { min: 70, label: 'Muito Superior', hex: '#7c3aed', tw: 'bg-violet-100 text-violet-800' },
  { min: 63, label: 'Superior',       hex: '#2563eb', tw: 'bg-blue-100 text-blue-800' },
  { min: 57, label: 'Médio Superior', hex: '#0891b2', tw: 'bg-cyan-100 text-cyan-800' },
  { min: 44, label: 'Médio',          hex: '#059669', tw: 'bg-emerald-100 text-emerald-800' },
  { min: 37, label: 'Médio Inferior', hex: '#ca8a04', tw: 'bg-yellow-100 text-yellow-800' },
  { min: 31, label: 'Limítrofe',      hex: '#ea580c', tw: 'bg-orange-100 text-orange-800' },
  { min: 0,  label: 'Deficitário',    hex: '#dc2626', tw: 'bg-red-100 text-red-800' },
]

const CLS_COMPOSITE = [
  { min: 130, label: 'Muito Superior', hex: '#7c3aed', tw: 'bg-violet-100 text-violet-800' },
  { min: 120, label: 'Superior',       hex: '#2563eb', tw: 'bg-blue-100 text-blue-800' },
  { min: 110, label: 'Médio Superior', hex: '#0891b2', tw: 'bg-cyan-100 text-cyan-800' },
  { min: 90,  label: 'Médio',          hex: '#059669', tw: 'bg-emerald-100 text-emerald-800' },
  { min: 80,  label: 'Médio Inferior', hex: '#ca8a04', tw: 'bg-yellow-100 text-yellow-800' },
  { min: 70,  label: 'Limítrofe',      hex: '#ea580c', tw: 'bg-orange-100 text-orange-800' },
  { min: 0,   label: 'Extrem. Baixo',  hex: '#dc2626', tw: 'bg-red-100 text-red-800' },
]

type ClsEntry = { min: number; label: string; hex: string; tw: string }
function classifyBy(score: number | null, table: ClsEntry[]): ClsEntry & { empty: boolean } {
  if (score === null) return { min: 0, label: '—', hex: '#94a3b8', tw: 'bg-slate-100 text-slate-500', empty: true }
  return { ...(table.find(c => score >= c.min) ?? table[table.length - 1]), empty: false }
}

const groupTw: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   text: 'text-blue-800',   badge: 'bg-blue-100 text-blue-700' },
  purple: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
  emerald:{ border: 'border-emerald-200',bg: 'bg-emerald-50',text: 'text-emerald-800',badge: 'bg-emerald-100 text-emerald-700' },
  amber:  { border: 'border-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-800',  badge: 'bg-amber-100 text-amber-700' },
  slate:  { border: 'border-slate-200',  bg: 'bg-slate-50',  text: 'text-slate-700',  badge: 'bg-slate-100 text-slate-600' },
}

// ─── Chart Components ─────────────────────────────────────────────────────────

function WechslerBarChart({
  config, scores, composites, isWASI,
}: {
  config: WechslerConfig
  scores: Record<string, string>
  composites: Record<string, string>
  isWASI: boolean
}) {
  const clsTable = isWASI ? CLS_WASI_T : CLS_SCALED
  const subtestData = config.groups
    .flatMap(g => g.subtests.filter(s => !s.supplemental).map(s => ({ ...s, index: g.index })))
    .map(s => {
      const v = scores[s.key] !== '' ? parseFloat(scores[s.key] || '') : null
      return {
        name: s.key,
        fullLabel: s.label,
        score: isNaN(v as number) ? null : v,
        fill: INDEX_HEX[config.groups.find(g => g.subtests.find(sub => sub.key === s.key))?.index ?? ''] ?? '#94a3b8',
      }
    })
    .filter(d => d.score !== null)

  const compositeData = config.mainComposites
    .map(k => ({ name: k, score: composites[k] ? parseFloat(composites[k]) : null }))
    .filter(d => d.score !== null && !isNaN(d.score as number))

  if (subtestData.length === 0 && compositeData.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-8">Preencha as pontuações para visualizar o gráfico.</p>
  }

  const mid = isWASI ? 50 : 10
  const lo  = isWASI ? 40 : 7
  const hi  = isWASI ? 60 : 13
  const yMin = isWASI ? 20 : 1
  const yMax = isWASI ? 80 : 19

  return (
    <div className="space-y-6">
      {subtestData.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Perfil de Subtestes — {isWASI ? 'Escore T (M=50, DP=10)' : 'Pont. Escalar (M=10, DP=3)'}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={subtestData} margin={{ left: -10, right: 10, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                formatter={(v: number, _, item) => [v, item.payload?.fullLabel ?? '']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <ReferenceLine y={mid} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: `M=${mid}`, fontSize: 10, fill: '#10b981', position: 'right' }} />
              <ReferenceLine y={lo}  stroke="#f59e0b" strokeDasharray="3 2" strokeWidth={1} />
              <ReferenceLine y={hi}  stroke="#3b82f6" strokeDasharray="3 2" strokeWidth={1} />
              <Bar dataKey="score" radius={[4,4,0,0]} maxBarSize={40}>
                {subtestData.map((d, i) => (
                  <Cell key={i} fill={d.fill ?? '#94a3b8'} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center flex-wrap mt-2">
            {Object.entries(INDEX_HEX).slice(0,4).map(([k, c]) => (
              <div key={k} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                {k}
              </div>
            ))}
          </div>
        </div>
      )}

      {compositeData.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Escores Compostos / QI (M=100, DP=15)
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, compositeData.length * 44)}>
            <BarChart data={compositeData} layout="vertical" margin={{ left: 10, right: 40, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" domain={[50, 150]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="name" width={46} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine x={100} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: '100', fontSize: 10, fill: '#10b981' }} />
              <Bar dataKey="score" radius={[0,4,4,0]} maxBarSize={28}>
                {compositeData.map((d, i) => {
                  const cls = classifyBy(d.score, CLS_COMPOSITE)
                  return <Cell key={i} fill={cls.hex} fillOpacity={0.8} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function RAVLTChart({ scores }: { scores: Record<string, string> }) {
  const g = (k: string) => {
    const v = parseFloat(scores[k] || '')
    return isNaN(v) ? null : v
  }
  const data = RAVLT_TRIALS.map(t => ({ trial: t.key, recall: g(t.key), phase: t.phase }))
  const hasData = data.some(d => d.recall !== null)
  if (!hasData) return <p className="text-slate-400 text-sm text-center py-8">Preencha as tentativas para visualizar a curva de aprendizado.</p>

  const derived = calcRAVLT(
    Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v ? parseFloat(v) : null]))
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Curva de Aprendizado — Tentativas (máx. 15 palavras)
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: -10, right: 10, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="trial" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis domain={[0, 15]} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={15} stroke="#94a3b8" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Máx', fontSize: 9, fill: '#94a3b8', position: 'right' }} />
            <Line
              type="monotone" dataKey="recall"
              stroke="#3b82f6" strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { trial: string; phase: string } }
                const color = payload.phase === 'interf' ? '#f59e0b' : payload.phase === 'delay' ? '#8b5cf6' : '#3b82f6'
                return <circle key={payload.trial} cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />
              }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-5 justify-center mt-2">
          {[['#3b82f6','Aprendizado (A1–A5)'],['#f59e0b','Interferência (B1)'],['#8b5cf6','Evocação/Tardio (A6,A7)']].map(([c,l]) => (
            <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-0.5 rounded" style={{ background: c }} />
              {l}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Índices Derivados</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { key: 'TOTAL', label: 'Total (A1+...+A5)', note: 'max 75', threshold: null },
            { key: 'ALT',   label: 'Aprendizagem (ALT)', note: 'A1+...+A5 − 5×A1', threshold: null },
            { key: 'ITP',   label: 'Interf. Proativa', note: 'B1 / A1', threshold: null },
            { key: 'ITR',   label: 'Interf. Retroativa', note: 'A6 / A5', threshold: null },
            { key: 'VE',    label: 'Veloc. Esquecimento', note: 'A7 / A6', threshold: null },
            { key: 'PR',    label: 'Retenção (%)', note: '⚠ <80% = significativo', threshold: 80 },
          ].map(({ key, label, note, threshold }) => {
            const val = derived[key as keyof typeof derived]
            const flagLow = threshold !== null && val !== null && (val as number) < threshold
            return (
              <div key={key} className={`rounded-lg p-3 border ${flagLow ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                <p className={`text-xl font-bold ${flagLow ? 'text-red-600' : 'text-slate-800'}`}>
                  {val !== null ? String(val) : '—'}
                  {key === 'PR' && val !== null ? '%' : ''}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{note}</p>
                {flagLow && <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Abaixo do esperado</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, min = 40, max = 160 }: { score: number; min?: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100))
  const cls = classifyBy(score, CLS_COMPOSITE)
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 bg-slate-200 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: cls.hex }} />
      </div>
      <span className="text-sm font-bold text-slate-800 w-8 text-right tabular-nums">{score}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const WECHSLER_CFGS: Record<string, WechslerConfig> = { WISC_IV, WAIS_III, WASI: WASI_CFG }

const TYPE_COLORS: Record<string, string> = {
  WISC_IV: 'bg-blue-500', WAIS_III: 'bg-emerald-500',
  WASI: 'bg-purple-500', RAVLT: 'bg-orange-500', COGNITIVA: 'bg-amber-500',
}

export default function Avaliacoes() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'scores' | 'charts' | 'interpret'>('scores')

  const [assessType, setAssessType] = useState<AvalType>('WISC_IV')
  const [assessDate, setAssessDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [patientAge, setPatientAge] = useState('')
  const [subtestScores, setSubtestScores] = useState<Record<string, string>>({})
  const [compositeScores, setCompositeScores] = useState<Record<string, string>>({})
  const [interpretation, setInterpretation] = useState('')
  const [notes, setNotes] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['patients', search],
    queryFn: () => api.get('/patients', { params: search ? { search } : {} }).then(r => r.data),
  })

  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ['assessments', selectedPatient?.id],
    queryFn: () => api.get('/assessments', { params: { patientId: selectedPatient!.id } }).then(r => r.data),
    enabled: !!selectedPatient,
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      selectedAssessment
        ? api.put(`/assessments/${selectedAssessment.id}`, data).then(r => r.data)
        : api.post('/assessments', data).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['assessments'] })
      toast.success(selectedAssessment ? 'Avaliação atualizada!' : 'Avaliação salva!')
      setSelectedAssessment(data)
      setCreating(true)
    },
    onError: () => toast.error('Erro ao salvar avaliação'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assessments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments'] })
      toast.success('Avaliação removida')
      setSelectedAssessment(null)
      setCreating(false)
    },
  })

  const wcfg = assessType !== 'RAVLT' && assessType !== 'COGNITIVA' ? WECHSLER_CFGS[assessType] : null

  const resetForm = () => {
    setSubtestScores({})
    setCompositeScores({})
    setInterpretation('')
    setNotes('')
    setPatientAge(
      selectedPatient?.birthDate
        ? String(differenceInYears(new Date(), parseISO(selectedPatient.birthDate)))
        : ''
    )
    setAssessDate(format(new Date(), 'yyyy-MM-dd'))
    setExpandedGroups({})
    setTab('scores')
  }

  const loadAssessment = (a: Assessment) => {
    setSelectedAssessment(a)
    setAssessType(a.type as AvalType)
    setAssessDate(format(new Date(a.assessDate), 'yyyy-MM-dd'))
    setPatientAge(a.patientAge?.toString() ?? '')
    const ss: Record<string, string> = {}
    for (const [k, v] of Object.entries(a.subtestScores)) ss[k] = v != null ? String(v) : ''
    setSubtestScores(ss)
    const cs: Record<string, string> = {}
    for (const [k, v] of Object.entries(a.compositeScores)) cs[k] = v != null ? String(v) : ''
    setCompositeScores(cs)
    setInterpretation(a.interpretation ?? '')
    setNotes(a.notes ?? '')
    setCreating(true)
    setTab('scores')
    setExpandedGroups({})
  }

  const handleSave = (status: 'DRAFT' | 'COMPLETED') => {
    if (!selectedPatient) return
    const parsedSub: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(subtestScores)) parsedSub[k] = v !== '' ? parseFloat(v) : null
    const parsedComp: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(compositeScores)) parsedComp[k] = v !== '' ? parseFloat(v) : null

    if (assessType === 'RAVLT') {
      const der = calcRAVLT(parsedSub)
      for (const [k, v] of Object.entries(der)) {
        if (typeof v === 'number') parsedComp[k] = v
      }
    }

    saveMutation.mutate({
      patientId: selectedPatient.id, type: assessType, assessDate,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      subtestScores: parsedSub, compositeScores: parsedComp,
      interpretation, notes, status,
    })
  }

  // Auto-generate interpretation hint
  const autoInterpret = useMemo(() => {
    if (assessType === 'RAVLT') {
      const p = calcRAVLT(Object.fromEntries(Object.entries(subtestScores).map(([k,v]) => [k, v ? parseFloat(v) : null])))
      if (p.TOTAL === null) return ''
      let text = `RAVLT — Total de Aprendizagem: ${p.TOTAL} palavras (A1–A5).`
      if (p.PR !== null) text += `\nRetenção (A7/A5): ${p.PR}% ${p.PR < 80 ? '— ABAIXO DE 80%, sugerindo dificuldade de consolidação da memória.' : '— dentro do esperado.'}`
      if (p.ITR !== null) text += `\nInterferência Retroativa (A6/A5): ${p.ITR}${p.ITR < 0.8 ? ' — indica interferência retroativa significativa.' : '.'}`
      return text
    }
    if (!wcfg) return ''
    const filled = Object.entries(compositeScores).filter(([, v]) => v && !isNaN(parseFloat(v)))
    if (filled.length === 0) return ''
    const lines = filled.map(([k, v]) => {
      const s = parseFloat(v)
      const cls = classifyBy(s, CLS_COMPOSITE)
      return `${k} = ${s} (${cls.label})`
    })
    return lines.join('\n')
  }, [assessType, subtestScores, compositeScores, wcfg])

  const groupIsExpanded = (idx: string) => expandedGroups[idx] !== false

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-600" />
            Avaliações Neuropsicológicas
          </h1>
          <p className="page-subtitle">WISC-IV · WAIS-III · WASI · RAVLT · Bateria Cognitiva</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 no-print" style={{ minHeight: '600px' }}>
        {/* ─── Left panel ─────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-3">
          <div className="card p-0 overflow-hidden">
            <div className="p-3 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pacientes</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar paciente..." className="input-field pl-8 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setCreating(false); setSelectedAssessment(null) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-slate-50 hover:bg-blue-50 transition-colors ${selectedPatient?.id === p.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${selectedPatient?.id === p.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {p.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-slate-900">{p.name}</p>
                    {p.birthDate && (
                      <p className="text-xs text-slate-400">
                        {differenceInYears(new Date(), parseISO(p.birthDate))} anos
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedPatient && (
            <div className="card p-0 overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avaliações</p>
                <button
                  onClick={() => { setSelectedAssessment(null); resetForm(); setCreating(true) }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Nova
                </button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                {assessments.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <Brain className="w-6 h-6 mx-auto mb-1 opacity-30" />
                    <p className="text-xs">Nenhuma avaliação</p>
                  </div>
                ) : assessments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => loadAssessment(a)}
                    className={`w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-slate-50 hover:bg-blue-50 transition-colors ${selectedAssessment?.id === a.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_COLORS[a.type] ?? 'bg-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{a.type.replace('_', '-')}</p>
                      <p className="text-xs text-slate-400">{format(new Date(a.assessDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${a.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.status === 'COMPLETED' ? 'Concluído' : 'Rascunho'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right panel ─────────────────────────────────── */}
        <div className="xl:col-span-3">
          {!selectedPatient ? (
            <div className="card flex flex-col items-center justify-center text-center py-20">
              <Brain className="w-16 h-16 text-slate-200 mb-4" />
              <p className="text-slate-500 font-medium text-lg">Selecione um paciente</p>
              <p className="text-slate-400 text-sm">para iniciar ou visualizar uma avaliação</p>
            </div>
          ) : !creating ? (
            <div className="card flex flex-col items-center justify-center text-center py-16">
              <User className="w-12 h-12 text-blue-200 mb-3" />
              <p className="text-slate-700 font-semibold text-lg">{selectedPatient.name}</p>
              <p className="text-slate-400 text-sm mb-6">{assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''} registrada{assessments.length !== 1 ? 's' : ''}</p>
              <button onClick={() => { setSelectedAssessment(null); resetForm(); setCreating(true) }} className="btn-primary">
                <Plus className="w-4 h-4" /> Nova Avaliação
              </button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {/* Card header */}
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">
                    {selectedAssessment ? 'Editar' : 'Nova'} — <span className="text-blue-700">{selectedPatient.name}</span>
                  </p>
                  {wcfg && <p className="text-xs text-slate-400 mt-0.5">{wcfg.fullName}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {selectedAssessment && (
                    <button onClick={() => { if (confirm('Remover avaliação?')) deleteMutation.mutate(selectedAssessment.id) }} className="p-2 text-slate-400 hover:text-red-500 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => { setCreating(false); setSelectedAssessment(null) }} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50">
                {([
                  { id: 'scores', label: 'Escores', Icon: CheckCircle2 },
                  { id: 'charts', label: 'Gráficos', Icon: BarChart2 },
                  { id: 'interpret', label: 'Interpretação', Icon: MessageSquare },
                ] as { id: 'scores' | 'charts' | 'interpret'; label: string; Icon: typeof CheckCircle2 }[]).map(t => (
                  <button
                    key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <t.Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto p-5" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {/* ── TAB: Escores ── */}
                {tab === 'scores' && (
                  <div className="space-y-5">
                    {/* Test type */}
                    <div>
                      <p className="label mb-2">Tipo de Avaliação</p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(['WISC_IV','WAIS_III','WASI','RAVLT','COGNITIVA'] as AvalType[]).map(k => (
                          <button key={k} onClick={() => { setAssessType(k); resetForm() }}
                            className={`p-2.5 rounded-xl border-2 text-left transition-all ${assessType === k ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <p className={`font-bold text-xs ${assessType === k ? 'text-blue-700' : 'text-slate-700'}`}>
                              {k === 'COGNITIVA' ? 'Cognitiva' : k.replace('_', '-')}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 leading-tight">
                              {k === 'WISC_IV' ? '6–16a' : k === 'WAIS_III' ? '16–89a' : k === 'WASI' ? '6–89a' : k === 'RAVLT' ? 'memória' : 'bateria'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date + Age */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Data da Avaliação</label>
                        <input type="date" value={assessDate} onChange={e => setAssessDate(e.target.value)} className="input-field" />
                      </div>
                      <div>
                        <label className="label">Idade (anos)</label>
                        <input type="number" value={patientAge} onChange={e => setPatientAge(e.target.value)} placeholder="ex: 12" className="input-field" min="1" max="120" />
                      </div>
                    </div>

                    {/* ── Wechsler groups ── */}
                    {wcfg && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-700">
                          Pontuações dos Subtestes <span className="text-xs font-normal text-slate-400">({wcfg.scoreLabel}: {wcfg.scoreRange[0]}–{wcfg.scoreRange[1]})</span>
                        </p>
                        {wcfg.groups.map(group => {
                          const gTw = groupTw[group.color] ?? groupTw.slate
                          const expanded = groupIsExpanded(group.index)
                          const sum = group.subtests.filter(s => !s.supplemental)
                            .reduce<number | null>((acc, s) => {
                              const v = parseFloat(subtestScores[s.key] || '')
                              if (isNaN(v)) return null
                              return acc === null ? v : acc + v
                            }, 0)

                          return (
                            <div key={group.index} className={`border ${gTw.border} rounded-xl overflow-hidden`}>
                              <button
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left ${gTw.bg}`}
                                onClick={() => setExpandedGroups(p => ({ ...p, [group.index]: !expanded }))}
                              >
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gTw.badge}`}>{group.shortLabel}</span>
                                <span className={`font-semibold text-sm ${gTw.text}`}>{group.label}</span>
                                <span className="ml-auto flex items-center gap-2">
                                  {sum !== null && <span className="text-xs text-slate-400">Σ={sum}</span>}
                                  {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </span>
                              </button>
                              {expanded && (
                                <div className="px-4 py-3 space-y-2 bg-white">
                                  {group.subtests.map(sub => {
                                    const val = subtestScores[sub.key]
                                    const num = val ? parseFloat(val) : null
                                    const cls = classifyBy(num, wcfg.scoreRange[1] === 19 ? CLS_SCALED : CLS_WASI_T)
                                    return (
                                      <div key={sub.key} className="flex items-center gap-3">
                                        <label className={`flex-1 text-sm ${sub.supplemental ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                                          {sub.label}{sub.supplemental && <span className="ml-1 text-xs">(supl.)</span>}
                                        </label>
                                        <input
                                          type="number" min={wcfg.scoreRange[0]} max={wcfg.scoreRange[1]}
                                          value={val ?? ''}
                                          onChange={e => setSubtestScores(p => ({ ...p, [sub.key]: e.target.value }))}
                                          className="w-16 text-center input-field py-1.5 text-sm font-mono"
                                          placeholder="—"
                                        />
                                        {!cls.empty && (
                                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-28 text-center ${cls.tw}`}>{cls.label}</span>
                                        )}
                                      </div>
                                    )
                                  })}
                                  {/* Composite for this index */}
                                  <div className={`mt-2 pt-2 border-t ${gTw.border} flex items-center gap-3`}>
                                    <label className={`flex-1 text-xs font-bold ${gTw.text}`}>
                                      Escore Composto {group.shortLabel} <span className="font-normal text-slate-400">(tabela)</span>
                                    </label>
                                    <input
                                      type="number" min={40} max={160}
                                      value={compositeScores[group.index] ?? ''}
                                      onChange={e => setCompositeScores(p => ({ ...p, [group.index]: e.target.value }))}
                                      className={`w-16 text-center input-field py-1.5 text-sm font-bold font-mono border-2 ${gTw.border}`}
                                      placeholder="—"
                                    />
                                    {(() => { const v = compositeScores[group.index]; const s = v ? parseFloat(v) : null; const c = classifyBy(s, CLS_COMPOSITE); return !c.empty && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.tw}`}>{c.label}</span> })()}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Global composites */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">Escores Globais (QI / Índices)</div>
                          <div className="px-4 py-3 space-y-2 bg-white">
                            {wcfg.mainComposites.filter(c => !wcfg.groups.find(g => g.index === c)).map(c => {
                              const v = compositeScores[c]
                              const s = v ? parseFloat(v) : null
                              const cls = classifyBy(s, CLS_COMPOSITE)
                              return (
                                <div key={c} className="flex items-center gap-3">
                                  <label className="flex-1 text-sm font-semibold text-slate-700">{c}</label>
                                  <input
                                    type="number" min={40} max={160}
                                    value={v ?? ''}
                                    onChange={e => setCompositeScores(p => ({ ...p, [c]: e.target.value }))}
                                    className="w-16 text-center input-field py-1.5 text-sm font-bold font-mono border-2 border-slate-300"
                                    placeholder="—"
                                  />
                                  {!cls.empty && (
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <ScoreBar score={s!} />
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls.tw}`}>{cls.label}</span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── RAVLT form ── */}
                    {assessType === 'RAVLT' && (
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-slate-700">Tentativas de Evocação <span className="text-xs font-normal text-slate-400">(0–15 palavras por tentativa)</span></p>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                {RAVLT_TRIALS.map(t => (
                                  <th key={t.key} className={`py-2 text-center text-xs font-bold ${t.phase==='learn'?'text-blue-700':t.phase==='interf'?'text-amber-700':t.phase==='recall'?'text-emerald-700':'text-purple-700'}`}>{t.key}</th>
                                ))}
                              </tr>
                              <tr>
                                {RAVLT_TRIALS.map(t => (
                                  <th key={t.key} className={`py-1 text-center text-xs font-normal ${t.phase==='learn'?'text-blue-400':t.phase==='interf'?'text-amber-400':t.phase==='recall'?'text-emerald-400':'text-purple-400'}`}>
                                    {t.phase==='learn'?'Aprend.':t.phase==='interf'?'Interf.':t.phase==='recall'?'Imed.':'Tardio'}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white">
                                {RAVLT_TRIALS.map(t => (
                                  <td key={t.key} className="py-3 text-center">
                                    <input
                                      type="number" min={0} max={15}
                                      value={subtestScores[t.key] ?? ''}
                                      onChange={e => setSubtestScores(p => ({ ...p, [t.key]: e.target.value }))}
                                      className="w-12 text-center input-field py-1.5 text-sm font-bold font-mono mx-auto"
                                      placeholder="—"
                                    />
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { key: 'REC', label: 'Reconhecimento', sub: 'acertos (0–15)' },
                            { key: 'FP', label: 'Falsos Positivos', sub: '0–50 palavras' },
                            { key: 'INTRUS_A', label: 'Intrusões (Lista A)', sub: 'total' },
                            { key: 'PERSEV', label: 'Perseverações', sub: 'total' },
                          ].map(f => (
                            <div key={f.key} className="border border-slate-200 rounded-xl p-3">
                              <p className="text-xs font-medium text-slate-600">{f.label}</p>
                              <p className="text-xs text-slate-400 mb-2">{f.sub}</p>
                              <input
                                type="number" min={0}
                                value={subtestScores[f.key] ?? ''}
                                onChange={e => setSubtestScores(p => ({ ...p, [f.key]: e.target.value }))}
                                className="w-full text-center input-field py-1.5 text-sm font-bold font-mono"
                                placeholder="—"
                              />
                            </div>
                          ))}
                        </div>
                        {/* Live derived scores */}
                        {(() => {
                          const p = calcRAVLT(Object.fromEntries(Object.entries(subtestScores).map(([k,v]) => [k, v ? parseFloat(v) : null])))
                          if (p.TOTAL === null) return null
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Índices calculados automaticamente</p>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                {[
                                  { k:'TOTAL', l:'Total A1–A5', v:p.TOTAL, warn:false },
                                  { k:'ALT',   l:'Aprend. (ALT)', v:p.ALT, warn:false },
                                  { k:'ITP',   l:'Interf. Proativa', v:p.ITP, warn:false },
                                  { k:'ITR',   l:'Interf. Retroativa', v:p.ITR, warn: p.ITR!==null && p.ITR<0.8 },
                                  { k:'VE',    l:'Vel. Esquecimento', v:p.VE, warn:false },
                                  { k:'PR',    l:'Retenção (%)', v:p.PR!==null?`${p.PR}%`:null, warn:p.PR!==null && p.PR<80 },
                                ].map(d => (
                                  <div key={d.k} className={`rounded-lg px-2 py-2 ${d.warn?'bg-red-50 border border-red-200':'bg-white border border-blue-100'}`}>
                                    <p className="text-xs text-slate-500">{d.l}</p>
                                    <p className={`text-lg font-bold tabular-nums ${d.warn?'text-red-600':'text-blue-800'}`}>{d.v ?? '—'}</p>
                                    {d.warn && <p className="text-xs text-red-500 flex items-center gap-0.5 justify-center"><AlertTriangle className="w-3 h-3" />Atenção</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* ── Cognitiva form ── */}
                    {assessType === 'COGNITIVA' && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-slate-700">Bateria Neuropsicológica</p>
                        {COGNITIVA_GROUPS.map(grp => {
                          const gTw = groupTw[grp.color] ?? groupTw.slate
                          const expanded = groupIsExpanded(grp.index)
                          return (
                            <div key={grp.index} className={`border ${gTw.border} rounded-xl overflow-hidden`}>
                              <button
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left ${gTw.bg}`}
                                onClick={() => setExpandedGroups(p => ({ ...p, [grp.index]: !expanded }))}
                              >
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gTw.badge}`}>{grp.shortLabel}</span>
                                <span className={`font-semibold text-sm ${gTw.text}`}>{grp.label}</span>
                                <span className="ml-auto">{expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}</span>
                              </button>
                              {expanded && (
                                <div className="px-4 py-3 space-y-2 bg-white">
                                  {grp.tests.map(t => (
                                    <div key={t.key} className="flex items-center gap-3">
                                      <div className="flex-1">
                                        <p className="text-sm text-slate-700">{t.label}</p>
                                        <p className="text-xs text-slate-400">{t.note}</p>
                                      </div>
                                      <input
                                        type="number" min={0}
                                        value={subtestScores[t.key] ?? ''}
                                        onChange={e => setSubtestScores(p => ({ ...p, [t.key]: e.target.value }))}
                                        className="w-20 text-center input-field py-1.5 text-sm font-mono"
                                        placeholder="—"
                                      />
                                    </div>
                                  ))}
                                  {/* VF_FAS auto-calc */}
                                  {grp.index === 'EXEC' && (() => {
                                    const f = parseFloat(subtestScores['VF_F'] || '')
                                    const a = parseFloat(subtestScores['VF_A'] || '')
                                    const s = parseFloat(subtestScores['VF_S'] || '')
                                    if (!isNaN(f) && !isNaN(a) && !isNaN(s)) {
                                      return (
                                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                                          <p className="flex-1 text-sm text-slate-600 font-medium">FAS Total (F+A+S auto)</p>
                                          <p className="w-20 text-center text-lg font-bold text-blue-700">{f+a+s}</p>
                                        </div>
                                      )
                                    }
                                    return null
                                  })()}
                                  {/* TMT B/A ratio */}
                                  {grp.index === 'EXEC' && (() => {
                                    const ta = parseFloat(subtestScores['TMT_A'] || '')
                                    const tb = parseFloat(subtestScores['TMT_B'] || '')
                                    if (!isNaN(ta) && !isNaN(tb) && ta > 0) {
                                      const ratio = (tb/ta).toFixed(2)
                                      const warn = parseFloat(ratio) > 3
                                      return (
                                        <div className={`flex items-center gap-3 pt-2 border-t border-slate-100 ${warn?'text-red-600':''}`}>
                                          <p className={`flex-1 text-sm font-medium ${warn?'text-red-700':'text-slate-600'}`}>Razão B/A (auto) {warn && '⚠ >3 = disfunção exec.'}</p>
                                          <p className={`w-20 text-center text-lg font-bold ${warn?'text-red-600':'text-blue-700'}`}>{ratio}</p>
                                        </div>
                                      )
                                    }
                                    return null
                                  })()}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Gráficos ── */}
                {tab === 'charts' && (
                  <div className="space-y-6">
                    {(assessType === 'WISC_IV' || assessType === 'WAIS_III' || assessType === 'WASI') && wcfg && (
                      <WechslerBarChart config={wcfg} scores={subtestScores} composites={compositeScores} isWASI={assessType === 'WASI'} />
                    )}
                    {assessType === 'RAVLT' && <RAVLTChart scores={subtestScores} />}
                    {assessType === 'COGNITIVA' && (
                      <div>
                        <p className="text-sm text-slate-500 mb-4">Bateria cognitiva — valores brutos por instrumento</p>
                        {(() => {
                          const data = COGNITIVA_GROUPS.flatMap(g => g.tests)
                            .map(t => ({ name: t.label.split('–')[0].trim().substring(0,16), score: subtestScores[t.key] ? parseFloat(subtestScores[t.key]) : null }))
                            .filter(d => d.score !== null)
                          if (data.length === 0) return <p className="text-slate-400 text-sm text-center py-8">Preencha os escores para visualizar.</p>
                          return (
                            <ResponsiveContainer width="100%" height={260}>
                              <BarChart data={data} margin={{ left: -10, right: 10, top: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                <Bar dataKey="score" fill="#3b82f6" radius={[4,4,0,0]} fillOpacity={0.8} maxBarSize={36} />
                              </BarChart>
                            </ResponsiveContainer>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Interpretação ── */}
                {tab === 'interpret' && (
                  <div className="space-y-4">
                    {autoInterpret && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5" />Resumo automático dos escores
                        </p>
                        <pre className="text-xs text-blue-800 whitespace-pre-wrap font-mono leading-relaxed">{autoInterpret}</pre>
                        <button
                          onClick={() => setInterpretation(prev => prev ? prev + '\n\n' + autoInterpret : autoInterpret)}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Copiar para interpretação
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="label">Interpretação Clínica</label>
                      <textarea value={interpretation} onChange={e => setInterpretation(e.target.value)} rows={7} className="input-field resize-none"
                        placeholder="Descreva os resultados, implicações clínicas, pontos de atenção e recomendações..." />
                    </div>
                    <div>
                      <label className="label">Observações da Avaliação</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input-field resize-none"
                        placeholder="Comportamento, condições do exame, cooperação, aspectos relevantes..." />
                    </div>
                  </div>
                )}

                {/* ── Actions (always visible) ── */}
                <div className="flex items-center gap-3 pt-4 mt-4 border-t border-slate-100">
                  <button onClick={() => handleSave('DRAFT')} disabled={saveMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
                    <Save className="w-4 h-4" />Rascunho
                  </button>
                  <button onClick={() => handleSave('COMPLETED')} disabled={saveMutation.isPending} className="btn-primary flex-1">
                    {saveMutation.isPending
                      ? <span className="flex items-center gap-2 justify-center"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando...</span>
                      : <><CheckCircle2 className="w-4 h-4" />Concluir Avaliação</>}
                  </button>
                  <button onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium text-sm transition-colors">
                    <Printer className="w-4 h-4" />Imprimir
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Print section ─────────────────────────────────────────────────── */}
      <div className="print-only p-8 max-w-4xl mx-auto space-y-6 text-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-300 pb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">ClinIQ Pro</h1>
            <p className="text-slate-500 text-sm">Gestão Clínica Inteligente</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-900 text-lg">
              {assessType === 'RAVLT' ? 'RAVLT' : assessType === 'COGNITIVA' ? 'Bateria Cognitiva' : assessType.replace('_', '-')} — Laudo Psicológico
            </p>
            {wcfg && <p className="text-slate-500 text-sm">{wcfg.fullName}</p>}
            {assessType === 'RAVLT' && <p className="text-slate-500 text-sm">Teste de Aprendizagem Auditivo-Verbal de Rey</p>}
          </div>
        </div>

        {/* Patient info */}
        <div className="grid grid-cols-3 gap-3 border border-slate-200 rounded-lg p-4 text-sm bg-slate-50">
          <div><span className="font-semibold">Paciente:</span> {selectedPatient?.name ?? '—'}</div>
          <div><span className="font-semibold">Idade:</span> {patientAge ? `${patientAge} anos` : '—'}</div>
          <div><span className="font-semibold">Data da Avaliação:</span> {assessDate ? format(new Date(assessDate), 'dd/MM/yyyy') : '—'}</div>
          <div><span className="font-semibold">Profissional:</span> {user?.name ?? '—'}</div>
          <div><span className="font-semibold">{user?.certType ?? 'CRP'}:</span> {user?.certNumber ?? user?.crm ?? '—'}</div>
          <div><span className="font-semibold">Especialidade:</span> {user?.specialty ?? '—'}</div>
        </div>

        {/* Scores table — Wechsler */}
        {wcfg && Object.keys(compositeScores).some(k => compositeScores[k]) && (
          <div>
            <h2 className="font-bold text-slate-900 text-base mb-3">Escores Compostos e Índices</h2>
            <table className="w-full text-sm border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-left">Índice / QI</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-20">Escore</th>
                  <th className="border border-slate-300 px-3 py-2 text-left">Classificação</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-28">Percentil (aprox.)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(compositeScores).filter(([,v]) => v && !isNaN(parseFloat(v))).map(([k, v]) => {
                  const s = parseFloat(v)
                  const cls = classifyBy(s, CLS_COMPOSITE)
                  const pct = s >= 130 ? '≥98' : s >= 120 ? '91–97' : s >= 110 ? '75–90' : s >= 90 ? '25–74' : s >= 80 ? '9–24' : s >= 70 ? '3–8' : '≤2'
                  return (
                    <tr key={k}>
                      <td className="border border-slate-300 px-3 py-2 font-medium">{k}</td>
                      <td className="border border-slate-300 px-3 py-2 text-center font-bold">{s}</td>
                      <td className="border border-slate-300 px-3 py-2">{cls.label}</td>
                      <td className="border border-slate-300 px-3 py-2 text-center">{pct}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Subtests table — Wechsler */}
        {wcfg && Object.keys(subtestScores).some(k => subtestScores[k]) && (
          <div>
            <h2 className="font-bold text-slate-900 text-base mb-3">Pontuações dos Subtestes</h2>
            <table className="w-full text-sm border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-left">Subteste</th>
                  <th className="border border-slate-300 px-3 py-2 text-center w-20">{wcfg.scoreLabel}</th>
                  <th className="border border-slate-300 px-3 py-2 text-left">Índice</th>
                  <th className="border border-slate-300 px-3 py-2 text-left">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {wcfg.groups.flatMap(g => g.subtests.filter(s => !s.supplemental).map(s => ({ ...s, gIdx: g.index }))).map(sub => {
                  const v = subtestScores[sub.key]
                  if (!v || isNaN(parseFloat(v))) return null
                  const score = parseFloat(v)
                  const cls = classifyBy(score, wcfg.scoreRange[1] === 19 ? CLS_SCALED : CLS_WASI_T)
                  return (
                    <tr key={sub.key}>
                      <td className="border border-slate-300 px-3 py-2">{sub.label}</td>
                      <td className="border border-slate-300 px-3 py-2 text-center font-bold">{score}</td>
                      <td className="border border-slate-300 px-3 py-2 text-slate-500">{sub.gIdx}</td>
                      <td className="border border-slate-300 px-3 py-2">{cls.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* RAVLT print table */}
        {assessType === 'RAVLT' && (
          <div>
            <h2 className="font-bold text-slate-900 text-base mb-3">RAVLT — Resultados</h2>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border-collapse border border-slate-300">
                <thead className="bg-slate-100">
                  <tr>{RAVLT_TRIALS.map(t => <th key={t.key} className="border border-slate-300 px-3 py-2 text-center">{t.key}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>{RAVLT_TRIALS.map(t => <td key={t.key} className="border border-slate-300 px-3 py-2 text-center font-bold">{subtestScores[t.key] || '—'}</td>)}</tr>
                </tbody>
              </table>
            </div>
            {(() => {
              const p = calcRAVLT(Object.fromEntries(Object.entries(subtestScores).map(([k,v]) => [k, v ? parseFloat(v) : null])))
              if (p.TOTAL === null) return null
              return (
                <table className="w-full text-sm border-collapse border border-slate-300">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 px-3 py-2 text-left">Índice Derivado</th>
                      <th className="border border-slate-300 px-3 py-2 text-center">Valor</th>
                      <th className="border border-slate-300 px-3 py-2 text-left">Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { l: 'Total (A1+A2+A3+A4+A5)', v: p.TOTAL, ref: 'max. 75 palavras' },
                      { l: 'Aprendizagem (ALT)', v: p.ALT, ref: 'A1+...+A5 − 5×A1' },
                      { l: 'Interferência Proativa (ITP)', v: p.ITP, ref: 'B1 ÷ A1' },
                      { l: 'Interferência Retroativa (ITR)', v: p.ITR, ref: 'A6 ÷ A5 (< 0,8 = significativo)' },
                      { l: 'Velocidade de Esquecimento (VE)', v: p.VE, ref: 'A7 ÷ A6' },
                      { l: 'Porcentagem de Retenção (%)', v: p.PR !== null ? `${p.PR}%` : null, ref: '< 80% = comprometimento de consolidação' },
                      { l: 'Reconhecimento Líquido', v: p.NET_REC, ref: 'Acertos − Falsos Positivos' },
                    ].map(row => (
                      <tr key={row.l} className={row.l.includes('Retenção') && p.PR !== null && p.PR < 80 ? 'bg-red-50' : ''}>
                        <td className="border border-slate-300 px-3 py-2">{row.l}</td>
                        <td className="border border-slate-300 px-3 py-2 text-center font-bold">{row.v ?? '—'}</td>
                        <td className="border border-slate-300 px-3 py-2 text-slate-500 text-xs">{row.ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
        )}

        {/* Interpretation */}
        {interpretation && (
          <div>
            <h2 className="font-bold text-slate-900 text-base mb-2">Interpretação Clínica</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border-l-4 border-blue-300 pl-4">{interpretation}</p>
          </div>
        )}

        {notes && (
          <div>
            <h2 className="font-bold text-slate-900 text-base mb-2">Observações</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        {/* Signature */}
        <div className="mt-12 pt-6 border-t-2 border-slate-300 grid grid-cols-2 gap-10 text-sm">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-12" />
            <p className="font-semibold text-slate-900">{user?.name ?? '—'}</p>
            <p className="text-slate-500">{user?.specialty ?? '—'}</p>
            <p className="text-slate-500">{user?.certType ?? 'CRP'}: {user?.certNumber ?? user?.crm ?? '—'}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-12" />
            <p className="font-semibold text-slate-900">Data e Assinatura do Responsável</p>
            <p className="text-slate-500">_______ / _______ / _______</p>
          </div>
        </div>
      </div>
    </div>
  )
}
