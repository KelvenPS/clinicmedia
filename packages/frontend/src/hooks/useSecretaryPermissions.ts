import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export const SECRETARY_PERMISSION_KEYS = [
  'financeiro',
  'chatbot_light',
  'chatbot_agente',
  'nota_fiscal',
  'teleconsulta',
  'documentos',
  'salas',
  'integracoes',
] as const

export type SecretaryPermissionKey = typeof SECRETARY_PERMISSION_KEYS[number]
export type SecretaryPermissions = Partial<Record<SecretaryPermissionKey, boolean>>

export const SECRETARY_PERMISSION_LABELS: Record<SecretaryPermissionKey, string> = {
  financeiro: 'Financeiro (Painel Financeiro)',
  chatbot_light: 'Chatbot Light',
  chatbot_agente: 'Chatbot Agente Clínico',
  nota_fiscal: 'Nota Fiscal (NFS-e)',
  teleconsulta: 'Teleconsulta',
  documentos: 'Documentos',
  salas: 'Clínica (Salas)',
  integracoes: 'Integrações',
}

/**
 * DOCTOR e ADMIN não são afetados por esse sistema (sempre liberado).
 * SECRETARY só vê o que o médico marcou em "Gestão de Acessos".
 */
export function useSecretaryPermissions() {
  const { user } = useAuthStore()
  const isSecretary = user?.role === 'SECRETARY'

  const { data, isLoading } = useQuery<SecretaryPermissions>({
    queryKey: ['secretary-my-permissions'],
    queryFn: () => api.get('/team/my-permissions').then(r => r.data),
    enabled: isSecretary,
    staleTime: 60 * 1000,
  })

  const can = (key: SecretaryPermissionKey) => {
    if (!isSecretary) return true
    // Backward compat: old 'chatbot' permission (stored as JSON) grants both Light and Agente
    const legacy = (data as Record<string, boolean | undefined>)?.['chatbot']
    if ((key === 'chatbot_light' || key === 'chatbot_agente') && legacy) return true
    return !!data?.[key]
  }

  return { isSecretary, permissions: data ?? {}, isLoading: isSecretary && isLoading, can }
}
