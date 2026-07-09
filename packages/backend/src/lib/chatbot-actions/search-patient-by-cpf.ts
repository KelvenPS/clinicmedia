import { prisma } from '../prisma'
import type { SystemAction } from './types'

// Mesmo padrão de busca já usado em routes/patients.ts (findDuplicatePatient),
// reimplementado aqui direto — não vale a pena exportar uma função de um
// arquivo de rotas só por isso.
export const searchPatientByCpf: SystemAction = {
  key: 'search_patient_by_cpf',
  name: 'Buscar paciente por CPF',
  description: 'Busca um paciente já cadastrado pelo CPF informado.',
  implemented: true,
  inputs: [{ key: 'cpf', label: 'CPF', required: true }],
  outputs: [
    { key: 'pacienteId', label: 'ID do paciente', required: false },
    { key: 'nome', label: 'Nome', required: false },
    { key: 'telefone', label: 'Telefone', required: false },
    { key: 'existePaciente', label: 'Paciente encontrado?', required: true },
  ],
  async execute(ctx, input) {
    const cpf = String(input.cpf ?? '').replace(/\D/g, '')
    if (!cpf) return { success: false, error: 'CPF inválido', code: 'INVALID_CPF' }

    const patient = await prisma.patient.findFirst({ where: { doctorId: ctx.doctorId, cpf } })
    if (!patient) {
      return { success: true, data: { existePaciente: false } }
    }
    return {
      success: true,
      data: {
        existePaciente: true,
        pacienteId: patient.id,
        nome: patient.name,
        telefone: patient.phone,
      },
    }
  },
}
