import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
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
import type {
  PaymentMethodAnalytics,
  HourAnalytics,
  DayOfWeekAnalytics,
  ConvenioAnalytics,
  ProcedureAnalytics,
} from '../../types'

const CHART_COLORS = ['#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#f97316', '#fb923c']

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function yAxisFormatter(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`
  return `R$${v}`
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{currency(p.value)}</p>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-1/2 mb-4" />
      <div className="h-[280px] bg-slate-100 rounded-xl" />
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function AnaliseAvancada() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const params = {
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate + 'T23:59:59').toISOString(),
  }

  const { data: byPayment = [], isLoading: loadingPayment } = useQuery<PaymentMethodAnalytics[]>({
    queryKey: ['analytics-payment-method', startDate, endDate],
    queryFn: () => api.get('/financial/analytics/by-payment-method', { params }).then(r => r.data),
  })

  const { data: byHour = [], isLoading: loadingHour } = useQuery<HourAnalytics[]>({
    queryKey: ['analytics-by-hour', startDate, endDate],
    queryFn: () => api.get('/financial/analytics/by-hour', { params }).then(r => r.data),
  })

  const { data: byDow = [], isLoading: loadingDow } = useQuery<DayOfWeekAnalytics[]>({
    queryKey: ['analytics-by-dow', startDate, endDate],
    queryFn: () => api.get('/financial/analytics/by-day-of-week', { params }).then(r => r.data),
  })

  const { data: byConvenio = [], isLoading: loadingConvenio } = useQuery<ConvenioAnalytics[]>({
    queryKey: ['analytics-by-convenio', startDate, endDate],
    queryFn: () => api.get('/financial/analytics/by-convenio', { params }).then(r => r.data),
  })

  const { data: byProcedure = [], isLoading: loadingProcedure } = useQuery<ProcedureAnalytics[]>({
    queryKey: ['analytics-by-procedure', startDate, endDate],
    queryFn: () => api.get('/financial/analytics/by-procedure', { params }).then(r => r.data),
  })

  const totalFaturado = byPayment.reduce((s, r) => s + r.total, 0)
  const totalTransacoes = byPayment.reduce((s, r) => s + r.count, 0)
  const ticketMedio = totalTransacoes > 0 ? totalFaturado / totalTransacoes : 0

  const maxHourTotal = byHour.length > 0 ? Math.max(...byHour.map(h => h.total)) : 1

  const pieData = byPayment.map((p, i) => ({
    name: p.method,
    value: p.total,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const hourBarData = byHour.map(h => ({
    name: h.label,
    Faturamento: h.total,
    fill: h.total === maxHourTotal ? CHART_COLORS[0] : CHART_COLORS[2],
  }))

  const dowBarData = byDow.map((d, i) => ({
    name: d.label,
    Faturamento: d.total,
    fill: CHART_COLORS[i % 4],
  }))

  const convenioBarData = byConvenio.slice(0, 8).map(c => ({
    name: c.convenio.length > 20 ? c.convenio.slice(0, 20) + '…' : c.convenio,
    Faturamento: c.total,
  }))

  const procedureBarData = byProcedure.slice(0, 8).map(p => ({
    name: p.procedure.length > 22 ? p.procedure.slice(0, 22) + '…' : p.procedure,
    Faturamento: p.total,
  }))

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Análise Avançada"
        subtitle="Faturamento por forma de pagamento, horário, dia e procedimento"
      />

      {/* Filtros */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">De</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="input-field py-1.5 text-sm w-36"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="input-field py-1.5 text-sm w-36"
            />
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Total faturado" value={currency(totalFaturado)} />
        <StatTile label="Transações" value={String(totalTransacoes)} />
        <StatTile label="Ticket médio" value={currency(ticketMedio)} />
      </div>

      {/* Row 1: PieChart + BarChart hora */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por Forma de Pagamento */}
        {loadingPayment ? <SkeletonCard /> : (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Faturamento por Forma de Pagamento</h3>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [currency(v), 'Total']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', fontSize: 12 }}
                  />
                  <Legend
                    formatter={(value: string) => <span className="text-xs text-slate-600">{value}</span>}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Por Hora do Dia */}
        {loadingHour ? <SkeletonCard /> : (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Faturamento por Hora do Dia</h3>
            {hourBarData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourBarData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Faturamento" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {hourBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Row 2: BarChart dia semana + BarChart convênio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por Dia da Semana */}
        {loadingDow ? <SkeletonCard /> : (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Faturamento por Dia da Semana</h3>
            {dowBarData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dowBarData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Faturamento" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {dowBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Por Convênio */}
        {loadingConvenio ? <SkeletonCard /> : (
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Faturamento por Convênio</h3>
            {convenioBarData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={convenioBarData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} opacity={0.3} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="Faturamento" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Row 3: Por Procedimento full width */}
      {loadingProcedure ? <SkeletonCard /> : (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Faturamento por Procedimento</h3>
          {procedureBarData.length === 0 ? (
            <div className="flex items-center justify-center h-[280px] text-slate-400 text-sm">Sem dados no período</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={procedureBarData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={130} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="Faturamento" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
