import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Brain, Search, Plus, Printer, Save, Trash2, ChevronDown, ChevronUp,
  FileText, User, Calendar, CheckCircle2, Edit3, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Patient, Assessment } from '../types'

// ─── Test definitions ──────────────────────────────────────────────────────────

interface Subtest {
  key: string
  label: string
  supplemental?: boolean
}

interface SubtestGroup {
  index: string
  label: string
  shortLabel: string
  color: string
  subtests: Subtest[]
}

interface AssessmentConfig {
  label: string
  fullName: string
  ageRange: string
  compositeLabel: string
  groups: SubtestGroup[]
  mainComposites: string[]
}

const CONFIGS: Record<string, AssessmentConfig> = {
  WISC_IV: {
    label: 'WISC-IV',
    fullName: 'Escala de Inteligência Wechsler para Crianças (4ª Ed.)',
    ageRange: '6 a 16 anos',
    compositeLabel: 'QIT',
    groups: [
      {
        index: 'ICV', label: 'Índice de Compreensão Verbal', shortLabel: 'ICV',
        color: 'blue',
        subtests: [
          { key: 'SE', label: 'Semelhanças' },
          { key: 'VO', label: 'Vocabulário' },
          { key: 'CM', label: 'Compreensão' },
          { key: 'IN', label: 'Informação', supplemental: true },
          { key: 'RP', label: 'Raciocínio com Palavras', supplemental: true },
        ],
      },
      {
        index: 'IOP', label: 'Índice de Organização Perceptual', shortLabel: 'IOP',
        color: 'purple',
        subtests: [
          { key: 'CU', label: 'Cubos' },
          { key: 'CF', label: 'Conceitos Figurativos' },
          { key: 'RM', label: 'Raciocínio Matricial' },
          { key: 'CmF', label: 'Completar Figuras', supplemental: true },
        ],
      },
      {
        index: 'IMO', label: 'Índice de Memória Operacional', shortLabel: 'IMO',
        color: 'emerald',
        subtests: [
          { key: 'DI', label: 'Dígitos' },
          { key: 'SL', label: 'Seq. Números-Letras' },
          { key: 'AR', label: 'Aritmética', supplemental: true },
        ],
      },
      {
        index: 'IVP', label: 'Índice de Velocidade de Processamento', shortLabel: 'IVP',
        color: 'amber',
        subtests: [
          { key: 'CD', label: 'Código' },
          { key: 'PS', label: 'Procurar Símbolos' },
          { key: 'CA', label: 'Cancelamento', supplemental: true },
        ],
      },
    ],
    mainComposites: ['ICV', 'IOP', 'IMO', 'IVP', 'QIT'],
  },
  WASI: {
    label: 'WASI',
    fullName: 'Escala de Inteligência Wechsler Abreviada',
    ageRange: '6 anos ou mais',
    compositeLabel: 'QIT',
    groups: [
      {
        index: 'QIV', label: 'QI Verbal', shortLabel: 'QIV',
        color: 'blue',
        subtests: [
          { key: 'VO', label: 'Vocabulário' },
          { key: 'SE', label: 'Semelhanças' },
        ],
      },
      {
        index: 'QIE', label: 'QI de Execução', shortLabel: 'QIE',
        color: 'purple',
        subtests: [
          { key: 'CU', label: 'Cubos' },
          { key: 'RM', label: 'Raciocínio Matricial' },
        ],
      },
    ],
    mainComposites: ['QIV', 'QIE', 'QIT'],
  },
  WAIS_III: {
    label: 'WAIS-III',
    fullName: 'Escala de Inteligência Wechsler para Adultos (3ª Ed.)',
    ageRange: '16 a 89 anos',
    compositeLabel: 'QIT',
    groups: [
      {
        index: 'ICV', label: 'Índice de Compreensão Verbal', shortLabel: 'ICV',
        color: 'blue',
        subtests: [
          { key: 'VO', label: 'Vocabulário' },
          { key: 'SE', label: 'Semelhanças' },
          { key: 'IN', label: 'Informação' },
          { key: 'CM', label: 'Compreensão' },
        ],
      },
      {
        index: 'IOP', label: 'Índice de Organização Perceptual', shortLabel: 'IOP',
        color: 'purple',
        subtests: [
          { key: 'CmF', label: 'Completar Figuras' },
          { key: 'CU', label: 'Cubos' },
          { key: 'RM', label: 'Raciocínio Matricial' },
          { key: 'AF', label: 'Arranjo de Figuras' },
        ],
      },
      {
        index: 'IMO', label: 'Índice de Memória Operacional', shortLabel: 'IMO',
        color: 'emerald',
        subtests: [
          { key: 'AR', label: 'Aritmética' },
          { key: 'DI', label: 'Dígitos' },
          { key: 'SL', label: 'Seq. Letras-Números' },
        ],
      },
      {
        index: 'IVP', label: 'Índice de Velocidade de Processamento', shortLabel: 'IVP',
        color: 'amber',
        subtests: [
          { key: 'CD', label: 'Código' },
          { key: 'PS', label: 'Procurar Símbolos' },
        ],
      },
    ],
    mainComposites: ['ICV', 'IOP', 'IMO', 'IVP', 'QIV', 'QIE', 'QIT'],
  },
  COGNITIVA: {
    label: 'Cognitiva',
    fullName: 'Avaliação Cognitiva Geral',
    ageRange: 'Qualquer idade',
    compositeLabel: 'Escore Global',
    groups: [
      {
        index: 'MEM', label: 'Memória', shortLabel: 'Mem.',
        color: 'blue',
        subtests: [
          { key: 'ME1', label: 'Memória Imediata' },
          { key: 'ME2', label: 'Memória de Trabalho' },
          { key: 'ME3', label: 'Memória de Longo Prazo' },
        ],
      },
      {
        index: 'ATN', label: 'Atenção e Concentração', shortLabel: 'Aten.',
        color: 'purple',
        subtests: [
          { key: 'AT1', label: 'Atenção Seletiva' },
          { key: 'AT2', label: 'Atenção Sustentada' },
          { key: 'AT3', label: 'Controle Inibitório' },
        ],
      },
      {
        index: 'EXE', label: 'Funções Executivas', shortLabel: 'F.Exe.',
        color: 'emerald',
        subtests: [
          { key: 'EX1', label: 'Planejamento' },
          { key: 'EX2', label: 'Flexibilidade Cognitiva' },
          { key: 'EX3', label: 'Fluência Verbal' },
        ],
      },
      {
        index: 'LIN', label: 'Linguagem', shortLabel: 'Ling.',
        color: 'amber',
        subtests: [
          { key: 'LI1', label: 'Compreensão' },
          { key: 'LI2', label: 'Expressão' },
          { key: 'LI3', label: 'Nomeação' },
        ],
      },
    ],
    mainComposites: ['MEM', 'ATN', 'EXE', 'LIN', 'Escore Global'],
  },
}

