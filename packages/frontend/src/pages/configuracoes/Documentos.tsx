import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Edit2, FileText, Upload, CheckCircle, XCircle, Download,
  Send, Search, User, Info, ChevronRight, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { DocumentTemplate, Patient } from '../../types'
import Modal from '../../components/ui/Modal'

const DOC_TYPES = [
  { value: 'ATESTADO',    label: 'Atestado Médico', icon: '📋', color: 'text-blue-700',    bg: 'bg-blue-50'   },
  { value: 'DECLARACAO',  label: 'Declaração',      icon: '📄', color: 'text-purple-700',  bg: 'bg-purple-50' },
  { value: 'RECIBO',      label: 'Recibo',          icon: '🧾', color: 'text-emerald-700', bg: 'bg-emerald-50'},
  { value: 'COMPROVANTE', label: 'Comprovante',     icon: '✅', color: 'text-amber-700',   bg: 'bg-amber-50'  },
  { value: 'OUTROS',      label: 'Outros',          icon: '📁', color: 'text-slate-700',   bg: 'bg-slate-50'  },
]

const schema = z.object({
  name:    z.string().min(1, 'Nome obrigatório'),
  type:    z.enum(['ATESTADO', 'DECLARACAO', 'RECIBO', 'COMPROVANTE', 'OUTROS']),
  content: z.string(),
})

type FormData = z.infer<typeof schema>

// Variáveis fixas que podem ser inseridas manualmente no editor de template
const TEMPLATE_VARIABLES = [
  { key: '{{paciente}}',              label: 'Nome do Paciente',      auto: true  },
  { key: '{{medico}}',                label: 'Nome do Médico',        auto: true  },
  { key: '{{crm}}',                   label: 'CRM / CRP',             auto: true  },
  { key: '{{especialidade}}',         label: 'Especialidade',         auto: true  },
  { key: '{{data_hoje}}',             label: 'Data Atual',            auto: true  },
  { key: '{{cpf_contratante}}',       label: 'CPF do Paciente',       auto: true  },
  { key: '{{rg_contratante}}',        label: 'RG do Paciente',        auto: true  },
  { key: '{{endereco_contratante}}',  label: 'Endereço do Paciente',  auto: true  },
]

// Label amigável para variável custom não reconhecida
function varLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function DocForm({ doc, onSubmit, loading }: {
  doc: DocumentTemplate | null
  onSubmit: (d: FormData) => void
  loading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:    doc?.name    || '',
      type:    doc?.type    || 'ATESTADO',
      content: doc?.content || '',
    },
  })

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setValue('content', ev.target?.result as string || '')
    reader.readAsText(file)
    toast.success(`Arquivo "${file.name}" importado`)
  }

  const insertVar = (v: string) => {
    const ta = document.getElementById('doc-content') as HTMLTextAreaElement
    const start = ta.selectionStart
    const current = ta.value
    setValue('content', current.slice(0, start) + v + current.slice(start))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length) }, 0)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nome do documento *</label>
          <input {...register('name')} className="input-field" placeholder="Ex: Atestado padrão 2 dias" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Tipo *</label>
          <select {...register('type')} className="input-field">
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Conteúdo do documento</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" onChange={handleImport} className="hidden" />
        </div>

        {/* Variáveis disponíveis para inserção */}
        <div className="mb-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-2">
            Variáveis automáticas (clique para inserir no cursor):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVar(v.key)}
                className="group flex items-center gap-1 text-xs bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 px-2 py-1 rounded-lg font-mono transition-colors"
                title={v.label}
              >
                {v.key}
                <span className="text-slate-400 group-hover:text-blue-400 font-sans non-mono text-[10px]">
                  {v.label}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Você também pode criar variáveis customizadas usando{' '}
            <code className="bg-white border border-slate-200 px-1 rounded text-[11px]">{'{{nome_da_variavel}}'}</code>{' '}
            — o sistema vai pedir o valor ao enviar.
          </p>
        </div>

        <textarea
          id="doc-content"
          {...register('content')}
          rows={12}
          className="input-field resize-none font-mono text-sm"
          placeholder={'Digite o conteúdo. Use {{variavel}} para campos dinâmicos.\nExemplo: Atesto que {{paciente}} esteve em consulta em {{data_hoje}}.'}
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : doc ? 'Atualizar Documento' : 'Salvar Documento'}
      </button>
    </form>
  )
}

