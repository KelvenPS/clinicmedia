import { prisma } from './prisma'
import { categorizeFailure, FailedReasonCounts } from './chatbot-light-failure-reasons'

// Relatório gerencial do Chatbot Light — "como o chatbot está performando"
// (complementa chatbot-light-tasks.ts, que é operacional: "o que precisa
// de atenção agora"). Ver redesenho do Relatório (jul/2026).

export interface ReportFilters {
  startDate: Date
  endDate: Date
  module?: string
  status?: string
  flowId?: string
}

export interface ReportCards {
  sent: number
  delivered: number
  failed: number
  deliveryRate: number
  sessionsStarted: number
  transferred: number
  preRegistrations: number
}

export interface ReportComparison {
  current: number
  previous: number
  diffPercent: number
}

export interface EvolutionPoint {
  date: string
  sent: number
  delivered: number
  failed: number
}

export interface ModuleCount {
  module: string
  count: number
}

export interface FlowPerformance {
  flowId: string
  flowName: string
  executions: number
  completed: number
  abandoned: number
  transferred: number
  failed: number
}

export interface ConversionFunnel {
  sessionsStarted: number
  sessionsCompleted: number
  preRegistrationsGenerated: number
  convertedToAppointment: number
}

export interface TemplateUsage {
  templateId: string
  templateName: string
  sent: number
  delivered: number
  failed: number
  deliveryRate: number
}

export interface HourBucket {
  hour: number
  label: string
  count: number
}

export interface RecentLogEntry {
  id: string
  createdAt: Date
  recipientName: string | null
  phone: string
  module: string
  status: string
  errorMessage: string | null
}

export interface ChatbotLightReport {
  cards: ReportCards
  comparison: ReportComparison
  evolution: EvolutionPoint[]
  byModule: ModuleCount[]
  byFlow: FlowPerformance[]
  failedReasonCounts: FailedReasonCounts
  funnel: ConversionFunnel
  templates: TemplateUsage[]
  byHour: HourBucket[]
  recentLogs: RecentLogEntry[]
}

function buildLogWhere(doctorId: string, f: ReportFilters, flowName: string | null) {
  const where: any = { doctorId, createdAt: { gte: f.startDate, lte: f.endDate } }
  if (f.status) where.status = f.status
  if (f.flowId) {
    // triggerEvent guarda o NOME do fluxo (não o id) para envios module='fluxo' —
    // match por texto, frágil a rename do fluxo. Ver nota no plano do Relatório.
    where.module = { in: ['fluxo', 'fluxo_guiado'] }
    where.triggerEvent = flowName ?? '__no_match__'
  } else if (f.module) {
    where.module = f.module
  }
  return where
}

