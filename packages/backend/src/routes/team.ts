import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { SECRETARY_PERMISSION_KEYS, normalizeSecretaryPermissions } from '../lib/secretaryAccess'

const router = Router()
router.use(authenticate)

// A própria secretária consulta o que o médico liberou para ela (usado pelo
// frontend para esconder/mostrar menus). Precisa vir antes do requireRole
// abaixo, que restringe o resto das rotas de equipe a DOCTOR/ADMIN.
router.get('/my-permissions', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'SECRETARY') {
      res.json({})
      return
    }
    const link = await prisma.doctorSecretary.findFirst({
      where: { secretaryId: req.user!.userId, active: true },
      select: { permissions: true },
    })
    res.json(normalizeSecretaryPermissions(link?.permissions))
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.use(requireRole('DOCTOR', 'ADMIN'))

router.get('/', async (req: AuthRequest, res) => {
  try {
    const doctorId =
      req.user!.role === 'ADMIN'
        ? (req.query.doctorId as string | undefined)
        : req.user!.userId

    if (!doctorId) {
      res.status(400).json({ message: 'doctorId é obrigatório para ADMIN' })
      return
    }

    const team = await prisma.doctorSecretary.findMany({
      where: { doctorId },
      include: {
        secretary: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    res.json(team)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const createSecretarySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
})

router.post('/secretary', async (req: AuthRequest, res) => {
  try {
    const { name, email, password, phone } = createSecretarySchema.parse(req.body)
    const doctorId = req.user!.userId

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({
        message: 'Email já cadastrado. Use "Vincular" para conectar uma secretaria existente.',
      })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const result = await prisma.$transaction(async (tx) => {
      const secretary = await tx.user.create({
        data: { name, email, password: hashedPassword, phone, role: 'SECRETARY' },
      })

      return tx.doctorSecretary.create({
        data: { doctorId, secretaryId: secretary.id },
        include: {
          secretary: {
            select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true },
          },
        },
      })
    })

    res.status(201).json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/link', async (req: AuthRequest, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const doctorId = req.user!.userId

    const secretary = await prisma.user.findUnique({ where: { email } })
    if (!secretary) {
      res.status(404).json({ message: 'Usuário não encontrado com este email' })
      return
    }

    if (secretary.role !== 'SECRETARY') {
      res.status(400).json({ message: 'Este usuário não possui perfil de secretaria' })
      return
    }

    const existingLink = await prisma.doctorSecretary.findUnique({
      where: { doctorId_secretaryId: { doctorId, secretaryId: secretary.id } },
    })

    if (existingLink) {
      if (existingLink.active) {
        res.status(409).json({ message: 'Esta secretaria já está vinculada à sua equipe' })
        return
      }
      const updated = await prisma.doctorSecretary.update({
        where: { id: existingLink.id },
        data: { active: true },
        include: {
          secretary: {
            select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true },
          },
        },
      })
      res.json(updated)
      return
    }

    const link = await prisma.doctorSecretary.create({
      data: { doctorId, secretaryId: secretary.id },
      include: {
        secretary: {
          select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true },
        },
      },
    })

    res.status(201).json(link)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:linkId/toggle', async (req: AuthRequest, res) => {
  try {
    const { linkId } = req.params
    const doctorId = req.user!.userId

    const link = await prisma.doctorSecretary.findUnique({ where: { id: linkId } })
    if (!link) {
      res.status(404).json({ message: 'Vínculo não encontrado' })
      return
    }

    if (link.doctorId !== doctorId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    const updated = await prisma.doctorSecretary.update({
      where: { id: linkId },
      data: { active: !link.active },
      include: {
        secretary: {
          select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true },
        },
      },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

const permissionsSchema = z.object(
  Object.fromEntries(SECRETARY_PERMISSION_KEYS.map(key => [key, z.boolean().optional()])),
)

router.patch('/:linkId/permissions', async (req: AuthRequest, res) => {
  try {
    const { linkId } = req.params
    const doctorId = req.user!.userId
    const data = permissionsSchema.parse(req.body)

    const link = await prisma.doctorSecretary.findUnique({ where: { id: linkId } })
    if (!link) {
      res.status(404).json({ message: 'Vínculo não encontrado' })
      return
    }

    if (link.doctorId !== doctorId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    const merged = { ...normalizeSecretaryPermissions(link.permissions), ...data }

    const updated = await prisma.doctorSecretary.update({
      where: { id: linkId },
      data: { permissions: merged },
      include: {
        secretary: {
          select: { id: true, name: true, email: true, phone: true, active: true, createdAt: true },
        },
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

router.delete('/:linkId', async (req: AuthRequest, res) => {
  try {
    const { linkId } = req.params
    const doctorId = req.user!.userId

    const link = await prisma.doctorSecretary.findUnique({ where: { id: linkId } })
    if (!link) {
      res.status(404).json({ message: 'Vínculo não encontrado' })
      return
    }

    if (link.doctorId !== doctorId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ message: 'Sem permissão' })
      return
    }

    await prisma.doctorSecretary.delete({ where: { id: linkId } })
    res.json({ message: 'Secretaria desvinculada com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
