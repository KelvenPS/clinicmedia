import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)
router.use(requireRole('ADMIN'))

const MAX_QUERY_LENGTH = 10_000
const QUERY_TIMEOUT_MS = 30_000

// ─── POST /api/admin/sql/execute ─────────────────────────────────────────────
router.post('/execute', async (req: AuthRequest, res: Response) => {
  const { query, allowWrites = false } = req.body as {
    query: unknown
    allowWrites?: boolean
  }

  if (typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ message: 'Campo "query" é obrigatório e deve ser uma string.' })
    return
  }

  if (query.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ message: `Query muito longa. Máximo: ${MAX_QUERY_LENGTH} caracteres.` })
    return
  }

  const normalised = query.trim().toUpperCase()
  const isSelect = normalised.startsWith('SELECT')

  if (!allowWrites && !isSelect) {
    res.status(403).json({
      message: 'Apenas queries SELECT são permitidas por padrão. Passe allowWrites: true para executar escrita.',
    })
    return
  }

  if (allowWrites) {
    console.warn(
      `[ADMIN SQL WRITE] adminId=${req.user!.userId} query="${query.slice(0, 200)}${query.length > 200 ? '…' : ''}"`,
    )
  }

  const startMs = Date.now()
  let rows: unknown[] = []
  let success = false
  let errorMessage: string | undefined

  try {
    const result = await Promise.race([
      prisma.$queryRawUnsafe<unknown[]>(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout (30s)')), QUERY_TIMEOUT_MS),
      ),
    ])

    rows = result
    success = true
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err)
  }

  const durationMs = Date.now() - startMs
  const rowCount = rows.length

  // Persist query log
  await prisma.sqlQueryLog
    .create({
      data: {
        adminId: req.user!.userId,
        query,
        rowCount: success ? rowCount : null,
        durationMs,
        success,
        error: errorMessage ?? null,
      },
    })
    .catch(logErr => {
      console.error('[ADMIN SQL] Failed to persist query log:', logErr)
    })

  if (!success) {
    res.status(400).json({ message: errorMessage ?? 'Erro ao executar query', durationMs })
    return
  }

  // Derive column names from the first row
  const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : []

  res.json({ rows, columns, rowCount, durationMs })
})

// ─── GET /api/admin/sql/history ──────────────────────────────────────────────
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const logs = await prisma.sqlQueryLog.findMany({
      where: { adminId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        query: true,
        rowCount: true,
        durationMs: true,
        success: true,
        error: true,
        createdAt: true,
      },
    })
    res.json(logs)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export default router
