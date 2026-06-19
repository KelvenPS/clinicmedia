import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { getEffectiveDoctorId, requireSecretaryPermission } from '../lib/secretaryAccess'
import { triggerLightAutomatedMessage } from '../lib/chatbot-light-engine'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR', 'SECRETARY'))
router.use(requireSecretaryPermission('documentos'))

const docSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['ATESTADO', 'DECLARACAO', 'RECIBO', 'COMPROVANTE', 'OUTROS']),
  content: z.string(),
})

router.get('/', async (req: AuthRequest, res) => {
  try {
    const doctorId = await getEffectiveDoctorId(req)
    const docs = await prisma.documentTemplate.findMany({
      where: { doctorId: doctorId ?? undefined },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    res.json(docs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = docSchema.parse(req.body)
    const doctorId = await getEffectiveDoctorId(req)
    if (!doctorId) {
      res.status(400).json({ message: 'Não foi possível identificar o médico responsável' })
      return
    }
    const doc = await prisma.documentTemplate.create({
      data: { ...data, doctorId },
    })
    res.status(201).json(doc)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const data = docSchema.partial().parse(req.body)
    const doctorId = await getEffectiveDoctorId(req)
    const existing = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!existing || (doctorId && existing.doctorId !== doctorId)) {
      res.status(404).json({ message: 'Documento não encontrado' })
      return
    }
    const doc = await prisma.documentTemplate.update({ where: { id }, data })
    res.json(doc)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)
    const current = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!current || (doctorId && current.doctorId !== doctorId)) {
      res.status(404).json({ message: 'Documento não encontrado' }); return
    }
    const doc = await prisma.documentTemplate.update({ where: { id }, data: { active: !current.active } })
    res.json(doc)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)
    const existing = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!existing || (doctorId && existing.doctorId !== doctorId)) {
      res.status(404).json({ message: 'Documento não encontrado' })
      return
    }
    await prisma.documentTemplate.delete({ where: { id } })
    res.json({ message: 'Documento removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Envia notificação WhatsApp ao paciente quando um documento é gerado para ele
router.post('/:id/emit', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { patientId } = z.object({ patientId: z.string().min(1) }).parse(req.body)

    const doctorId = await getEffectiveDoctorId(req)
    if (!doctorId) {
      res.status(400).json({ message: 'Não foi possível identificar o médico responsável' })
      return
    }

    const template = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!template || template.doctorId !== doctorId) {
      res.status(404).json({ message: 'Documento não encontrado' })
      return
    }

    const [patient, doctor] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, phone: true } }),
      prisma.user.findUnique({ where: { id: doctorId }, select: { name: true } }),
    ])

    if (!patient?.phone) {
      res.status(400).json({ message: 'Paciente não encontrado ou sem telefone cadastrado' })
      return
    }

    // Dedup: bloqueia reenvio ao mesmo paciente dentro de 2 minutos
    const cleanPhone = patient.phone.replace(/\D/g, '')
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    const recentLog = await prisma.lightMessageLog.findFirst({
      where: {
        doctorId,
        phone: cleanPhone,
        triggerEvent: 'DOCUMENT_SENT',
        createdAt: { gte: twoMinutesAgo },
        status: { in: ['SENT', 'PENDING'] },
      },
    })
    if (recentLog) {
      res.status(429).json({ message: 'Mensagem já enviada recentemente para este paciente. Aguarde 2 minutos antes de reenviar.' })
      return
    }

    triggerLightAutomatedMessage(doctorId, 'DOCUMENT_SENT', {
      patientName: patient.name,
      patientPhone: patient.phone,
      doctorName: doctor?.name ?? '',
      documentName: template.name,
    }).catch(() => {})

    res.json({ message: 'Notificação enviada com sucesso' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
