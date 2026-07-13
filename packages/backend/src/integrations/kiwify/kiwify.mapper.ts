import type { KiwifyWebhookPayload, NormalizedBillingEvent, NormalizedBillingEventType } from './kiwify.types'

// Mapeia o status bruto da Kiwify para o nosso tipo interno de evento.
// A regra de negócio (subscription-service) nunca deve depender diretamente
// dos nomes de status da Kiwify — só desse tipo normalizado.
const STATUS_MAP: Record<string, NormalizedBillingEventType> = {
  paid: 'PAYMENT_APPROVED',
  approved: 'PAYMENT_APPROVED',
  subscription_renewed: 'SUBSCRIPTION_RENEWED',
  renewed: 'SUBSCRIPTION_RENEWED',
  late: 'PAYMENT_LATE',
  past_due: 'PAYMENT_LATE',
  overdue: 'PAYMENT_LATE',
  canceled: 'SUBSCRIPTION_CANCELED',
  cancelled: 'SUBSCRIPTION_CANCELED',
  subscription_canceled: 'SUBSCRIPTION_CANCELED',
  refunded: 'PAYMENT_REFUNDED',
  refund: 'PAYMENT_REFUNDED',
  chargedback: 'CHARGEBACK',
  chargeback: 'CHARGEBACK',
  refused: 'PAYMENT_REFUSED',
  rejected: 'PAYMENT_REFUSED',
  declined: 'PAYMENT_REFUSED',
  waiting_payment: 'PAYMENT_PENDING',
  pending: 'PAYMENT_PENDING',
}

export function mapKiwifyWebhook(payload: KiwifyWebhookPayload): NormalizedBillingEvent {
  const rawStatus = (payload.webhook_event_type || payload.order_status || payload.Subscription?.status || '').toLowerCase()
  const eventType = STATUS_MAP[rawStatus] ?? 'UNKNOWN'

  const amountCents = typeof payload.charge_amount === 'number'
    ? Math.round(payload.charge_amount)
    : typeof payload.product_base_price === 'number'
      ? Math.round(payload.product_base_price)
      : undefined

  const eventDateRaw = payload.updated_at || payload.created_at
  const eventDate = eventDateRaw ? new Date(eventDateRaw) : new Date()

  return {
    eventType,
    providerOrderId: payload.order_id || payload.order_ref || '',
    providerSubscriptionId: payload.Subscription?.id,
    providerProductId: payload.product?.product_id || payload.Product?.product_id,
    doctorId: payload.TrackingParameters?.s1,
    userId: payload.TrackingParameters?.s2,
    checkoutAttemptId: payload.TrackingParameters?.s3,
    amountCents,
    eventDate: Number.isNaN(eventDate.getTime()) ? new Date() : eventDate,
    rawPayload: payload,
  }
}
