// Motor de blocos genérico (Fase 3 — "visual_builder"). Independente do
// motor legado (chatbot-light-engine.ts / chatbot-light-guided-engine.ts) —
// não lê nem escreve LightFluxo/LightSystemActionConfig/LightFlowSession.
// Só é chamado para chatbots com LightChatbot.builderMode === 'visual_builder'.
//
// Regra central: Ações do Sistema (chatbot-actions/registry.ts) nunca mandam
// mensagem — só quem manda mensagem é um bloco (`sendAndTrace`). Toda
// mensagem enviada é logada em ChatbotMessageTrace com blockId/sourceType.

import { prisma } from './prisma'
import { sendLightMessage, normalizeText } from './chatbot-light-engine'
import { runAction } from './chatbot-actions/registry'
import { isWithinBusinessHours, DEFAULT_BUSINESS_HOURS, BusinessHoursConfig } from './chatbot-light-business-hours'

const WAITING_TYPES = new Set(['menu', 'submenu', 'menu_dynamic', 'collect_data', 'confirm_data'])
const MAX_STEPS_PER_TURN = 50

export interface BlockRow {
  id: string
  chatbotId: string
  type: string
  name: string
  orderIndex: number
  parentBlockId: string | null
  config: any
  isActive: boolean
}

interface EngineCtx {
  doctorId: string
  chatbotId: string
  // Abstrai o canal de envio: no motor real, manda WhatsApp de verdade
  // (sendLightMessage); no simulador do Construtor, só coleta a mensagem
  // num array em memória — mesma lógica de blocos nos dois casos.
  send: (content: string) => Promise<void>
  // Observador opcional chamado toda vez que um bloco manda mensagem — usado
  // pelo simulador do Construtor pra montar o "rastro da conversa" com a
  // origem exata (bloco) de cada mensagem, sem reconstruir isso depois.
  onSend?: (content: string, block: BlockRow, sourceType: string) => void
}

function interpolate(text: string, variables: Record<string, unknown>): string {
  if (!text) return text
  return text.replace(/\{(\w+)\}/g, (_match, key) => {
    const v = variables[key]
    return v !== undefined && v !== null && v !== '' ? String(v) : `{${key}}`
  })
}

function matchesTrigger(config: any, incomingText: string): boolean {
  const triggers = String(config?.triggers ?? '').split(',').map((t: string) => normalizeText(t)).filter(Boolean)
  return triggers.includes(incomingText)
}

export async function loadVersionBlocks(chatbotId: string, status: 'published' | 'draft'): Promise<Map<string, BlockRow>> {
  const version = await prisma.chatbotBuilderVersion.findFirst({
    where: { chatbotId, status },
    orderBy: { versionNumber: 'desc' },
  })
  if (!version) return new Map()
  const blocks = await prisma.chatbotBlock.findMany({ where: { versionId: version.id, isActive: true } })
  return new Map(blocks.map(b => [b.id, b as unknown as BlockRow]))
}

async function trace(sessionId: string, chatbotId: string, direction: 'inbound' | 'outbound' | 'system', message: string, opts: { blockId?: string; sourceType: string; sourceId?: string; variables?: Record<string, unknown> }) {
  await prisma.chatbotMessageTrace.create({
    data: {
      sessionId,
      chatbotId,
      direction,
      message,
      blockId: opts.blockId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      variablesSnapshot: opts.variables as object | undefined,
    },
  }).catch(() => {})
}

async function sendAndTrace(ctx: EngineCtx, sessionId: string, variables: Record<string, unknown>, text: string, block: BlockRow, sourceType: string) {
  const content = interpolate(text, variables)
  if (!content) return
  await ctx.send(content)
  ctx.onSend?.(content, block, sourceType)
  await trace(sessionId, ctx.chatbotId, 'outbound', content, { blockId: block.id, sourceType, sourceId: block.id, variables })
}

function resolveInputsMap(inputsMap: Record<string, string> | undefined, variables: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, ref] of Object.entries(inputsMap ?? {})) {
    if (typeof ref === 'string' && ref.startsWith('{') && ref.endsWith('}')) {
      result[key] = variables[ref.slice(1, -1)]
    } else {
      result[key] = ref
    }
  }
  return result
}

function validateAnswer(answer: string, cfg: any): boolean {
  if (cfg?.validation?.required !== false && !answer.trim()) return false
  if (cfg?.dataType === 'cpf') return answer.replace(/\D/g, '').length === 11
  if (cfg?.dataType === 'telefone') return answer.replace(/\D/g, '').length >= 10
  if (cfg?.validation?.minLength && answer.trim().length < cfg.validation.minLength) return false
  return true
}

function normalizeCollectedValue(answer: string, dataType: string | undefined): string {
  if (dataType === 'cpf' || dataType === 'telefone') return answer.replace(/\D/g, '')
  return answer.trim()
}

