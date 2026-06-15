export type Role = 'ADMIN' | 'DOCTOR' | 'SECRETARY'
export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type TransactionType = 'INCOME' | 'EXPENSE'
export type TransactionStatus = 'PENDING' | 'PAID' | 'CANCELLED'
export type PlanType = 'PARTICULAR' | 'CONVENIO' | 'OUTROS'
export type RecordType = 'ANAMNESE' | 'EVOLUCAO' | 'PRESCRICAO' | 'EXAME' | 'ATESTADO' | 'OUTROS'
export type AssessmentType = 'WISC_IV' | 'WASI' | 'WAIS_III' | 'COGNITIVA' | 'RAVLT'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  specialty?: string | null
  certType?: string | null
  certNumber?: string | null
  crm?: string | null
  phone?: string | null
  avatarUrl?: string | null
  bio?: string | null
  createdAt?: string
  _count?: { doctorAppointments: number }
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  specialty?: string | null
  certType?: string | null
  certNumber?: string | null
  crm?: string | null
  phone?: string | null
  avatarUrl?: string | null
}

export interface HealthPlan {
  id: string
  name: string
  type: PlanType
  customTypeName?: string | null
  description?: string | null
  discountPercent?: number | null
  defaultValue?: number | null
  roomId?: string | null
  room?: { id: string; name: string; logradouro?: string | null; cidade?: string | null } | null
  active: boolean
  createdAt: string
  _count?: { patientPlans: number }
}

export interface PatientPlan {
  id: string
  patientId: string
  healthPlanId: string
  value?: number | null
  walletNumber?: string | null
  validUntil?: string | null
  createdAt: string
  healthPlan: HealthPlan
}

export interface Patient {
  id: string
  name: string
  email?: string | null
  phone: string
  birthDate?: string | null
  cpf?: string | null
  rg?: string | null
  address?: string | null
  notes?: string | null
  responsibleName?: string | null
  responsiblePhone?: string | null
  active: boolean
  createdAt: string
  _count?: { appointments: number }
  patientPlans?: PatientPlan[]
}

export interface AppointmentBlock {
  id: string
  doctorId: string
  date: string
  endDate: string
  reason?: string | null
  createdAt: string
  doctor: { id: string; name: string; specialty?: string | null }
}

export interface Appointment {
  id: string
  patientId: string
  doctorId: string
  createdById: string
  roomId?: string | null
  title: string
  date: string
  duration: number
  status: AppointmentStatus
  isBlocked: boolean
  notes?: string | null
  type?: string | null
  value?: number | null
  createdAt: string
  patient: { id: string; name: string; phone: string }
  doctor: { id: string; name: string; specialty?: string | null; crm?: string | null }
  createdBy?: { id: string; name: string }
  room?: { id: string; name: string; logradouro?: string | null; cidade?: string | null } | null
}

export interface Transaction {
  id: string
  doctorId: string
  appointmentId?: string | null
  type: TransactionType
  amount: number
  description: string
  date: string
  status: TransactionStatus
  category?: string | null
  createdAt: string
  doctor: { id: string; name: string }
  appointment?: { id: string; patient: { id: string; name: string } } | null
}

export interface MedicalRecord {
  id: string
  patientId: string
  doctorId: string
  title: string
  content: string
  type: RecordType
  date: string
  specialtyType?: string | null
  specialtyData?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  patient?: { id: string; name: string }
  doctor: { id: string; name: string; specialty?: string | null; crm?: string | null }
}

export interface GroupedMedicalRecord {
  doctor: { id: string; name: string; specialty: string | null; crm: string | null }
  records: MedicalRecord[]
}

export interface Assessment {
  id: string
  patientId: string
  doctorId: string
  type: AssessmentType
  assessDate: string
  patientAge?: number | null
  subtestScores: Record<string, number | null>
  compositeScores: Record<string, number | null>
  interpretation?: string | null
  notes?: string | null
  status: string
  createdAt: string
  updatedAt: string
  patient: { id: string; name: string; birthDate?: string | null }
  doctor: { id: string; name: string; specialty?: string | null; certType?: string | null; certNumber?: string | null; crm?: string | null }
}

export interface DoctorSecretary {
  id: string
  doctorId: string
  secretaryId: string
  active: boolean
  createdAt: string
  secretary: {
    id: string
    name: string
    email: string
    phone?: string | null
    active: boolean
    createdAt: string
  }
}

export interface FinancialSummary {
  income: number
  expense: number
  balance: number
  pending: number
}

export interface FinancialResponse {
  transactions: Transaction[]
  summary: FinancialSummary
}

export interface AppointmentStats {
  todayTotal: number
  todayCompleted: number
  todayScheduled: number
  totalPatients: number
}

