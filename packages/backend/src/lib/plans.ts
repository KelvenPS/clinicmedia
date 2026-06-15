export type PlanKey = 'TRIAL' | 'PRO' | 'PLUS' | 'CLINIC' | 'TELECONSULTA' | 'TELECONSULTA_PRO'

export const PLAN_PRICES: Record<string, { MONTHLY: number; ANNUAL: number }> = {
  PRO:              { MONTHLY: 89.90,  ANNUAL: 89.90  * 12 * 0.85 },
  PLUS:             { MONTHLY: 109.90, ANNUAL: 109.90 * 12 * 0.85 },
  CLINIC:           { MONTHLY: 159.90, ANNUAL: 159.90 * 12 * 0.85 },
  TELECONSULTA:     { MONTHLY: 199.90, ANNUAL: 199.90 * 12 * 0.85 },
  TELECONSULTA_PRO: { MONTHLY: 399.90, ANNUAL: 399.90 * 12 * 0.85 },
}

export const PLAN_DISPLAY: Record<string, string> = {
  TRIAL:            'Período Gratuito',
  PRO:              'Pro',
  PLUS:             'Plus',
  CLINIC:           'Clínica',
  TELECONSULTA:     'Teleconsulta',
  TELECONSULTA_PRO: 'Teleconsulta Pro',
}

// Feature flags used by requireFeature() middleware and frontend FeatureGate
export const PLAN_FEATURES: Record<string, string[]> = {
  TRIAL:            ['agenda', 'prontuario', 'financeiro'],
  PRO:              ['agenda', 'prontuario', 'financeiro'],
  PLUS:             ['agenda', 'prontuario', 'financeiro'],
  CLINIC:           ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot'],
  TELECONSULTA:     ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot', 'chatbot_agente', 'teleconsulta'],
  TELECONSULTA_PRO: ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'chatbot', 'chatbot_agente', 'teleconsulta', 'teleconsulta_pro'],
}

export const PLAN_LIMITS: Record<string, { rooms: number; secretaries: number; teleconsultas: number }> = {
  TRIAL:            { rooms: 0, secretaries: 0, teleconsultas: 0 },
  PRO:              { rooms: 1, secretaries: 1, teleconsultas: 0 },
  PLUS:             { rooms: 3, secretaries: 3, teleconsultas: 0 },
  CLINIC:           { rooms: 999, secretaries: 999, teleconsultas: 0 },
  TELECONSULTA:     { rooms: 999, secretaries: 999, teleconsultas: 4 },
  TELECONSULTA_PRO: { rooms: 999, secretaries: 999, teleconsultas: 10 },
}