// ─── Blocos que não esperam resposta: executam e avançam sozinhos ─────────────
async function enterBlock(ctx: EngineCtx, session: any, block: BlockRow): Promise<{ nextBlockId: string | null; waiting?: boolean; terminal?: string }> {
  const variables = session.variables as Record<string, unknown>
  const cfg = block.config ?? {}

  switch (block.type) {
    case 'welcome':
    case 'message':
    case 'off_hours':
    case 'success_message':
    case 'error_message': {
      if (cfg.message) await sendAndTrace(ctx, session.id, variables, cfg.message, block, 'block')
      return { nextBlockId: cfg.nextBlockId ?? null }
    }

    case 'menu':
    case 'submenu': {
      const options = (cfg.options ?? []) as any[]
      const optionsText = options.map(o => `${o.number} - ${o.label}`).join('\n')
      const text = `${cfg.message ?? ''}\n\n${optionsText}`.trim()
      await sendAndTrace(ctx, session.id, variables, text, block, 'block')
      return { waiting: true, nextBlockId: null }
    }

    case 'menu_dynamic': {
      const input = resolveInputsMap(cfg.inputsMap, variables)
      const result = await runAction(cfg.actionKey, { doctorId: ctx.doctorId, chatbotId: ctx.chatbotId, sessionId: session.id }, input)
      if (!result.success) {
        await sendAndTrace(ctx, session.id, variables, result.error || 'Não encontrei opções disponíveis no momento.', block, 'system_action_result')
        return { nextBlockId: cfg.errorBlockId ?? null }
      }
      const listField = cfg.optionsField || Object.keys(result.data ?? {}).find(k => Array.isArray((result.data as any)[k]))
      const list = listField ? (((result.data as any)[listField] as any[]) ?? []) : []
      const labelKey = cfg.labelField || 'label'
      const options = list.map((item, i) => ({ number: i + 1, label: item?.[labelKey] ?? item?.name ?? String(item), value: item }))
      variables.__pendingOptions = options
      const optionsText = options.map(o => `${o.number} - ${o.label}`).join('\n')
      const text = `${cfg.message ?? ''}\n\n${optionsText}`.trim()
      await sendAndTrace(ctx, session.id, variables, text, block, 'system_action_result')
      return { waiting: true, nextBlockId: null }
    }

    case 'collect_data': {
      await sendAndTrace(ctx, session.id, variables, cfg.question ?? '', block, 'block')
      return { waiting: true, nextBlockId: null }
    }

    case 'confirm_data': {
      await sendAndTrace(ctx, session.id, variables, cfg.message ?? '', block, 'block')
      return { waiting: true, nextBlockId: null }
    }

    case 'system_action': {
      const input = resolveInputsMap(cfg.inputsMap, variables)
      const result = await runAction(cfg.actionKey, { doctorId: ctx.doctorId, chatbotId: ctx.chatbotId, sessionId: session.id }, input)
      await trace(session.id, ctx.chatbotId, 'system', `Ação ${cfg.actionKey}: ${result.success ? 'sucesso' : (result.error ?? 'erro')}`, {
        blockId: block.id, sourceType: 'system_action_result', sourceId: block.id, variables,
      })
      if (result.success && result.data) Object.assign(variables, result.data)
      return { nextBlockId: result.success ? (cfg.successBlockId ?? null) : (cfg.errorBlockId ?? null) }
    }

    case 'condition': {
      const value = variables[cfg.variable]
      let pass = false
      if (cfg.operator === 'exists') pass = value !== undefined && value !== null && value !== ''
      else if (cfg.operator === 'eq') pass = String(value) === String(cfg.value)
      else if (cfg.operator === 'neq') pass = String(value) !== String(cfg.value)
      return { nextBlockId: pass ? (cfg.trueBlockId ?? null) : (cfg.falseBlockId ?? null) }
    }

    case 'transfer': {
      if (cfg.message) await sendAndTrace(ctx, session.id, variables, cfg.message, block, 'block')
      return { nextBlockId: null, terminal: 'TRANSFER' }
    }

    case 'end': {
      if (cfg.message) await sendAndTrace(ctx, session.id, variables, cfg.message, block, 'block')
      return { nextBlockId: null, terminal: 'COMPLETED' }
    }

    default:
      return { nextBlockId: cfg.nextBlockId ?? null }
  }
}

