import { prisma } from './prisma'

// Agrega itens acionáveis do dia a dia do Chatbot Light a partir de dados
// já existentes (nenhuma tabela nova) — ver Fase 4 do plano de refatoração.

export interface TaskItem {
  id: string
  type: 'TRANSFER' | 'FAILED_MESSAGE' | 'PRE_REGISTRATION' | 'OVERDUE_PAYMENT' | 'UNCONFIRMED_APPOINTMENT'
  title: string
  subtitle: string
  createdAt: Date
  actionLabel: string
}

export interface TasksResult {
  transfers: TaskItem[]
  failedMessages: TaskItem[]
  preRegistrations: TaskItem[]
  overduePayments: TaskItem[]
  unconfirmedAppointments: TaskItem[]
  totalCount: number
}

const TAKE = 20

export async function getChatbotLightTasks(doctorId: string): Promise<TasksResult> {
  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { doctorId_type: { doctorId, type: 'CHATBOT_LIGHT' } },
  })

  const [transferSessions, failedLogs, preRegPatients, overdueTx, unconfirmedAppts] = await Promise.all([
    instance
      ? prisma.lightFlowSession.findMany({
          where: { instanceId: instance.id, status: 'TRANSFER' },
          orderBy: { updatedAt: 'desc' },
          take: TAKE,
        })
      : Promise.resolve([]),
    prisma.lightMessageLog.findMany({
      where: { doctorId, status: 'FAILED', createdAt: { gte: last7days } },
      orderBy: { createdAt: 'desc' },
      take: TAKE,
    }),
    prisma.patient.findMany({
      where: { doctorId, origin: 'CHATBOT', status: 'PRE_CADASTRO' },
      orderBy: { createdAt: 'desc' },
      take: TAKE,
    }),
    prisma.transaction.findMany({
      where: { doctorId, status: 'PENDING', date: { lt: now } },
      include: { appointment: { include: { patient: true } } },
      orderBy: { date: 'asc' },
      take: TAKE,
    }),
    prisma.appointment.findMany({
      where: { doctorId, status: 'SCHEDULED', isBlocked: false, date: { gte: now, lte: in48h } },
      include: { patient: true },
      orderBy: { date: 'asc' },
      take: TAKE,
    }),
  ])

  const transfers: TaskItem[] = transferSessions.map(s => ({
    id: s.id,
    type: 'TRANSFER' as const,
    title: 'Conversa transferida para atendente',
    subtitle: s.contactPhone,
    createdAt: s.updatedAt,
    actionLabel: 'Marcar como atendida',
  }))

  const failedMessages: TaskItem[] = failedLogs.map(l => ({
    id: l.id,
    type: 'FAILED_MESSAGE' as const,
    title: `Falha ao enviar para ${l.recipientName ?? l.phone}`,
    subtitle: l.errorMessage ?? 'Erro desconhecido',
    createdAt: l.createdAt,
    actionLabel: 'Reenviar',
  }))

  const preRegistrations: TaskItem[] = preRegPatients.map(p => ({
    id: p.id,
    type: 'PRE_REGISTRATION' as const,
    title: p.name,
    subtitle: p.phone,
    createdAt: p.createdAt,
    actionLabel: 'Completar cadastro',
  }))

  const overduePayments: TaskItem[] = overdueTx
    .filter(tx => tx.appointment?.patient?.phone)
    .map(tx => ({
      id: tx.id,
      type: 'OVERDUE_PAYMENT' as const,
      title: tx.appointment!.patient.name,
      subtitle: `R$ ${tx.amount.toFixed(2)} vencido em ${tx.date.toLocaleDateString('pt-BR')}`,
      createdAt: tx.date,
      actionLabel: 'Cobrar agora',
    }))

  const unconfirmedAppointments: TaskItem[] = unconfirmedAppts
    .filter(a => a.patient?.phone)
    .map(a => ({
      id: a.id,
      type: 'UNCONFIRMED_APPOINTMENT' as const,
      title: a.patient.name,
      subtitle: `Consulta em ${a.date.toLocaleDateString('pt-BR')} às ${a.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: a.date,
      actionLabel: 'Confirmar',
    }))

  return {
    transfers,
    failedMessages,
    preRegistrations,
    overduePayments,
    unconfirmedAppointments,
    totalCount:
      transfers.length +
      failedMessages.length +
      preRegistrations.length +
      overduePayments.length +
      unconfirmedAppointments.length,
  }
}
