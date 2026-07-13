import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import appointmentRoutes from './routes/appointments'
import patientRoutes from './routes/patients'
import financialRoutes from './routes/financial'
import doctorRoutes from './routes/doctors'
import healthPlanRoutes from './routes/health-plans'
import medicalRecordRoutes from './routes/medical-records'
import appointmentBlockRoutes from './routes/appointment-blocks'
import teamRoutes from './routes/team'
import appointmentTypeRoutes from './routes/appointment-types'
import roomRoutes from './routes/rooms'
import documentRoutes from './routes/documents'
import notificationRoutes from './routes/notifications'
import paymentMethodRoutes from './routes/payment-methods'
import integrationRoutes from './routes/integrations'
import chatbotLightRoutes from './routes/chatbot-light'
import myRoomsRoutes from './routes/my-rooms'
import { runStartupDatabaseCleanup } from './lib/whatsapp'
import { restoreRoomSessions, startRoomHealthWatchdog } from './lib/room-whatsapp'
import { startLightScheduler } from './lib/chatbot-light-engine'
import adminRoutes from './routes/admin'
import adminSqlRoutes from './routes/admin-sql'
import versionRoutes from './routes/version'
import readinessRoutes from './routes/readiness'
import subscriptionRoutes from './routes/subscriptions'
import kiwifyWebhookRoutes from './routes/webhooks-kiwify'
import { getAppVersion } from './lib/app-version'
import { authenticate } from './middleware/auth'
import { requireActiveSubscription } from './middleware/subscription'
import { startSubscriptionExpiryWatchdog } from './lib/subscription-access'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin requests (no origin header) and any browser origin.
    // Auth is enforced by JWT tokens, not by origin allow-list.
    callback(null, origin || true)
  },
  credentials: true,
}))

// Captura o corpo bruto da requisição (necessário pra validar a assinatura
// HMAC do webhook da Kiwify, que precisa dos bytes originais, não do JSON já
// reserializado). Custo desprezível para as demais rotas.
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf
  },
}))
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/appointments', authenticate, requireActiveSubscription, appointmentRoutes)
app.use('/api/patients', authenticate, requireActiveSubscription, patientRoutes)
app.use('/api/financial', authenticate, requireActiveSubscription, financialRoutes)
app.use('/api/doctors', doctorRoutes)
app.use('/api/health-plans', authenticate, requireActiveSubscription, healthPlanRoutes)
app.use('/api/medical-records', authenticate, requireActiveSubscription, medicalRecordRoutes)
app.use('/api/appointment-blocks', authenticate, requireActiveSubscription, appointmentBlockRoutes)
// Avaliações (NFe/Teleconsulta/Avaliação) removidas do produto — rota desmontada
// de propósito, mas o arquivo e o modelo Assessment continuam intactos caso
// precise ser reativado (ver docs/assinatura-kiwify.md).
app.use('/api/team', authenticate, requireActiveSubscription, teamRoutes)
app.use('/api/appointment-types', authenticate, requireActiveSubscription, appointmentTypeRoutes)
app.use('/api/rooms', authenticate, requireActiveSubscription, roomRoutes)
app.use('/api/documents', authenticate, requireActiveSubscription, documentRoutes)
app.use('/api/notifications', authenticate, requireActiveSubscription, notificationRoutes)
app.use('/api/payment-methods', authenticate, requireActiveSubscription, paymentMethodRoutes)
app.use('/api/integrations', authenticate, requireActiveSubscription, integrationRoutes)
app.use('/api/chatbot-light', authenticate, requireActiveSubscription, chatbotLightRoutes)
app.use('/api/my/rooms', authenticate, requireActiveSubscription, myRoomsRoutes)
app.use('/api/admin/sql', adminSqlRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/version', versionRoutes)
app.use('/api/readiness', readinessRoutes)
app.use('/api/subscription', subscriptionRoutes)
app.use('/api/webhooks/kiwify', kiwifyWebhookRoutes)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  })
})

// Global Express error handler — catches any error passed via next(err) in routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[EXPRESS] Unhandled route error:', err?.message || err)
  if (!res.headersSent) {
    res.status(500).json({ message: 'Erro interno do servidor' })
  }
})

// Keep the process alive — unhandled rejections and exceptions must never kill the server
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled Rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught Exception:', error?.message || error)
})

app.listen(PORT, () => {
  console.log('')
  console.log('  ⚡  ClinIQ Pro — API')
  console.log(`  🚀  Servidor: http://localhost:${PORT}`)
  console.log(`  🐘  Banco: PostgreSQL`)
  console.log(`  📡  Ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log('')

  // Limpeza de dados de inicialização e correção de LIDs antigos de teste
  runStartupDatabaseCleanup()
    .then(() => {
      // Restaura conexões WhatsApp por sala
      restoreRoomSessions().catch(err => console.error('[ROOM_WA] Erro ao restaurar sessões de sala:', err))
    })
    .catch(err => console.error('[WA] Erro na limpeza inicial:', err))

  // Inicia watchdog que monitora e restaura sessões WhatsApp que morrem silenciosamente
  startRoomHealthWatchdog()

  // Inicia o scheduler do Chatbot Light para disparar avisos atrasados e lembretes periódicos
  startLightScheduler()

  // Verifica periodicamente trials expirados e marca a assinatura como bloqueada
  startSubscriptionExpiryWatchdog()
})

export default app
