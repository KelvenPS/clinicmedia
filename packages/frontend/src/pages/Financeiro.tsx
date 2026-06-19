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
  MapPin,
  Tag,
  HeartPulse,
  TrendingUp as GrowthIcon,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Transaction, FinancialResponse, MonthlyData, User, FinancialAnalytics } from '../types'
import Modal from '../components/ui/Modal'
import TransactionForm from '../components/Financial/TransactionForm'
import PageHeader from '../components/ui/PageHeader'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const ANALYTICS_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function AnalyticsBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-700 font-medium truncate max-w-[60%]">{label}</span>
        <span className="text-slate-500 tabular-nums font-semibold">{currency(value)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

interface AnalyticsCardProps {
  icon: React.ElementType
  title: string
  subtitle: string
  color: string
  iconBg: string
  children: React.ReactNode
  pieData?: { name: string; value: number }[]
}

function AnalyticsCard({ icon: Icon, title, subtitle, color, iconBg, children, pieData }: AnalyticsCardProps) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        {pieData && pieData.length > 0 && (
          <div className="ml-auto">
            <PieChart width={64} height={64}>
              <Pie data={pieData} cx={28} cy={28} innerRadius={18} outerRadius={30} dataKey="value" strokeWidth={0}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </div>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
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

  const { data: analytics } = useQuery<FinancialAnalytics>({
    queryKey: ['financial-analytics', period, filterDoctorId],
    queryFn: () =>
      api.get('/financial/analytics', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ...(filterDoctorId && { doctorId: filterDoctorId }),
        },
      }).then(r => r.data),
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
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Financeiro"
        subtitle="Controle de receitas e despesas"
        actions={
          <button onClick={handleNew} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nova Transação
          </button>
        }
      />

      {/* ── Filters ── */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
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

          {user?.role === 'ADMIN' && (
            <select
              value={filterDoctorId}
              onChange={e => setFilterDoctorId(e.target.value)}
              className="input-field py-2 sm:max-w-[200px] text-sm"
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
            className="input-field py-2 sm:max-w-[160px] text-sm"
          >
            <option value="">Tipo: Todos</option>
            <option value="INCOME">Receitas</option>
            <option value="EXPENSE">Despesas</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="input-field py-2 sm:max-w-[160px] text-sm"
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

      {/* ── Análises detalhadas ── */}
      {analytics && (analytics.byRoom.length > 0 || analytics.byType.length > 0 || analytics.byHealthPlan.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center">
              <GrowthIcon className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Análise de Receitas</h2>
              <p className="text-xs text-slate-400">Oportunidades de crescimento e distribuição de faturamento</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Por Local de Atendimento */}
            <AnalyticsCard
              icon={MapPin}
              title="Por Local de Atendimento"
              subtitle="Receita por sala / consultório"
              color="text-blue-600"
              iconBg="bg-blue-50"
              pieData={analytics.byRoom.slice(0, 5).map(r => ({ name: r.name, value: r.total }))}
            >
              {analytics.byRoom.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Sem dados com local associado</p>
              ) : (
                analytics.byRoom.slice(0, 5).map((room, i) => (
                  <div key={room.id}>
                    <AnalyticsBar
                      label={room.cidade ? `${room.name} — ${room.cidade}` : room.name}
                      value={room.total}
                      max={analytics.byRoom[0].total}
                      color={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]}
                    />
                    <p className="text-xs text-slate-400 mt-0.5 pl-0.5">
                      {room.count} atendimento{room.count !== 1 ? 's' : ''} · ticket médio {currency(room.total / room.count)}
                    </p>
                  </div>
                ))
              )}
              {analytics.byRoom.length === 0 && (
                <div className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
                  Vincule salas aos agendamentos para ver análise por local.
                </div>
              )}
            </AnalyticsCard>

            {/* Por Tipo de Atendimento */}
            <AnalyticsCard
              icon={Tag}
              title="Por Tipo de Atendimento"
              subtitle="Receita por procedimento / consulta"
              color="text-emerald-600"
              iconBg="bg-emerald-50"
              pieData={analytics.byType.slice(0, 5).map(t => ({ name: t.type, value: t.total }))}
            >
              {analytics.byType.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Sem dados de tipo associado</p>
              ) : (
                analytics.byType.slice(0, 6).map((item, i) => (
                  <div key={item.type}>
                    <AnalyticsBar
                      label={item.type}
                      value={item.total}
                      max={analytics.byType[0].total}
                      color={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]}
                    />
                    <p className="text-xs text-slate-400 mt-0.5 pl-0.5">
                      {item.count} atendimento{item.count !== 1 ? 's' : ''} · ticket médio {currency(item.total / item.count)}
                    </p>
                  </div>
                ))
              )}
            </AnalyticsCard>

            {/* Por Plano de Saúde */}
            <AnalyticsCard
              icon={HeartPulse}
              title="Por Plano de Saúde"
              subtitle="Receita por convênio / particular"
              color="text-rose-600"
              iconBg="bg-rose-50"
              pieData={analytics.byHealthPlan.slice(0, 5).map(p => ({ name: p.name, value: p.total }))}
            >
              {analytics.byHealthPlan.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Sem dados de plano associado</p>
              ) : (
                analytics.byHealthPlan.slice(0, 5).map((plan, i) => (
                  <div key={plan.id}>
                    <AnalyticsBar
                      label={plan.name}
                      value={plan.total}
                      max={analytics.byHealthPlan[0].total}
                      color={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]}
                    />
                    <p className="text-xs text-slate-400 mt-0.5 pl-0.5">
                      {plan.count} atendimento{plan.count !== 1 ? 's' : ''} · ticket médio {currency(plan.total / plan.count)}
                      {plan.planType === 'CONVENIO' && <span className="ml-1 text-blue-500">(convênio)</span>}
                    </p>
                  </div>
                ))
              )}
            </AnalyticsCard>
          </div>

          {/* Insight de crescimento */}
          {(analytics.byRoom.length > 0 || analytics.byType.length > 0) && (() => {
            const topRoom = analytics.byRoom[0]
            const topType = analytics.byType[0]
            const insights: string[] = []
            if (topRoom) insights.push(`"${topRoom.name}" é seu local mais rentável com ${currency(topRoom.total)} (${topRoom.count} atendimentos).`)
            if (topType) insights.push(`"${topType.type}" é o procedimento que mais gera receita com ${currency(topType.total)}.`)
            const weakRoom = analytics.byRoom[analytics.byRoom.length - 1]
            if (weakRoom && analytics.byRoom.length > 1 && weakRoom.total < analytics.byRoom[0].total * 0.3) {
              insights.push(`O local "${weakRoom.name}" está gerando apenas ${currency(weakRoom.total)} — avalie realocar horários.`)
            }
            return insights.length > 0 ? (
              <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GrowthIcon className="w-4 h-4 text-violet-600" />
                  <span className="text-sm font-semibold text-violet-900">Oportunidades de Crescimento</span>
                </div>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0 mt-1.5" />
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* ── Transactions table ── */}
      <div className="card p-0 overflow-hidden animate-stagger-5">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Transações</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {transactions.length} registro{transactions.length !== 1 ? 's' : ''} encontrado{transactions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="table-head-cell">Descrição</th>
                <th className="table-head-cell hidden md:table-cell">Médico</th>
                <th className="table-head-cell hidden lg:table-cell">Categoria</th>
                <th className="table-head-cell">Data</th>
                <th className="table-head-cell text-right">Valor</th>
                <th className="table-head-cell">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state py-12">
                      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3 animate-float">
                        <DollarSign className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-slate-500 font-semibold">Nenhuma transação no período</p>
                      <p className="text-slate-400 text-sm mt-1">Adicione uma nova transação para começar</p>
                      <button onClick={handleNew} className="mt-4 btn-primary text-xs">
                        <Plus className="w-3.5 h-3.5" />
                        Nova Transação
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className="table-row group"
                    style={{ animationDelay: `${idx * 0.025}s` }}
                  >
                    <td className="table-cell max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                      </div>
                      {tx.appointment?.patient && (
                        <p className="text-xs text-slate-400 ml-4 mt-0.5 truncate">{tx.appointment.patient.name}</p>
                      )}
                    </td>
                    <td className="table-cell text-slate-600 hidden md:table-cell">
                      <span className="truncate max-w-[120px] block">{tx.doctor.name}</span>
                    </td>
                    <td className="table-cell hidden lg:table-cell">
                      {tx.category && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                          {tx.category}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-slate-600 tabular-nums whitespace-nowrap">
                      {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className={`table-cell font-bold text-right tabular-nums whitespace-nowrap ${
                      tx.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
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
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          tx.status === 'PAID' ? 'bg-emerald-500' : tx.status === 'PENDING' ? 'bg-amber-400' : 'bg-slate-400'
                        }`} />
                        {tx.status === 'PAID' ? 'Pago' : tx.status === 'PENDING' ? 'Pendente' : 'Cancelado'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => handleEdit(tx)}
                          className="btn-ghost py-1 px-2 text-xs"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(tx.id)}
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
