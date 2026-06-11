import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const typeSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  baseValue: z.coerce.number().min(0).optional().or(z.literal('')),
  hasReturns: z.boolean().optional().default(false),
})

/**
 * Retorna o doctorId efetivo com base no papel do usuário autenticado.
 * - DOCTOR     → próprio userId
 * - SECRETARY  → doctorId do médico vinculado (primeiro vínculo ativo)
 * - ADMIN      → null (sem filtro automático; pode passar ?doctorId via query)
 */
async function getEffectiveDoctorId(req: AuthRequest): Promise<string | null> {
  if (!req.user) return null

  if (req.user.role === 'DOCTOR') return req.user.userId

  if (req.user.role === 'SECRETARY') {
    const link = await prisma.doctorSecretary.findFirst({
      where: { secretaryId: req.user.userId, active: true },
      select: { doctorId: true },
    })
    return link?.doctorId ?? null
  }

  // ADMIN: sem filtro automático
  return null
}

// ─── GET / — tipos ativos do tenant ─────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getEffectiveDoctorId(req)

    // ADMIN pode filtrar por ?doctorId=xxx; sem parâmetro vê tudo
    const filterDoctorId =
      req.user?.role === 'ADMIN'
        ? (req.query.doctorId as string | undefined) ?? undefined
        : doctorId ?? undefined

    const types = await prisma.appointmentType.findMany({
      where: {
        active: true,
        ...(filterDoctorId ? { doctorId: filterDoctorId } : {}),
      },
      orderBy: { name: 'asc' },
    })
    res.json(types)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── GET /all — todos os tipos do tenant (inclusive inativos) ────────────────
router.get('/all', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res: Response) => {
  try {
    const doctorId = await getEffectiveDoctorId(req)

    const filterDoctorId =
      req.user?.role === 'ADMIN'
        ? (req.query.doctorId as string | undefined) ?? undefined
        : doctorId ?? undefined

    const types = await prisma.appointmentType.findMany({
      where: {
        ...(filterDoctorId ? { doctorId: filterDoctorId } : {}),
      },
      orderBy: { name: 'asc' },
    })
    res.json(types)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── POST / — criar tipo ─────────────────────────────────────────────────────
router.post('/', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res: Response) => {
  try {
    const data = typeSchema.parse(req.body)

    const doctorId = await getEffectiveDoctorId(req)
    if (!doctorId && req.user?.role !== 'ADMIN') {
      res.status(400).json({ message: 'Não foi possível identificar o médico responsável' })
      return
    }

    const type = await prisma.appointmentType.create({
      data: {
        name: data.name,
        baseValue: data.baseValue === '' ? null : data.baseValue,
        hasReturns: data.hasReturns ?? false,
        ...(doctorId ? { doctorId } : {}),
      },
    })
    res.status(201).json(type)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PUT /:id — atualizar tipo ───────────────────────────────────────────────
router.put('/:id', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const data = typeSchema.partial().parse(req.body)

    const existing = await prisma.appointmentType.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Tipo não encontrado' })
      return
    }

    // Ownership check: DOCTOR can only edit their own types
    const doctorId = await getEffectiveDoctorId(req)
    if (doctorId && existing.doctorId !== doctorId) {
      res.status(403).json({ message: 'Acesso negado. Este tipo pertence a outro médico.' })
      return
    }

    const type = await prisma.appointmentType.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        baseValue: data.baseValue === '' ? null : data.baseValue,
        ...(data.hasReturns !== undefined && { hasReturns: data.hasReturns }),
      },
    })
    res.json(type)
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Dados inválidos', errors: error.errors })
      return
    }
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── PATCH /:id/toggle — ativar/desativar ────────────────────────────────────
router.patch('/:id/toggle', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const current = await prisma.appointmentType.findUnique({ where: { id } })
    if (!current) {
      res.status(404).json({ message: 'Tipo não encontrado' })
      return
    }

    const doctorId = await getEffectiveDoctorId(req)
    if (doctorId && current.doctorId !== doctorId) {
      res.status(403).json({ message: 'Acesso negado. Este tipo pertence a outro médico.' })
      return
    }

    const type = await prisma.appointmentType.update({
      where: { id },
      data: { active: !current.active },
    })
    res.json(type)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// ─── DELETE /:id — remover tipo ──────────────────────────────────────────────
router.delete('/:id', requireRole('ADMIN', 'DOCTOR'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.appointmentType.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ message: 'Tipo não encontrado' })
      return
    }

    const doctorId = await getEffectiveDoctorId(req)
    if (doctorId && existing.doctorId !== doctorId) {
      res.status(403).json({ message: 'Acesso negado. Este tipo pertence a outro médico.' })
      return
    }

    await prisma.appointmentType.delete({ where: { id } })
    res.json({ message: 'Tipo removido com sucesso' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
