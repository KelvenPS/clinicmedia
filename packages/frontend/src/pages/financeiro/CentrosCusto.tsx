import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'

interface CostCenter {
  id: string
  name: string
  description?: string | null
  createdAt: string
}

function CostCenterForm({
  costCenter,
  onSubmit,
  loading,
}: {
  costCenter: CostCenter | null
  onSubmit: (data: { name: string; description?: string }) => void
  loading: boolean
}) {
  const [name, setName] = useState(costCenter?.name ?? '')
  const [description, setDescription] = useState(costCenter?.description ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Nome obrigatório'); return }
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nome *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input-field"
          placeholder="Ex: Administrativo, Clínico, Marketing"
          autoFocus
        />
      </div>

      <div>
        <label className="label">Descrição</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="input-field resize-none"
          rows={3}
          placeholder="Descrição opcional do centro de custo..."
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : costCenter ? 'Atualizar Centro de Custo' : 'Criar Centro de Custo'}
      </button>
    </form>
  )
}

export default function CentrosCusto() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CostCenter | null>(null)

  const { data: centers = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers'],
    queryFn: () => api.get('/financial/cost-centers').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      editItem
        ? api.put(`/financial/cost-centers/${editItem.id}`, data)
        : api.post('/financial/cost-centers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-centers'] })
      toast.success(editItem ? 'Centro atualizado!' : 'Centro criado!')
      setModalOpen(false)
      setEditItem(null)
    },
    onError: () => toast.error('Erro ao salvar centro de custo'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/cost-centers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-centers'] })
      toast.success('Centro de custo removido')
    },
    onError: () => toast.error('Erro ao remover centro de custo'),
  })

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Centros de Custo"
        subtitle="Agrupe despesas por departamento ou área de responsabilidade"
        actions={
          <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo Centro de Custo
          </button>
        }
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : centers.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <Layers className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">Nenhum centro de custo cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">Crie centros de custo para classificar suas despesas</p>
            <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="mt-4 btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" />
              Novo Centro de Custo
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="table-head-cell">Nome</th>
                  <th className="table-head-cell hidden md:table-cell">Descrição</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {centers.map((center, idx) => (
                  <tr key={center.id} className="table-row group" style={{ animationDelay: `${idx * 0.03}s` }}>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <Layers className="w-4 h-4 text-violet-600" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">{center.name}</p>
                      </div>
                    </td>
                    <td className="table-cell text-slate-500 text-sm hidden md:table-cell max-w-[300px]">
                      <p className="truncate">{center.description ?? <span className="text-slate-300">Sem descrição</span>}</p>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditItem(center); setModalOpen(true) }}
                          className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm('Remover este centro de custo?')) deleteMutation.mutate(center.id) }}
                          className="btn-icon w-7 h-7 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        title={editItem ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
      >
        <CostCenterForm
          costCenter={editItem}
          onSubmit={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
