import { Router, Request } from 'express'
import crypto from 'crypto'
import { verifyKiwifyWebhookSignature } from '../integrations/kiwify/kiwify.client'
import { mapKiwifyWebhook } from '../integrations/kiwify/kiwify.mapper'
import { processKiwifyWebhookEvent } from '../integrations/kiwify/kiwify.service'
import { KIWIFY_WEBHOOK_ENABLED } from '../lib/billing-config'

interface RequestWithRawBody extends Request {
  rawBody?: Buffer
}

const router = Router()

// POST /api/webhooks/kiwify — endpoint público, sem authenticate(). A
// validação é o segredo do webhook, não sessão de usuário.
router.post('/', async (req: RequestWithRawBody, res) => {
  if (!KIWIFY_WEBHOOK_ENABLED) {
    res.status(503).json({ message: 'Webhook desabilitado' })
    return
  }

  const secret = process.env.KIWIFY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[KIWIFY_WEBHOOK] KIWIFY_WEBHOOK_SECRET não configurado — recusando evento')
    res.status(500).json({ message: 'Webhook não configurado' })
    return
  }

  const headerSignature = req.get('x-kiwify-signature') || undefined
  const querySignature = typeof req.query.signature === 'string'
    ? req.query.signature
    : typeof req.query.token === 'string' ? req.query.token : undefined

  const isValid = verifyKiwifyWebhookSignature({
    rawBody: req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})),
    headerSignature,
    querySignature,
    secret,
  })

  if (!isValid) {
    console.error('[KIWIFY_WEBHOOK] Assinatura inválida')
    res.status(400).json({ message: 'Assinatura inválida' })
    return
  }

  const productId = process.env.KIWIFY_PRODUCT_ID
  const payload = req.body

  try {
    const event = mapKiwifyWebhook(payload)

    // Validação de produto: se KIWIFY_PRODUCT_ID estiver configurado, ignora
    // pagamentos de qualquer outro produto da mesma conta Kiwify.
    if (productId && event.providerProductId && event.providerProductId !== productId) {
      res.status(200).json({ received: true, ignored: 'product_mismatch' })
      return
    }

    const eventKey = event.providerOrderId
      ? `kiwify:${event.eventType}:${event.providerOrderId}:${event.eventDate.toISOString()}`
      : `kiwify:unknown:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`

    const result = await processKiwifyWebhookEvent(event, eventKey)
    res.status(200).json(result)
  } catch (error) {
    console.error('[KIWIFY_WEBHOOK] Erro ao processar evento:', error)
    // Ainda assim responde 200 pra Kiwify não entrar em loop de retry agressivo
    // sobre um payload que provavelmente vai falhar de novo; o erro fica no log.
    res.status(200).json({ received: true, error: 'processing_failed' })
  }
})

export default router
