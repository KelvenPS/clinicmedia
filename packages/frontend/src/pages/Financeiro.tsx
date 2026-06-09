import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Plus,
  Trash2,
  BarChart3,
  ChevronDown,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Transaction, FinancialResponse, MonthlyData, User } from '../types'
import Modal from '../components/ui/Modal'
import TransactionForm from '../components/Financial/TransactionForm'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface SummaryCardProps {
  icon: React.ElementType
  label: string
  value: number
  color: string
  iconBg: string
}

function SummaryCard({ icon: Icon, label, value, color, iconBg }: SummaryCardProps) {
  return (
    <div className="card-hover">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${iconBg}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold ${color} mt-1 leading-none`}>{currency(value)}</p>
        </div>
      </div>
    </div>
  )
}


export default function Financeiro() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [period, setPeriod] = useState<'current' | 'last' | 'custom'>('current')
  const [filterDoctorId, setFilterDoctorId] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const getDateRange = () => {
    const now = new Date()
    if (period === 'current') return { startDate: startOfMonth(now), endDate: endOfMonth(now) }
    if (period === 'last') {
      const last = subMonths(now, 1)
      return { startDate: startOfMonth(last), endDate: endOfMonth(last) }
    }
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) }
  }

  const { startDate, endDate } = getDateRange()

  const { data: financialData } = useQuery<FinancialResponse>({
    queryKey: ['financial', period, filterDoctorId, filterType, filterStatus],
    queryFn: () =>
      api.get('/financial', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ...(filterDoctorId && { doctorId: filterDoctorId }),
          ...(filterType && { type: filterType }),
          ...(filterStatus && { status: filterStatus }),
        },
      }).then(r => r.data),
  })

  const { data: monthlyData = [] } = useQuery<MonthlyData[]>({
    queryKey: ['financial-monthly', new Date().getFullYear(), filterDoctorId],
    queryFn: () =>
      api.get('/financial/monthly', {
        params: {
          year: new Date().getFullYear(),
          ...(filterDoctorId && { doctorId: filterDoctorId }),
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
      qc.invalidateQueries({ queryKey: ['financial'] })
      qc.invalidateQueries({ queryKey: ['financial-monthly'] })
      toast.success(editTx ? 'Transação atualizada!' : 'Transação adicionada!')
      setModalOpen(false)
      setEditTx(null)
    },
    onError: () => toast.error('Erro ao salvar transação'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/financial/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financial'] })
      toast.success('Transação removida')
    },
  })

  const chartData = monthlyData.map(d => ({
    name: MONTH_NAMES[d.month - 1],
    Receitas: d.income,
    Despesas: d.expense,
  }))

  const summary = financialData?.summary
  const transactions = financialData?.transactions ?? []

  const handleNew = () => { setEditTx(null); setModalOpen(true) }
  const handleEdit = (tx: Transaction) => { setEditTx(tx); setModalOpen(true) }

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-stagger-1">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">Controle de receitas e despesas</p>
        </div>
        <button onClick={handleNew} className="btn-primary self-start">
          <Plus className="w-4 h-4" />
          Nova Transação
        </button>
      </div>

      {/* Filters */}
      <div className="card py-4 animate-stagger-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {[
              { key: 'current', label: 'Mês Atual' },
              { key: 'last', label: 'Mês Anterior' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key as 'current' | 'last')}
                className={`px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                  period === key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {user?.role === 'ADMIN' && (
            <select
              value={filterDoctorId}
              onChange={e => setFilterDoctorId(e.target.value)}
              className="input-field py-2 max-w-[200px] text-sm"
            >
              <option value="">Todos os médicos</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>Dr(a). {d.name}</option>
              ))}
            </select>
          )}

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="input-field py-2 max-w-[160px] text-sm"
          >
            <option value="">Tipo: Todos</option>
            <option value="INCOME">Receitas</option>
            <option value="EXPENSE">Despesas</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="input-field py-2 max-w-[160px] text-sm"
          >
            <option value="">Status: Todos</option>
            <option value="PAID">Pago</option>
            <option value="PENDING">Pendente</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="animate-stagger-1">
          <SummaryCard
            icon={TrendingUp}
            label="Receitas"
            value={summary?.income ?? 0}
            color="text-emerald-600"
            iconBg="bg-gradient-to-br from-emerald-400 to-emerald-600"
          />
        </div>
        <div className="animate-stagger-2">
          <SummaryCard
            icon={TrendingDown}
            label="Despesas"
            value={summary?.expense ?? 0}
            color="text-red-600"
            iconBg="bg-gradient-to-br from-red-400 to-red-600"
          />
        </div>
        <div className="animate-stagger-3">
          <SummaryCard
            icon={DollarSign}
            label="Saldo"
            value={summary?.balance ?? 0}
            color={(summary?.balance ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}
            iconBg="bg-gradient-to-br from-blue-500 to-blue-700"
          />
        </div>
        <div className="animate-stagger-4">
          <SummaryCard
            icon={Clock}
            label="Pendentes"
            value={summary?.pending ?? 0}
            color="text-amber-600"
            iconBg="bg-gradient-to-br from-amber-400 to-amber-600"
          />
        </div>
      </div>

      {/* Chart */}
      <div className="card animate-stagger-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Visão Anual {new Date().getFullYear()}</h2>
              <p className="text-xs text-slate-400">Receitas vs Despesas</p>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
            <Tooltip
              formatter={(value: number) => [currency(value)]}
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)',
                fontSize: 12,
                padding: '10px 14px',
              }}
              cursor={{ fill: '#f8fafc' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Transactions table */}
      <div className="card p-0 overflow-hidden animate-stagger-5">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Transações</h2>
            <p className="text-xs text-slate-400 mt-0.5">{transactions.length} registros encontrados</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Médico</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Nenhuma transação encontrada no período
                  </td>
                </tr>
              ) : (
                transactions.map(tx => (
                  <tr key={tx.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <p className="text-sm font-medium text-slate-900">{tx.description}</p>
                      </div>
                      {tx.appointment?.patient && (
                        <p className="text-xs text-slate-400 ml-4 mt-0.5">{tx.appointment.patient.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{tx.doctor.name}</td>
                    <td className="px-6 py-4">
                      {tx.category && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {tx.category}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className={`px-6 py-4 text-sm font-semibold text-right ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {tx.type === 'INCOME' ? '+' : '-'}{currency(tx.amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`status-badge ${
                        tx.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : tx.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {tx.status === 'PAID' ? '✓ Pago' : tx.status === 'PENDING' ? '● Pendente' : '✕ Cancelado'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleEdit(tx)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(tx.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTx(null) }}
        title={editTx ? 'Editar Transação' : 'Nova Transação'}
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
