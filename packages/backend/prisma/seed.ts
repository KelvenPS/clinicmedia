import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed ClinIQ Pro...\n')

  const adminPass = await bcrypt.hash('admin123', 10)
  const doctorPass = await bcrypt.hash('doctor123', 10)
  const secretPass = await bcrypt.hash('secretary123', 10)

  const admin = await prisma.user.upsert({
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

  const doctor1 = await prisma.user.upsert({
    where: { email: 'dr.silva@cliniq.com' },
    update: {},
    create: {
      name: 'Dr. Carlos Silva',
      email: 'dr.silva@cliniq.com',
      password: doctorPass,
      role: 'DOCTOR',
      specialty: 'Neuropsicólogo',
      certType: 'CRP',
      certNumber: 'CRP/SP 06/12345',
      crm: 'CRP/SP 06/12345',
      phone: '(11) 98888-1111',
    },
  })

  const doctor2 = await prisma.user.upsert({
    where: { email: 'dra.santos@cliniq.com' },
    update: {},
    create: {
      name: 'Dra. Ana Santos',
      email: 'dra.santos@cliniq.com',
      password: doctorPass,
      role: 'DOCTOR',
      specialty: 'Psicólogo',
      certType: 'CRP',
      certNumber: 'CRP/SP 06/67890',
      crm: 'CRP/SP 06/67890',
      phone: '(11) 97777-2222',
    },
  })

  await prisma.user.upsert({
    where: { email: 'secretaria@cliniq.com' },
    update: {},
    create: {
      name: 'Maria Secretária',
      email: 'secretaria@cliniq.com',
      password: secretPass,
      role: 'SECRETARY',
      phone: '(11) 96666-3333',
    },
  })

  // Health Plans
  const planParticular = await prisma.healthPlan.upsert({
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

  const planUnimed = await prisma.healthPlan.upsert({
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

  const planAmil = await prisma.healthPlan.upsert({
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

  // Patients
  const patient1 = await prisma.patient.upsert({
    where: { cpf: '111.111.111-11' },
    update: {},
    create: {
      name: 'João Pereira',
      phone: '(11) 98765-4321',
      email: 'joao.pereira@email.com',
      cpf: '111.111.111-11',
      rg: '12.345.678-9',
      birthDate: new Date('1985-03-15'),
      address: 'Rua das Flores, 123 - São Paulo/SP',
    },
  })

  const patient2 = await prisma.patient.upsert({
    where: { cpf: '222.222.222-22' },
    update: {},
    create: {
      name: 'Maria Oliveira',
      phone: '(11) 91234-5678',
      email: 'maria.oliveira@email.com',
      cpf: '222.222.222-22',
      rg: '98.765.432-1',
      birthDate: new Date('1990-07-22'),
      address: 'Av. Paulista, 456 - São Paulo/SP',
    },
  })

  const patient3 = await prisma.patient.upsert({
    where: { cpf: '333.333.333-33' },
    update: {},
    create: {
      name: 'Pedro Costa',
      phone: '(11) 99876-5432',
      cpf: '333.333.333-33',
      birthDate: new Date('1978-11-30'),
      notes: 'Paciente encaminhado para avaliação neuropsicológica.',
    },
  })

  const patient4 = await prisma.patient.upsert({
    where: { cpf: '444.444.444-44' },
    update: {},
    create: {
      name: 'Ana Lima',
      phone: '(11) 95555-6666',
      email: 'ana.lima@email.com',
      cpf: '444.444.444-44',
      birthDate: new Date('1995-05-10'),
    },
  })

  // Patient Plans
  const existingPP1 = await prisma.patientPlan.findFirst({ where: { patientId: patient1.id, healthPlanId: planParticular.id } })
  if (!existingPP1) {
    await prisma.patientPlan.create({ data: { patientId: patient1.id, healthPlanId: planParticular.id, value: 200 } })
  }

  const existingPP2 = await prisma.patientPlan.findFirst({ where: { patientId: patient2.id, healthPlanId: planUnimed.id } })
  if (!existingPP2) {
    await prisma.patientPlan.create({ data: { patientId: patient2.id, healthPlanId: planUnimed.id, walletNumber: '9876543210001', value: 0 } })
  }

  const existingPP3 = await prisma.patientPlan.findFirst({ where: { patientId: patient3.id, healthPlanId: planAmil.id } })
  if (!existingPP3) {
    await prisma.patientPlan.create({ data: { patientId: patient3.id, healthPlanId: planAmil.id, walletNumber: '1234567890002', value: 0 } })
  }

  const existingPP4 = await prisma.patientPlan.findFirst({ where: { patientId: patient4.id, healthPlanId: planParticular.id } })
  if (!existingPP4) {
    await prisma.patientPlan.create({ data: { patientId: patient4.id, healthPlanId: planParticular.id, value: 250 } })
  }

  // Appointments
  const today = new Date()
  today.setHours(9, 0, 0, 0)

  const appts = await prisma.appointment.findFirst({ where: { patientId: patient1.id } })
  if (!appts) {
    await prisma.appointment.createMany({
      data: [
        { patientId: patient1.id, doctorId: doctor1.id, createdById: admin.id, title: 'Avaliação Neuropsicológica', date: new Date(today), duration: 60, status: 'CONFIRMED', type: 'Consulta', value: 200 },
        { patientId: patient2.id, doctorId: doctor1.id, createdById: admin.id, title: 'Sessão de psicoterapia', date: new Date(today.getTime() + 90 * 60 * 1000), duration: 50, status: 'SCHEDULED', type: 'Retorno', value: 150 },
        { patientId: patient3.id, doctorId: doctor2.id, createdById: admin.id, title: 'Aplicação WISC-IV', date: new Date(today.getTime() + 3 * 60 * 60 * 1000), duration: 90, status: 'SCHEDULED', type: 'Avaliação', value: 400 },
        { patientId: patient4.id, doctorId: doctor1.id, createdById: admin.id, title: 'Primeira consulta', date: new Date(today.getTime() + 5 * 60 * 60 * 1000), duration: 60, status: 'SCHEDULED', type: 'Consulta', value: 250 },
        { patientId: patient1.id, doctorId: doctor2.id, createdById: admin.id, title: 'Devolutiva WAIS-III', date: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000), duration: 60, status: 'SCHEDULED', type: 'Consulta', value: 300 },
      ],
    })
  }

  // Transactions
  const tx = await prisma.transaction.findFirst({ where: { doctorId: doctor1.id } })
  if (!tx) {
    await prisma.transaction.createMany({
      data: [
        { doctorId: doctor1.id, type: 'INCOME', amount: 200, description: 'Avaliação - João Pereira', date: today, status: 'PAID', category: 'Consulta' },
        { doctorId: doctor1.id, type: 'INCOME', amount: 150, description: 'Psicoterapia - Maria Oliveira', date: today, status: 'PENDING', category: 'Consulta' },
        { doctorId: doctor2.id, type: 'INCOME', amount: 400, description: 'WISC-IV - Pedro Costa', date: today, status: 'PENDING', category: 'Avaliação' },
        { doctorId: doctor1.id, type: 'EXPENSE', amount: 80, description: 'Material de consultório', date: new Date(today.getTime() - 2 * 86400000), status: 'PAID', category: 'Material' },
        { doctorId: doctor2.id, type: 'EXPENSE', amount: 120, description: 'Livros e materiais de teste', date: new Date(today.getTime() - 5 * 86400000), status: 'PAID', category: 'Material' },
      ],
    })
  }

  // Medical Records
  const mr = await prisma.medicalRecord.findFirst({ where: { patientId: patient1.id } })
  if (!mr) {
    await prisma.medicalRecord.createMany({
      data: [
        { patientId: patient1.id, doctorId: doctor1.id, title: 'Anamnese Inicial', type: 'ANAMNESE', content: 'Paciente João, 40 anos, encaminhado por queixa de dificuldades de memória e concentração. Nega uso de medicamentos psicotrópicos. Histórico familiar de TDAH. Escolaridade superior completo.', date: new Date(today.getTime() - 30 * 86400000) },
        { patientId: patient1.id, doctorId: doctor1.id, title: 'Evolução - 2ª sessão', type: 'EVOLUCAO', content: 'Paciente relata melhora após início da terapia cognitiva. Aplicação do WAIS-III programada para próxima semana. Humor estável, sem sintomas depressivos.', date: new Date(today.getTime() - 7 * 86400000) },
        { patientId: patient1.id, doctorId: doctor2.id, title: 'Avaliação WAIS-III', type: 'ANAMNESE', content: 'Aplicação do protocolo WAIS-III completo. Resultados preliminares indicam funcionamento intelectual dentro da média. Laudo em elaboração.', date: new Date(today.getTime() - 3 * 86400000) },
        { patientId: patient2.id, doctorId: doctor1.id, title: 'Sessão de Psicoterapia', type: 'EVOLUCAO', content: 'Paciente apresenta boa adesão ao processo terapêutico. Trabalhando reestruturação cognitiva. Mantém bom controle emocional.', date: new Date(today.getTime() - 14 * 86400000) },
      ],
    })
  }

  console.log('✅ Seed ClinIQ Pro concluído!\n')
  console.log('📋 Credenciais:')
  console.log('  Admin:      admin@cliniq.com     | admin123')
  console.log('  Médico 1:   dr.silva@cliniq.com  | doctor123')
  console.log('  Médico 2:   dra.santos@cliniq.com | doctor123')
  console.log('  Secretária: secretaria@cliniq.com | secretary123\n')
}

main()
  .catch(e => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
