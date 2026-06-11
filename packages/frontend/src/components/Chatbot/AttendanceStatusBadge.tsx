import { statusColors, statusLabels, type ConversationStatus } from '../../types/chatbot'

interface Props {
  status: ConversationStatus
  size?: 'sm' | 'md'
}

export default function AttendanceStatusBadge({ status, size = 'sm' }: Props) {
  const base = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
  return (
    <span className={`${base} rounded-full font-semibold ${statusColors[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {statusLabels[status] ?? status}
    </span>
  )
}
