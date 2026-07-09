import { createAppointmentFromChatbot } from '../chatbot-light-guided-engine'
import type { SystemAction } from './types'

// Encapsula createAppointmentFromChatbot() (chatbot-light-guided-engine.ts)
// — a lógica transacional de agendamento (checagem de conflito, find-or-create
// de Patient, criação do Appointment) não é reescrita, só chamada.
export const createAppointment: SystemAction = {
  key: 'create_appointment',
  name: 'Criar agendamento',
  description: 'Cria um agendamento real na agenda da clínica a partir dos dados coletados na conversa.',
  implemented: true,
  inputs: [
    { key: 'nome', label: 'Nome do paciente', required: true },
    { key: 'telefone', label: 'Telefone', required: true },
    { key: 'cpf', label: 'CPF', required: false },
    { key: 'convenioId', label: 'Convênio', required: false },
    { key: 'servicoId', label: 'Serviço', required: true },
    { key: 'startAt', label: 'Início do horário (ISO)', required: true },
    { key: 'endAt', label: 'Fim do horário (ISO)', required: true },
  ],
  outputs: [
    { key: 'agendamentoId', label: 'ID do agendamento', required: true },
    { key: 'protocolo', label: 'Protocolo', required: true },
    { key: 'status', label: 'Status', required: true },
  ],
  async execute(ctx, input) {
    try {
      const appointment = await createAppointmentFromChatbot({
        doctorId: ctx.doctorId,
        patientName: String(input.nome ?? ''),
        patientPhone: String(input.telefone ?? ''),
        patientCpf: input.cpf ? String(input.cpf) : undefined,
        patientConvenioId: input.convenioId ? String(input.convenioId) : undefined,
        serviceId: String(input.servicoId ?? ''),
        startAt: String(input.startAt ?? ''),
        endAt: String(input.endAt ?? ''),
        source: 'VISUAL_BUILDER',
      })
      return {
        success: true,
        data: {
          agendamentoId: appointment.id,
          protocolo: `AG-${appointment.id.slice(0, 8).toUpperCase()}`,
          status: appointment.status,
        },
      }
    } catch (err: any) {
      const code = err?.message === 'SLOT_OCCUPIED' || err?.message === 'SLOT_BLOCKED' ? err.message : 'CREATE_APPOINTMENT_FAILED'
      return { success: false, error: 'Não foi possível concluir o agendamento agora.', code }
    }
  },
}
