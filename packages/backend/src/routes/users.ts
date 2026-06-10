import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const createUserSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.enum(['ADMIN', 'DOCTOR', 'SECRETARY']),
  specialty: z.string().optional(),
  certType: z.string().optional(),
  certNumber: z.string().optional(),
  crm: z.string().optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
})

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
})

router.get('/', requireRole('ADMIN'), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        specialty: true,
        certType: true,
        certNumber: true,
        crm: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: { doctorAppointments: true },
        },
      },
      orderBy: { name: 'asc' },
    })
    res.json(users)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const data = createUserSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      res.status(400).json({ message: 'Email já cadastrado' })
      return
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        crm: data.certNumber || data.crm,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        specialty: true,
        certType: true,
        certNumber: true,
        crm: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    res.status(201).json(user)
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

    // Permitir se for ADMIN ou se o próprio usuário estiver editando seu perfil
    if (req.user!.role !== 'ADMIN' && req.user!.userId !== id) {
      res.status(403).json({ message: 'Acesso negado' })
      return
    }

    const data = updateUserSchema.parse(req.body)

    const updateData: Record<string, unknown> = { ...data }

    // Proteger role para não-admins
    if (req.user!.role !== 'ADMIN') {
      delete updateData.role
    }

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    } else {
      delete updateData.password
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        specialty: true,
        certType: true,
        certNumber: true,
        crm: true,
        phone: true,
        avatarUrl: true,
      },
    })

    res.json(user)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/toggle', requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params
    const user = await prisma.user.findUnique({ where: { id } })

    if (!user) {
      res.status(404).json({ message: 'Usuário não encontrado' })
      return
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: { id: true, name: true, active: true },
    })

    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
