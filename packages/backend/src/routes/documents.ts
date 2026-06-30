import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { getEffectiveDoctorId, requireSecretaryPermission } from '../lib/secretaryAccess'
import { sendLightMessage } from '../lib/chatbot-light-engine'
import { resolveChatbotLightSendTarget } from '../lib/room-whatsapp'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN', 'DOCTOR', 'SECRETARY'))
router.use(requireSecretaryPermission('documentos'))

const docSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  type: z.enum(['ATESTADO', 'DECLARACAO', 'RECIBO', 'COMPROVANTE', 'OUTROS']),
  content: z.string(),
})

// Variáveis de sistema: preenchidas automaticamente a partir dos dados do banco
const SYSTEM_VAR_KEYS = new Set([
  'paciente', 'nome_paciente', 'nome_contratante',
  'medico', 'nome_profissional',
  'crm', 'registro_crp',
  'especialidade',
  'data', 'data_hoje',
  'cpf_contratante', 'rg_contratante', 'endereco_contratante',
])

// Extrai todas as variáveis {{variavel}} de um template
function extractTemplateVars(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const vars: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    if (!vars.includes(match[1])) vars.push(match[1])
  }
  return vars
}

// Substitui todas as variáveis {{variavel}} no conteúdo
function fillTemplate(content: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value),
    content
  )
}

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

// Retorna as variáveis detectadas no template: quais são de sistema (auto) e quais precisam de input
router.get('/:id/variables', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const doctorId = await getEffectiveDoctorId(req)
    const template = await prisma.documentTemplate.findUnique({ where: { id } })
    if (!template || (doctorId && template.doctorId !== doctorId)) {
      res.status(404).json({ message: 'Documento não encontrado' })
      return
    }
    const allVars = extractTemplateVars(template.content)
    const systemVars = allVars.filter(v => SYSTEM_VAR_KEYS.has(v))
    const customVars = allVars.filter(v => !SYSTEM_VAR_KEYS.has(v))
    res.json({ allVars, systemVars, customVars })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Preenche o template com as variáveis e envia o documento completo via WhatsApp
router.post('/:id/emit', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { patientId, variables = {} } = z.object({
      patientId: z.string().min(1),
      variables: z.record(z.string()).optional().default({}),
    }).parse(req.body)

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
      prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, name: true, phone: true, cpf: true, rg: true, address: true },
      }),
      prisma.user.findUnique({
        where: { id: doctorId },
        select: { name: true, crm: true, certNumber: true, specialty: true },
      }),
    ])

    if (!patient?.phone) {
      res.status(400).json({ message: 'Paciente não encontrado ou sem telefone cadastrado' })
      return
    }

    // Verifica instância WhatsApp conectada
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { doctorId_type: { doctorId, type: 'CHATBOT_LIGHT' } },
    })
    if (!instance) {
      res.status(400).json({ message: 'WhatsApp não configurado. Conecte no menu ChatBot Light → Configurações.' })
      return
    }
    const target = await resolveChatbotLightSendTarget(doctorId)
    if (!target) {
      res.status(400).json({ message: 'WhatsApp desconectado. Verifique a conexão no menu ChatBot Light.' })
      return
    }

    // Dedup: bloqueia reenvio do mesmo documento ao mesmo paciente em 2 minutos
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
      res.status(429).json({ message: 'Documento já enviado recentemente para este paciente. Aguarde 2 minutos antes de reenviar.' })
      return
    }

    // Monta mapa de variáveis de sistema (auto-preenchidas)
    const todayFormatted = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const systemVarMap: Record<string, string> = {
      paciente:             patient.name,
      nome_paciente:        patient.name,
      nome_contratante:     patient.name,
      medico:               doctor?.name ?? '',
      nome_profissional:    doctor?.name ?? '',
      crm:                  doctor?.crm ?? '',
      registro_crp:         doctor?.certNumber ?? doctor?.crm ?? '',
      especialidade:        doctor?.specialty ?? '',
      data:                 todayFormatted,
      data_hoje:            todayFormatted,
      cpf_contratante:      patient.cpf ?? '',
      rg_contratante:       patient.rg ?? '',
      endereco_contratante: patient.address ?? '',
    }

    // Mescla variáveis de sistema com as variáveis custom enviadas pelo usuário
    const allVarMap: Record<string, string> = { ...systemVarMap, ...variables }

    // Preenche o template com todas as variáveis
    const filledContent = fillTemplate(template.content, allVarMap)

    // Envia o documento completo via WhatsApp
    await sendLightMessage(
      instance,
      patient.phone,
      filledContent,
      'documentos',
      'DOCUMENT_SENT',
      patient.name,
    )

    res.json({ message: 'Documento enviado via WhatsApp com sucesso' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    console.error('[documents] POST /:id/emit', error)
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
