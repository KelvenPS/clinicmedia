import { prisma } from './prisma'

export const ensureTrialSubscription = async (doctorId: string): Promise<void> => {
  const existing = await prisma.doctorSubscription.findUnique({ where: { doctorId } })
  if (!existing) {
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 30)
    await prisma.doctorSubscription.create({
      data: { doctorId, plan: 'TRIAL', status: 'ACTIVE', trialEndsAt },
    })
  }
}
