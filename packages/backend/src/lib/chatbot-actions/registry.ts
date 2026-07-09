import { prisma } from '../prisma'
import type { ActionContext, ActionResult, SystemAction } from './types'
import { searchPatientByCpf } from './search-patient-by-cpf'
import { listServices } from './list-services'
import { listAvailableSlots } from './list-available-slots'
import { createAppointment } from './create-appointment'
import { confirmAppointment } from './confirm-appointment'
import { cancelAppointment } from './cancel-appointment'
import { createPreScheduling } from './create-pre-scheduling'
import { updatePatientData } from './update-patient-data'
import { requestDocuments } from './request-documents'

export type { SystemAction, ActionField, ActionResult, ActionContext } from './types'

const ACTIONS: SystemAction[] = [
  searchPatientByCpf,
  listServices,
  listAvailableSlots,
  createAppointment,
  confirmAppointment,
  cancelAppointment,
  createPreScheduling,
  updatePatientData,
  requestDocuments,
]

const ACTION_MAP: Record<string, SystemAction> = Object.fromEntries(ACTIONS.map(a => [a.key, a]))

export function listActions(): SystemAction[] {
  return ACTIONS
}

export function getAction(key: string): SystemAction | undefined {
  return ACTION_MAP[key]
}

// Ponto único de execução — toda ação passa por aqui, o que garante que
// SystemActionExecution é sempre logado (rastro de "o que essa ação fez")
// sem cada arquivo de ação precisar lembrar de logar.
export async function runAction(key: string, ctx: ActionContext, input: Record<string, unknown>): Promise<ActionResult> {
  const action = getAction(key)
  if (!action) {
    return { success: false, error: `Ação "${key}" não encontrada.`, code: 'ACTION_NOT_FOUND' }
  }

  let result: ActionResult
  try {
    result = await action.execute(ctx, input)
  } catch (err: any) {
    result = { success: false, error: err?.message || 'Erro inesperado ao executar a ação.', code: 'ACTION_EXCEPTION' }
  }

  await prisma.systemActionExecution.create({
    data: {
      chatbotId: ctx.chatbotId,
      sessionId: ctx.sessionId,
      actionKey: key,
      input: input as object,
      output: (result.data ?? null) as object | undefined,
      success: result.success,
      errorCode: result.code,
      errorMessage: result.error,
    },
  }).catch(() => {})

  return result
}
