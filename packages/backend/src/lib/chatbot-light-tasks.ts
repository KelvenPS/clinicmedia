import { prisma } from './prisma'
import { categorizeFailure, FailedReasonCounts } from './chatbot-light-failure-reasons'

// Agrega itens acionáveis do dia a dia do Chatbot Light a partir de dados
// já existentes (nenhuma tabela nova) — ver Fase 4 do plano de refatoração,
// e o redesenho da Central (jul/2026).

export interface TaskItem {
  id: string
  type: 'TRANSFER' | 'FAILED_MESSAGE' | 'PRE_REGISTRATION' | 'OVERDUE_PAYMENT' | 'UNCONFIRMED_APPOINTMENT'
  title: string
  subtitle: string
  createdAt: Date
  actionLabel: string
}

export interface SessionCardItem {
  id: string
  contactPhone: string
  flowName: string | null
  currentStepKey: string
  updatedAt: Date
}

export interface TasksResult {
  transfers: SessionCardItem[]
  activeSessions: SessionCardItem[]
  failedMessages: TaskItem[]
  failedReasonCounts: FailedReasonCounts
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

  // Um médico pode ter vários chatbots (multi-chatbot, jul/2026) — agrega
  // sessões de todas as instâncias CHATBOT_LIGHT da conta, não só uma.
  const instances = await prisma.whatsAppInstance.findMany({
    where: { doctorId, type: 'CHATBOT_LIGHT' },
  })
  const instanceIds = instances.map(i => i.id)

  const [transferSessions, activeSessionRows, failedLogs, allFailedForCount, preRegPatients, overdueTx, unconfirmedAppts] = await Promise.all([
    instanceIds.length > 0
      ? prisma.lightFlowSession.findMany({
          where: { instanceId: { in: instanceIds }, status: 'TRANSFER' },
          orderBy: { updatedAt: 'desc' },
          take: TAKE,
        })
      : Promise.resolve([]),
    instanceIds.length > 0
      ? prisma.lightFlowSession.findMany({
          where: { instanceId: { in: instanceIds }, status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
          take: TAKE,
        })
      : Promise.resolve([]),
    prisma.lightMessageLog.findMany({
      where: { doctorId, status: 'FAILED', createdAt: { gte: last7days } },
      orderBy: { createdAt: 'desc' },
      take: TAKE,
    }),
    prisma.lightMessageLog.findMany({
      where: { doctorId, status: 'FAILED', createdAt: { gte: last7days } },
      select: { errorMessage: true },
      take: 500,
    }),
    prisma.patient.findMany({
      where: { doctorId, origin: 'CHATBOT', leadStatus: 'NOVO' },
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

  // Nomes dos fluxos referenciados por transferências e sessões ativas —
  // LightFlowSession.flowId não tem relation no schema, então o join é manual.
  const flowIds = Array.from(new Set(
    [...transferSessions, ...activeSessionRows]
      .map(s => s.flowId)
      .filter((id): id is string => !!id)
  ))
  const flows = flowIds.length > 0
    ? await prisma.lightFluxo.findMany({ where: { id: { in: flowIds } }, select: { id: true, name: true } })
    : []
  const flowNameById = new Map(flows.map(f => [f.id, f.name]))

  const toSessionCard = (s: typeof transferSessions[number]): SessionCardItem => ({
    id: s.id,
    contactPhone: s.contactPhone,
    flowName: s.flowId ? flowNameById.get(s.flowId) ?? null : null,
    currentStepKey: s.currentStepKey,
    updatedAt: s.updatedAt,
  })

  const transfers: SessionCardItem[] = transferSessions.map(toSessionCard)
  const activeSessions: SessionCardItem[] = activeSessionRows.map(toSessionCard)

  const failedMessages: TaskItem[] = failedLogs.map(l => ({
    id: l.id,
    type: 'FAILED_MESSAGE' as const,
    title: `Falha ao enviar para ${l.recipientName ?? l.phone}`,
    subtitle: l.errorMessage ?? 'Erro desconhecido',
    createdAt: l.createdAt,
    actionLabel: 'Reenviar',
  }))

  const failedReasonCounts: FailedReasonCounts = allFailedForCount.reduce(
    (acc, l) => {
      acc[categorizeFailure(l.errorMessage)]++
      acc.total++
      return acc
    },
    { invalidNumber: 0, disconnected: 0, other: 0, total: 0 } as FailedReasonCounts
  )

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
    activeSessions,
    failedMessages,
    failedReasonCounts,
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
