import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  TrendingUp,
  Download,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import type { Transaction, FinancialResponse, User } from '../../types'
import Modal from '../../components/ui/Modal'
import TransactionForm from '../../components/Financial/TransactionForm'
import PageHeader from '../../components/ui/PageHeader'

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const PAGE_SIZE = 50

export default function Receitas() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const { data: financialData, isLoading } = useQuery<FinancialResponse>({
    queryKey: ['financial-receitas', startDate, endDate, filterStatus],
    queryFn: () =>
      api.get('/financial', {
        params: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
          type: 'INCOME',
          ...(filterStatus && { status: filterStatus }),
        },
      }).then(r => r.data),
  })

  const { data: doctors = [] } = useQuery<User[]>({
    queryKey: ['doctors'],
    queryFn: () => api.get('/doctors').then(r => r.data),
    enabled: user?.role === 'ADMIN',
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      editTx ? api.put(`/financial/${editTx.id}`, data) : api.post('/financial', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-receitas'] })
      toast.success(editTx ? 'Receita atualizada!' : 'Receita adicionada!')
      setModalOpen(false)
      setEditTx(null)
    },
    onError: () => toast.error('Erro ao salvar receita'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-receitas'] })
      toast.success('Receita removida')
    },
  })

  const allTransactions = financialData?.transactions ?? []

  const filtered = allTransactions.filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return tx.description.toLowerCase().includes(q) || (tx.category?.toLowerCase().includes(q) ?? false)
  })

  const totalReceived = allTransactions.filter(t => t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const totalPending = allTransactions.filter(t => t.status === 'PENDING').reduce((s, t) => s + t.amount, 0)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const exportCSV = () => {
    const rows = [
      ['Data', 'Descrição', 'Categoria', 'Valor', 'Status'].join(';'),
      ...filtered.map(tx => [
        format(new Date(tx.date), 'dd/MM/yyyy'),
        `"${tx.description}"`,
        tx.category ?? '',
        tx.amount.toFixed(2).replace('.', ','),
        tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado',
      ].join(';')),
    ].join('\n')
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receitas-${startDate}-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Receitas"
        subtitle="Todas as entradas e receitas financeiras"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="btn-secondary">
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button onClick={() => { setEditTx(null); setModalOpen(true) }} className="btn-primary">
              <Plus className="w-4 h-4" />
              Nova Receita
            </button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total do Período</p>
              <p className="text-xl font-bold text-emerald-600 mt-1 leading-none">{currency(financialData?.summary?.income ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Recebido</p>
              <p className="text-xl font-bold text-emerald-600 mt-1 leading-none">{currency(totalReceived)}</p>
            </div>
          </div>
        </div>
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
              <Clock className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">A Receber</p>
              <p className="text-xl font-bold text-amber-600 mt-1 leading-none">{currency(totalPending)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar receita..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="input-field pl-9"
            />
          </div>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(0) }}
            className="input-field py-2 text-sm"
          />
          <span className="text-slate-400 text-sm">até</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(0) }}
            className="input-field py-2 text-sm"
          />
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
            className="input-field py-2 text-sm"
          >
            <option value="">Status: Todos</option>
            <option value="PAID">Pago</option>
            <option value="PENDING">Pendente</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Receitas</h2>
            <p className="text-xs text-slate-400 mt-0.5">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Anterior</button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-secondary py-1 px-3 text-xs disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="table-head-cell">Data</th>
                  <th className="table-head-cell">Descrição</th>
                  <th className="table-head-cell hidden lg:table-cell">Categoria</th>
                  <th className="table-head-cell text-right">Valor</th>
                  <th className="table-head-cell">Status</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state py-12">
                        <TrendingUp className="w-10 h-10 text-slate-300 mb-3" />
                        <p className="text-slate-500 font-semibold">Nenhuma receita encontrada</p>
                        <button onClick={() => { setEditTx(null); setModalOpen(true) }} className="mt-4 btn-primary text-xs">
                          <Plus className="w-3.5 h-3.5" /> Nova Receita
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((tx, idx) => (
                    <tr key={tx.id} className="table-row group" style={{ animationDelay: `${idx * 0.02}s` }}>
                      <td className="table-cell text-slate-600 tabular-nums whitespace-nowrap">
                        {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="table-cell max-w-[220px]">
                        <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                        {tx.appointment?.patient && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{tx.appointment.patient.name}</p>
                        )}
                      </td>
                      <td className="table-cell hidden lg:table-cell">
                        {tx.category && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                            {tx.category}
                          </span>
                        )}
                      </td>
                      <td className="table-cell font-bold text-right text-emerald-600 tabular-nums whitespace-nowrap">
                        +{currency(tx.amount)}
                      </td>
                      <td className="table-cell">
                        <span className={`status-badge gap-1.5 ${
                          tx.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : tx.status === 'PENDING' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'PAID' ? 'bg-emerald-500' : tx.status === 'PENDING' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                          {tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditTx(tx); setModalOpen(true) }} className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { if (confirm('Remover esta receita?')) deleteMutation.mutate(tx.id) }}
                            className="btn-icon w-7 h-7 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTx(null) }}
        title={editTx ? 'Editar Receita' : 'Nova Receita'}
      >
        <TransactionForm
          transaction={editTx}
          doctors={doctors}
          currentUser={user}
          onSubmit={(data) => saveMutation.mutate({ ...data as Record<string, unknown>, type: 'INCOME' })}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