export async function getChatbotLightReport(doctorId: string, filters: ReportFilters): Promise<ChatbotLightReport> {
  const { startDate, endDate } = filters
  const durationMs = endDate.getTime() - startDate.getTime()
  const previousStart = new Date(startDate.getTime() - durationMs)
  const previousEnd = new Date(startDate.getTime())

  // Um médico pode ter vários chatbots (multi-chatbot, jul/2026) — o
  // relatório agrega todas as instâncias CHATBOT_LIGHT da conta.
  const instances = await prisma.whatsAppInstance.findMany({
    where: { doctorId, type: 'CHATBOT_LIGHT' },
  })
  const instanceIds = instances.map(i => i.id)

  let flowName: string | null = null
  if (filters.flowId) {
    const flow = await prisma.lightFluxo.findUnique({ where: { id: filters.flowId }, select: { name: true } })
    flowName = flow?.name ?? null
  }

  const logWhere = buildLogWhere(doctorId, filters, flowName)

  const sessionWhere: any = instanceIds.length > 0
    ? { instanceId: { in: instanceIds }, createdAt: { gte: startDate, lte: endDate } }
    : null
  if (sessionWhere && filters.flowId) sessionWhere.flowId = filters.flowId

  const [
    byStatus,
    previousSentCount,
    byModuleRaw,
    failedForCount,
    sessionStatusRows,
    transfersCount,
    preRegPatients,
    recentLogs,
    evolutionRaw,
    byHourRaw,
  ] = await Promise.all([
    prisma.lightMessageLog.groupBy({ by: ['status'], where: logWhere, _count: { id: true } }),
    prisma.lightMessageLog.count({ where: { ...logWhere, createdAt: { gte: previousStart, lte: previousEnd } } }),
    prisma.lightMessageLog.groupBy({ by: ['module'], where: logWhere, _count: { id: true } }),
    prisma.lightMessageLog.findMany({ where: { ...logWhere, status: 'FAILED' }, select: { errorMessage: true }, take: 1000 }),
    sessionWhere
      ? prisma.lightFlowSession.groupBy({ by: ['flowId', 'status'], where: sessionWhere, _count: { id: true } })
      : Promise.resolve([]),
    sessionWhere
      ? prisma.lightFlowSession.count({ where: { ...sessionWhere, status: 'TRANSFER' } })
      : Promise.resolve(0),
    prisma.patient.findMany({
      where: {
        doctorId, origin: 'CHATBOT', createdAt: { gte: startDate, lte: endDate },
        ...(filters.flowId ? { chatbotSession: { flowId: filters.flowId } } : {}),
      },
      select: { id: true, appointments: { select: { id: true }, take: 1 } },
    }),
    prisma.lightMessageLog.findMany({
      where: logWhere,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, createdAt: true, recipientName: true, phone: true, module: true, status: true, errorMessage: true },
    }),
    prisma.$queryRaw<Array<{ day: Date; status: string; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS "day", status, COUNT(*) AS "count"
      FROM "TBLCHATBOTLIGHTLOG"
      WHERE "doctorId" = ${doctorId} AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY DATE_TRUNC('day', "createdAt"), status
      ORDER BY "day"
    `,
    prisma.$queryRaw<Array<{ hour: unknown; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "createdAt") AS "hour", COUNT(*) AS "count"
      FROM "TBLCHATBOTLIGHTLOG"
      WHERE "doctorId" = ${doctorId} AND "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY "hour"
    `,
  ])

  const sent      = byStatus.find(s => s.status === 'SENT')?._count.id ?? 0
  const rejected  = byStatus.find(s => s.status === 'REJECTED')?._count.id ?? 0
  const failed    = (byStatus.find(s => s.status === 'FAILED')?._count.id ?? 0) + rejected
  const totalSent = byStatus.reduce((sum, s) => sum + s._count.id, 0)
  const deliveryRate = totalSent > 0 ? Math.round((sent / totalSent) * 100) : 0

  const sessionsStarted = sessionStatusRows.reduce((sum, r) => sum + r._count.id, 0)

  const cards: ReportCards = {
    sent: totalSent,
    delivered: sent,
    failed,
    deliveryRate,
    sessionsStarted,
    transferred: transfersCount,
    preRegistrations: preRegPatients.length,
  }

  const diffPercent = previousSentCount > 0
    ? Math.round(((totalSent - previousSentCount) / previousSentCount) * 1000) / 10
    : (totalSent > 0 ? 100 : 0)

  const comparison: ReportComparison = { current: totalSent, previous: previousSentCount, diffPercent }

  const byModule: ModuleCount[] = byModuleRaw.map(r => ({ module: r.module, count: r._count.id }))

  const failedReasonCounts: FailedReasonCounts = failedForCount.reduce(
    (acc, l) => { acc[categorizeFailure(l.errorMessage)]++; acc.total++; return acc },
    { invalidNumber: 0, disconnected: 0, other: 0, total: 0 } as FailedReasonCounts
  )

  // Performance por fluxo — agrega execuções/status por flowId, junta nomes manualmente
  // (LightFlowSession.flowId não tem relation no schema).
  const flowIds = Array.from(new Set(sessionStatusRows.map(r => r.flowId).filter((id): id is string => !!id)))
  const flows = flowIds.length > 0
    ? await prisma.lightFluxo.findMany({ where: { id: { in: flowIds } }, select: { id: true, name: true } })
    : []
  const flowNameById = new Map(flows.map(f => [f.id, f.name]))

  const byFlowMap = new Map<string, FlowPerformance>()
  for (const row of sessionStatusRows) {
    if (!row.flowId) continue
    if (!byFlowMap.has(row.flowId)) {
      byFlowMap.set(row.flowId, {
        flowId: row.flowId,
        flowName: flowNameById.get(row.flowId) ?? '(fluxo removido)',
        executions: 0, completed: 0, abandoned: 0, transferred: 0, failed: 0,
      })
    }
    const entry = byFlowMap.get(row.flowId)!
    entry.executions += row._count.id
    if (row.status === 'COMPLETED') entry.completed += row._count.id
    if (row.status === 'EXPIRED' || row.status === 'CANCELLED') entry.abandoned += row._count.id
    if (row.status === 'TRANSFER') entry.transferred += row._count.id
    if (row.status === 'FAILED') entry.failed += row._count.id
  }
  const byFlow = Array.from(byFlowMap.values()).sort((a, b) => b.executions - a.executions)

  const sessionsCompleted = sessionStatusRows
    .filter(r => r.status === 'COMPLETED')
    .reduce((sum, r) => sum + r._count.id, 0)
  const convertedToAppointment = preRegPatients.filter(p => p.appointments.length > 0).length

  const funnel: ConversionFunnel = {
    sessionsStarted,
    sessionsCompleted,
    preRegistrationsGenerated: preRegPatients.length,
    convertedToAppointment,
  }

  // Templates mais usados — só reflete Mensagens Automáticas e Respostas Rápidas
  // (LightMessageLog.templateId só passou a ser gravado nesses dois pontos, jul/2026).
  const templateLogs = await prisma.lightMessageLog.findMany({
    where: { ...logWhere, templateId: { not: null } },
    select: { templateId: true, status: true },
  })
  const templateIds = Array.from(new Set(templateLogs.map(l => l.templateId).filter((id): id is string => !!id)))
  const templateRows = templateIds.length > 0
    ? await prisma.lightTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } })
    : []
  const templateNameById = new Map(templateRows.map(t => [t.id, t.name]))
  const templatesMap = new Map<string, TemplateUsage>()
  for (const l of templateLogs) {
    if (!l.templateId) continue
    if (!templatesMap.has(l.templateId)) {
      templatesMap.set(l.templateId, {
        templateId: l.templateId,
        templateName: templateNameById.get(l.templateId) ?? '(template removido)',
        sent: 0, delivered: 0, failed: 0, deliveryRate: 0,
      })
    }
    const entry = templatesMap.get(l.templateId)!
    entry.sent++
    if (l.status === 'SENT') entry.delivered++
    if (l.status === 'FAILED' || l.status === 'REJECTED') entry.failed++
  }
  const templates = Array.from(templatesMap.values())
    .map(t => ({ ...t, deliveryRate: t.sent > 0 ? Math.round((t.delivered / t.sent) * 100) : 0 }))
    .sort((a, b) => b.sent - a.sent)

  // Evolução por dia — pivota o resultado bruto de status→contagem em sent/delivered/failed.
  const evolutionMap = new Map<string, EvolutionPoint>()
  for (const row of evolutionRaw) {
    const key = row.day.toISOString().slice(0, 10)
    if (!evolutionMap.has(key)) evolutionMap.set(key, { date: key, sent: 0, delivered: 0, failed: 0 })
    const point = evolutionMap.get(key)!
    const count = Number(row.count)
    point.sent += count
    if (row.status === 'SENT') point.delivered += count
    if (row.status === 'FAILED' || row.status === 'REJECTED') point.failed += count
  }
  const evolution = Array.from(evolutionMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  const byHour: HourBucket[] = byHourRaw.map(r => {
    const h = Number(r.hour)
    return { hour: h, label: `${String(h).padStart(2, '0')}h`, count: Number(r.count) }
  })

  return {
    cards,
    comparison,
    evolution,
    byModule,
    byFlow,
    failedReasonCounts,
    funnel,
    templates,
    byHour,
    recentLogs,
  }
}
