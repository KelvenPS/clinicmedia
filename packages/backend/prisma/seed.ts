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

  // Health Plans
  await prisma.healthPlan.upsert({
    where: { id: 'plan-particular' },
    update: {},
    create: {
      id: 'plan-particular',
      name: 'Particular',
      type: 'PARTICULAR',
      description: 'Atendimento particular sem convênio',
      defaultValue: 200,
    },
  })

  await prisma.healthPlan.upsert({
    where: { id: 'plan-unimed' },
    update: {},
    create: {
      id: 'plan-unimed',
      name: 'Unimed',
      type: 'CONVENIO',
      description: 'Plano de saúde Unimed',
      discountPercent: 20,
      defaultValue: 0,
    },
  })

  await prisma.healthPlan.upsert({
    where: { id: 'plan-amil' },
    update: {},
    create: {
      id: 'plan-amil',
      name: 'Amil',
      type: 'CONVENIO',
      description: 'Plano de saúde Amil',
      discountPercent: 15,
      defaultValue: 0,
    },
  })

  await prisma.healthPlan.upsert({
    where: { id: 'plan-sulamerica' },
    update: {},
    create: {
      id: 'plan-sulamerica',
      name: 'SulAmérica',
      type: 'CONVENIO',
      description: 'Plano SulAmérica Saúde',
      discountPercent: 10,
      defaultValue: 0,
    },
  })

  await prisma.healthPlan.upsert({
    where: { id: 'plan-bradesco' },
    update: {},
    create: {
      id: 'plan-bradesco',
      name: 'Bradesco Saúde',
      type: 'CONVENIO',
      description: 'Bradesco Saúde - Cobertura nacional',
      discountPercent: 25,
      defaultValue: 0,
    },
  })

  console.log('✅ Seed ClinIQ Pro concluído!\n')
  console.log('📋 Credenciais:')
  console.log('  Admin: admin@cliniq.com | admin123\n')
}

main()
  .catch(e => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
