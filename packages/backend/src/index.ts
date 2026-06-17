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
import assessmentRoutes from './routes/assessments'
import teamRoutes from './routes/team'
import appointmentTypeRoutes from './routes/appointment-types'
import roomRoutes from './routes/rooms'
import documentRoutes from './routes/documents'
import notificationRoutes from './routes/notifications'
import paymentMethodRoutes from './routes/payment-methods'
import subscriptionRoutes from './routes/subscriptions'
import integrationRoutes from './routes/integrations'
import chatbotRoutes from './routes/chatbot'
import chatbotLightRoutes from './routes/chatbot-light'
import { restoreSessions, startHealthWatchdog, runStartupDatabaseCleanup } from './lib/whatsapp'
import { startLightScheduler } from './lib/chatbot-light-engine'
import adminRoutes from './routes/admin'
import adminSqlRoutes from './routes/admin-sql'

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

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/patients', patientRoutes)
app.use('/api/financial', financialRoutes)
app.use('/api/doctors', doctorRoutes)
app.use('/api/health-plans', healthPlanRoutes)
app.use('/api/medical-records', medicalRecordRoutes)
app.use('/api/appointment-blocks', appointmentBlockRoutes)
app.use('/api/assessments', assessmentRoutes)
app.use('/api/team', teamRoutes)
app.use('/api/appointment-types', appointmentTypeRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/payment-methods', paymentMethodRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/integrations', integrationRoutes)
app.use('/api/chatbot', chatbotRoutes)
app.use('/api/chatbot-light', chatbotLightRoutes)
app.use('/api/admin/sql', adminSqlRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
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
      // Restaura sessões WhatsApp ativas após restart do servidor
      restoreSessions().catch(err => console.error('[WA] Erro ao restaurar sessões:', err))
    })
    .catch(err => console.error('[WA] Erro na limpeza inicial:', err))

  // Inicia watchdog que monitora e restaura sessões WhatsApp que morrem silenciosamente
  startHealthWatchdog()

  // Inicia o scheduler do Chatbot Light para disparar avisos atrasados e lembretes periódicos
  startLightScheduler()
})

export default app
