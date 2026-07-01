import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingDown,
  Tag,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import api from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import type { FinancialResponse } from '../../types'

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#84cc16']

function AnalyticsBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-700 font-medium truncate max-w-[60%]">{label}</span>
        <span className="text-slate-500 tabular-nums font-semibold">{currency(value)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

interface CategoryGroup {
  category: string
  total: number
  count: number
}

export default function AnaliseDespesas() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const { data: financialData, isLoading } = useQuery<FinancialResponse>({
    queryKey: ['financial-analise-despesas', startDate, endDate],
    queryFn: () =>
      api.get('/financial', {
        params: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
          type: 'EXPENSE',
        },
      }).then(r => r.data),
  })

  const expenses = financialData?.transactions ?? []
  const totalExpense = financialData?.summary?.expense ?? 0

  // Group by category
  const byCategory = expenses.reduce<Record<string, CategoryGroup>>((acc, tx) => {
    const cat = tx.category ?? 'Sem categoria'
    if (!acc[cat]) acc[cat] = { category: cat, total: 0, count: 0 }
    acc[cat].total += tx.amount
    acc[cat].count += 1
    return acc
  }, {})

  const categoryList = Object.values(byCategory).sort((a, b) => b.total - a.total)

  const barData = categoryList.slice(0, 8).map((c, i) => ({
    name: c.category.length > 14 ? c.category.slice(0, 14) + '…' : c.category,
    Despesa: c.total,
    fill: COLORS[i % COLORS.length],
  }))

  const pieData = categoryList.slice(0, 6).map((c, i) => ({
    name: c.category,
    value: c.total,
    fill: COLORS[i % COLORS.length],
  }))

  // Top largest individual expenses
  const topExpenses = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5)
  const biggestCat = categoryList[0]

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Análise de Despesas"
        subtitle="Distribuição e concentração das despesas por categoria"
      />

      {/* Date filter */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600 font-medium">Período:</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="input-field py-2 text-sm"
          />
          <span className="text-slate-400 text-sm">até</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="input-field py-2 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
                  <TrendingDown className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total Despesas</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{currency(totalExpense)}</p>
                </div>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Maior Categoria</p>
                  <p className="text-sm font-bold text-orange-700 mt-1 truncate">{biggestCat?.category ?? '—'}</p>
                  {biggestCat && <p className="text-xs text-slate-400">{currency(biggestCat.total)}</p>}
                </div>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total de Lançamentos</p>
                  <p className="text-xl font-bold text-slate-700 mt-1">{expenses.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar chart by category */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Despesas por Categoria</h3>
                  <p className="text-xs text-slate-400">Top 8 categorias</p>
                </div>
              </div>
              {barData.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-slate-400 text-sm">Sem despesas no período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {categoryList.slice(0, 8).map((cat, i) => (
                    <AnalyticsBar
                      key={cat.category}
                      label={cat.category}
                      value={cat.total}
                      max={categoryList[0].total}
                      color={COLORS[i % COLORS.length]}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pie chart */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Tag className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Distribuição por Categoria</h3>
                  <p className="text-xs text-slate-400">Proporção do total de despesas</p>
                </div>
              </div>
              {pieData.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-slate-400 text-sm">Sem dados no período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={0}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [currency(v)]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bar chart overall */}
          {barData.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Comparativo por Categoria</h3>
                  <p className="text-xs text-slate-400">Visão em barras</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip formatter={(v: number) => [currency(v), 'Despesa']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Despesa" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top individual expenses */}
          {topExpenses.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Maiores Despesas do Período</h3>
                <p className="text-xs text-slate-400 mt-0.5">Top 5 lançamentos individuais</p>
              </div>
              <div className="divide-y divide-slate-50">
                {topExpenses.map((tx, i) => (
                  <div key={tx.id} className="flex items-center gap-4 px-6 py-3">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}
                        {tx.category && ` · ${tx.category}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-red-600 tabular-nums flex-shrink-0">
                      −{currency(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