// ─── Blocos que esperam resposta: processam a mensagem do paciente ────────────
async function resumeWaitingBlock(ctx: EngineCtx, session: any, block: BlockRow, answerRaw: string): Promise<{ nextBlockId: string | null; waitingAgain?: boolean; terminal?: string }> {
  const variables = session.variables as Record<string, unknown>
  const cfg = block.config ?? {}
  const answer = normalizeText(answerRaw)

  await trace(session.id, ctx.chatbotId, 'inbound', answerRaw, { blockId: block.id, sourceType: 'block' })

  switch (block.type) {
    case 'menu':
    case 'submenu': {
      const options = (cfg.options ?? []) as any[]
      const matched = options.find(o =>
        String(o.number) === answer ||
        String(o.triggers ?? '').split(',').map((t: string) => normalizeText(t)).includes(answer)
      )
      if (!matched) {
        const attempts = (Number(variables.__invalidAttempts) || 0) + 1
        variables.__invalidAttempts = attempts
        if (attempts >= (cfg.maxAttempts || 3) && cfg.fallbackBlockId) {
          return { nextBlockId: cfg.fallbackBlockId }
        }
        await sendAndTrace(ctx, session.id, variables, cfg.invalidMessage || 'Opção inválida. Tente novamente.', block, 'block')
        return { waitingAgain: true, nextBlockId: null }
      }
      variables.__invalidAttempts = 0
      return { nextBlockId: matched.nextBlockId ?? null }
    }

    case 'menu_dynamic': {
      const options = (variables.__pendingOptions ?? []) as any[]
      const matched = options.find(o => String(o.number) === answer)
      if (!matched) {
        await sendAndTrace(ctx, session.id, variables, 'Opção inválida. Tente novamente.', block, 'block')
        return { waitingAgain: true, nextBlockId: null }
      }
      if (cfg.saveTo) variables[cfg.saveTo] = matched.value?.id ?? matched.value?.startAt ?? matched.value
      if (cfg.saveLabelTo) variables[cfg.saveLabelTo] = matched.label
      // Pra ações cujo item tem mais de um campo útil (ex: horário tem
      // startAt/endAt), o bloco pode pedir campos extras explicitamente.
      for (const [varName, fieldKey] of Object.entries(cfg.saveFieldsMap ?? {})) {
        variables[varName as string] = matched.value?.[fieldKey as string]
      }
      delete variables.__pendingOptions
      return { nextBlockId: cfg.nextBlockId ?? null }
    }

    case 'collect_data': {
      if (!validateAnswer(answerRaw, cfg)) {
        return { nextBlockId: cfg.errorBlockId ?? null }
      }
      if (cfg.saveTo) variables[cfg.saveTo] = normalizeCollectedValue(answerRaw, cfg.dataType)
      return { nextBlockId: cfg.nextBlockId ?? null }
    }

    case 'confirm_data': {
      const yes = ['1', 'sim', 'confirmar'].includes(answer)
      const no = ['2', 'nao', 'alterar'].includes(answer)
      if (yes) return { nextBlockId: cfg.yesBlockId ?? null }
      if (no) return { nextBlockId: cfg.noBlockId ?? null }
      await sendAndTrace(ctx, session.id, variables, 'Responda 1 para confirmar ou 2 para alterar.', block, 'block')
      return { waitingAgain: true, nextBlockId: null }
    }

    default:
      return { nextBlockId: cfg.nextBlockId ?? null }
  }
}

async function persistSession(session: any, currentBlockId: string | null, status: string) {
  await prisma.chatbotBuilderSession.update({
    where: { id: session.id },
    data: { currentBlockId, status, variables: session.variables, lastMessageAt: new Date() },
  })
}

async function drive(ctx: EngineCtx, session: any, blocks: Map<string, BlockRow>, startBlockId: string, initialAnswer: string | null) {
  let blockId: string | null = startBlockId
  let answer = initialAnswer
  let iterations = 0

  while (blockId && iterations++ < MAX_STEPS_PER_TURN) {
    const block: BlockRow | undefined = blocks.get(blockId)
    if (!block) break

    if (answer !== null && WAITING_TYPES.has(block.type)) {
      const r = await resumeWaitingBlock(ctx, session, block, answer)
      answer = null
      if (r.waitingAgain) { await persistSession(session, block.id, 'ACTIVE'); return }
      if (r.terminal) { await persistSession(session, null, r.terminal); return }
      blockId = r.nextBlockId
      continue
    }

    const r = await enterBlock(ctx, session, block)
    answer = null
    if (r.waiting) { await persistSession(session, block.id, 'ACTIVE'); return }
    if (r.terminal) { await persistSession(session, null, r.terminal); return }
    blockId = r.nextBlockId
  }

  await persistSession(session, null, 'COMPLETED')
}

