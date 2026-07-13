// Script explícito de migração — cria assinatura para médicos (contas DOCTOR)
// que existiam antes do sistema de assinatura Kiwify e ainda não têm uma
// linha em TBLASSINATURACLINICA. NÃO é executado automaticamente pelo
// migrate.sh — rode manualmente e decida conscientemente o status inicial.
//
// Uso:
//   BACKFILL_STATUS=ACTIVE npx tsx scripts/backfill-subscriptions.ts
//   BACKFILL_STATUS=TRIAL  npx tsx scripts/backfill-subscriptions.ts
//
// BACKFILL_STATUS=ACTIVE (recomendado para contas que já usavam a Clinic Pro
// antes da Kiwify existir): grandfathering, acesso liberado sem data de
// expiração (currentPeriodEndsAt fica null — ver calculateClinicAccess).
//
// BACKFILL_STATUS=TRIAL: concede um novo período de 7 dias a partir de agora.
// Só use se fizer sentido comercialmente para essas contas.
import { prisma } from '../src/lib/prisma'
import { CLINIC_PRO_SUBSCRIPTION } from '../src/lib/billing-config'

async function main() {
  const status = process.env.BACKFILL_STATUS
  if (status !== 'ACTIVE' && status !== 'TRIAL') {
    console.error('Defina BACKFILL_STATUS=ACTIVE ou BACKFILL_STATUS=TRIAL antes de rodar este script.')
    process.exit(1)
  }

  const doctorsWithoutSubscription = await prisma.user.findMany({
    where: { role: 'DOCTOR', active: true, subscription: null },
    select: { id: true, name: true, email: true },
  })

  console.log(`Encontrados ${doctorsWithoutSubscription.length} médicos sem assinatura.`)

  for (const doctor of doctorsWithoutSubscription) {
    if (status === 'ACTIVE') {
      await prisma.doctorSubscription.create({
        data: {
          doctorId: doctor.id,
          status: 'ACTIVE',
          trialStartedAt: new Date(),
          trialEndsAt: new Date(), // já expirado — irrelevante pois status é ACTIVE
          currentPeriodStartedAt: new Date(),
          currentPeriodEndsAt: null, // grandfathering: sem data de expiração
        },
      })
    } else {
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + CLINIC_PRO_SUBSCRIPTION.trialDays)
      await prisma.doctorSubscription.create({
        data: { doctorId: doctor.id, status: 'TRIAL', trialStartedAt: new Date(), trialEndsAt },
      })
    }
    console.log(`  ✓ ${doctor.email} → ${status}`)
  }

  console.log('Backfill concluído.')
}

main()
  .catch((err) => {
    console.error('Erro no backfill:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
