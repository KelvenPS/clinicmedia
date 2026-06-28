import { PrismaClient } from '@prisma/client'

// ─── Variable Registry (single source of truth) ───────────────────────────────

export const TEMPLATE_VARIABLE_REGISTRY = [
  // Paciente
  { key: '{nome}',             label: 'Nome do paciente',          category: 'paciente',     description: 'Nome completo do paciente' },
  { key: '{telefone}',         label: 'Telefone',                  category: 'paciente',     description: 'Telefone do paciente' },
  { key: '{cpf}',              label: 'CPF',                       category: 'paciente',     description: 'CPF do paciente (mascarado)' },
  { key: '{plano}',            label: 'Plano de saúde',            category: 'paciente',     description: 'Nome do convênio/plano do paciente' },
  // Consulta
  { key: '{data}',             label: 'Data da consulta',          category: 'consulta',     description: 'Data formatada dd/mm/aaaa' },
  { key: '{hora}',             label: 'Hora da consulta',          category: 'consulta',     description: 'Hora no formato HH:MM' },
  { key: '{tipo_atendimento}', label: 'Tipo de atendimento',       category: 'consulta',     description: 'Ex: Consulta, Retorno, Avaliação' },
  { key: '{status}',           label: 'Status da consulta',        category: 'consulta',     description: 'Ex: Confirmado, Agendado, Cancelado' },
  // Médico / Clínica
  { key: '{medico}',           label: 'Nome do médico',            category: 'clinica',      description: 'Nome completo do profissional' },
  { key: '{especialidade}',    label: 'Especialidade',             category: 'clinica',      description: 'Especialidade do profissional' },
  { key: '{endereco}',         label: 'Endereço',                  category: 'clinica',      description: 'Endereço da sala/clínica' },
  // Financeiro
  { key: '{valor}',            label: 'Valor',                     category: 'financeiro',   description: 'Valor da consulta em R$' },
  { key: '{forma_pagamento}',  label: 'Forma de pagamento',        category: 'financeiro',   description: 'Ex: PIX, Cartão, Dinheiro' },
  { key: '{nf}',               label: 'Nota fiscal',               category: 'financeiro',   description: 'Número ou link da nota fiscal' },
  // Links / Digital
  { key: '{link}',             label: 'Link genérico',             category: 'digital',      description: 'Link personalizado' },
  { key: '{teleconsulta}',     label: 'Link teleconsulta',         category: 'digital',      description: 'Link para a consulta online' },
  { key: '{prontuario}',       label: 'Link prontuário',           category: 'digital',      description: 'Link para acessar o prontuário' },
  { key: '{documento}',        label: 'Documento',                 category: 'digital',      description: 'Nome de documento enviado' },
] as const

export type TemplateVariableKey = typeof TEMPLATE_VARIABLE_REGISTRY[number]['key']
export type TemplateVariableCategory = typeof TEMPLATE_VARIABLE_REGISTRY[number]['category']

// ─── Template Context ─────────────────────────────────────────────────────────

export interface TemplateContext {
  // Paciente
  patientName?: string
  patientPhone?: string
  patientCpf?: string
  patientPlan?: string
  // Consulta
  appointmentDate?: string
  appointmentTime?: string
  appointmentType?: string
  appointmentStatus?: string
  // Médico / Clínica
  doctorName?: string
  doctorSpecialty?: string
  clinicAddress?: string
  // Financeiro
  paymentValue?: string
  paymentMethod?: string
  nfNumber?: string
  nfLink?: string
  // Digital
  link?: string
  teleconsultaLink?: string
  prontuarioLink?: string
  documentName?: string
}

// ─── Appointment Status Map (EN → PT-BR) ─────────────────────────────────────

const APPOINTMENT_STATUS_MAP: Record<string, string> = {
  CONFIRMED:  'Confirmada',
  SCHEDULED:  'Agendada',
  CANCELLED:  'Cancelada',
  COMPLETED:  'Concluída',
  NO_SHOW:    'Não compareceu',
  WAITING:    'Aguardando',
  IN_PROGRESS: 'Em atendimento',
}

