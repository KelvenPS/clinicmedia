import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Activity,
  Lock,
  ArrowRight,
  Zap,
  Stethoscope,
  BarChart3,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Appointment, AppointmentStats } from '../types'
import StatusBadge from '../components/ui/StatusBadge'
import { SkeletonStats } from '../components/ui/SkeletonCard'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
  index = 0,
  trend,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  sub?: string
  index?: number
  trend?: { value: string; up: boolean }
}) {
  return (
    <div className={`stat-card animate-stagger-${(index + 1) as 1 | 2 | 3 | 4}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color} shadow-sm transition-transform duration-200 group-hover:scale-110`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1 leading-none tabular-nums">
            {value}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {sub && <p className="text-xs text-slate-400">{sub}</p>}
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                trend.up ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {trend.up ? '↑' : '↓'} {trend.value}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnimatedProgress({ value, max, color, delay = 0 }: {
  value: number
  max: number
  color: string
  delay?: number
}) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  return (
    <div className="progress-track">
      <div
        className={`progress-fill ${color}`}
        style={{
          width: `${pct}%`,
          transitionDelay: `${delay}ms`,
        }}
      />
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const today = new Date()

  const { data: stats, isLoading: statsLoading } = useQuery<AppointmentStats>({
    queryKey: ['appointment-stats'],
    queryFn: () => api.get('/appointments/stats').then(r => r.data),
  })

  const { data: todayAppointments = [], isLoading: apptLoading } = useQuery<Appointment[]>({
    queryKey: ['today-appointments'],
    queryFn: () => api.get('/appointments/today').then(r => r.data),
  })

  const dateFormatted = format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
  const dateCapitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1)
  const conclusionRate = stats?.todayTotal
    ? Math.round((stats.todayCompleted / stats.todayTotal) * 100)
    : 0

  return (
    <div className="space-y-6 page-stagger">

      {/* ── Welcome banner ── */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-600 rounded-2xl p-5 sm:p-6 text-white shadow-xl shadow-blue-700/25 overflow-hidden relative">
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-52 h-52 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-4 right-48 w-2 h-2 bg-white/30 rounded-full animate-pulse-soft pointer-events-none hidden lg:block" />
        <div className="absolute bottom-6 right-32 w-1.5 h-1.5 bg-cyan-300/50 rounded-full animate-float pointer-events-none hidden lg:block" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-cyan-300" fill="currentColor" />
              <span className="text-cyan-300 text-xs font-bold uppercase tracking-widest">ClinIQ Pro</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 leading-tight">
              {getGreeting()}, {user?.name?.split(' ')[0]}! 👋
            </h1>
            <p className="text-blue-200 text-sm">{dateCapitalized}</p>
            {user?.specialty && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm
                              px-3 py-1.5 rounded-full text-xs font-medium border border-white/20">
                <Activity className="w-3.5 h-3.5 text-cyan-300" />
                {user.specialty}
                {user.crm && ` · ${user.crm}`}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2.5 bg-white/15 backdrop-blur-sm
                          px-4 py-3 rounded-2xl border border-white/20 flex-shrink-0
                          hover:bg-white/20 transition-colors duration-200">
            <Calendar className="w-5 h-5 text-cyan-300" />
            <div className="text-right">
              <p className="text-lg font-bold leading-none tabular-nums">
                {format(today, 'd MMM', { locale: ptBR })}
              </p>
              <p className="text-xs text-blue-200 mt-0.5">{format(today, 'yyyy')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      {statsLoading ? (
        <SkeletonStats count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={Calendar}
            label="Consultas Hoje"
            value={stats?.todayTotal ?? 0}
            color="bg-gradient-to-br from-blue-500 to-blue-700"
            sub="agendamentos do dia"
            index={0}
          />
          <StatCard
            icon={CheckCircle2}
            label="Concluídas"
            value={stats?.todayCompleted ?? 0}
            color="bg-gradient-to-br from-emerald-500 to-emerald-700"
            sub="finalizadas hoje"
            index={1}
          />
          <StatCard
            icon={Clock}
            label="Pendentes"
            value={stats?.todayScheduled ?? 0}
            color="bg-gradient-to-br from-amber-500 to-amber-600"
            sub="aguardando atendimento"
            index={2}
          />
          <StatCard
            icon={Users}
            label="Total de Pacientes"
            value={stats?.totalPatients ?? 0}
            color="bg-gradient-to-br from-purple-500 to-purple-700"
            sub="cadastrados no sistema"
            index={3}
          />
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Agenda de hoje ── */}
        <div className="xl:col-span-2 animate-stagger-3">
          <div className="card h-full flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Agenda de Hoje</h2>
                <p className="text-xs text-slate-400 mt-0.5">{dateCapitalized}</p>
              </div>
              <div className="flex items-center gap-2">
                {todayAppointments.length > 0 && (
                  <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-100 tabular-nums">
                    {todayAppointments.length} consulta{todayAppointments.length !== 1 ? 's' : ''}
                  </span>
                )}
                <Link
                  to="/agenda"
                  className="btn-icon"
                  title="Ver agenda completa"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {apptLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50">
                    <div className="skeleton w-12 h-10 rounded-lg flex-shrink-0" />
                    <div className="w-px h-8 bg-slate-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-text w-1/2" />
                      <div className="skeleton-text w-1/3" />
                    </div>
                    <div className="skeleton w-20 h-6 rounded-full" />
                  </div>
                ))}
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="empty-state flex-1">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 animate-float">
                  <Calendar className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-semibold">Nenhuma consulta hoje</p>
                <p className="text-slate-400 text-sm mt-1">Aproveite o dia tranquilo!</p>
                <Link to="/agenda" className="mt-4 btn-primary text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  Ver agenda
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5 scrollbar-none flex-1">
                {todayAppointments.map((appt, idx) => {
                  const isSecretaryBlocked = user?.role === 'SECRETARY' && appt.isBlocked
                  return (
                    <div
                      key={appt.id}
                      className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-200 ${
                        isSecretaryBlocked
                          ? 'bg-amber-50 border-amber-100'
                          : 'bg-slate-50 hover:bg-white hover:shadow-sm hover:border-slate-200 border-transparent cursor-pointer'
                      }`}
                      style={{ animationDelay: `${idx * 0.04}s` }}
                    >
                      <div className="text-center min-w-[52px]">
                        <p className="text-sm font-bold text-slate-900 tabular-nums">
                          {format(new Date(appt.date), 'HH:mm')}
                        </p>
                        <p className="text-xs text-slate-400">{appt.duration}min</p>
                      </div>
                      <div className={`w-px h-9 flex-shrink-0 ${isSecretaryBlocked ? 'bg-amber-200' : 'bg-slate-200'}`} />
                      {isSecretaryBlocked ? (
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-amber-800 text-sm">Horário reservado</p>
                            <p className="text-xs text-amber-600">Dr(a). {appt.doctor.name}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">{appt.patient.name}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {appt.type && `${appt.type} · `}Dr(a). {appt.doctor.name}
                            </p>
                          </div>
                          <StatusBadge status={appt.status} />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Painel lateral ── */}
        <div className="space-y-4 animate-stagger-4">

          {/* Resumo */}
          <div className="card">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
              <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              </div>
              Resumo do Dia
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">Concluídas</span>
                  <span className="text-xs font-bold text-emerald-600 tabular-nums">{conclusionRate}%</span>
                </div>
                <AnimatedProgress value={stats?.todayCompleted ?? 0} max={stats?.todayTotal ?? 0} color="bg-emerald-500" delay={100} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">Agendadas</span>
                  <span className="text-xs font-bold text-amber-600 tabular-nums">{stats?.todayScheduled ?? 0}</span>
                </div>
                <AnimatedProgress value={stats?.todayScheduled ?? 0} max={stats?.todayTotal ?? 0} color="bg-amber-400" delay={200} />
              </div>
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Pacientes totais</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600 tabular-nums">{stats?.totalPatients ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Acesso rápido */}
          <div className="card bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700/50">
            <h3 className="font-semibold text-white mb-1 flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-cyan-400" fill="currentColor" />
              Acesso Rápido
            </h3>
            <p className="text-xs text-slate-400 mb-4">Ações mais usadas</p>
            <div className="space-y-1">
              {[
                { to: '/agenda', icon: Calendar, label: 'Ver agenda completa', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { to: '/pacientes', icon: Users, label: 'Gerenciar pacientes', color: 'text-purple-400', bg: 'bg-purple-500/10' },
                { to: '/prontuario', icon: TrendingUp, label: 'Prontuários', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { to: '/financeiro', icon: Stethoscope, label: 'Financeiro', color: 'text-amber-400', bg: 'bg-amber-500/10' },
              ].map(({ to, icon: Icon, label, color, bg }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                             hover:bg-white/10 active:bg-white/5
                             text-slate-300 hover:text-white
                             transition-all duration-150 group"
                >
                  <div className={`w-6 h-6 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${color}`} />
                  </div>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-150" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
