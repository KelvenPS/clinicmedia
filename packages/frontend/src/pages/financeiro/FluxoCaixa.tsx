import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CalendarDays,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import api from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'

function currency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

type PeriodPreset = 'month' | 'last30' | 'custom'
type Granularity = 'daily' | 'monthly'

interface CashFlowEntry {
  date: string
  income: number
  expense: number
  balance: number
  cumulativeBalance: number
}

interface CashFlowResponse {
  entries: CashFlowEntry[]
  totals: {
    income: number
    expense: number
    net: number
  }
}

export default function FluxoCaixa() {
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))

  const getRange = () => {
    const now = new Date()
    if (preset === 'month') {
      return { start: startOfMonth(now), end: endOfMonth(now) }
    }
    if (preset === 'last30') {
      return { start: subDays(now, 30), end: now }
    }
    return { start: new Date(customStart), end: new Date(customEnd) }
  }

  const { start, end } = getRange()

  const { data, isLoading } = useQuery<CashFlowResponse>({
    queryKey: ['cash-flow', preset, granularity, customStart, customEnd],
    queryFn: () =>
      api.get('/financial/cash-flow', {
        params: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          period: granularity,
        },
      }).then(r => r.data),
  })

  const entries = data?.entries ?? []
  const totals = data?.totals

  const chartData = entries.map(e => ({
    name: granularity === 'daily'
      ? format(new Date(e.date), 'dd/MM', { locale: ptBR })
      : format(new Date(e.date), 'MMM/yy', { locale: ptBR }),
    Receitas: e.income,
    Despesas: e.expense,
    Saldo: e.cumulativeBalance,
  }))

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Evolução de receitas, despesas e saldo ao longo do tempo"
      />

      {/* Controls */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="seg-control">
            {[
              { key: 'month', label: 'Este mês' },
              { key: 'last30', label: 'Últimos 30 dias' },
              { key: 'custom', label: 'Personalizado' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPreset(key as PeriodPreset)}
                className={`seg-btn px-3 ${preset === key ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="input-field py-2 text-sm"
              />
              <span className="text-slate-400 text-sm">até</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="input-field py-2 text-sm"
              />
            </div>
          )}

          <div className="ml-auto seg-control">
            {[
              { key: 'daily', label: 'Diário' },
              { key: 'monthly', label: 'Mensal' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setGranularity(key as Granularity)}
                className={`seg-btn px-3 ${granularity === key ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Receitas</p>
              <p className="text-xl font-bold text-emerald-600 mt-1 leading-none">{currency(totals?.income ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-red-400 to-red-600 shadow-sm">
              <TrendingDown className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Despesas</p>
              <p className="text-xl font-bold text-red-600 mt-1 leading-none">{currency(totals?.expense ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className="card-hover">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${(totals?.net ?? 0) >= 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700' : 'bg-gradient-to-br from-red-400 to-red-600'}`}>
              <DollarSign className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Resultado Líquido</p>
              <p className={`text-xl font-bold mt-1 leading-none ${(totals?.net ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {currency(totals?.net ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Area chart */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Evolução do Fluxo de Caixa</h2>
            <p className="text-xs text-slate-400">
              {format(start, 'dd/MM/yyyy', { locale: ptBR })} — {format(end, 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-slate-400 text-sm">Nenhum dado no período selecionado</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
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
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2} fill="url(#colorReceitas)" dot={false} />
              <Area type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} fill="url(#colorDespesas)" dot={false} />
              <Area type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#colorSaldo)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Detail table */}
      {entries.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Detalhamento por Período</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="table-head-cell">Período</th>
                  <th className="table-head-cell text-right">Receitas</th>
                  <th className="table-head-cell text-right">Despesas</th>
                  <th className="table-head-cell text-right">Saldo do Período</th>
                  <th className="table-head-cell text-right">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="table-row">
                    <td className="table-cell font-medium text-slate-700">
                      {granularity === 'daily'
                        ? format(new Date(e.date), 'dd/MM/yyyy', { locale: ptBR })
                        : format(new Date(e.date), 'MMMM yyyy', { locale: ptBR })}
                    </td>
                    <td className="table-cell text-right text-emerald-600 font-medium tabular-nums">
                      {currency(e.income)}
                    </td>
                    <td className="table-cell text-right text-red-600 font-medium tabular-nums">
                      {currency(e.expense)}
                    </td>
                    <td className={`table-cell text-right font-semibold tabular-nums ${e.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {currency(e.balance)}
                    </td>
                    <td className={`table-cell text-right font-bold tabular-nums ${e.cumulativeBalance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                      {currency(e.cumulativeBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="table-cell font-bold text-slate-900">Total</td>
                  <td className="table-cell text-right font-bold text-emerald-600 tabular-nums">{currency(totals?.income ?? 0)}</td>
                  <td className="table-cell text-right font-bold text-red-600 tabular-nums">{currency(totals?.expense ?? 0)}</td>
                  <td className={`table-cell text-right font-bold tabular-nums ${(totals?.net ?? 0) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {currency(totals?.net ?? 0)}
                  </td>
                  <td className="table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
