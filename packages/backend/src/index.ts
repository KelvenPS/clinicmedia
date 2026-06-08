import express from 'express'
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

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    db: 'postgresql/neon',
  })
})

app.listen(PORT, () => {
  console.log('')
  console.log('  ⚡  ClinIQ Pro — API')
  console.log(`  🚀  Servidor: http://localhost:${PORT}`)
  console.log(`  🐘  Banco: PostgreSQL (Neon)`)
  console.log(`  📡  Ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log('')
})

export default app
