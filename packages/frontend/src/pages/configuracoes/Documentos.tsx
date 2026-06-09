import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, FileText, Upload, CheckCircle, XCircle, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import type { DocumentTemplate } from '../../types'
import Modal from '../../components/ui/Modal'

const DOC_TYPES = [
  { value: 'ATESTADO', label: 'Atestado Médico', icon: '📋', color: 'text-blue-700', bg: 'bg-blue-50' },
  { value: 'DECLARACAO', label: 'Declaração', icon: '📄', color: 'text-purple-700', bg: 'bg-purple-50' },
  { value: 'RECIBO', label: 'Recibo', icon: '🧾', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { value: 'COMPROVANTE', label: 'Comprovante', icon: '✅', color: 'text-amber-700', bg: 'bg-amber-50' },
  { value: 'OUTROS', label: 'Outros', icon: '📁', color: 'text-slate-700', bg: 'bg-slate-50' },
]

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['ATESTADO', 'DECLARACAO', 'RECIBO', 'COMPROVANTE', 'OUTROS']),
  content: z.string(),
})

type FormData = z.infer<typeof schema>

const VARIABLES = ['{{paciente}}', '{{medico}}', '{{data}}', '{{crm}}', '{{especialidade}}', '{{dias}}']

function DocForm({ doc, onSubmit, loading }: {
  doc: DocumentTemplate | null
  onSubmit: (d: FormData) => void
  loading: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: doc?.name || '',
      type: doc?.type || 'ATESTADO',
      content: doc?.content || '',
    },
  })

  const watchType = watch('type')

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
    const next = current.slice(0, start) + v + current.slice(start)
    setValue('content', next)
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
            Importar arquivo .txt
          </button>
          <input ref={fileRef} type="file" accept=".txt" onChange={handleImport} className="hidden" />
        </div>

        <div className="flex flex-wrap gap-1 mb-2">
          {VARIABLES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="text-xs bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 px-2 py-0.5 rounded font-mono transition-colors"
            >
              {v}
            </button>
          ))}
        </div>

        <textarea
          id="doc-content"
          {...register('content')}
          rows={10}
          className="input-field resize-none font-mono text-sm"
          placeholder="Digite o conteúdo do documento. Use as variáveis acima para campos dinâmicos."
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
  const [modalOpen, setModalOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<DocumentTemplate | null>(null)
  const [filterType, setFilterType] = useState('')

  const { data: docs = [] } = useQuery<DocumentTemplate[]>({
    queryKey: ['documents'],
    queryFn: () => api.get('/documents').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      editDoc ? api.put(`/documents/${editDoc.id}`, data) : api.post('/documents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.success(editDoc ? 'Documento atualizado!' : 'Documento criado!')
      setModalOpen(false)
      setEditDoc(null)
    },
    onError: () => toast.error('Erro ao salvar documento'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/documents/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Status alterado') },
  })

  const displayed = docs.filter(d => !filterType || d.type === filterType)

  const exportDoc = (doc: DocumentTemplate) => {
    const blob = new Blob([doc.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl space-y-6 animate-page-enter">
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

      {/* Filter */}
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
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{doc.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                      {!doc.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inativo</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{doc.content.slice(0, 80)}...</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => exportDoc(doc)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Exportar"
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

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditDoc(null) }}
        title={editDoc ? 'Editar Documento' : 'Novo Documento'}
        size="lg"
      >
        <DocForm doc={editDoc} onSubmit={(data) => saveMutation.mutate(data)} loading={saveMutation.isPending} />
      </Modal>
    </div>
  )
}
