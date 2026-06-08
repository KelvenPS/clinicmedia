import crypto from 'crypto'
import { prisma } from './prisma'

export type WebhookEvent =
  | 'appointment.created'
  | 'appointment.updated'
  | 'appointment.completed'
  | 'appointment.cancelled'
  | 'patient.created'
  | 'transaction.created'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

function signPayload(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

async function deliver(integrationId: string, event: WebhookEvent, payload: WebhookPayload, url: string, secret?: string, headers?: Record<string, string>) {
  const body = JSON.stringify(payload)
  const start = Date.now()
  let statusCode: number | undefined
  let success = false
  let responseBody: string | undefined
  let error: string | undefined

  try {
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ClinIQ-Pro/1.0',
      'X-ClinIQ-Event': event,
      'X-ClinIQ-Timestamp': payload.timestamp,
      ...(headers ?? {}),
    }
    if (secret) {
      reqHeaders['X-ClinIQ-Signature'] = signPayload(body, secret)
    }

    const res = await fetch(url, { method: 'POST', headers: reqHeaders, body, signal: AbortSignal.timeout(10000) })
    statusCode = res.status
    responseBody = (await res.text()).substring(0, 500)
    success = res.ok
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  await prisma.webhookLog.create({
    data: {
      integrationId,
      event,
      payload: payload as object,
      statusCode,
      success,
      responseBody,
      error,
      duration: Date.now() - start,
    },
  })
}

export async function fireWebhooks(doctorId: string, event: WebhookEvent, data: Record<string, unknown>) {
  try {
    const integrations = await prisma.integration.findMany({
      where: { doctorId, type: 'WEBHOOK', active: true },
    })

    const triggered = integrations.filter(i => {
      const events = i.events as string[]
      return events.includes(event) || events.includes('*')
    })

    if (triggered.length === 0) return

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    }

    for (const integration of triggered) {
      const config = integration.config as {
        url?: string
        secret?: string
        headers?: Record<string, string>
      }
      if (!config.url) continue
      // fire and forget — do not block the main request
      deliver(integration.id, event, payload, config.url, config.secret, config.headers).catch(() => {})
    }
  } catch {
    // webhook errors must never break the main flow
  }
}
