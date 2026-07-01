import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
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

export default function Extrato() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [defaultType, setDefaultType] = useState<'INCOME' | 'EXPENSE'>('INCOME')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const { data: financialData, isLoading } = useQuery<FinancialResponse>({
    queryKey: ['financial-extrato', startDate, endDate, filterType, filterStatus],
    queryFn: () =>
      api.get('/financial', {
        params: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
          ...(filterType && { type: filterType }),
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
      qc.invalidateQueries({ queryKey: ['financial-extrato'] })
      toast.success(editTx ? 'Transação atualizada!' : 'Transação adicionada!')
      setModalOpen(false)
      setEditTx(null)
    },
    onError: () => toast.error('Erro ao salvar transação'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial-extrato'] })
      toast.success('Transação removida')
    },
    onError: () => toast.error('Erro ao remover transação'),
  })

  const allTransactions = financialData?.transactions ?? []

  const filtered = allTransactions.filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      tx.description.toLowerCase().includes(q) ||
      (tx.category?.toLowerCase().includes(q) ?? false) ||
      tx.doctor.name.toLowerCase().includes(q)
    )
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleNew = (type: 'INCOME' | 'EXPENSE') => {
    setEditTx(null)
    setDefaultType(type)
    setModalOpen(true)
  }

  const handleEdit = (tx: Transaction) => {
    setEditTx(tx)
    setModalOpen(true)
  }

  const exportCSV = () => {
    const rows = [
      ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status', 'Médico'].join(';'),
      ...filtered.map(tx => [
        format(new Date(tx.date), 'dd/MM/yyyy'),
        `"${tx.description}"`,
        tx.category ?? '',
        tx.type === 'INCOME' ? 'Receita' : 'Despesa',
        tx.amount.toFixed(2).replace('.', ','),
        tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado',
        tx.doctor.name,
      ].join(';')),
    ].join('\n')

    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extrato-${startDate}-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summary = financialData?.summary

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Extrato"
        subtitle="Todas as movimentações financeiras"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="btn-secondary">
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button onClick={() => handleNew('EXPENSE')} className="btn-secondary">
              <TrendingDown className="w-4 h-4" />
              Lançar Despesa
            </button>
            <button onClick={() => handleNew('INCOME')} className="btn-primary">
              <TrendingUp className="w-4 h-4" />
              Lançar Receita
            </button>
          </div>
        }
      />

      {/* Summary mini cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Receitas</p>
          <p className="text-lg font-bold text-emerald-600 tabular-nums">{currency(summary?.income ?? 0)}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Despesas</p>
          <p className="text-lg font-bold text-red-600 tabular-nums">{currency(summary?.expense ?? 0)}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Saldo</p>
          <p className={`text-lg font-bold tabular-nums ${(summary?.balance ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {currency(summary?.balance ?? 0)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, categoria ou médico..."
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
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(0) }}
            className="input-field py-2 text-sm"
          >
            <option value="">Tipo: Todos</option>
            <option value="INCOME">Receitas</option>
            <option value="EXPENSE">Despesas</option>
          </select>

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
            <h2 className="font-semibold text-slate-900">Transações</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary py-1 px-3 text-xs disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="table-head-cell">Data</th>
                  <th className="table-head-cell">Descrição</th>
                  <th className="table-head-cell hidden lg:table-cell">Categoria</th>
                  <th className="table-head-cell hidden md:table-cell">Tipo</th>
                  <th className="table-head-cell text-right">Valor</th>
                  <th className="table-head-cell">Status</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state py-12">
                        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                          <DollarSign className="w-7 h-7 text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-semibold">Nenhuma transação encontrada</p>
                        <p className="text-slate-400 text-sm mt-1">Ajuste os filtros ou adicione uma nova transação</p>
                        <button onClick={() => handleNew('INCOME')} className="mt-4 btn-primary text-xs">
                          <Plus className="w-3.5 h-3.5" />
                          Nova Transação
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
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                        </div>
                        {tx.appointment?.patient && (
                          <p className="text-xs text-slate-400 ml-4 mt-0.5 truncate">{tx.appointment.patient.name}</p>
                        )}
                      </td>
                      <td className="table-cell hidden lg:table-cell">
                        {tx.category && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                            {tx.category}
                          </span>
                        )}
                      </td>
                      <td className="table-cell hidden md:table-cell">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {tx.type === 'INCOME' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className={`table-cell font-bold text-right tabular-nums whitespace-nowrap ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.type === 'INCOME' ? '+' : '−'}{currency(tx.amount)}
                      </td>
                      <td className="table-cell">
                        <span className={`status-badge gap-1.5 ${
                          tx.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : tx.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'PAID' ? 'bg-emerald-500' : tx.status === 'PENDING' ? 'bg-amber-400' : 'bg-slate-400'}`} />
                          {tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(tx)}
                            className="btn-icon w-7 h-7 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Remover esta transação?')) deleteMutation.mutate(tx.id)
                            }}
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
        title={editTx ? 'Editar Transação' : defaultType === 'INCOME' ? 'Lançar Receita' : 'Lançar Despesa'}
      >
        <TransactionForm
          transaction={editTx}
          doctors={doctors}
          currentUser={user}
          onSubmit={(data) => saveMutation.mutate(data as Record<string, unknown>)}
          loading={saveMutation.isPending}
        />
      </Modal>
    </div>
  )
}
