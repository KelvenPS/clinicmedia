// Horário de funcionamento do Chatbot Light — vale para toda a conta (todos os
// chatbots), coerente com onde o usuário pediu essa configuração no menu
// (Configurações, não dentro de um chatbot específico).

export interface BusinessHoursConfig {
  enabled: boolean
  daysOfWeek: string[] // subconjunto de DAY_KEYS, ex: ['MON','TUE','WED','THU','FRI']
  startTime: string    // 'HH:MM'
  endTime: string      // 'HH:MM'
  offHoursMessage: string
  allowLeadCaptureOffHours: boolean
}

export const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: false,
  daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  startTime: '08:00',
  endTime: '18:00',
  offHoursMessage: 'No momento estamos fora do horário de atendimento. Você pode deixar sua mensagem ou iniciar um pré-agendamento — nossa equipe responderá assim que possível.',
  allowLeadCaptureOffHours: true,
}

// Sempre calculado no horário de Brasília — o público deste produto é
// exclusivamente clínicas brasileiras (ver project-overview).
export function isWithinBusinessHours(config: BusinessHoursConfig | null | undefined, now: Date = new Date()): boolean {
  if (!config || !config.enabled) return true

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  const weekday = parts.find(p => p.type === 'weekday')?.value.toUpperCase().slice(0, 3)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  const nowMinutes = hour * 60 + minute

  const days = config.daysOfWeek?.length ? config.daysOfWeek : DEFAULT_BUSINESS_HOURS.daysOfWeek
  if (weekday && !days.includes(weekday)) return false

  const [startH, startM] = (config.startTime || DEFAULT_BUSINESS_HOURS.startTime).split(':').map(Number)
  const [endH, endM] = (config.endTime || DEFAULT_BUSINESS_HOURS.endTime).split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes
}

// Um fluxo "permite pré-agendamento fora do horário" quando alguma de suas
// opções captura lead (START_LEAD_CAPTURE) — heurística simples a partir do
// JSON de opções já existente em LightFluxo.options.
export function flowHasLeadCapture(options: unknown): boolean {
  if (!Array.isArray(options)) return false
  return options.some((o: any) => o?.actionType === 'START_LEAD_CAPTURE')
}