export default function Documentos() {
  const qc = useQueryClient()
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editDoc,    setEditDoc]    = useState<DocumentTemplate | null>(null)
  const [filterType, setFilterType] = useState('')

  // Estado do modal de emissão
  const [emitDoc,         setEmitDoc]         = useState<DocumentTemplate | null>(null)
  const [patientSearch,   setPatientSearch]   = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({})

  // ─── Queries ──────────────────────────────────────────────────────────────────
  const { data: docs = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ['documents'],
    queryFn:  () => api.get('/documents').then(r => r.data),
  })

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['patients-list'],
    queryFn:  () => api.get('/patients').then(r => r.data),
    enabled:  !!emitDoc,
    staleTime: 60_000,
  })

  // Detecta variáveis do template selecionado para emissão
  const { data: varsData, isFetching: varsFetching } = useQuery<{
    allVars: string[]; systemVars: string[]; customVars: string[]
  }>({
    queryKey: ['doc-variables', emitDoc?.id],
    queryFn:  () => api.get(`/documents/${emitDoc!.id}/variables`).then(r => r.data),
    enabled:  !!emitDoc,
  })

  // ─── Mutations ────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editDoc ? api.put(`/documents/${editDoc.id}`, data) : api.post('/documents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success(editDoc ? 'Documento atualizado!' : 'Documento criado!')
      setModalOpen(false); setEditDoc(null)
    },
    onError: () => toast.error('Erro ao salvar documento'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/documents/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Status alterado') },
  })

  const emitMutation = useMutation({
    mutationFn: ({ docId, patientId, variables }: { docId: string; patientId: string; variables: Record<string, string> }) =>
      api.post(`/documents/${docId}/emit`, { patientId, variables }),
    onSuccess: () => {
      toast.success('Documento enviado via WhatsApp!')
      closeEmitModal()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Erro ao enviar documento'
      toast.error(msg)
    },
  })

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const closeEmitModal = () => {
    setEmitDoc(null); setSelectedPatient(null)
    setPatientSearch(''); setCustomVarValues({})
  }

  const filteredPatients = patientSearch.length >= 2
    ? patients.filter(p =>
        p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
        (p.phone ?? '').includes(patientSearch)
      ).slice(0, 20)
    : []

  const displayed = docs.filter(d => !filterType || d.type === filterType)

  const exportDoc = (doc: DocumentTemplate) => {
    const blob = new Blob([doc.content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${doc.name}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleSendDoc = () => {
    if (!emitDoc || !selectedPatient) return
    emitMutation.mutate({
      docId:     emitDoc.id,
      patientId: selectedPatient.id,
      variables: customVarValues,
    })
  }

  const canSend = !!selectedPatient?.phone && !emitMutation.isPending

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-6 page-stagger">
      <div className="flex items-start justify-between">
        <div className="animate-stagger-1">
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">Templates de atestados, declarações, recibos e comprovantes</p>
        </div>
        <button onClick={() => { setEditDoc(null); setModalOpen(true) }} className="btn-primary animate-stagger-1">
          <Plus className="w-4 h-4" />
          Novo Documento
        </button>
      </div>

      {/* Filtros por tipo */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${!filterType ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
        >
          Todos ({docs.length})
        </button>
        {DOC_TYPES.map(t => {
          const count = docs.filter(d => d.type === t.value).length
          if (count === 0) return null
          return (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${filterType === t.value ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
            >
              {t.icon} {t.label} ({count})
            </button>
          )
        })}
      </div>

      {displayed.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">Nenhum documento cadastrado</p>
          <button onClick={() => setModalOpen(true)} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
            Criar primeiro documento
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {displayed.map(doc => {
              const tc = DOC_TYPES.find(t => t.value === doc.type)!
              return (
                <div key={doc.id} className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors ${!doc.active ? 'opacity-60' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${tc.bg}`}>
                    {tc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{doc.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                      {!doc.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativo</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.content.slice(0, 80)}...</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEmitDoc(doc); setSelectedPatient(null); setPatientSearch(''); setCustomVarValues({}) }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Enviar para Paciente via WhatsApp"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => exportDoc(doc)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Exportar .txt"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditDoc(doc); setModalOpen(true) }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(doc.id)}
                      className={`p-1.5 rounded-lg transition-colors ${doc.active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      {doc.active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal: Criar / Editar template */}
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditDoc(null) }}
        title={editDoc ? 'Editar Documento' : 'Novo Documento'}
        size="lg"
      >
        <DocForm doc={editDoc} onSubmit={(data) => saveMutation.mutate(data)} loading={saveMutation.isPending} />
      </Modal>

      {/* Modal: Enviar documento para paciente via WhatsApp */}
      <Modal
        isOpen={!!emitDoc}
        onClose={closeEmitModal}
        title="Enviar Documento via WhatsApp"
        size="md"
      >
        {emitDoc && (
          <div className="space-y-5">
            {/* Info do documento */}
            <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-xl border border-rose-100">
              <FileText className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">{emitDoc.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  O conteúdo completo do documento será enviado ao paciente via WhatsApp com as variáveis preenchidas.
                </p>
              </div>
            </div>

            {/* Seleção de paciente */}
            <div>
              <label className="label">Paciente destinatário</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null) }}
                  className="input-field pl-9"
                  placeholder="Buscar por nome ou telefone (mín. 2 caracteres)"
                  autoFocus
                />
              </div>

              {filteredPatients.length > 0 && (
                <div className="mt-1.5 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto shadow-sm">
                  {filteredPatients.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPatient(p); setPatientSearch(p.name) }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${selectedPatient?.id === p.id ? 'bg-rose-50' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-rose-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.phone || 'Sem telefone'}</p>
                      </div>
                      {selectedPatient?.id === p.id && (
                        <CheckCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedPatient && !selectedPatient.phone && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">
                  Este paciente não tem telefone cadastrado e não pode receber o documento.
                </p>
              )}
            </div>

            {/* Variáveis de sistema (informativo) */}
            {varsFetching && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando variáveis do template...
              </div>
            )}

            {varsData && (
              <>
                {varsData.systemVars.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      <p className="text-xs font-semibold text-blue-700">Variáveis preenchidas automaticamente</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {varsData.systemVars.map(v => (
                        <span key={v} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-md font-mono">
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variáveis custom que precisam de preenchimento */}
                {varsData.customVars.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-semibold text-slate-700">
                        Preencha as variáveis customizadas
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      {varsData.customVars.map(v => (
                        <div key={v}>
                          <label className="label text-xs">
                            <code className="font-mono bg-slate-100 px-1 rounded">{`{{${v}}}`}</code>
                            {' — '}{varLabel(v)}
                          </label>
                          <input
                            type="text"
                            className="input-field text-sm"
                            placeholder={`Valor para ${varLabel(v)}`}
                            value={customVarValues[v] ?? ''}
                            onChange={e => setCustomVarValues(prev => ({ ...prev, [v]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {varsData.customVars.length === 0 && varsData.systemVars.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-1">
                    Nenhuma variável detectada no template.
                  </p>
                )}
              </>
            )}

            {/* Ações */}
            <div className="flex gap-3 pt-1">
              <button onClick={closeEmitModal} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                disabled={!canSend}
                onClick={handleSendDoc}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {emitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" />Enviar documento</>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
