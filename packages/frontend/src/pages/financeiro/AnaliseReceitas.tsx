import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import {
  TrendingUp,
  MapPin,
  Tag,
  HeartPulse,
  Calculator,
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
import type { FinancialAnalytics } from '../../types'

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16']

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

export default function AnaliseReceitas() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const { data: analytics, isLoading } = useQuery<FinancialAnalytics>({
    queryKey: ['financial-analytics', startDate, endDate],
    queryFn: () =>
      api.get('/financial/analytics', {
        params: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate + 'T23:59:59').toISOString(),
        },
      }).then(r => r.data),
  })

  const totalIncome = analytics
    ? analytics.byType.reduce((s, t) => s + t.total, 0)
    : 0

  const topCategory = analytics?.byType[0]
  const avgPerConsultation = analytics && analytics.byType.length > 0
    ? totalIncome / analytics.byType.reduce((s, t) => s + t.count, 0)
    : 0

  const byTypePie = (analytics?.byType ?? []).slice(0, 6).map((t, i) => ({
    name: t.type ?? 'Sem tipo',
    value: t.total,
    fill: COLORS[i % COLORS.length],
  }))

  const byRoomBarData = (analytics?.byRoom ?? []).slice(0, 8).map((r, i) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name,
    Receita: r.total,
    fill: COLORS[i % COLORS.length],
  }))

  const byHealthPlanData = (analytics?.byHealthPlan ?? []).slice(0, 6).map((p, i) => ({
    name: p.name,
    value: p.total,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Análise de Receitas"
        subtitle="Distribuição e performance das receitas por categoria, sala e plano"
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
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total do Período</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{currency(totalIncome)}</p>
                </div>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Calculator className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Ticket Médio</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{currency(avgPerConsultation)}</p>
                </div>
              </div>
            </div>
            <div className="card-hover">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Top Categoria</p>
                  <p className="text-sm font-bold text-violet-700 mt-1 truncate">{topCategory?.type ?? '—'}</p>
                  {topCategory && <p className="text-xs text-slate-400">{currency(topCategory.total)}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By type bar chart */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Tag className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Por Tipo de Atendimento</h3>
                  <p className="text-xs text-slate-400">Receita por procedimento / consulta</p>
                </div>
              </div>
              {byTypePie.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-slate-400 text-sm">Sem dados no período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(analytics?.byType ?? []).slice(0, 6).map((item, i) => (
                    <div key={item.type}>
                      <AnalyticsBar
                        label={item.type ?? 'Sem tipo'}
                        value={item.total}
                        max={analytics!.byType[0].total}
                        color={COLORS[i % COLORS.length]}
                      />
                      <p className="text-xs text-slate-400 mt-0.5">
                        {item.count} atendimento{item.count !== 1 ? 's' : ''} · ticket médio {currency(item.total / Math.max(item.count, 1))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By health plan pie */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center">
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Por Plano de Saúde</h3>
                  <p className="text-xs text-slate-400">Particular vs. Convênios</p>
                </div>
              </div>
              {byHealthPlanData.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-slate-400 text-sm">Sem dados no período</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={byHealthPlanData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {byHealthPlanData.map((entry, i) => (
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

          {/* By room bar chart */}
          {byRoomBarData.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Por Local de Atendimento</h3>
                  <p className="text-xs text-slate-400">Receita por sala / consultório</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byRoomBarData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip formatter={(v: number) => [currency(v), 'Receita']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Receita" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {byRoomBarData.map((entry, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
