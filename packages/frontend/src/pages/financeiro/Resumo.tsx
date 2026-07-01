import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Plus,
  BarChart3,
  ArrowUpRight,
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
import api from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import type { Transaction, FinancialResponse, MonthlyData, User } from '../../types'
import Modal from '../../components/ui/Modal'
import TransactionForm from '../../components/Financial/TransactionForm'
import PageHeader from '../../components/ui/PageHeader'

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

export default function FinanceiroResumo() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [defaultType, setDefaultType] = useState<'INCOME' | 'EXPENSE'>('INCOME')
  const [period, setPeriod] = useState<'current' | 'last'>('current')

  const getDateRange = () => {
    const now = new Date()
    if (period === 'current') return { startDate: startOfMonth(now), endDate: endOfMonth(now) }
    const last = subMonths(now, 1)
    return { startDate: startOfMonth(last), endDate: endOfMonth(last) }
  }

  const { startDate, endDate } = getDateRange()

  const { data: financialData } = useQuery<FinancialResponse>({
    queryKey: ['financial', period],
    queryFn: () =>
      api.get('/financial', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      }).then(r => r.data),
  })

  const { data: monthlyData = [] } = useQuery<MonthlyData[]>({
    queryKey: ['financial-monthly', new Date().getFullYear()],
    queryFn: () =>
      api.get('/financial/monthly', {
        params: { year: new Date().getFullYear() },
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

  const chartData = monthlyData.map(d => ({
    name: MONTH_NAMES[d.month - 1],
    Receitas: d.income,
    Despesas: d.expense,
  }))

  const summary = financialData?.summary

  const handleNew = (type: 'INCOME' | 'EXPENSE' = 'INCOME') => {
    setEditTx(null)
    setDefaultType(type)
    setModalOpen(true)
  }

  const recentTransactions = (financialData?.transactions ?? []).slice(0, 8)

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Resumo Financeiro"
        subtitle={`${format(startDate, 'MMM yyyy')} — visão geral do período`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNew('EXPENSE')}
              className="btn-secondary"
            >
              <ArrowUpRight className="w-4 h-4 rotate-90" />
              Lançar Repasse
            </button>
            <button onClick={() => handleNew('INCOME')} className="btn-primary">
              <Plus className="w-4 h-4" />
              Nova Transação
            </button>
          </div>
        }
      />

      {/* Period toggle */}
      <div className="card py-3">
        <div className="seg-control">
          {[
            { key: 'current', label: 'Mês Atual' },
            { key: 'last', label: 'Mês Anterior' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key as 'current' | 'last')}
              className={`seg-btn px-4 ${period === key ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
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

      {/* Annual chart */}
      <div className="card animate-stagger-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Visão Anual {new Date().getFullYear()}</h2>
              <p className="text-xs text-slate-400">Receitas vs Despesas por mês</p>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
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
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
            <Bar dataKey="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent transactions */}
      {recentTransactions.length > 0 && (
        <div className="card p-0 overflow-hidden animate-stagger-5">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Transações Recentes</h2>
            <p className="text-xs text-slate-400 mt-0.5">Últimas {recentTransactions.length} movimentações do período</p>
          </div>
          <div className="divide-y divide-slate-50">
            {recentTransactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50/60 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                  {tx.category && (
                    <p className="text-xs text-slate-400">{tx.category}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {tx.type === 'INCOME' ? '+' : '−'}{currency(tx.amount)}
                  </p>
                  <p className="text-xs text-slate-400">{format(new Date(tx.date), 'dd/MM')}</p>
                </div>
                <span className={`status-badge text-xs flex-shrink-0 ${
                  tx.status === 'PAID'
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : tx.status === 'PENDING'
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                }`}>
                  {tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTx(null) }}
        title={editTx ? 'Editar Transação' : defaultType === 'INCOME' ? 'Nova Receita' : 'Lançar Repasse'}
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
