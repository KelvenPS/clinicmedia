import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'

interface FinancialCategory {
  id: string
  name: string
  type: 'INCOME' | 'EXPENSE'
  color: string
  createdAt: string
}

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const DEFAULT_INCOME_CATS = ['Consulta', 'Retorno', 'Exame', 'Procedimento', 'Plano de Saúde']
const DEFAULT_EXPENSE_CATS = ['Material', 'Equipamento', 'Aluguel', 'Salário', 'Impostos', 'Marketing']

function CategoryForm({
  category,
  onSubmit,
  loading,
}: {
  category: FinancialCategory | null
  onSubmit: (data: { name: string; type: 'INCOME' | 'EXPENSE'; color: string }) => void
  loading: boolean
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(category?.type ?? 'INCOME')
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[0])

  const suggestions = type === 'INCOME' ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Nome obrigatório'); return }
    onSubmit({ name: name.trim(), type, color })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Tipo *</label>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {[
            { value: 'INCOME', label: 'Receita', active: 'bg-emerald-500 text-white' },
            { value: 'EXPENSE', label: 'Despesa', active: 'bg-red-500 text-white' },
          ].map(({ value, label, active }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value as 'INCOME' | 'EXPENSE')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${type === value ? active : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Nome *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input-field"
          placeholder="Ex: Consulta particular"
          autoFocus
        />
        {/* Suggestions */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Cor</label>
        <div className="flex items-center gap-2 mt-1">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-8 h-8 rounded-full cursor-pointer border-0 p-0.5 bg-transparent"
            title="Cor personalizada"
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
        {loading ? (
          <span className="flex items-center gap-2 justify-center">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Salvando...
          </span>
        ) : category ? 'Atualizar Categoria' : 'Criar Categoria'}
      </button>
    </form>
  )
}

export default function FinanceiroCategorias() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<FinancialCategory | null>(null)

  const { data: categories = [], isLoading } = useQuery<FinancialCategory[]>({
    queryKey: ['financial-categories'],
    queryFn: () => api.get('/financial/categories').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; type: 'INCOME' | 'EXPENSE'; color: string }) =>
      editItem
        ? api.put(`/financial/categories/${editItem.id}`, data)
        : api.post('/financial/categories', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-categories'] })
      toast.success(editItem ? 'Categoria atualizada!' : 'Categoria criada!')
      setModalOpen(false)
      setEditItem(null)
    },
    onError: () => toast.error('Erro ao salvar categoria'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-categories'] })
      toast.success('Categoria removida')
    },
    onError: () => toast.error('Erro ao remover categoria'),
  })

  const income = categories.filter(c => c.type === 'INCOME')
  const expense = categories.filter(c => c.type === 'EXPENSE')

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Categorias Financeiras"
        subtitle="Organize receitas e despesas por categorias personalizadas"
        actions={
          <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nova Categoria
          </button>
        }
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <Tag className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-semibold">Nenhuma categoria criada</p>
            <p className="text-slate-400 text-sm mt-1">Crie categorias para organizar suas transações</p>
            <button onClick={() => { setEditItem(null); setModalOpen(true) }} className="mt-4 btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" />
              Nova Categoria
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income categories */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/50">
              <h2 className="font-semibold text-emerald-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Categorias de Receita
                <span className="ml-auto text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{income.length}</span>
              </h2>
            </div>
            {income.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-slate-400 text-sm">Nenhuma categoria de receita</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {income.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50/60 transition-colors group">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <p className="flex-1 text-sm font-medium text-slate-900">{cat.name}</p>
                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Receita</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditItem(cat); setModalOpen(true) }}
                        className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remover esta categoria?')) deleteMutation.mutate(cat.id) }}
                        className="btn-icon w-7 h-7 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense categories */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-red-50/50">
              <h2 className="font-semibold text-red-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Categorias de Despesa
                <span className="ml-auto text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{expense.length}</span>
              </h2>
            </div>
            {expense.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-slate-400 text-sm">Nenhuma categoria de despesa</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {expense.map(cat => (
                  <div key={cat.id} className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50/60 transition-colors group">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <p className="flex-1 text-sm font-medium text-slate-900">{cat.name}</p>
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Despesa</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditItem(cat); setModalOpen(true) }}
                        className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remover esta categoria?')) deleteMutation.mutate(cat.id) }}
                        className="btn-icon w-7 h-7 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null) }}
        title={editItem ? 'Editar Categoria' : 'Nova Categoria'}
      >
        <CategoryForm
          category={editItem}
          onSubmit={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
