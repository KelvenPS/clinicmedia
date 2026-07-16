// Configuração central da assinatura Clinic Pro — plano único, sem tiers.
// Não repita 8990 / 89.90 / 7 em outros arquivos: importe daqui.
export const CLINIC_PRO_SUBSCRIPTION = {
  name: 'Clinic Pro',
  monthlyPriceCents: Number(process.env.CLINIC_PRO_MONTHLY_PRICE_CENTS) || 4990,
  currency: process.env.CLINIC_PRO_CURRENCY || 'BRL',
  trialDays: Number(process.env.CLINIC_PRO_TRIAL_DAYS) || 7,
  gracePeriodDays: Number(process.env.CLINIC_PRO_GRACE_PERIOD_DAYS) || 0,
}

export const BILLING_PROVIDER = process.env.BILLING_PROVIDER || 'kiwify'

// Feature flags de rollout — ver docs/assinatura-kiwify.md antes de ativar em produção.
export const SUBSCRIPTION_FEATURE_ENABLED = process.env.SUBSCRIPTION_FEATURE_ENABLED !== 'false'
export const SUBSCRIPTION_ENFORCEMENT_ENABLED = process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true'
export const KIWIFY_WEBHOOK_ENABLED = process.env.KIWIFY_WEBHOOK_ENABLED !== 'false'

export function monthlyPriceLabel(): string {
  const value = CLINIC_PRO_SUBSCRIPTION.monthlyPriceCents / 100
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Add-ons de integração — cobrança recorrente extra por tipo, além da
// assinatura Clinic Pro. Nenhum produto Kiwify existe ainda para isso: os
// valores abaixo são placeholders (confirmar preço real antes de produção) e
// os kiwifyProductIdEnvKey apontam pra env vars que devem ser preenchidas
// quando os produtos forem criados no painel da Kiwify.
export const INTEGRATION_ADDON_PRICING: Record<string, { label: string; priceCents: number; kiwifyProductIdEnvKey: string; kiwifyCheckoutUrlEnvKey: string }> = {
  WEBHOOK: {
    label: 'Webhooks',
    priceCents: Number(process.env.ADDON_WEBHOOK_PRICE_CENTS) || 2990,
    kiwifyProductIdEnvKey: 'KIWIFY_ADDON_WEBHOOK_PRODUCT_ID',
    kiwifyCheckoutUrlEnvKey: 'KIWIFY_ADDON_WEBHOOK_CHECKOUT_URL',
  },
  GOOGLE_CALENDAR: {
    label: 'Google Calendar',
    priceCents: Number(process.env.ADDON_GOOGLE_CALENDAR_PRICE_CENTS) || 1990,
    kiwifyProductIdEnvKey: 'KIWIFY_ADDON_GOOGLE_CALENDAR_PRODUCT_ID',
    kiwifyCheckoutUrlEnvKey: 'KIWIFY_ADDON_GOOGLE_CALENDAR_CHECKOUT_URL',
  },
  GOOGLE_GMAIL: {
    label: 'Gmail',
    priceCents: Number(process.env.ADDON_GOOGLE_GMAIL_PRICE_CENTS) || 1990,
    kiwifyProductIdEnvKey: 'KIWIFY_ADDON_GOOGLE_GMAIL_PRODUCT_ID',
    kiwifyCheckoutUrlEnvKey: 'KIWIFY_ADDON_GOOGLE_GMAIL_CHECKOUT_URL',
  },
  WHATSAPP: {
    label: 'WhatsApp (integração externa)',
    priceCents: Number(process.env.ADDON_WHATSAPP_PRICE_CENTS) || 3990,
    kiwifyProductIdEnvKey: 'KIWIFY_ADDON_WHATSAPP_PRODUCT_ID',
    kiwifyCheckoutUrlEnvKey: 'KIWIFY_ADDON_WHATSAPP_CHECKOUT_URL',
  },
  AI_AGENT: {
    label: 'Agente de IA',
    priceCents: Number(process.env.ADDON_AI_AGENT_PRICE_CENTS) || 4990,
    kiwifyProductIdEnvKey: 'KIWIFY_ADDON_AI_AGENT_PRODUCT_ID',
    kiwifyCheckoutUrlEnvKey: 'KIWIFY_ADDON_AI_AGENT_CHECKOUT_URL',
  },
}

export function integrationAddonPriceLabel(type: string): string {
  const cents = INTEGRATION_ADDON_PRICING[type]?.priceCents ?? 0
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Identifica, a partir do product_id recebido num webhook da Kiwify, qual
// add-on de integração ele corresponde (cada tipo tem seu próprio produto).
// Retorna null se o product_id não bater com nenhum add-on configurado.
export function resolveIntegrationAddonType(providerProductId: string): string | null {
  for (const [type, pricing] of Object.entries(INTEGRATION_ADDON_PRICING)) {
    const configuredId = process.env[pricing.kiwifyProductIdEnvKey]
    if (configuredId && configuredId === providerProductId) return type
  }
  return null
}
