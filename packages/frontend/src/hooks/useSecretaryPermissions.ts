import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'

export const SECRETARY_PERMISSION_KEYS = [
  'financeiro',
  'chatbot_light_operar',
  'chatbot_light_configurar',
  'documentos',
  'salas',
  'integracao_webhook',
  'integracao_google_calendar',
  'integracao_gmail',
  'integracao_whatsapp',
  'integracao_ai_agent',
] as const

export type SecretaryPermissionKey = typeof SECRETARY_PERMISSION_KEYS[number]
export type SecretaryPermissions = Partial<Record<SecretaryPermissionKey, boolean>>

export const SECRETARY_PERMISSION_LABELS: Record<SecretaryPermissionKey, string> = {
  financeiro: 'Financeiro (Painel Financeiro)',
  chatbot_light_operar: 'Chatbot Light — Uso do dia a dia',
  chatbot_light_configurar: 'Chatbot Light — Configurações e Campanhas',
  documentos: 'Documentos',
  salas: 'Clínica (Salas)',
  integracao_webhook: 'Integração — Webhooks',
  integracao_google_calendar: 'Integração — Google Calendar',
  integracao_gmail: 'Integração — Gmail',
  integracao_whatsapp: 'Integração — WhatsApp',
  integracao_ai_agent: 'Integração — Agente de IA',
}

// Chaves de integração, na mesma ordem de IntegrationType (Prisma) — usado
// pra checar "tem acesso a pelo menos uma integração" sem hardcodear a lista
// em cada tela.
export const INTEGRATION_PERMISSION_KEYS: SecretaryPermissionKey[] = [
  'integracao_webhook',
  'integracao_google_calendar',
  'integracao_gmail',
  'integracao_whatsapp',
  'integracao_ai_agent',
]

// Chave de permissão → IntegrationType (Prisma) correspondente — usado pra
// saber, dado um add-on ACTIVE, qual checkbox de "Gestão de Acessos" liberar.
export const PERMISSION_KEY_TO_INTEGRATION_TYPE: Partial<Record<SecretaryPermissionKey, string>> = {
  integracao_webhook: 'WEBHOOK',
  integracao_google_calendar: 'GOOGLE_CALENDAR',
  integracao_gmail: 'GOOGLE_GMAIL',
  integracao_whatsapp: 'WHATSAPP',
  integracao_ai_agent: 'AI_AGENT',
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
