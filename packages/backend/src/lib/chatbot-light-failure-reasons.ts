// Classificação heurística do motivo de falha de envio — LightMessageLog.errorMessage
// é uma string crua, sem código de erro estruturado. Compartilhado entre a Central
// (chatbot-light-tasks.ts) e o Relatório (chatbot-light-reports.ts).

export interface FailedReasonCounts {
  invalidNumber: number
  disconnected: number
  other: number
  total: number
}

export function categorizeFailure(errorMessage: string | null): 'invalidNumber' | 'disconnected' | 'other' {
  const msg = (errorMessage ?? '').toLowerCase()
  if (msg.includes('não está no whatsapp')) return 'invalidNumber'
  if (msg.includes('desconectad') || msg.includes('não conectad') || msg.includes('vincule uma sala')) return 'disconnected'
  return 'other'
}
