// Tipos do payload cru da Kiwify. Os nomes de campo aqui foram montados a
// partir da documentação pública de webhooks da Kiwify e podem precisar de
// ajuste fino assim que o primeiro webhook real chegar em produção — ver
// docs/assinatura-kiwify.md, seção "Como verificar evento".
export interface KiwifyWebhookPayload {
  order_id?: string
  order_ref?: string
  order_status?: string
  webhook_event_type?: string
  payment_method?: string
  product?: {
    product_id?: string
    product_name?: string
  }
  Product?: {
    product_id?: string
  }
  Customer?: {
    email?: string
    full_name?: string
  }
  Subscription?: {
    id?: string
    status?: string
    next_payment?: string
    plan?: { id?: string; name?: string }
  }
  charge_amount?: number
  product_base_price?: number
  created_at?: string
  updated_at?: string
  TrackingParameters?: {
    s1?: string // doctorId
    s2?: string // userId (quem abriu o checkout)
    s3?: string // checkoutAttemptId
  }
  [key: string]: unknown
}

export type NormalizedBillingEventType =
  | 'PAYMENT_APPROVED'
  | 'SUBSCRIPTION_RENEWED'
  | 'PAYMENT_LATE'
  | 'SUBSCRIPTION_CANCELED'
  | 'PAYMENT_REFUNDED'
  | 'CHARGEBACK'
  | 'PAYMENT_REFUSED'
  | 'PAYMENT_PENDING'
  | 'UNKNOWN'

export interface NormalizedBillingEvent {
  eventType: NormalizedBillingEventType
  providerOrderId: string
  providerSubscriptionId?: string
  providerProductId?: string
  doctorId?: string
  userId?: string
  checkoutAttemptId?: string
  amountCents?: number
  eventDate: Date
  rawPayload: unknown
}
