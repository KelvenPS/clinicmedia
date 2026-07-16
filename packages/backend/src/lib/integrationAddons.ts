import { prisma } from './prisma'

// Tipos de integração com add-on pago ACTIVE para a clínica — usado para
// filtrar o que uma SECRETARY pode ver/usar (nunca faz sentido liberar acesso
// a uma integração que a clínica não contratou).
export async function getActiveIntegrationAddonTypes(doctorId: string): Promise<Set<string>> {
  const rows = await prisma.integrationAddon.findMany({
    where: { doctorId, status: 'ACTIVE' },
    select: { type: true },
  })
  return new Set(rows.map(r => r.type))
}
