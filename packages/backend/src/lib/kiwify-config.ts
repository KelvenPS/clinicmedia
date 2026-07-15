import crypto from 'crypto'
import { prisma } from './prisma'
import { logAudit } from './secretaryAccess'

const SINGLETON_ID = 'kiwify'

export interface ResolvedKiwifyConfig {
  enabled: boolean
  checkoutUrl: string | null
  productId: string | null
  accountId: string | null
  clientId: string | null
  clientSecret: string | null
  webhookSecret: string | null
  apiBaseUrl: string | null
}

export interface KiwifyIntegrationConfigView {
  enabled: boolean
  checkoutUrl: string | null
  productId: string | null
  accountId: string | null
  clientId: string | null
  hasClientSecret: boolean
  hasWebhookSecret: boolean
  webhookSecretPreview: string | null
  webhookUrl: string
  updatedAt: Date | null
}

export function kiwifyWebhookUrl(): string {
  const base = (process.env.BACKEND_URL || '').replace(/\/$/, '')
  return `${base}/api/webhooks/kiwify`
}

// Config efetiva da integração: valores salvos no banco (editáveis pelo admin
// em runtime, via menu Admin > Integrações) têm prioridade; as variáveis de
// ambiente KIWIFY_* só entram como fallback pra quem ainda configura via
// .env/redeploy. Isso deixa o rollout seguro: nada muda pra quem já usa env vars.
export async function getResolvedKiwifyConfig(): Promise<ResolvedKiwifyConfig> {
  const row = await prisma.kiwifyIntegrationConfig.findUnique({ where: { id: SINGLETON_ID } })

  return {
    // Enquanto o admin nunca salvou configuração pelo menu (row inexistente),
    // mantém o comportamento legado (ligado por padrão via env, ver
    // billing-config.ts). Assim que existir uma linha salva, o toggle da UI
    // manda — o admin precisa ativar explicitamente após configurar.
    enabled: row ? row.enabled : process.env.KIWIFY_WEBHOOK_ENABLED !== 'false',
    checkoutUrl: row?.checkoutUrl || process.env.KIWIFY_CHECKOUT_URL || null,
    productId: row?.productId || process.env.KIWIFY_PRODUCT_ID || null,
    accountId: row?.accountId || process.env.KIWIFY_ACCOUNT_ID || null,
    clientId: row?.clientId || process.env.KIWIFY_CLIENT_ID || null,
    clientSecret: row?.clientSecret || process.env.KIWIFY_CLIENT_SECRET || null,
    webhookSecret: row?.webhookSecret || process.env.KIWIFY_WEBHOOK_SECRET || null,
    apiBaseUrl: process.env.KIWIFY_API_BASE_URL || null,
  }
}

export async function getKiwifyConfigView(): Promise<KiwifyIntegrationConfigView> {
  const [row, resolved] = await Promise.all([
    prisma.kiwifyIntegrationConfig.findUnique({ where: { id: SINGLETON_ID } }),
    getResolvedKiwifyConfig(),
  ])

  return {
    enabled: resolved.enabled,
    checkoutUrl: resolved.checkoutUrl,
    productId: resolved.productId,
    accountId: resolved.accountId,
    clientId: resolved.clientId,
    hasClientSecret: !!resolved.clientSecret,
    hasWebhookSecret: !!resolved.webhookSecret,
    webhookSecretPreview: resolved.webhookSecret ? `••••${resolved.webhookSecret.slice(-4)}` : null,
    webhookUrl: kiwifyWebhookUrl(),
    updatedAt: row?.updatedAt ?? null,
  }
}

export interface UpdateKiwifyConfigInput {
  enabled?: boolean
  checkoutUrl?: string | null
  productId?: string | null
  accountId?: string | null
  clientId?: string | null
  clientSecret?: string | null
}

export async function updateKiwifyConfig(input: UpdateKiwifyConfigInput, adminUserId: string): Promise<KiwifyIntegrationConfigView> {
  const data = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.checkoutUrl !== undefined ? { checkoutUrl: input.checkoutUrl || null } : {}),
    ...(input.productId !== undefined ? { productId: input.productId || null } : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId || null } : {}),
    ...(input.clientId !== undefined ? { clientId: input.clientId || null } : {}),
    ...(input.clientSecret !== undefined ? { clientSecret: input.clientSecret || null } : {}),
    updatedByUserId: adminUserId,
  }

  await prisma.kiwifyIntegrationConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  })

  await logAudit({
    userId: adminUserId,
    action: 'KIWIFY_INTEGRATION_UPDATED',
    description: 'Admin atualizou a configuração da integração Kiwify',
  })

  return getKiwifyConfigView()
}

// Gera um segredo aleatório (usado no header x-kiwify-signature/HMAC ou como
// token de query string, ver kiwify.client.ts) — retornado em texto puro só
// nesta chamada, pra o admin copiar e colar no painel da Kiwify.
export async function regenerateWebhookSecret(adminUserId: string): Promise<string> {
  const secret = crypto.randomBytes(24).toString('hex')

  await prisma.kiwifyIntegrationConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, webhookSecret: secret, updatedByUserId: adminUserId },
    update: { webhookSecret: secret, updatedByUserId: adminUserId },
  })

  await logAudit({
    userId: adminUserId,
    action: 'KIWIFY_WEBHOOK_SECRET_REGENERATED',
    description: 'Admin gerou um novo segredo do webhook Kiwify',
  })

  return secret
}

export async function getWebhookSecretPlain(adminUserId: string): Promise<string | null> {
  const resolved = await getResolvedKiwifyConfig()
  if (!resolved.webhookSecret) return null

  await logAudit({
    userId: adminUserId,
    action: 'KIWIFY_WEBHOOK_SECRET_REVEALED',
    description: 'Admin visualizou o segredo do webhook Kiwify',
  })

  return resolved.webhookSecret
}