export interface Room {
  id: string
  doctorId: string
  name: string
  logradouro?: string | null
  cep?: string | null
  numero?: string | null
  cidade?: string | null
  daysOfWeek: number[]
  startTime: string
  endTime: string
  color?: string | null
  active: boolean
  createdAt: string
  doctor?: { id: string; name: string; specialty?: string | null }
  secretaries?: { id: string; secretaryId: string; secretary: { id: string; name: string; email: string } }[]
}

export interface DocumentTemplate {
  id: string
  doctorId: string
  name: string
  type: 'ATESTADO' | 'DECLARACAO' | 'RECIBO' | 'COMPROVANTE' | 'OUTROS'
  content: string
  active: boolean
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  read: boolean
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT'
  link?: string | null
  createdAt: string
}

export interface PaymentMethod {
  id: string
  doctorId: string
  name: string
  type: 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'CHEQUE' | 'DINHEIRO' | 'TRANSFERENCIA' | 'OUTROS'
  instructions?: string | null
  active: boolean
  createdAt: string
}

export type PlanKey = 'TRIAL' | 'PRO' | 'PLUS' | 'CLINIC' | 'TELECONSULTA' | 'TELECONSULTA_PRO'
export type PlanStatus = 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'EXPIRED'

export const PLAN_DISPLAY: Record<PlanKey, string> = {
  TRIAL:            'Período Gratuito',
  PRO:              'Pro',
  PLUS:             'Plus',
  CLINIC:           'Clínica',
  TELECONSULTA:     'Teleconsulta',
  TELECONSULTA_PRO: 'Teleconsulta Pro',
}

export const PLAN_FEATURES: Record<PlanKey, string[]> = {
  TRIAL:            ['agenda', 'prontuario', 'financeiro'],
  PRO:              ['agenda', 'prontuario', 'financeiro'],
  PLUS:             ['agenda', 'prontuario', 'financeiro'],
  CLINIC:           ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot'],
  TELECONSULTA:     ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot', 'chatbot_agente', 'teleconsulta'],
  TELECONSULTA_PRO: ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot', 'chatbot_agente', 'teleconsulta', 'teleconsulta_pro'],
}

export const PLAN_LIMITS: Record<PlanKey, { rooms: number; secretaries: number; teleconsultas: number }> = {
  TRIAL:            { rooms: 0, secretaries: 0, teleconsultas: 0 },
  PRO:              { rooms: 1, secretaries: 1, teleconsultas: 0 },
  PLUS:             { rooms: 3, secretaries: 3, teleconsultas: 0 },
  CLINIC:           { rooms: 999, secretaries: 999, teleconsultas: 0 },
  TELECONSULTA:     { rooms: 999, secretaries: 999, teleconsultas: 4 },
  TELECONSULTA_PRO: { rooms: 999, secretaries: 999, teleconsultas: 10 },
}

export const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  PRO:              { monthly: 89.90,  annual: 89.90  * 12 * 0.85 },
  PLUS:             { monthly: 109.90, annual: 109.90 * 12 * 0.85 },
  CLINIC:           { monthly: 159.90, annual: 159.90 * 12 * 0.85 },
  TELECONSULTA:     { monthly: 199.90, annual: 199.90 * 12 * 0.85 },
  TELECONSULTA_PRO: { monthly: 399.90, annual: 399.90 * 12 * 0.85 },
}

export interface SubscriptionPaymentRecord {
  id: string
  plan: string
  billingCycle: string
  amount: number
  status: string
  mpPaymentId?: string | null
  paidAt?: string | null
  createdAt: string
}

export interface DoctorSubscription {
  id: string
  doctorId: string
  plan: PlanKey
  billingCycle: 'MONTHLY' | 'ANNUAL'
  status: PlanStatus
  trialEndsAt?: string | null
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  cancelledAt?: string | null
  mpPaymentId?: string | null
  adminNote?: string | null
  trialWarned?: boolean
  createdAt: string
  payments?: SubscriptionPaymentRecord[]
}

export interface AppointmentType {
  id: string
  name: string
  baseValue?: number | null
  hasReturns: boolean
  active: boolean
  createdAt: string
}

export interface MonthlyData {
  month: number
  income: number
  expense: number
}

export type IntegrationType = 'WEBHOOK' | 'GOOGLE_CALENDAR' | 'GOOGLE_GMAIL' | 'WHATSAPP' | 'AI_AGENT'

export interface Integration {
  id: string
  doctorId: string
  type: IntegrationType
  name: string
  active: boolean
  config: Record<string, unknown>
  events: string[]
  createdAt: string
  updatedAt: string
  _count?: { webhookLogs: number }
}

export interface WebhookLog {
  id: string
  integrationId: string
  event: string
  payload: Record<string, unknown>
  statusCode?: number | null
  success: boolean
  responseBody?: string | null
  error?: string | null
  duration?: number | null
  createdAt: string
}