// ─── Date Formatting (sem date-fns) ──────────────────────────────────────────

function formatDatePtBR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function formatTimePtBR(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

// ─── CPF Mask ─────────────────────────────────────────────────────────────────

function maskCpf(cpf: string): string {
  const clean = cpf.replace(/\D/g, '')
  if (clean.length !== 11) return '***'
  return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9)}`
}

// ─── Core Resolution Function ─────────────────────────────────────────────────

/**
 * Substitui todas as variáveis do registry no template.
 * Campos não fornecidos no contexto resultam em string vazia.
 */
export function resolveTemplateVariables(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{nome\}/g,             ctx.patientName       ?? '')
    .replace(/\{telefone\}/g,         ctx.patientPhone      ?? '')
    .replace(/\{cpf\}/g,              ctx.patientCpf        ?? '')
    .replace(/\{plano\}/g,            ctx.patientPlan       ?? '')
    .replace(/\{data\}/g,             ctx.appointmentDate   ?? '')
    .replace(/\{hora\}/g,             ctx.appointmentTime   ?? '')
    .replace(/\{tipo_atendimento\}/g, ctx.appointmentType   ?? '')
    .replace(/\{status\}/g,           ctx.appointmentStatus ?? '')
    .replace(/\{medico\}/g,           ctx.doctorName        ?? '')
    .replace(/\{especialidade\}/g,    ctx.doctorSpecialty   ?? '')
    .replace(/\{endereco\}/g,         ctx.clinicAddress     ?? '')
    .replace(/\{valor\}/g,            ctx.paymentValue      ?? '')
    .replace(/\{forma_pagamento\}/g,  ctx.paymentMethod     ?? '')
    .replace(/\{nf\}/g,               ctx.nfLink ?? ctx.nfNumber ?? '')
    .replace(/\{link\}/g,             ctx.link              ?? '')
    .replace(/\{teleconsulta\}/g,     ctx.teleconsultaLink  ?? '')
    .replace(/\{prontuario\}/g,       ctx.prontuarioLink    ?? '')
    .replace(/\{documento\}/g,        ctx.documentName      ?? '')
}

// ─── Context Resolver from Appointment ───────────────────────────────────────

/**
 * Resolve o TemplateContext completo a partir de um appointmentId.
 * O parâmetro `extras` permite sobrescrever ou adicionar campos ao contexto final.
 */
export async function resolveContextFromAppointment(
  appointmentId: string,
  prisma: PrismaClient,
  extras: Partial<TemplateContext> = {}
): Promise<TemplateContext> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        include: {
          patientPlans: {
            include: { healthPlan: true },
            take: 1,
          },
        },
      },
      doctor: true,
      room: true,
    },
  })

  if (!appt) {
    return extras
  }

  const patient = appt.patient as any
  const doctor  = appt.doctor as any
  const room    = appt.room   as any

  const rawCpf = patient?.cpf as string | null | undefined
  const maskedCpf = rawCpf ? maskCpf(rawCpf) : undefined

  const frontendUrl = process.env.FRONTEND_URL ?? ''

  const base: TemplateContext = {
    patientName:       patient?.name                                ?? undefined,
    patientPhone:      patient?.phone                               ?? undefined,
    patientCpf:        maskedCpf,
    patientPlan:       patient?.patientPlans?.[0]?.healthPlan?.name ?? undefined,
    appointmentDate:   formatDatePtBR(appt.date),
    appointmentTime:   formatTimePtBR(appt.date),
    appointmentType:   (appt.type as string | null | undefined)     ?? 'Consulta',
    appointmentStatus: APPOINTMENT_STATUS_MAP[(appt.status as string) ?? ''] ?? (appt.status as string | undefined),
    doctorName:        doctor?.name                                 ?? undefined,
    doctorSpecialty:   doctor?.specialty                            ?? undefined,
    clinicAddress:     room?.address                                ?? undefined,
    teleconsultaLink:  room?.teleconsultaLink                       ?? undefined,
    prontuarioLink:    `${frontendUrl}/prontuario`,
  }

  return { ...base, ...extras }
}
