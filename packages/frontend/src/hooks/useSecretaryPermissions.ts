import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export const SECRETARY_PERMISSION_KEYS = [
  'financeiro',
  'chatbot_light_operar',
  'chatbot_light_configurar',
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
  chatbot_light_operar: 'Chatbot Light — Uso do dia a dia',
  chatbot_light_configurar: 'Chatbot Light — Configurações e Campanhas',
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
    // O backend (/team/my-permissions) já normaliza chaves legadas
    // ('chatbot' e 'chatbot_light' antigos) para as chaves granulares atuais.
    return !!data?.[key]
  }

  return { isSecretary, permissions: data ?? {}, isLoading: isSecretary && isLoading, can }
}
