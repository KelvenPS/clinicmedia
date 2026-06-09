import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed ClinIQ Pro...\n')

  const adminPass = await bcrypt.hash('admin123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@cliniq.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@cliniq.com',
      password: adminPass,
      role: 'ADMIN',
      phone: '(11) 99999-0000',
    },
  })

  console.log('✅ Seed ClinIQ Pro concluído!\n')
  console.log('📋 Credenciais:')
  console.log('  Admin: admin@cliniq.com | admin123\n')
  console.log('ℹ️  Planos de Saúde são criados por cada médico no painel de configurações.\n')
}

main()
  .catch(e => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
