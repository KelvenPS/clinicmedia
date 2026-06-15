export type PlanKey = 'TRIAL' | 'PRO' | 'PLUS' | 'CLINIC' | 'TELECONSULTA'

export const PLAN_PRICES: Record<string, { MONTHLY: number; ANNUAL: number }> = {
  PRO:          { MONTHLY: 89.90,  ANNUAL: 89.90  * 12 * 0.85 },
  PLUS:         { MONTHLY: 109.90, ANNUAL: 109.90 * 12 * 0.85 },
  CLINIC:       { MONTHLY: 159.90, ANNUAL: 159.90 * 12 * 0.85 },
  TELECONSULTA: { MONTHLY: 199.90, ANNUAL: 199.90 * 12 * 0.85 },
}

export const PLAN_DISPLAY: Record<string, string> = {
  TRIAL:        'Período Gratuito',
  PRO:          'Pro',
  PLUS:         'Plus',
  CLINIC:       'Clínica',
  TELECONSULTA: 'Teleconsulta',
}

export const PLAN_FEATURES: Record<string, string[]> = {
  TRIAL:        ['agenda', 'prontuario', 'financeiro', 'avaliacoes'],
  PRO:          ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'nota_fiscal', 'documentos'],
  PLUS:         ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'nota_fiscal', 'documentos', 'chatbot'],
  CLINIC:       ['agenda', 'prontuario', 'financeiro', 'avaliacoes', 'nota_fiscal', 'documentos', 'chatbot', 'whatsapp'],
  TELECONSULTA: ['agenda', 'teleconsulta'],
}

export const PLAN_LIMITS: Record<string, { rooms: number; secretaries: number }> = {
  TRIAL:        { rooms: 0, secretaries: 0 },
  PRO:          { rooms: 2, secretaries: 1 },
  PLUS:         { rooms: 5, secretaries: 5 },
  CLINIC:       { rooms: 999, secretaries: 999 },
  TELECONSULTA: { rooms: 0, secretaries: 0 },
}
