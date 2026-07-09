import { prisma } from '../prisma'
import type { SystemAction } from './types'

export const updatePatientData: SystemAction = {
  key: 'update_patient_data',
  name: 'Atualizar cadastro do paciente',
  description: 'Atualiza dados cadastrais de um paciente já existente (localizado por CPF ou telefone).',
  implemented: true,
  inputs: [
    { key: 'cpf', label: 'CPF (para localizar)', required: false },
    { key: 'telefone', label: 'Telefone (para localizar)', required: false },
    { key: 'nome', label: 'Novo nome', required: false },
    { key: 'email', label: 'Novo e-mail', required: false },
    { key: 'endereco', label: 'Novo endereço', required: false },
  ],
  outputs: [
    { key: 'pacienteId', label: 'ID do paciente', required: false },
    { key: 'atualizado', label: 'Atualizado com sucesso?', required: true },
  ],
  async execute(ctx, input) {
    const cpf = input.cpf ? String(input.cpf).replace(/\D/g, '') : undefined
    const phone = input.telefone ? String(input.telefone).replace(/\D/g, '') : undefined
    if (!cpf && !phone) {
      return { success: false, error: 'Informe CPF ou telefone para localizar o paciente.', code: 'MISSING_LOOKUP' }
    }

    const patient = cpf
      ? await prisma.patient.findFirst({ where: { doctorId: ctx.doctorId, cpf } })
      : await prisma.patient.findFirst({ where: { doctorId: ctx.doctorId, phone } })
    if (!patient) {
      return { success: false, error: 'Paciente não encontrado.', code: 'PATIENT_NOT_FOUND' }
    }

    const data: Record<string, unknown> = {}
    if (input.nome) data.name = String(input.nome)
    if (input.email) data.email = String(input.email)
    if (input.endereco) data.address = String(input.endereco)

    if (Object.keys(data).length === 0) {
      return { success: true, data: { pacienteId: patient.id, atualizado: false } }
    }

    await prisma.patient.update({ where: { id: patient.id }, data })
    return { success: true, data: { pacienteId: patient.id, atualizado: true } }
  },
}
