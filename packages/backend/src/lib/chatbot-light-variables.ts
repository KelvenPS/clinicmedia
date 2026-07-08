import { PrismaClient } from '@prisma/client'

// ─── Variable Registry (single source of truth) ───────────────────────────────

export const TEMPLATE_VARIABLE_REGISTRY = [
  // Paciente
  { key: '{nome}',             label: 'Nome do paciente',          category: 'paciente',     description: 'Nome completo do paciente' },
  { key: '{telefone}',         label: 'Telefone',                  category: 'paciente',     description: 'Telefone do paciente' },
  { key: '{cpf}',              label: 'CPF',                       category: 'paciente',     description: 'CPF do paciente (mascarado)' },
  { key: '{plano}',            label: 'Plano de saúde',            category: 'paciente',     description: 'Nome do convênio/plano do paciente' },
  { key: '{carteirinha}',      label: 'Número da carteirinha',      category: 'paciente',     description: 'Número da carteirinha do convênio do paciente' },
  // Consulta
  { key: '{data}',             label: 'Data da consulta',          category: 'consulta',     description: 'Data formatada dd/mm/aaaa' },
  { key: '{hora}',             label: 'Hora da consulta',          category: 'consulta',     description: 'Hora no formato HH:MM' },
  { key: '{tipo_atendimento}', label: 'Tipo de atendimento',       category: 'consulta',     description: 'Ex: Consulta, Retorno, Avaliação' },
  { key: '{status}',           label: 'Status da consulta',        category: 'consulta',     description: 'Ex: Confirmado, Agendado, Cancelado' },
  // Médico / Clínica
  { key: '{medico}',           label: 'Nome do médico',            category: 'clinica',      description: 'Nome completo do profissional' },
  { key: '{especialidade}',    label: 'Especialidade',             category: 'clinica',      description: 'Especialidade do profissional' },
  { key: '{endereco}',         label: 'Endereço',                  category: 'clinica',      description: 'Endereço da sala/clínica' },
  { key: '{clinica}',          label: 'Nome da clínica/sala',       category: 'clinica',      description: 'Nome da sala/clínica onde a consulta ocorre' },
  { key: '{telefone_clinica}', label: 'Telefone da clínica',        category: 'clinica',      description: 'Telefone do WhatsApp vinculado à sala' },
  { key: '{crm}',              label: 'CRM do médico',              category: 'clinica',      description: 'Registro profissional (CRM/CRP) do médico' },
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
  patientWalletNumber?: string
  // Consulta
  appointmentDate?: string
  appointmentTime?: string
  appointmentType?: string
  appointmentStatus?: string
  // Médico / Clínica
  doctorName?: string
  doctorSpecialty?: string
  doctorCrm?: string
  clinicAddress?: string
  clinicName?: string
  clinicPhone?: string
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

const BR_TZ = 'America/Sao_Paulo'

// ─── Date Formatting ──────────────────────────────────────────────────────────

function formatDatePtBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: BR_TZ })
}

function formatTimePtBR(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BR_TZ })
}

function buildRoomAddress(room: any): string | undefined {
  const parts = [room?.logradouro, room?.numero, room?.bairro].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  return room?.address ?? undefined
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
    .replace(/\{carteirinha\}/g,      ctx.patientWalletNumber ?? '')
    .replace(/\{data\}/g,             ctx.appointmentDate   ?? '')
    .replace(/\{hora\}/g,             ctx.appointmentTime   ?? '')
    .replace(/\{tipo_atendimento\}/g, ctx.appointmentType   ?? '')
    .replace(/\{status\}/g,           ctx.appointmentStatus ?? '')
    .replace(/\{medico\}/g,           ctx.doctorName        ?? '')
    .replace(/\{especialidade\}/g,    ctx.doctorSpecialty   ?? '')
    .replace(/\{endereco\}/g,         ctx.clinicAddress     ?? '')
    .replace(/\{clinica\}/g,          ctx.clinicName        ?? '')
    .replace(/\{telefone_clinica\}/g, ctx.clinicPhone       ?? '')
    .replace(/\{crm\}/g,              ctx.doctorCrm         ?? '')
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
      room: { include: { whatsappConnection: true } },
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
    patientWalletNumber: patient?.patientPlans?.[0]?.walletNumber   ?? undefined,
    appointmentDate:   formatDatePtBR(appt.date),
    appointmentTime:   formatTimePtBR(appt.date),
    appointmentType:   (appt.type as string | null | undefined)     ?? 'Consulta',
    appointmentStatus: APPOINTMENT_STATUS_MAP[(appt.status as string) ?? ''] ?? (appt.status as string | undefined),
    doctorName:        doctor?.name                                 ?? undefined,
    doctorSpecialty:   doctor?.specialty                            ?? undefined,
    doctorCrm:         doctor?.crm                                  ?? undefined,
    clinicAddress:     buildRoomAddress(room),
    clinicName:        room?.name                                   ?? undefined,
    clinicPhone:       room?.whatsappConnection?.phoneNumber        ?? undefined,
    teleconsultaLink:  room?.teleconsultaLink                       ?? undefined,
    prontuarioLink:    `${frontendUrl}/prontuario`,
    paymentValue:      (appt as any).value != null
                         ? `R$ ${Number((appt as any).value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                         : undefined,
  }

  return { ...base, ...extras }
}

// ─── Resolução unificada de texto de mensagem ────────────────────────────────

/**
 * Ponto único de resolução de texto usado por Fluxos, Respostas Rápidas e
 * Ações do Sistema: se `templateId` estiver definido e o template existir e
 * estiver ativo, o conteúdo do template prevalece; caso contrário usa `text`
 * (texto livre salvo diretamente no fluxo/resposta/ação) como fallback.
 */
export async function resolveMessageText(
  source: { text?: string | null; templateId?: string | null },
  ctx: TemplateContext,
  prisma: PrismaClient
): Promise<string> {
  if (source.templateId) {
    const template = await prisma.lightTemplate.findUnique({ where: { id: source.templateId } })
    if (template && template.active) {
      return resolveTemplateVariables(template.content, ctx)
    }
  }
  return resolveTemplateVariables(source.text ?? '', ctx)
}
