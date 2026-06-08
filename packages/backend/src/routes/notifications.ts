import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

router.get('/', async (req: AuthRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(notifications)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.userId, read: false },
    })
    res.json({ count })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    const notif = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    })
    res.json(notif)
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.patch('/read-all', async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false },
      data: { read: true },
    })
    res.json({ message: 'Todas as notificações foram marcadas como lidas' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.notification.delete({ where: { id: req.params.id } })
    res.json({ message: 'Notificação removida' })
  } catch {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT' = 'INFO',
  link?: string,
) => {
  try {
    await prisma.notification.create({ data: { userId, title, message, type, link } })
  } catch {
    // Notifications are non-critical — silently ignore errors
  }
}

export default router