// ─── Score classification ──────────────────────────────────────────────────────

function classifyScore(score: number): { label: string; color: string; bg: string; textBg: string } {
  if (score >= 130) return { label: 'Muito Superior', color: 'text-violet-700', bg: 'bg-violet-100', textBg: 'bg-violet-600' }
  if (score >= 120) return { label: 'Superior', color: 'text-indigo-700', bg: 'bg-indigo-100', textBg: 'bg-indigo-600' }
  if (score >= 110) return { label: 'Médio Superior', color: 'text-blue-700', bg: 'bg-blue-100', textBg: 'bg-blue-600' }
  if (score >= 90) return { label: 'Médio', color: 'text-emerald-700', bg: 'bg-emerald-100', textBg: 'bg-emerald-600' }
  if (score >= 80) return { label: 'Médio Inferior', color: 'text-yellow-700', bg: 'bg-yellow-100', textBg: 'bg-yellow-500' }
  if (score >= 70) return { label: 'Limítrofe', color: 'text-orange-700', bg: 'bg-orange-100', textBg: 'bg-orange-500' }
  return { label: 'Extremamente Baixo', color: 'text-red-700', bg: 'bg-red-100', textBg: 'bg-red-600' }
}

function classifySubtest(score: number): { label: string; color: string } {
  if (score >= 16) return { label: 'Muito Superior', color: 'text-violet-600' }
  if (score >= 14) return { label: 'Superior', color: 'text-indigo-600' }
  if (score >= 12) return { label: 'Médio Superior', color: 'text-blue-600' }
  if (score >= 8) return { label: 'Médio', color: 'text-emerald-600' }
  if (score >= 6) return { label: 'Médio Inferior', color: 'text-yellow-600' }
  if (score >= 4) return { label: 'Limítrofe', color: 'text-orange-600' }
  return { label: 'Muito Baixo', color: 'text-red-600' }
}

