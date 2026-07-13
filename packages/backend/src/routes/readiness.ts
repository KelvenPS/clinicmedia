import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[READINESS] Database check failed:', error instanceof Error ? error.message : error)
    res.status(503).json({ status: 'not_ready', database: 'disconnected', timestamp: new Date().toISOString() })
  }
})

export default router
