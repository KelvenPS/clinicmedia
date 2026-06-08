import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { signToken } from '../utils/jwt'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  specialty: z.string().optional(),
  certType: z.string().optional(),
  certNumber: z.string().optional(),
  phone: z.string().optional(),
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.active) {
      res.status(401).json({ message: 'Email ou senha inválidos' })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      res.status(401).json({ message: 'Email ou senha inválidos' })
      return
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        certType: user.certType,
        certNumber: user.certNumber,
        crm: user.crm,
        phone: user.phone,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      res.status(400).json({ message: 'Este e-mail já está cadastrado' })
      return
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: 'DOCTOR',
        active: true,
        specialty: data.specialty,
        certType: data.certType,
        certNumber: data.certNumber,
        crm: data.certNumber,
        phone: data.phone,
      },
    })

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    })

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        certType: user.certType,
        certNumber: user.certNumber,
        crm: user.crm,
        phone: user.phone,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        specialty: true,
        certType: true,
        certNumber: true,
        crm: true,
        phone: true,
        active: true,
        createdAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'Usuário não encontrado' })
      return
    }

    res.json(user)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