async function pickInitialBlock(doctorId: string, blocks: Map<string, BlockRow>, incomingText: string): Promise<BlockRow | null> {
  const all = Array.from(blocks.values())
  const settings = await prisma.lightSettings.findUnique({ where: { doctorId } }).catch(() => null)
  const hours = (settings?.businessHours as unknown as BusinessHoursConfig) ?? DEFAULT_BUSINESS_HOURS
  const withinHours = isWithinBusinessHours(hours)

  if (!withinHours) {
    const offHours = all.find(b => b.type === 'off_hours' && b.isActive && matchesTrigger(b.config, incomingText))
    if (offHours) return offHours
  }
  return all.find(b => b.type === 'welcome' && b.isActive && matchesTrigger(b.config, incomingText)) ?? null
}

// Núcleo compartilhado entre o motor real (WhatsApp) e o simulador do
// Construtor — a única diferença entre os dois é `ctx.send` e qual versão
// (published/draft) de blocos é carregada; a lógica de sessão/roteamento é
// idêntica, o que garante que "Testar" se comporta exatamente como produção.
async function runEngineForSession(ctx: EngineCtx, blocks: Map<string, BlockRow>, phone: string, contactName: string | undefined, messageText: string): Promise<void> {
  const incomingText = normalizeText(messageText)
  if (blocks.size === 0) return // nada publicado/rascunho ainda pra este chatbot

  const session = await prisma.chatbotBuilderSession.findFirst({
    where: { chatbotId: ctx.chatbotId, phone, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })

  if (session) {
    if (incomingText === 'cancelar') {
      await prisma.chatbotBuilderSession.update({ where: { id: session.id }, data: { status: 'CANCELLED' } })
      await ctx.send('Atendimento cancelado. Qualquer dúvida, estou à disposição!')
      return
    }
    if (incomingText === 'atendente' || incomingText === 'humano') {
      await prisma.chatbotBuilderSession.update({ where: { id: session.id }, data: { status: 'TRANSFER' } })
      await ctx.send('Certo, vou transferir sua conversa para um atendente.')
      return
    }

    if (!session.currentBlockId || !blocks.has(session.currentBlockId)) {
      // Estado órfão (ex: versão trocada no meio da conversa) — encerra e
      // deixa a próxima mensagem iniciar uma sessão nova.
      await prisma.chatbotBuilderSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
      return
    }

    await drive(ctx, session, blocks, session.currentBlockId, messageText)
    return
  }

  const startBlock = await pickInitialBlock(ctx.doctorId, blocks, incomingText)
  if (!startBlock) return // nenhuma palavra-chave reconhecida

  const newSession = await prisma.chatbotBuilderSession.create({
    data: { chatbotId: ctx.chatbotId, phone, contactName, currentBlockId: startBlock.id, status: 'ACTIVE', variables: {} },
  })
  await drive(ctx, newSession, blocks, startBlock.id, messageText)
}

export async function runBlockEngine(params: {
  instance: any
  chatbotId: string
  doctorId: string
  contactPhone: string
  deliveryJid: string
  contactName?: string
  messageText: string
}): Promise<void> {
  const { instance, chatbotId, doctorId, contactPhone, deliveryJid, contactName, messageText } = params
  const ctx: EngineCtx = {
    doctorId,
    chatbotId,
    send: async (content: string) => { await sendLightMessage(instance, deliveryJid, content, 'visual_builder') },
  }
  const blocks = await loadVersionBlocks(chatbotId, 'published')
  await runEngineForSession(ctx, blocks, contactPhone, contactName, messageText)
}

const SIM_PREFIX = 'SIM_BLOCK_'

// "Testar" do Construtor — roda contra o rascunho (draft), nunca contra a
// versão publicada, e nunca manda WhatsApp real. Reaproveita 100% da lógica
// de sessão/blocos do motor real via runEngineForSession(); `onSend` dá a
// origem exata (bloco) de cada mensagem pro "rastro da conversa" no drawer.
export async function simulateBlockEngine(params: {
  doctorId: string
  chatbotId: string
  sessionToken: string
  messageText: string
}): Promise<{ botMessages: { text: string; source: { blockType: string; blockName: string } }[] }> {
  const { doctorId, chatbotId, sessionToken, messageText } = params
  const phone = `${SIM_PREFIX}${sessionToken}`
  const botMessages: { text: string; source: { blockType: string; blockName: string } }[] = []

  const blocks = await loadVersionBlocks(chatbotId, 'draft')
  const ctx: EngineCtx = {
    doctorId,
    chatbotId,
    send: async () => {},
    onSend: (content, block) => { botMessages.push({ text: content, source: { blockType: block.type, blockName: block.name } }) },
  }

  await runEngineForSession(ctx, blocks, phone, undefined, messageText)
  return { botMessages }
}

export async function resetBlockEngineSimulation(chatbotId: string, sessionToken: string): Promise<void> {
  const phone = `${SIM_PREFIX}${sessionToken}`
  await prisma.chatbotBuilderSession.deleteMany({ where: { chatbotId, phone } })
}
