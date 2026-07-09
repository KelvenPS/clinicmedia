// Contrato do Action Registry (Fase 3 — motor de blocos genérico).
//
// Uma SystemAction é uma operação técnica: recebe entradas, executa algo no
// sistema, retorna sucesso/erro. Estruturalmente ela NUNCA recebe um canal
// de envio de mensagem (nenhum `sendMessage`/`collect` é injetado em
// `execute()`) — não é fisicamente possível uma ação mandar mensagem ao
// paciente. Quem manda mensagem é sempre um bloco do Construtor
// (chatbot-block-engine.ts).

export interface ActionField {
  key: string
  label: string
  required: boolean
}

export interface ActionResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  code?: string
}

export interface ActionContext {
  doctorId: string
  chatbotId: string
  sessionId?: string
}

export interface SystemAction {
  key: string
  name: string
  description: string
  implemented: boolean
  inputs: ActionField[]
  outputs: ActionField[]
  execute(ctx: ActionContext, input: Record<string, unknown>): Promise<ActionResult>
}
