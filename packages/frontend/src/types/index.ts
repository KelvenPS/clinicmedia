import type { SecretaryPermissions } from '../hooks/useSecretaryPermissions'

export type Role = 'ADMIN' | 'DOCTOR' | 'SECRETARY'
export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type PatientStatus = 'PRE_CADASTRO' | 'ATIVO' | 'INCOMPLETO' | 'INATIVO'
export type PatientOrigin = 'AGENDA' | 'CHATBOT' | 'MANUAL' | 'IMPORTACAO'
export type TransactionType = 'INCOME' | 'EXPENSE'
export type TransactionStatus = 'PENDING' | 'PAID' | 'CANCELLED'
export type PlanType = 'PARTICULAR' | 'CONVENIO' | 'OUTROS'
export type RecordType = 'ANAMNESE' | 'EVOLUCAO' | 'PRESCRICAO' | 'EXAME' | 'ATESTADO' | 'OUTROS' | 'SISTEMA'

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
  lunchStart?: string | null
  lunchEnd?: string | null
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
  lunchStart?: string | null
  lunchEnd?: string | null
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
  status: PatientStatus
  origin: PatientOrigin
  roomId?: string | null
  createdByUserId?: string | null
  completedByUserId?: string | null
  completedAt?: string | null
  createdAt: string
  _count?: { appointments: number }
  patientPlans?: PatientPlan[]
  createdByUser?: { id: string; name: string } | null
  completedByUser?: { id: string; name: string } | null
  room?: { id: string; name: string } | null
  appointments?: Array<{ id: string; date: string; title: string; status: string }>
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
  billedAt?: string | null
  createdAt: string
  patient: { id: string; name: string; phone: string; status?: PatientStatus; patientPlans?: Array<{ healthPlan: { name: string; discountPercent?: number | null } }> }
  doctor: { id: string; name: string; specialty?: string | null; crm?: string | null }
  createdBy?: { id: string; name: string }
  room?: { id: string; name: string; logradouro?: string | null; cidade?: string | null } | null
  transaction?: { id: string } | null
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
  paymentMethod?: string | null
  paymentMethodId?: string | null
  repasseValue?: number | null
  paidAt?: string | null
  notes?: string | null
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

export interface DoctorSecretary {
  id: string
  doctorId: string
  secretaryId: string
  active: boolean
  permissions?: SecretaryPermissions
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

export interface FinancialAnalyticsItem {
  id: string
  name?: string
  type?: string
  total: number
  count: number
  cidade?: string | null
  planType?: string
}

export interface FinancialAnalytics {
  byRoom: (FinancialAnalyticsItem & { name: string; cidade?: string | null })[]
  byType: (FinancialAnalyticsItem & { type: string })[]
  byHealthPlan: (FinancialAnalyticsItem & { name: string; planType: string })[]
}

export interface AppointmentStats {
  todayTotal: number
  todayCompleted: number
  todayScheduled: number
  totalPatients: number
}

export type RoomWhatsAppStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'QUARANTINED'

export interface RoomWhatsAppConnection {
  id: string
  roomId: string
  status: RoomWhatsAppStatus
  phoneNumber?: string | null
  displayName?: string | null
  connectedAt?: string | null
  disconnectedAt?: string | null
  lastSyncAt?: string | null
  qrCode?: string | null
  qrCodeExpiresAt?: string | null
  connected: boolean
  connectedByUserId?: string | null
}

export interface RoomPermissions {
  canViewSchedule: boolean
  canManageWhatsapp: boolean
  canConnectWhatsapp: boolean
  canReconnectWhatsapp: boolean
  canDisconnectWhatsapp: boolean
  canSendMessages: boolean
  canUseTemplates: boolean
  canUseAutomaticMessages: boolean
  canViewHistory: boolean
}

export interface RoomSecretary {
  id: string
  roomId: string
  secretaryId: string
  active: boolean
  canViewSchedule: boolean
  canManageWhatsapp: boolean
  canConnectWhatsapp: boolean
  canReconnectWhatsapp: boolean
  canDisconnectWhatsapp: boolean
  canSendMessages: boolean
  canUseTemplates: boolean
  canUseAutomaticMessages: boolean
  canViewHistory: boolean
  createdAt: string
  secretary: { id: string; name: string; email: string; phone?: string | null; active: boolean }
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
  secretaries?: { id: string; secretaryId: string; active: boolean; secretary: { id: string; name: string; email: string } }[]
  whatsappConnection?: Pick<RoomWhatsAppConnection, 'id' | 'status' | 'phoneNumber' | 'displayName' | 'connectedAt'> | null
  myPermissions?: RoomPermissions | null
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

// ── Advanced Financial Analytics ─────────────────────────────────────────────

export interface PaymentMethodAnalytics {
  method: string
  total: number
  count: number
  percent: number
}

export interface HourAnalytics {
  hour: number
  label: string
  total: number
  count: number
}

export interface DayOfWeekAnalytics {
  dayOfWeek: number
  label: string
  total: number
  count: number
}

export interface ConvenioAnalytics {
  convenio: string
  total: number
  count: number
}

export interface ProcedureAnalytics {
  procedure: string
  total: number
  count: number
}
