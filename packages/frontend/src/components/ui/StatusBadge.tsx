import type { AppointmentStatus } from '../../types'

const config: Record<AppointmentStatus, { label: string; dot: string; className: string }> = {
  SCHEDULED: {
    label: 'Agendado',
    dot: 'bg-blue-500',
    className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  },
  CONFIRMED: {
    label: 'Confirmado',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  COMPLETED: {
    label: 'Concluído',
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  },
  CANCELLED: {
    label: 'Cancelado',
    dot: 'bg-red-500',
    className: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  },
  NO_SHOW: {
    label: 'Faltou',
    dot: 'bg-orange-500',
    className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  },
}

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, dot, className } = config[status] || config.SCHEDULED
  return (
    <span className={`status-badge ${className} gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
