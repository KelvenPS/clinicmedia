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
