import crypto from 'crypto'
import { getResolvedKiwifyConfig } from '../../lib/kiwify-config'

// Verificação de assinatura do webhook. A Kiwify suporta dois esquemas comuns:
// 1) HMAC SHA-256 do corpo bruto, enviado no header `x-kiwify-signature`;
// 2) um token fixo anexado como query string na URL cadastrada no painel
//    (`?signature=xxx` ou `?token=xxx`).
// Confirme no painel da Kiwify qual esquema sua conta usa antes de habilitar
// KIWIFY_WEBHOOK_ENABLED=true em produção (ver docs/assinatura-kiwify.md).
export function verifyKiwifyWebhookSignature(params: {
  rawBody: Buffer
  headerSignature?: string
  querySignature?: string
  secret: string
}): boolean {
  const { rawBody, headerSignature, querySignature, secret } = params

  if (!secret) return false

  if (headerSignature) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSignature))
    } catch {
      return false
    }
  }

  if (querySignature) {
    try {
      return crypto.timingSafeEqual(Buffer.from(querySignature), Buffer.from(secret))
    } catch {
      return false
    }
  }

  return false
}

export async function buildKiwifyCheckoutUrl(params: {
  doctorId: string
  userId: string
  checkoutAttemptId: string
}): Promise<string> {
  const config = await getResolvedKiwifyConfig()
  const baseUrl = config.checkoutUrl
  if (!baseUrl) {
    throw new Error('URL de checkout da Kiwify não configurada — configure em Admin > Integrações')
  }

  const url = new URL(baseUrl)
  url.searchParams.set('s1', params.doctorId)
  url.searchParams.set('s2', params.userId)
  url.searchParams.set('s3', params.checkoutAttemptId)
  url.searchParams.set('utm_source', 'clinic-pro')
  url.searchParams.set('utm_medium', 'subscription')

  return url.toString()
}

interface KiwifySaleResult {
  status: string
  productId?: string
  amountCents?: number
}

// Consulta best-effort de uma venda diretamente na API da Kiwify, usada pela
// reconciliação manual ("Já realizei o pagamento"). Requer client_id/secret
// válidos (OAuth client credentials) — o endpoint exato e o formato de
// resposta devem ser confirmados com a documentação da conta Kiwify antes de
// depender disso em produção; por ora falha de forma segura (retorna null) se
// as credenciais não estiverem configuradas.
let cachedToken: { token: string; expiresAt: number } | null = null

async function getKiwifyAccessToken(): Promise<string | null> {
  const config = await getResolvedKiwifyConfig()
  const { clientId, clientSecret, apiBaseUrl: apiBase } = config

  if (!clientId || !clientSecret || !apiBase) return null

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`${apiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null

    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000 }
    return cachedToken.token
  } catch (err) {
    console.error('[KIWIFY_CLIENT] Falha ao obter token OAuth:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function getKiwifySale(orderId: string): Promise<KiwifySaleResult | null> {
  const config = await getResolvedKiwifyConfig()
  const { apiBaseUrl: apiBase, accountId } = config
  if (!apiBase) return null

  const token = await getKiwifyAccessToken()
  if (!token) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`${apiBase}/sales/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(accountId ? { 'x-kiwify-account-id': accountId } : {}),
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null

    const data = await res.json() as { status?: string; product_id?: string; charge_amount?: number }
    return { status: data.status ?? 'unknown', productId: data.product_id, amountCents: data.charge_amount }
  } catch (err) {
    console.error('[KIWIFY_CLIENT] Falha ao consultar venda:', err instanceof Error ? err.message : err)
    return null
  }
}
