import { useQuery } from '@tanstack/react-query'
import { differenceInDays } from 'date-fns'
import api from '../lib/api'
import { PLAN_FEATURES, PLAN_LIMITS, type PlanKey, type DoctorSubscription } from '../types'
import { useAuthStore } from '../store/authStore'

export interface SubscriptionStatus {
  subscription: DoctorSubscription | null
  plan: PlanKey
  isLoading: boolean
  isActive: boolean
  isTrial: boolean
  isTrialExpired: boolean
  isPaidExpired: boolean
  trialDaysLeft: number
  daysUntilRenewal: number
  hasFeature: (feature: string) => boolean
  limits: { rooms: number; secretaries: number; teleconsultas: number }
  canShowTrialWarning: boolean
}

export function useSubscription(): SubscriptionStatus {
  const { user } = useAuthStore()

  const { data: subscription, isLoading } = useQuery<DoctorSubscription | null>({
    queryKey: ['my-subscription'],
    queryFn: () => api.get('/subscriptions/me').then(r => r.data).catch(() => null),
    enabled: !!user && user.role !== 'ADMIN',
    staleTime: 5 * 60 * 1000,
  })

  // Admins and secretaries bypass plan checks
  if (!user || user.role === 'ADMIN') {
    return {
      subscription: null,
      plan: 'CLINIC',
      isLoading: false,
      isActive: true,
      isTrial: false,
      isTrialExpired: false,
      isPaidExpired: false,
      trialDaysLeft: 0,
      daysUntilRenewal: 0,
      hasFeature: () => true,
      limits: { rooms: 999, secretaries: 999, teleconsultas: 999 },
      canShowTrialWarning: false,
    }
  }

  const plan = (subscription?.plan ?? 'TRIAL') as PlanKey
  const now = new Date()

  const isTrial = plan === 'TRIAL'
  const isTrialExpired = isTrial && !!subscription?.trialEndsAt && now > new Date(subscription.trialEndsAt)
  const isPaidExpired = !isTrial && !!subscription?.currentPeriodEnd && now > new Date(subscription.currentPeriodEnd)
  const isActive = !isTrialExpired && !isPaidExpired && subscription?.status === 'ACTIVE'

  const trialDaysLeft = isTrial && subscription?.trialEndsAt
    ? Math.max(0, differenceInDays(new Date(subscription.trialEndsAt), now))
    : 0

  const daysUntilRenewal = !isTrial && subscription?.currentPeriodEnd
    ? Math.max(0, differenceInDays(new Date(subscription.currentPeriodEnd), now))
    : 0

  const features = (isTrialExpired || isPaidExpired)
    ? []
    : (PLAN_FEATURES[plan] ?? PLAN_FEATURES.TRIAL)

  const hasFeature = (feature: string) => features.includes(feature)

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.TRIAL

  const canShowTrialWarning = isTrial && !isTrialExpired && trialDaysLeft <= 5

  return {
    subscription: subscription ?? null,
    plan,
    isLoading,
    isActive,
    isTrial,
    isTrialExpired,
    isPaidExpired,
    trialDaysLeft,
    daysUntilRenewal,
    hasFeature,
    limits,
    canShowTrialWarning,
  }
}
