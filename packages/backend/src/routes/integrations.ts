import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { fireWebhooks } from '../lib/webhook'
import { getEffectiveDoctorId, normalizeSecretaryPermissions, INTEGRATION_TYPE_PERMISSION_KEYS } from '../lib/secretaryAccess'
import { getActiveIntegrationAddonTypes } from '../lib/integrationAddons'

const router = Router()
router.use(authenticate)
router.use(requireRole('DOCTOR', 'ADMIN', 'SECRETARY'))

const ALLOWED_EVENTS = [
  'appointment.created',
  'appointment.updated',
  'appointment.completed',
  'appointment.cancelled',
  'patient.created',
  'transaction.created',
]

const integrationSchema = z.object({
  type: z.enum(['WEBHOOK', 'GOOGLE_CALENDAR', 'GOOGLE_GMAIL', 'WHATSAPP', 'AI_AGENT']),
  name: z.string().min(1),
  active: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  events: z.array(z.string()).optional(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getEffectiveDoctorId(req)
    const integrations = await prisma.integration.findMany({
      where: { doctorId: doctorId ?? undefined },
      include: {
        _count: { select: { webhookLogs: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // SECRETARY só vê integrações de tipos que o médico liberou especificamente
    // E cujo add-on da clínica está ACTIVE (nunca faz sentido liberar algo que
    // a clínica não contratou). DOCTOR/ADMIN veem tudo.
    if (req.user!.role === 'SECRETARY') {
      const link = await prisma.doctorSecretary.findFirst({
        where: { secretaryId: req.user!.userId, active: true },
        select: { permissions: true },
      })
      const permissions = normalizeSecretaryPermissions(link?.permissions)
      const activeAddonTypes = doctorId ? await getActiveIntegrationAddonTypes(doctorId) : new Set<string>()

      const visible = integrations.filter(i => {
        const key = INTEGRATION_TYPE_PERMISSION_KEYS[i.type]
        return !!key && !!permissions[key] && activeAddonTypes.has(i.type)
      })
      res.json(visible)
      return
    }

    res.json(integrations)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const doctorId = await getEffectiveDoctorId(req)
    if (!doctorId) {
      res.status(400).json({ message: 'Não foi possível identificar o médico responsável' })
      return
    }
    const data = integrationSchema.parse(req.body)

    const activeAddonTypes = await getActiveIntegrationAddonTypes(doctorId)
    if (!activeAddonTypes.has(data.type)) {
      res.status(402).json({ message: 'Contrate o add-on desta integração em Integrações antes de configurá-la.', code: 'ADDON_NOT_ACTIVE' })
      return
    }

    const integration = await prisma.integration.create({
      data: {
        doctorId,
        type: data.type,
        name: data.name,
        active: data.active ?? false,
        config: (data.config ?? {}) as object,
        events: data.events ?? [],
      },
    })
    res.status(201).json(integration)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)
    const data = integrationSchema.partial().parse(req.body)

    const existing = await prisma.integration.findUnique({ where: { id } })
    if (!existing || existing.doctorId !== doctorId) {
      res.status(404).json({ message: 'Integração não encontrada' })
      return
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.config && { config: data.config as object }),
        ...(data.events && { events: data.events }),
      },
    })
    res.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)

    const existing = await prisma.integration.findUnique({ where: { id } })
    if (!existing || existing.doctorId !== doctorId) {
      res.status(404).json({ message: 'Integração não encontrada' })
      return
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: { active: !existing.active },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)

    const existing = await prisma.integration.findUnique({ where: { id } })
    if (!existing || existing.doctorId !== doctorId) {
      res.status(404).json({ message: 'Integração não encontrada' })
      return
    }

    await prisma.integration.delete({ where: { id } })
    res.json({ message: 'Integração removida' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Test: send sample payload to webhook
router.post('/:id/test', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)

    const integration = await prisma.integration.findUnique({ where: { id } })
    if (!integration || integration.doctorId !== doctorId) {
      res.status(404).json({ message: 'Integração não encontrada' })
      return
    }

    if (integration.type !== 'WEBHOOK') {
      res.status(400).json({ message: 'Teste disponível apenas para webhooks' })
      return
    }

    const config = integration.config as { url?: string; secret?: string }
    if (!config.url) {
      res.status(400).json({ message: 'URL não configurada' })
      return
    }

    await fireWebhooks(doctorId, 'appointment.created', {
      _test: true,
      id: 'test-id-123',
      patientName: 'Paciente Teste',
      date: new Date().toISOString(),
      status: 'SCHEDULED',
      message: 'Este é um evento de teste enviado pelo ClinIQ Pro',
    })

    res.json({ message: 'Payload de teste enviado. Verifique os logs.' })
  } catch {
    res.status(500).json({ message: 'Erro ao enviar teste' })
  }
})

// Webhook delivery logs
router.get('/:id/logs', requireRole('DOCTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)

    const integration = await prisma.integration.findUnique({ where: { id } })
    if (!integration || integration.doctorId !== doctorId) {
      res.status(404).json({ message: 'Integração não encontrada' })
      return
    }

    const logs = await prisma.webhookLog.findMany({
      where: { integrationId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(logs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Available events list
router.get('/meta/events', (_req, res) => {
  res.json(ALLOWED_EVENTS)
})

export default router
