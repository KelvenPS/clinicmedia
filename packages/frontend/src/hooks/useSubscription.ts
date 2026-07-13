import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export type SubscriptionStatusValue = 'TRIAL' | 'ACTIVE' | 'PENDING_PAYMENT' | 'PAST_DUE' | 'CANCELED' | 'BLOCKED'

export interface SubscriptionPaymentRecord {
  id: string
  kiwifyOrderId: string
  status: string
  amountCents: number
  approvedAt?: string | null
  createdAt: string
}

export interface SubscriptionStatusResponse {
  product: string
  monthlyPrice: string
  status: SubscriptionStatusValue
  accessAllowed: boolean
  reason: string
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  currentPeriodEndsAt: string | null
  lastPaymentAt: string | null
  payments: SubscriptionPaymentRecord[]
  isPlatformAdmin?: boolean
}

export function useSubscription() {
  const { user } = useAuthStore()

  const { data, isLoading, refetch } = useQuery<SubscriptionStatusResponse>({
    queryKey: ['subscription-status'],
    queryFn: () => api.get('/subscription/status').then(r => r.data),
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  })

  return {
    subscription: data ?? null,
    isLoading,
    accessAllowed: data?.accessAllowed ?? true, // otimista até carregar — evita flash de bloqueio
    isPlatformAdmin: data?.isPlatformAdmin ?? false,
    canManageBilling: user?.role === 'DOCTOR',
    refreshSubscription: refetch,
  }
}
