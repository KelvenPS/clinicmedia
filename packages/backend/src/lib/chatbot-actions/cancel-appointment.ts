import { prisma } from '../prisma'
import type { SystemAction } from './types'

export const cancelAppointment: SystemAction = {
  key: 'cancel_appointment',
  name: 'Cancelar consulta',
  description: 'Cancela um agendamento existente.',
  implemented: true,
  inputs: [
    { key: 'agendamentoId', label: 'ID do agendamento', required: true },
    { key: 'motivo', label: 'Motivo', required: false },
  ],
  outputs: [{ key: 'status', label: 'Status atualizado', required: true }],
  async execute(ctx, input) {
    const agendamentoId = String(input.agendamentoId ?? '')
    const existing = await prisma.appointment.findFirst({ where: { id: agendamentoId, doctorId: ctx.doctorId } })
    if (!existing) {
      return { success: false, error: 'Agendamento não encontrado.', code: 'APPOINTMENT_NOT_FOUND' }
    }
    if (existing.status === 'CANCELLED') {
      return { success: true, data: { status: 'CANCELLED' } }
    }
    await prisma.appointment.update({
      where: { id: agendamentoId },
      data: {
        status: 'CANCELLED',
        notes: input.motivo ? `${existing.notes ?? ''}\nCancelado via chatbot: ${input.motivo}`.trim() : existing.notes,
      },
    })
    return { success: true, data: { status: 'CANCELLED' } }
  },
}
