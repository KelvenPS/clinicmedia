import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import {
  getKiwifyConfigView,
  updateKiwifyConfig,
  regenerateWebhookSecret,
  getWebhookSecretPlain,
} from '../lib/kiwify-config'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN'))

// GET /api/admin/integrations/kiwify — status atual da integração (segredos mascarados)
router.get('/kiwify', async (_req: AuthRequest, res) => {
  try {
    const view = await getKiwifyConfigView()
    res.json(view)
  } catch (error) {
    console.error('[admin/integrations/kiwify] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  checkoutUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(500).url('URL inválida').nullable().optional()
  ),
  productId: z.string().trim().max(200).nullable().optional(),
  accountId: z.string().trim().max(200).nullable().optional(),
  clientId: z.string().trim().max(200).nullable().optional(),
  clientSecret: z.string().trim().max(500).nullable().optional(),
})

// PUT /api/admin/integrations/kiwify — atualiza checkout/produto/credenciais/toggle
router.put('/kiwify', async (req: AuthRequest, res) => {
  try {
    const input = updateSchema.parse(req.body)
    const view = await updateKiwifyConfig(input, req.user!.userId)
    res.json(view)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[admin/integrations/kiwify PUT] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/admin/integrations/kiwify/webhook-secret/regenerate — gera novo
// segredo e devolve em texto puro (única vez) pro admin colar no painel Kiwify
router.post('/kiwify/webhook-secret/regenerate', async (req: AuthRequest, res) => {
  try {
    const webhookSecret = await regenerateWebhookSecret(req.user!.userId)
    res.json({ webhookSecret })
  } catch (error) {
    console.error('[admin/integrations/kiwify regenerate] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/integrations/kiwify/webhook-secret — revela o segredo atual (auditado)
router.get('/kiwify/webhook-secret', async (req: AuthRequest, res) => {
  try {
    const webhookSecret = await getWebhookSecretPlain(req.user!.userId)
    if (!webhookSecret) {
      res.status(404).json({ message: 'Nenhum segredo gerado ainda' })
      return
    }
    res.json({ webhookSecret })
  } catch (error) {
    console.error('[admin/integrations/kiwify secret] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// GET /api/admin/integrations/kiwify/events — últimos webhooks recebidos (auditoria/debug)
router.get('/kiwify/events', async (req: AuthRequest, res) => {
  try {
    const take = Math.min(Math.max(Number(req.query.take) || 20, 1), 100)
    const events = await prisma.kiwifyWebhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take,
      select: {
        id: true,
        eventType: true,
        kiwifyOrderId: true,
        processingStatus: true,
        receivedAt: true,
        processedAt: true,
        errorMessage: true,
        attempts: true,
      },
    })
    res.json(events)
  } catch (error) {
    console.error('[admin/integrations/kiwify events] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