function ScoreBar({ score, max = 160, min = 40 }: { score: number; max?: number; min?: number }) {
  const pct = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100))
  const cls = classifyScore(score)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${cls.textBg}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-bold text-slate-900 w-8 text-right">{score}</span>
    </div>
  )
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

const groupColors: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  blue: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  purple: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Laudos() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const printRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null)
  const [assessmentType, setAssessmentType] = useState<string>('WISC_IV')
  const [creating, setCreating] = useState(false)
  const [assessDate, setAssessDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [patientAge, setPatientAge] = useState('')
  const [subtestScores, setSubtestScores] = useState<Record<string, string>>({})
  const [compositeScores, setCompositeScores] = useState<Record<string, string>>({})
  const [interpretation, setInterpretation] = useState('')
  const [notes, setNotes] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ ICV: true, QIV: true, MEM: true })

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
        ? api.put(`/assessments/${selectedAssessment.id}`, data)
        : api.post('/assessments', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assessments'] })
      toast.success(selectedAssessment ? 'Avaliação atualizada!' : 'Avaliação salva!')
      setSelectedAssessment(res.data)
      setCreating(false)
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

  const config = CONFIGS[assessmentType]

  const resetForm = () => {
    setSubtestScores({})
    setCompositeScores({})
    setInterpretation('')
    setNotes('')
    setPatientAge('')
    setAssessDate(format(new Date(), 'yyyy-MM-dd'))
    setExpandedGroups({ ICV: true, QIV: true, MEM: true })
  }

  const loadAssessment = (a: Assessment) => {
    setSelectedAssessment(a)
    setAssessmentType(a.type)
    setAssessDate(format(new Date(a.assessDate), 'yyyy-MM-dd'))
    setPatientAge(a.patientAge?.toString() || '')
    const ss: Record<string, string> = {}
    for (const [k, v] of Object.entries(a.subtestScores)) {
      ss[k] = v != null ? String(v) : ''
    }
    setSubtestScores(ss)
    const cs: Record<string, string> = {}
    for (const [k, v] of Object.entries(a.compositeScores)) {
      cs[k] = v != null ? String(v) : ''
    }
    setCompositeScores(cs)
    setInterpretation(a.interpretation || '')
    setNotes(a.notes || '')
    setCreating(true)
  }

  const handleNewAssessment = () => {
    setSelectedAssessment(null)
    resetForm()
    setCreating(true)
  }

  const handleSave = (status: 'DRAFT' | 'COMPLETED') => {
    if (!selectedPatient) return
    const parsedSubtest: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(subtestScores)) {
      parsedSubtest[k] = v !== '' ? parseFloat(v) : null
    }
    const parsedComposite: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(compositeScores)) {
      parsedComposite[k] = v !== '' ? parseFloat(v) : null
    }
    saveMutation.mutate({
      patientId: selectedPatient.id,
      type: assessmentType,
      assessDate,
      patientAge: patientAge ? parseInt(patientAge) : undefined,
      subtestScores: parsedSubtest,
      compositeScores: parsedComposite,
      interpretation,
      notes,
      status,
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const getSumForGroup = (group: SubtestGroup) => {
    const coreKeys = group.subtests.filter(s => !s.supplemental).map(s => s.key)
    let sum = 0
    let allFilled = true
    for (const key of coreKeys) {
      const val = parseFloat(subtestScores[key] || '')
      if (isNaN(val)) { allFilled = false; break }
      sum += val
    }
    return allFilled ? sum : null
  }

  const typeColors: Record<string, string> = {
    WISC_IV: 'bg-blue-600',
    WASI: 'bg-purple-600',
    WAIS_III: 'bg-emerald-600',
    COGNITIVA: 'bg-amber-600',
  }

  const typeLabels: Record<string, string> = {
    WISC_IV: 'WISC-IV',
    WASI: 'WASI',
    WAIS_III: 'WAIS-III',
    COGNITIVA: 'Cognitiva',
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-600" />
            Correção de Laudos
          </h1>
          <p className="page-subtitle">WISC-IV · WASI · WAIS-III · Cognitiva</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 no-print" style={{ minHeight: '600px' }}>
        {/* Left panel - patients + assessments */}
        <div className="xl:col-span-1 space-y-3">
          {/* Patient search */}
          <div className="card p-0 overflow-hidden">
            <div className="p-3 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pacientes</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="input-field pl-8 py-1.5 text-sm"
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
                        {Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600000))} anos
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Assessments list */}
          {selectedPatient && (
            <div className="card p-0 overflow-hidden">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Avaliações</p>
                <button onClick={handleNewAssessment} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Nova
                </button>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                {assessments.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <Brain className="w-6 h-6 mx-auto mb-1 opacity-30" />
                    <p className="text-xs">Nenhuma avaliação</p>
                  </div>
                ) : (
                  assessments.map(a => (
                    <button
                      key={a.id}
                      onClick={() => loadAssessment(a)}
                      className={`w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-slate-50 hover:bg-blue-50 transition-colors ${selectedAssessment?.id === a.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${typeColors[a.type]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900">{typeLabels[a.type]}</p>
                        <p className="text-xs text-slate-400">{format(new Date(a.assessDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${a.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {a.status === 'COMPLETED' ? 'Concluído' : 'Rascunho'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right panel - assessment form / results */}
        <div className="xl:col-span-3">
          {!selectedPatient ? (
            <div className="card flex-1 flex flex-col items-center justify-center text-center py-16">
              <Brain className="w-16 h-16 text-slate-200 mb-4" />
              <p className="text-slate-400 font-medium text-lg">Selecione um paciente</p>
              <p className="text-slate-400 text-sm">para iniciar uma correção de laudo</p>
            </div>
          ) : !creating ? (
            <div className="card flex flex-col items-center justify-center text-center py-16">
              <User className="w-12 h-12 text-blue-200 mb-4" />
              <p className="text-slate-700 font-semibold text-lg">{selectedPatient.name}</p>
              <p className="text-slate-400 text-sm mb-6">{assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''} registrada{assessments.length !== 1 ? 's' : ''}</p>
              <button onClick={handleNewAssessment} className="btn-primary">
                <Plus className="w-4 h-4" />
                Nova Avaliação
              </button>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {/* Form header */}
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">
                    {selectedAssessment ? 'Editar Avaliação' : 'Nova Avaliação'} — {selectedPatient.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{config.fullName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAssessment && (
                    <button
                      onClick={() => deleteMutation.mutate(selectedAssessment.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setCreating(false); setSelectedAssessment(null) }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                {/* Test type selector */}
                <div>
                  <p className="label mb-2">Tipo de Avaliação</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(CONFIGS).map(([key, cfg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { setAssessmentType(key); resetForm() }}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${assessmentType === key ? `border-blue-500 bg-blue-50` : 'border-slate-200 hover:border-slate-300'}`}
                      >
                        <p className={`font-bold text-sm ${assessmentType === key ? 'text-blue-700' : 'text-slate-700'}`}>{cfg.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-tight">{cfg.ageRange}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Patient info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Data da Avaliação</label>
                    <input type="date" value={assessDate} onChange={e => setAssessDate(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="label">Idade do Paciente</label>
                    <input
                      type="number"
                      value={patientAge}
                      onChange={e => setPatientAge(e.target.value)}
                      placeholder="anos"
                      className="input-field"
                      min="1"
                      max="120"
                    />
                  </div>
                </div>

                {/* Subtest score entry */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-slate-500" />
                    Pontuações dos Subtestes
                    <span className="text-xs text-slate-400 font-normal">(pontua escalar: 1–19)</span>
                  </p>

                  {config.groups.map(group => {
                    const gColors = groupColors[group.color] || groupColors.blue
                    const isExpanded = expandedGroups[group.index] !== false
                    const sum = getSumForGroup(group)

                    return (
                      <div key={group.index} className={`border ${gColors.border} rounded-xl overflow-hidden`}>
                        <button
                          type="button"
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left ${gColors.bg} hover:brightness-95 transition-colors`}
                          onClick={() => setExpandedGroups(prev => ({ ...prev, [group.index]: !isExpanded }))}
                        >
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gColors.badge}`}>{group.shortLabel}</span>
                          <span className={`font-semibold text-sm ${gColors.text}`}>{group.label}</span>
                          <span className="ml-auto flex items-center gap-2">
                            {sum !== null && (
                              <span className="text-xs text-slate-500">Σ = {sum}</span>
                            )}
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="px-4 py-3 space-y-2">
                            {group.subtests.map(sub => (
                              <div key={sub.key} className="flex items-center gap-3">
                                <label className={`flex-1 text-sm ${sub.supplemental ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                                  {sub.label}
                                  {sub.supplemental && <span className="ml-1 text-xs">(suplementar)</span>}
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max="19"
                                  value={subtestScores[sub.key] ?? ''}
                                  onChange={e => setSubtestScores(prev => ({ ...prev, [sub.key]: e.target.value }))}
                                  className="w-16 text-center input-field py-1.5 text-sm font-mono"
                                  placeholder="—"
                                />
                                {subtestScores[sub.key] && !isNaN(parseFloat(subtestScores[sub.key])) && (
                                  <span className={`text-xs font-medium w-28 ${classifySubtest(parseFloat(subtestScores[sub.key])).color}`}>
                                    {classifySubtest(parseFloat(subtestScores[sub.key])).label}
                                  </span>
                                )}
                              </div>
                            ))}

                            {/* Composite score for this index */}
                            <div className={`mt-3 pt-3 border-t ${gColors.border} flex items-center gap-3`}>
                              <label className={`flex-1 text-sm font-bold ${gColors.text}`}>
                                Escore Composto {group.shortLabel}
                                <span className="ml-1 text-xs font-normal text-slate-400">(tabela normativa)</span>
                              </label>
                              <input
                                type="number"
                                min="40"
                                max="160"
                                value={compositeScores[group.index] ?? ''}
                                onChange={e => setCompositeScores(prev => ({ ...prev, [group.index]: e.target.value }))}
                                className={`w-16 text-center input-field py-1.5 text-sm font-bold font-mono border-2 ${gColors.border}`}
                                placeholder="—"
                              />
                              {compositeScores[group.index] && !isNaN(parseFloat(compositeScores[group.index])) && (
                                <div>
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${classifyScore(parseFloat(compositeScores[group.index])).bg} ${classifyScore(parseFloat(compositeScores[group.index])).color}`}>
                                    {classifyScore(parseFloat(compositeScores[group.index])).label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Extra composites (QIV, QIE, QIT) */}
                  <div className="border border-slate-300 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <p className="font-semibold text-sm text-slate-700">Escores Globais</p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {config.mainComposites
                        .filter(c => !config.groups.find(g => g.index === c))
                        .concat([config.compositeLabel])
                        .filter((c, i, arr) => arr.indexOf(c) === i)
                        .map(composite => (
                          <div key={composite} className="flex items-center gap-3">
                            <label className="flex-1 text-sm font-semibold text-slate-700">{composite}</label>
                            <input
                              type="number"
                              min="40"
                              max="160"
                              value={compositeScores[composite] ?? ''}
                              onChange={e => setCompositeScores(prev => ({ ...prev, [composite]: e.target.value }))}
                              className="w-16 text-center input-field py-1.5 text-sm font-bold font-mono border-2 border-slate-300"
                              placeholder="—"
                            />
                            {compositeScores[composite] && !isNaN(parseFloat(compositeScores[composite])) && (
                              <div className="flex items-center gap-2 min-w-0">
                                <ScoreBar score={parseFloat(compositeScores[composite])} />
                                <span className={`text-xs font-semibold shrink-0 ${classifyScore(parseFloat(compositeScores[composite])).color}`}>
                                  {classifyScore(parseFloat(compositeScores[composite])).label}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Results summary */}
                {Object.keys(compositeScores).some(k => compositeScores[k] && !isNaN(parseFloat(compositeScores[k]))) && (
                  <div className="border border-blue-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                      <p className="font-semibold text-sm text-blue-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Resumo dos Resultados
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {Object.entries(compositeScores)
                        .filter(([, v]) => v && !isNaN(parseFloat(v)))
                        .map(([key, val]) => {
                          const score = parseFloat(val)
                          const cls = classifyScore(score)
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="w-16 text-xs font-bold text-slate-600">{key}</span>
                              <div className="flex-1">
                                <ScoreBar score={score} />
                              </div>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls.bg} ${cls.color}`}>
                                {cls.label}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Interpretation */}
                <div>
                  <label className="label">Interpretação Clínica</label>
                  <textarea
                    value={interpretation}
                    onChange={e => setInterpretation(e.target.value)}
                    rows={5}
                    className="input-field resize-none"
                    placeholder="Descreva a interpretação dos resultados, pontos de atenção, recomendações clínicas..."
                  />
                </div>

                <div>
                  <label className="label">Observações Adicionais</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Comportamento durante a avaliação, condições do exame, informações complementares..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSave('DRAFT')}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Rascunho
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave('COMPLETED')}
                    disabled={saveMutation.isPending}
                    className="btn-primary flex-1"
                  >
                    {saveMutation.isPending ? (
                      <span className="flex items-center gap-2 justify-center">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Salvando...
                      </span>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" />Concluir Avaliação</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium text-sm transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Print-only report */}
      <div ref={printRef} className="print-only p-8 space-y-6">
        <div className="flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ClinIQ Pro</h1>
            <p className="text-slate-500 text-sm">Gestão Clínica Inteligente</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-900">{config?.label || ''} — Laudo Psicológico</p>
            <p className="text-slate-500 text-sm">{config?.fullName || ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border border-slate-200 rounded-lg p-4 text-sm">
          <div><span className="font-semibold">Paciente:</span> {selectedPatient?.name}</div>
          <div><span className="font-semibold">Idade:</span> {patientAge ? `${patientAge} anos` : '—'}</div>
          <div><span className="font-semibold">Data:</span> {assessDate ? format(new Date(assessDate), 'dd/MM/yyyy') : '—'}</div>
          <div><span className="font-semibold">Profissional:</span> {user?.name}</div>
          <div><span className="font-semibold">{user?.certType || 'CRP'}:</span> {user?.certNumber || user?.crm || '—'}</div>
          <div><span className="font-semibold">Especialidade:</span> {user?.specialty || '—'}</div>
        </div>

        <div>
          <h2 className="font-bold text-slate-900 mb-3">Resultados — Escores Compostos</h2>
          <table className="w-full text-sm border-collapse border border-slate-300">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-300 px-3 py-2 text-left">Índice / Composto</th>
                <th className="border border-slate-300 px-3 py-2 text-center">Escore</th>
                <th className="border border-slate-300 px-3 py-2 text-left">Classificação</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(compositeScores)
                .filter(([, v]) => v && !isNaN(parseFloat(v)))
                .map(([key, val]) => {
                  const score = parseFloat(val)
                  return (
                    <tr key={key}>
                      <td className="border border-slate-300 px-3 py-2 font-medium">{key}</td>
                      <td className="border border-slate-300 px-3 py-2 text-center font-bold">{score}</td>
                      <td className="border border-slate-300 px-3 py-2">{classifyScore(score).label}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {interpretation && (
          <div>
            <h2 className="font-bold text-slate-900 mb-2">Interpretação Clínica</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{interpretation}</p>
          </div>
        )}

        {notes && (
          <div>
            <h2 className="font-bold text-slate-900 mb-2">Observações</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-sm">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-8" />
            <p className="font-semibold">{user?.name}</p>
            <p className="text-slate-500">{user?.specialty}</p>
            <p className="text-slate-500">{user?.certType}: {user?.certNumber || user?.crm}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-8" />
            <p className="font-semibold">Data e Assinatura</p>
            <p className="text-slate-500">______/______/______</p>
          </div>
        </div>
      </div>
    </div>
  )
}
