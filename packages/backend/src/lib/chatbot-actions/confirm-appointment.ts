import { prisma } from '../prisma'
import type { SystemAction } from './types'

export const confirmAppointment: SystemAction = {
  key: 'confirm_appointment',
  name: 'Confirmar consulta',
  description: 'Marca um agendamento existente como confirmado.',
  implemented: true,
  inputs: [{ key: 'agendamentoId', label: 'ID do agendamento', required: true }],
  outputs: [{ key: 'status', label: 'Status atualizado', required: true }],
  async execute(ctx, input) {
    const agendamentoId = String(input.agendamentoId ?? '')
    const result = await prisma.appointment.updateMany({
      where: { id: agendamentoId, doctorId: ctx.doctorId },
      data: { status: 'CONFIRMED' },
    })
    if (result.count === 0) {
      return { success: false, error: 'Agendamento não encontrado.', code: 'APPOINTMENT_NOT_FOUND' }
    }
    return { success: true, data: { status: 'CONFIRMED' } }
  },
}
