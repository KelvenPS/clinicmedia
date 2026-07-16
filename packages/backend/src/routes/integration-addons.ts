import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { INTEGRATION_ADDON_PRICING } from '../lib/billing-config'
import { buildAddonCheckoutUrl } from '../integrations/kiwify/kiwify.client'

const router = Router()
router.use(authenticate)

const typeParamSchema = z.object({
  type: z.enum(['WEBHOOK', 'GOOGLE_CALENDAR', 'GOOGLE_GMAIL', 'WHATSAPP', 'AI_AGENT']),
})

// GET /api/integration-addons — status de cada tipo de integração para a
// clínica do médico logado. Só DOCTOR/ADMIN compram e gerenciam add-ons —
// SECRETARY nunca vê preço nem contrata.
router.get('/', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    if (req.user!.role === 'ADMIN') {
      res.json([])
      return
    }

    const doctorId = req.user!.userId
    const existing = await prisma.integrationAddon.findMany({ where: { doctorId } })
    const byType = new Map(existing.map(a => [a.type, a]))

    const result = Object.entries(INTEGRATION_ADDON_PRICING).map(([type, pricing]) => {
      const addon = byType.get(type as never)
      return {
        type,
        label: pricing.label,
        priceCents: pricing.priceCents,
        status: addon?.status ?? 'INACTIVE',
        currentPeriodEndsAt: addon?.currentPeriodEndsAt ?? null,
      }
    })

    res.json(result)
  } catch (error) {
    console.error('[integration-addons GET] erro:', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// POST /api/integration-addons/:type/checkout — só o médico dono da clínica.
router.post('/:type/checkout', requireRole('DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { type } = typeParamSchema.parse(req.params)
    const doctorId = req.user!.userId
    const pricing = INTEGRATION_ADDON_PRICING[type]

    const addon = await prisma.integrationAddon.upsert({
      where: { doctorId_type: { doctorId, type } },
      create: { doctorId, type, status: 'PENDING_PAYMENT', priceCents: pricing.priceCents },
      update: { status: 'PENDING_PAYMENT', priceCents: pricing.priceCents },
    })

    const checkoutUrl = buildAddonCheckoutUrl({ doctorId, userId: req.user!.userId, addonId: addon.id, type })
    res.json({ checkoutUrl })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Tipo de integração inválido' })
      return
    }
    res.status(400).json({ message: error instanceof Error ? error.message : 'Erro ao gerar checkout' })
  }
})

// POST /api/integration-addons/:type/cancel — só o médico dono da clínica.
router.post('/:type/cancel', requireRole('DOCTOR'), async (req: AuthRequest, res) => {
  try {
    const { type } = typeParamSchema.parse(req.params)
    const doctorId = req.user!.userId

    const addon = await prisma.integrationAddon.findUnique({ where: { doctorId_type: { doctorId, type } } })
    if (!addon) {
      res.status(404).json({ message: 'Add-on não encontrado' })
      return
    }

    await prisma.integrationAddon.update({
      where: { id: addon.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    })
    res.json({ message: 'Add-on cancelado' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Tipo de integração inválido' })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
