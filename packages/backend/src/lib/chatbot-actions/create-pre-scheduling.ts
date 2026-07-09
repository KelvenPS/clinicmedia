import { prisma } from '../prisma'
import type { SystemAction } from './types'

// Mesmo formato usado por POST /patients/pre-register (routes/patients.ts) —
// status PRE_CADASTRO, origin CHATBOT. Reaproveita a checagem de duplicidade
// (mesmo padrão de findDuplicatePatient) direto aqui.
export const createPreScheduling: SystemAction = {
  key: 'create_pre_scheduling',
  name: 'Criar pré-agendamento',
  description: 'Registra o interesse do paciente para contato posterior da secretaria (sem confirmar horário).',
  implemented: true,
  inputs: [
    { key: 'nome', label: 'Nome', required: true },
    { key: 'telefone', label: 'Telefone', required: true },
    { key: 'cpf', label: 'CPF', required: false },
    { key: 'observacao', label: 'Observação', required: false },
    { key: 'salaId', label: 'Sala', required: false },
  ],
  outputs: [
    { key: 'preAgendamentoId', label: 'ID do pré-agendamento', required: true },
    { key: 'protocolo', label: 'Protocolo', required: true },
    { key: 'status', label: 'Status', required: true },
  ],
  async execute(ctx, input) {
    const phone = String(input.telefone ?? '').replace(/\D/g, '')
    const cpf = input.cpf ? String(input.cpf).replace(/\D/g, '') : undefined

    const duplicate = cpf
      ? await prisma.patient.findFirst({ where: { doctorId: ctx.doctorId, cpf } })
      : await prisma.patient.findFirst({ where: { doctorId: ctx.doctorId, phone } })
    if (duplicate) {
      return {
        success: true,
        data: { preAgendamentoId: duplicate.id, protocolo: `PA-${duplicate.id.slice(0, 8).toUpperCase()}`, status: duplicate.status },
      }
    }

    const patient = await prisma.patient.create({
      data: {
        doctorId: ctx.doctorId,
        name: String(input.nome ?? ''),
        phone,
        cpf: cpf || null,
        notes: input.observacao ? String(input.observacao) : null,
        roomId: input.salaId ? String(input.salaId) : null,
        status: 'PRE_CADASTRO',
        origin: 'CHATBOT',
        leadStatus: 'NOVO',
      },
    })

    return {
      success: true,
      data: {
        preAgendamentoId: patient.id,
        protocolo: `PA-${patient.id.slice(0, 8).toUpperCase()}`,
        status: patient.status,
      },
    }
  },
}
