import { prisma } from '../prisma'
import type { SystemAction } from './types'

export const listServices: SystemAction = {
  key: 'list_services',
  name: 'Listar serviços disponíveis',
  description: 'Lista os tipos de consulta/serviço ativos da clínica.',
  implemented: true,
  inputs: [],
  outputs: [{ key: 'services', label: 'Lista de serviços', required: true }],
  async execute(ctx) {
    const services = await prisma.appointmentType.findMany({
      where: { doctorId: ctx.doctorId, active: true },
      orderBy: { name: 'asc' },
    })
    return {
      success: true,
      data: {
        services: services.map(s => ({ id: s.id, name: s.name, baseValue: s.baseValue })),
      },
    }
  },
}
