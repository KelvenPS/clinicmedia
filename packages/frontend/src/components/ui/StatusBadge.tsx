import type { AppointmentStatus } from '../../types'

const config: Record<AppointmentStatus, { label: string; className: string }> = {
  SCHEDULED: { label: 'Agendado', className: 'bg-blue-100 text-blue-700' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-emerald-100 text-emerald-700' },
  COMPLETED: { label: 'Concluído', className: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Cancelado', className: 'bg-red-100 text-red-700' },
  NO_SHOW: { label: 'Faltou', className: 'bg-orange-100 text-orange-700' },
}

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, className } = config[status] || config.SCHEDULED
  return (
    <span className={`status-badge ${className}`}>
      {label}
    </span>
  )
}
