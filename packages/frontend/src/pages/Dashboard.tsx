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
} from 'lucide-react'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Appointment, AppointmentStats } from '../types'
import StatusBadge from '../components/ui/StatusBadge'

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
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
  sub?: string
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const today = new Date()

  const { data: stats } = useQuery<AppointmentStats>({
    queryKey: ['appointment-stats'],
    queryFn: () => api.get('/appointments/stats').then(r => r.data),
  })

  const { data: todayAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ['today-appointments'],
    queryFn: () => api.get('/appointments/today').then(r => r.data),
  })

  const dateFormatted = format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
  const dateCapitalized = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-600/20">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              {getGreeting()}, {user?.name?.split(' ')[0]}! 👋
            </h1>
            <p className="text-blue-200 text-sm">{dateCapitalized}</p>
            {user?.specialty && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full text-xs">
                <Activity className="w-3.5 h-3.5" />
                {user.specialty}
                {user.crm && ` · ${user.crm}`}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl">
            <Calendar className="w-5 h-5" />
            <div className="text-right">
              <p className="text-sm font-semibold">{format(today, 'd MMM', { locale: ptBR })}</p>
              <p className="text-xs text-blue-200">{format(today, 'yyyy')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          label="Consultas Hoje"
          value={stats?.todayTotal ?? 0}
          color="bg-blue-600"
          sub="agendamentos do dia"
        />
        <StatCard
          icon={CheckCircle2}
          label="Concluídas"
          value={stats?.todayCompleted ?? 0}
          color="bg-emerald-500"
          sub="finalizadas hoje"
        />
        <StatCard
          icon={Clock}
          label="Pendentes"
          value={stats?.todayScheduled ?? 0}
          color="bg-amber-500"
          sub="aguardando atendimento"
        />
        <StatCard
          icon={Users}
          label="Total de Pacientes"
          value={stats?.totalPatients ?? 0}
          color="bg-purple-500"
          sub="cadastrados no sistema"
        />
      </div>

      {/* Today's appointments */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Agenda de Hoje</h2>
                <p className="text-sm text-slate-500">{dateCapitalized}</p>
              </div>
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {todayAppointments.length} consultas
              </span>
            </div>

            {todayAppointments.length === 0 ? (
              <div className="text-center py-10">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Nenhuma consulta hoje</p>
                <p className="text-slate-400 text-sm">Aproveite o dia tranquilo!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map(appt => {
                  const isSecretaryBlocked = user?.role === 'SECRETARY' && appt.isBlocked
                  return (
                    <div
                      key={appt.id}
                      className={`flex items-center gap-4 p-3.5 rounded-xl border transition-colors ${isSecretaryBlocked ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'}`}
                    >
                      <div className="text-center min-w-[52px]">
                        <p className="text-sm font-bold text-slate-900">
                          {format(new Date(appt.date), 'HH:mm')}
                        </p>
                        <p className="text-xs text-slate-400">{appt.duration}min</p>
                      </div>
                      <div className={`w-px h-10 ${isSecretaryBlocked ? 'bg-amber-200' : 'bg-slate-200'}`} />
                      {isSecretaryBlocked ? (
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-amber-800 text-sm">Horário reservado pelo médico</p>
                            <p className="text-xs text-amber-600">Dr(a). {appt.doctor.name}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 text-sm truncate">{appt.patient.name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {appt.type && `${appt.type} · `}
                              Dr(a). {appt.doctor.name}
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

        {/* Quick info */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Resumo do Sistema
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Taxa de conclusão', value: stats?.todayTotal ? `${Math.round((stats.todayCompleted / stats.todayTotal) * 100)}%` : '0%', color: 'text-emerald-600' },
                { label: 'Aguardando hoje', value: `${stats?.todayScheduled ?? 0} consultas`, color: 'text-amber-600' },
                { label: 'Total pacientes', value: `${stats?.totalPatients ?? 0} cadastros`, color: 'text-blue-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">Acesso Rápido</h3>
            <p className="text-sm text-blue-700 mb-3">Ações mais usadas</p>
            <div className="space-y-2">
              <a href="/agenda" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium">
                <Calendar className="w-4 h-4" />
                Ver agenda completa
              </a>
              <a href="/pacientes" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium">
                <Users className="w-4 h-4" />
                Gerenciar pacientes
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
