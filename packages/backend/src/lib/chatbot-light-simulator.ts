import { prisma } from './prisma'
import { normalizeText } from './chatbot-light-engine'
import {
  parsePreferredDateText,
  findAvailableSlots,
  interpolateTemplate,
  maskCpf,
  formatSlotDateTime,
  startLeadCaptureFlow,
  processLeadCaptureStep,
} from './chatbot-light-guided-engine'

const SIM_PREFIX = 'SIM_'

function simPhone(doctorId: string, sessionToken: string): string {
  return `${SIM_PREFIX}${doctorId.substring(0, 8)}_${sessionToken}`
}

// Aplica os campos de rascunho do Construtor de Atendimento por cima dos
// campos live, sem alterar nenhuma lógica de roteamento abaixo — só usada
// quando o simulador é chamado com `useDraft: true` ("Testar" antes de
// publicar). O motor real (chatbot-light-engine.ts) nunca usa isso.
function withDraftOverlay<T extends {
  keywords: string
  welcomeMessage: string
  options: unknown
  draftKeywords?: string | null
  draftWelcomeMessage?: string | null
  draftOptions?: unknown
}>(fluxo: T, useDraft: boolean): T {
  if (!useDraft) return fluxo
  return {
    ...fluxo,
    keywords: fluxo.draftKeywords ?? fluxo.keywords,
    welcomeMessage: fluxo.draftWelcomeMessage ?? fluxo.welcomeMessage,
    options: fluxo.draftOptions ?? fluxo.options,
  }
}

export interface SimulateResult {
  botMessages: string[]
  currentStep: string | null
  sessionStatus: string
  flowName: string | null
  sessionId: string | null
}

// ─── Main simulate function ────────────────────────────────────────────────────
export async function simulateLightMessage(params: {
  doctorId: string
  sessionToken: string
  messageText: string
  chatbotId?: string
  useDraft?: boolean
}): Promise<SimulateResult> {
  const { doctorId, sessionToken, messageText, chatbotId, useDraft = false } = params

  const botMessages: string[] = []
  const collect = (msg: string) => { if (msg) botMessages.push(msg) }

  const incomingText = normalizeText(messageText)
  const contactPhone = simPhone(doctorId, sessionToken)

  // Sem chatbotId explícito, simula o chatbot padrão da conta (o mais
  // antigo) — mantém o simulador funcionando para quem só tem 1 chatbot.
  // Com chatbotId explícito, valida que pertence ao médico autenticado antes
  // de resolver a instância — sem isso, dava pra ler fluxo/template de outra clínica.
  const instance = chatbotId
    ? await prisma.whatsAppInstance.findFirst({ where: { chatbotId, chatbot: { doctorId } } })
    : await prisma.whatsAppInstance.findFirst({ where: { doctorId, type: 'CHATBOT_LIGHT' }, orderBy: { createdAt: 'asc' } })

  if (!instance) {
    collect('⚠️ Chatbot Light ainda não tem uma Sala vinculada. Vincule uma Sala em Configurações > Conexão.')
    return { botMessages, currentStep: null, sessionStatus: 'NO_INSTANCE', flowName: null, sessionId: null }
  }

  const activeSession = await prisma.lightFlowSession.findFirst({
    where: { contactPhone, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })

  // ── Active session path ────────────────────────────────────────────────────
  if (activeSession) {
    const now = new Date()
    if (activeSession.expiresAt && activeSession.expiresAt < now) {
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: { status: 'EXPIRED' },
      })
      collect('Este atendimento expirou por inatividade. Vamos iniciar novamente.')
      return await routeNewMessage({ doctorId, instance, contactPhone, incomingText, messageText, collect, useDraft })
    }

    await prisma.lightFlowSession.update({
      where: { id: activeSession.id },
      data: { expiresAt: new Date(now.getTime() + 30 * 60 * 1000) },
    })

    // Global commands
    const menuCmds = ['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'voltar']
    if (activeSession.currentStepKey === 'WAITING_MENU_OPTION' && menuCmds.includes(incomingText)) {
      if (activeSession.flowId) {
        const fluxoRaw = await prisma.lightFluxo.findUnique({ where: { id: activeSession.flowId } })
        const fluxo = fluxoRaw ? withDraftOverlay(fluxoRaw, useDraft) : null
        if (fluxo?.active) {
          collect(fluxo.welcomeMessage)
          return makeResult(botMessages, activeSession.currentStepKey, 'ACTIVE', fluxo.name, activeSession.id)
        }
      }
    }

    if (incomingText === 'cancelar') {
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: { status: 'CANCELLED' },
      })
      collect('Agendamento cancelado com sucesso. Qualquer dúvida, estou à disposição!')
      return makeResult(botMessages, null, 'CANCELLED', null, activeSession.id)
    }

    if (incomingText === 'atendente' || incomingText === 'humano') {
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: { status: 'TRANSFER' },
      })
      collect('Certo. Vou transferir sua conversa para um de nossos atendentes. Por favor, aguarde.')
      return makeResult(botMessages, null, 'TRANSFER', null, activeSession.id)
    }

    // WAITING_MENU_OPTION: match option triggers
    if (activeSession.currentStepKey === 'WAITING_MENU_OPTION') {
      return await processMenuOption({ instance, session: activeSession, incomingText, collect, useDraft })
    }

    // Guided steps (CHOOSE_PLAN, ASK_NAME, etc.)
    return await processGuidedSimStep({ doctorId, instance, session: activeSession, incomingText, messageText, collect })
  }

  // ── New message path ───────────────────────────────────────────────────────
  return await routeNewMessage({ doctorId, instance, contactPhone, incomingText, messageText, collect, useDraft })
}

// ─── Route new message (no active session) ───────────────────────────────────
async function routeNewMessage(params: {
  doctorId: string
  instance: any
  contactPhone: string
  incomingText: string
  messageText: string
  collect: (m: string) => void
  useDraft?: boolean
}): Promise<SimulateResult> {
  const { doctorId, instance, contactPhone, incomingText, collect, useDraft = false } = params
  const botMessages: string[] = []
  const innerCollect = (m: string) => { collect(m); botMessages.push(m) }

  const fluxosRaw = await prisma.lightFluxo.findMany({
    where: instance.chatbotId
      ? { chatbotId: instance.chatbotId, active: true }
      : { doctorId, chatbotId: null, active: true },
  })
  const fluxos = fluxosRaw.map(f => withDraftOverlay(f, useDraft))

  const matchedFlow = fluxos.find(f =>
    f.keywords.split(',').map(k => normalizeText(k)).includes(incomingText)
  )

  if (matchedFlow) {
    await prisma.lightFlowSession.updateMany({
      where: { contactPhone, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    })

    const newSession = await prisma.lightFlowSession.create({
      data: {
        instanceId: instance.id,
        conversationId: `SIM_CONV_${Date.now()}`,
        contactPhone,
        flowId: matchedFlow.id,
        currentStepKey: 'WAITING_MENU_OPTION',
        status: 'ACTIVE',
        lastMessageId: `SIM_${Date.now()}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        collectedData: { _contactIdentity: { normalizedPhone: '11999999999' } },
        dynamicOptions: {},
      },
    })

    innerCollect(matchedFlow.welcomeMessage)
    return makeResult(botMessages, 'WAITING_MENU_OPTION', 'ACTIVE', matchedFlow.name, newSession.id)
  }

  // Try quick replies
  const quickReply = await prisma.lightQuickReply.findFirst({
    where: instance.chatbotId
      ? { chatbotId: instance.chatbotId, keyword: { equals: incomingText, mode: 'insensitive' }, active: true }
      : { doctorId, chatbotId: null, keyword: { equals: incomingText, mode: 'insensitive' }, active: true },
  })

  if (quickReply) {
    innerCollect(quickReply.response)
    return makeResult(botMessages, null, 'QUICK_REPLY', null, null)
  }

  // No match found
  const keywords = fluxos.flatMap(f => f.keywords.split(',').map(k => k.trim())).filter(Boolean)
  if (keywords.length > 0) {
    innerCollect(`Não reconheci essa palavra. Tente uma das palavras-chave configuradas: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`)
  } else {
    innerCollect('Nenhum fluxo ativo encontrado. Crie um fluxo com palavras-chave para iniciar.')
  }
  return makeResult(botMessages, null, 'NO_MATCH', null, null)
}

// ─── Process WAITING_MENU_OPTION ──────────────────────────────────────────────
async function processMenuOption(params: {
  instance: any
  session: any
  incomingText: string
  collect: (m: string) => void
  useDraft?: boolean
}): Promise<SimulateResult> {
  const { instance, session, incomingText, collect, useDraft = false } = params

  const fluxoRaw = await prisma.lightFluxo.findUnique({ where: { id: session.flowId! } })
  const fluxo = fluxoRaw ? withDraftOverlay(fluxoRaw, useDraft) : null
  if (!fluxo?.active) {
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
    collect('Fluxo inativo ou não encontrado.')
    return makeResult([fluxo?.name || ''], null, 'FAILED', null, session.id)
  }

  const botMessages: string[] = []
  const innerCollect = (m: string) => { collect(m); botMessages.push(m) }

  let options: any[] = []
  try {
    options = typeof fluxo.options === 'string' ? JSON.parse(fluxo.options) : (fluxo.options as any[])
  } catch { options = [] }

  const matchedOption = options.find(o =>
    o.triggers.split(',').map((t: string) => normalizeText(t)).includes(incomingText)
  )

  if (!matchedOption) {
    const newAttempts = session.invalidAttempts + 1
    if (newAttempts >= fluxo.maxAttempts) {
      innerCollect(fluxo.fallbackMessage)
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { status: 'FAILED', failedReason: 'Excedeu tentativas.' },
      })
      return makeResult(botMessages, null, 'FAILED', fluxo.name, session.id)
    }
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { invalidAttempts: newAttempts },
    })
    innerCollect(`Opção inválida. Selecione uma opção válida do menu:\n\n${fluxo.welcomeMessage}`)
    return makeResult(botMessages, 'WAITING_MENU_OPTION', 'ACTIVE', fluxo.name, session.id)
  }

  const { actionType, response, nextFlowId, systemActionKey, systemActionConfigId, transitionMessage } = matchedOption

  if (actionType === 'SEND_MESSAGE') {
    if (response) innerCollect(response)
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })
    return makeResult(botMessages, null, 'COMPLETED', fluxo.name, session.id)
  }

  if (actionType === 'OPEN_MENU') {
    innerCollect(response || fluxo.welcomeMessage)
    return makeResult(botMessages, 'WAITING_MENU_OPTION', 'ACTIVE', fluxo.name, session.id)
  }

  if (actionType === 'TRANSFER_QUEUE') {
    if (response) innerCollect(response)
    innerCollect('Transferindo para atendente humano...')
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'TRANSFER' } })
    return makeResult(botMessages, null, 'TRANSFER', fluxo.name, session.id)
  }

  if (actionType === 'END_CHAT') {
    if (response) innerCollect(response)
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })
    return makeResult(botMessages, null, 'COMPLETED', fluxo.name, session.id)
  }

  // Lead capture como action type direto
  if (actionType === 'START_LEAD_CAPTURE') {
    if (response) innerCollect(response)
    const updatedLeadSession = await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: {
        currentStepKey: 'ASK_FIRST_TIME',
        collectedData: session.collectedData || { _contactIdentity: { normalizedPhone: '11999999999' } },
        dynamicOptions: {},
      },
    })
    // No simulador: envia a mensagem de abertura do lead capture diretamente
    innerCollect('Você vai agendar uma consulta pela primeira vez ou já fez algum procedimento conosco?\n\n1️⃣ Primeira vez\n2️⃣ Já fiz consulta')
    return makeResult(botMessages, 'ASK_FIRST_TIME', 'ACTIVE', fluxo.name, session.id)
  }

  if (actionType === 'OPEN_MENU' && nextFlowId) {
    const nextFlowRaw = await prisma.lightFluxo.findUnique({ where: { id: nextFlowId } })
    const nextFlow = nextFlowRaw ? withDraftOverlay(nextFlowRaw, useDraft) : null
    if (nextFlow?.active) {
      if (response) innerCollect(response)
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { flowId: nextFlow.id },
      })
      innerCollect(nextFlow.welcomeMessage)
      return makeResult(botMessages, 'WAITING_MENU_OPTION', 'ACTIVE', nextFlow.name, session.id)
    }
  }

  if (actionType === 'SYSTEM_ACTION' && systemActionKey === 'LEAD_CAPTURE') {
    const actionConfig = systemActionConfigId
      ? await prisma.lightSystemActionConfig.findUnique({ where: { id: systemActionConfigId } })
      : null

    if (!actionConfig?.active) {
      innerCollect('Não consegui iniciar essa ação. Configuração inativa ou não encontrada.')
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
      return makeResult(botMessages, null, 'FAILED', fluxo.name, session.id)
    }

    if (transitionMessage || response) innerCollect(transitionMessage || response)

    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: {
        actionConfigId: systemActionConfigId,
        currentStepKey: 'ASK_FIRST_TIME',
        collectedData: { _contactIdentity: { normalizedPhone: '11999999999' } },
        dynamicOptions: {},
      },
    })

    innerCollect('Você vai agendar uma consulta pela primeira vez ou já fez algum procedimento conosco?\n\n1️⃣ Primeira vez\n2️⃣ Já fiz consulta')
    return makeResult(botMessages, 'ASK_FIRST_TIME', 'ACTIVE', fluxo.name, session.id)
  }

  if (actionType === 'SYSTEM_ACTION' && systemActionKey === 'SCHEDULE_APPOINTMENT') {
    const actionConfig = systemActionConfigId
      ? await prisma.lightSystemActionConfig.findUnique({ where: { id: systemActionConfigId } })
      : null

    if (!actionConfig?.active) {
      innerCollect('Não consegui iniciar essa ação. Configuração inativa ou não encontrada.')
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
      return makeResult(botMessages, null, 'FAILED', fluxo.name, session.id)
    }

    if (transitionMessage || response) innerCollect(transitionMessage || response)

    const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
    const planSource = cfg.planSource || 'DOCTOR_SERVICES'
    const dynamicMap: Record<string, string> = {}
    let menuStr = ''

    if (planSource === 'DOCTOR_CONVENIOS') {
      const convenios = await prisma.healthPlan.findMany({
        where: { doctorId: instance.doctorId, active: true },
      })
      if (convenios.length === 0) {
        innerCollect('Desculpe, não há convênios cadastrados para agendamento.')
        await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
        return makeResult(botMessages, null, 'FAILED', fluxo.name, session.id)
      }
      menuStr = convenios.map((c, i) => {
        const idx = String(i + 1)
        dynamicMap[idx] = c.id
        return `${idx} - ${c.name}`
      }).join('\n')
    } else {
      const services = await prisma.appointmentType.findMany({
        where: { doctorId: instance.doctorId, active: true },
      })
      if (services.length === 0) {
        innerCollect('Desculpe, não há serviços cadastrados para agendamento.')
        await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
        return makeResult(botMessages, null, 'FAILED', fluxo.name, session.id)
      }
      menuStr = services.map((s, i) => {
        const idx = String(i + 1)
        dynamicMap[idx] = s.id
        const price = s.baseValue ? ` (R$ ${s.baseValue.toFixed(2)})` : ''
        return `${idx} - ${s.name}${price}`
      }).join('\n')
    }

    const messages = cfg.messages || {}
    const askPlanMsg = messages.askPlan || 'Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)'
    const interpolatedPlanMsg = interpolateTemplate(askPlanMsg, { opcoes: menuStr })

    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: {
        actionConfigId: systemActionConfigId,
        currentStepKey: 'CHOOSE_PLAN',
        dynamicOptions: dynamicMap,
        collectedData: { _contactIdentity: { normalizedPhone: '11999999999' } },
      },
    })

    innerCollect(interpolatedPlanMsg)
    return makeResult(botMessages, 'CHOOSE_PLAN', 'ACTIVE', fluxo.name, session.id)
  }

  // Fallback for unknown action type
  if (response) innerCollect(response)
  await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })
  return makeResult(botMessages, null, 'COMPLETED', fluxo.name, session.id)
}

// ─── Process guided scheduling steps ─────────────────────────────────────────
async function processGuidedSimStep(params: {
  doctorId: string
  instance: any
  session: any
  incomingText: string
  messageText: string
  collect: (m: string) => void
}): Promise<SimulateResult> {
  const { doctorId, instance, session, incomingText, messageText, collect } = params

  const botMessages: string[] = []
  const innerCollect = (m: string) => { collect(m); botMessages.push(m) }

  const actionConfigId = session.actionConfigId
  if (!actionConfigId) {
    innerCollect('Erro interno: sessão sem configuração de ação.')
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
    return makeResult(botMessages, null, 'FAILED', null, session.id)
  }

  const actionConfig = await prisma.lightSystemActionConfig.findUnique({ where: { id: actionConfigId } })
  if (!actionConfig?.active) {
    innerCollect('Configuração da ação inativa ou não encontrada.')
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
    return makeResult(botMessages, null, 'FAILED', null, session.id)
  }

  const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
  const limitSlots    = parseInt(cfg.limitSlots)    || 3
  const searchWindowDays = parseInt(cfg.searchWindowDays) || 15
  const durationMinutes  = parseInt(cfg.durationMinutes)  || 30
  const requireConvenio  = cfg.requireConvenio === true || cfg.requireConvenio === 'true'
  const planSource       = cfg.planSource || 'DOCTOR_SERVICES'
  const appointmentInitialStatus = cfg.appointmentInitialStatus || 'SCHEDULED'
  let cpfOption = cfg.cpfOption || ((cfg.requireCpf === true || cfg.requireCpf === 'true') ? 'ASK_REQUIRED' : 'DONT_ASK')

  const messages = cfg.messages || {}

  const collected = session.collectedData
    ? (typeof session.collectedData === 'string' ? JSON.parse(session.collectedData) : session.collectedData) as any
    : {}
  const dynamicMap = session.dynamicOptions
    ? (typeof session.dynamicOptions === 'string' ? JSON.parse(session.dynamicOptions) : session.dynamicOptions) as any
    : {}

  const ctx: Record<string, any> = {
    nome:        collected.nome        || '',
    telefone:    collected.telefone    || '',
    cpf:         collected.cpf ? maskCpf(collected.cpf) : '',
    planoNome:   collected.planoNome   || '',
    convenioNome:collected.convenioNome|| '',
    medico: '', data: '',
  }

  const msg = (key: string, fallback: string) => {
    const tmpl = messages[key] || fallback
    return interpolateTemplate(tmpl, ctx)
  }

  const updateStep = async (step: string, extra?: Record<string, any>) => {
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { currentStepKey: step, collectedData: collected, ...extra },
    })
    session.currentStepKey = step
  }

  const failSession = async (text: string) => {
    innerCollect(text)
    await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED', failedReason: text } })
  }

  let step = session.currentStepKey

  // ── CHOOSE_PLAN ────────────────────────────────────────────────────────────
  if (step === 'CHOOSE_PLAN') {
    const selectedId = dynamicMap[incomingText]
    if (!selectedId) {
      const attempts = session.invalidAttempts + 1
      if (attempts >= 3) {
        await failSession(msg('limitExceeded', 'Limite de tentativas excedido. Agendamento encerrado.'))
        return makeResult(botMessages, null, 'FAILED', null, session.id)
      }
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { invalidAttempts: attempts } })
      innerCollect(msg('invalidPlan', 'Opção inválida. Selecione o número correspondente ao plano desejado.'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    collected.serviceId = selectedId
    if (planSource === 'DOCTOR_CONVENIOS') {
      const plan = await prisma.healthPlan.findUnique({ where: { id: selectedId } })
      collected.planoNome = plan?.name || 'Convênio'
    } else {
      const service = await prisma.appointmentType.findUnique({ where: { id: selectedId } })
      collected.planoNome = service?.name || 'Serviço'
    }
    ctx.planoNome = collected.planoNome

    step = 'ASK_NAME'
    await updateStep(step, { dynamicOptions: {}, invalidAttempts: 0 })
    innerCollect(msg('askName', 'Para prosseguir, qual o seu nome completo?'))
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── ASK_NAME ───────────────────────────────────────────────────────────────
  if (step === 'ASK_NAME') {
    if (incomingText.trim().length < 3) {
      innerCollect(msg('askNameInvalid', 'Por favor, informe seu nome completo para registro.'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }
    collected.nome = messageText.trim() // preserve original case
    ctx.nome = collected.nome

    const contactIdentity = collected._contactIdentity || {}
    const canUseWaPhone = !!contactIdentity.normalizedPhone
    const useWaPhone = (cfg.useWhatsappPhone === true || cfg.useWhatsappPhone === 'true') && canUseWaPhone

    if (useWaPhone) {
      step = 'ASK_PHONE_CONFIRM'
      await updateStep(step, { dynamicOptions: { '1': 'CONFIRM_YES', '2': 'CONFIRM_NO' }, invalidAttempts: 0 })
      innerCollect(msg('askPhoneConfirm', 'Posso usar este número de WhatsApp como telefone de contato?\n\n1 - Sim\n2 - Informar outro número'))
    } else {
      step = 'ASK_PHONE_TEXT'
      await updateStep(step, { dynamicOptions: {}, invalidAttempts: 0 })
      innerCollect(msg('askPhoneText', 'Por favor, informe seu telefone com DDD:'))
    }
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── ASK_PHONE_CONFIRM ──────────────────────────────────────────────────────
  if (step === 'ASK_PHONE_CONFIRM') {
    const choice = dynamicMap[incomingText]
    if (choice === 'CONFIRM_YES') {
      const contactIdentity = collected._contactIdentity || {}
      collected.telefone = contactIdentity.normalizedPhone || '11999999999'
      ctx.telefone = collected.telefone
      return await afterPhoneCollected({ step, session, collected, ctx, cfg, cpfOption, requireConvenio, doctorId, instance, messages, msg, updateStep, innerCollect, botMessages })
    } else if (choice === 'CONFIRM_NO') {
      step = 'ASK_PHONE_TEXT'
      await updateStep(step, { dynamicOptions: {} })
      innerCollect(msg('askPhoneText', 'Por favor, informe seu telefone com DDD:'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    } else {
      innerCollect(msg('invalidPhoneConfirmChoice', 'Escolha inválida. Digite 1 ou 2.'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }
  }

  // ── ASK_PHONE_TEXT ─────────────────────────────────────────────────────────
  if (step === 'ASK_PHONE_TEXT') {
    const cleaned = incomingText.replace(/\D/g, '')
    if (cleaned.length < 10) {
      innerCollect(msg('invalidPhoneText', 'Telefone inválido. Digite o número com o DDD.'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }
    collected.telefone = cleaned
    ctx.telefone = cleaned
    return await afterPhoneCollected({ step, session, collected, ctx, cfg, cpfOption, requireConvenio, doctorId, instance, messages, msg, updateStep, innerCollect, botMessages })
  }

  // ── ASK_CPF ────────────────────────────────────────────────────────────────
  if (step === 'ASK_CPF') {
    const safeInput = incomingText.replace(/\D/g, '')
    if (cpfOption === 'ASK_OPTIONAL' && (safeInput === '0' || incomingText === 'pular' || incomingText === 'nao' || incomingText === 'não')) {
      collected.cpf = null
      ctx.cpf = ''
    } else {
      if (safeInput.length !== 11) {
        innerCollect(msg('invalidCpf', 'CPF inválido. Por favor, informe os 11 dígitos do seu CPF.'))
        return makeResult(botMessages, step, 'ACTIVE', null, session.id)
      }
      collected.cpf = safeInput
      ctx.cpf = maskCpf(safeInput)
    }

    if (requireConvenio) {
      step = 'ASK_CONVENIO'
      const convenios = await prisma.healthPlan.findMany({ where: { doctorId, active: true } })
      if (convenios.length > 0) {
        const mapOpts: Record<string, string> = {}
        const menuStr = convenios.map((c, i) => {
          const idx = String(i + 1)
          mapOpts[idx] = c.id
          return `${idx} - ${c.name}`
        }).join('\n')
        await updateStep(step, { dynamicOptions: mapOpts })
        innerCollect(`${msg('askConvenio', 'Qual o seu convênio/plano de saúde?')}\n\n${menuStr}\n\nSe for particular, digite 0.`)
      } else {
        step = 'ASK_DATE'
        await updateStep(step, { dynamicOptions: {} })
        innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
      }
    } else {
      step = 'ASK_DATE'
      await updateStep(step, { dynamicOptions: {} })
      innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
    }
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── ASK_CONVENIO ──────────────────────────────────────────────────────────
  if (step === 'ASK_CONVENIO') {
    if (incomingText === '0') {
      collected.convenioId = null
      collected.convenioNome = 'Particular'
    } else {
      const convId = dynamicMap[incomingText]
      if (!convId) {
        innerCollect(msg('invalidConvenio', 'Opção inválida. Digite o número do seu convênio ou 0 para Particular.'))
        return makeResult(botMessages, step, 'ACTIVE', null, session.id)
      }
      collected.convenioId = convId
      const plan = await prisma.healthPlan.findUnique({ where: { id: convId } })
      collected.convenioNome = plan?.name || 'Convênio'
    }
    ctx.convenioNome = collected.convenioNome

    step = 'ASK_DATE'
    await updateStep(step, { dynamicOptions: {} })
    innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── ASK_DATE ───────────────────────────────────────────────────────────────
  if (step === 'ASK_DATE') {
    collected.dataPreferida = incomingText

    const slots = await findAvailableSlots({
      doctorId,
      preferredDateText: incomingText,
      searchWindowDays,
      durationMinutes,
      limit: limitSlots,
    })

    if (slots.length === 0) {
      step = 'ASK_DATE_EMPTY'
      await updateStep(step, { dynamicOptions: { '1': 'REASK_DATE', '2': 'TRANSFER_HUMAN' } })
      innerCollect(msg('noSlots', 'Infelizmente não encontrei horários livres para este período. O que deseja fazer?\n\n1 - Escolher outra data\n2 - Falar com atendente'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    const mapOpts: Record<string, any> = {}
    const menuStr = slots.map((s, i) => {
      const idx = String(i + 1)
      mapOpts[idx] = s
      return `${idx} - ${formatSlotDateTime(s.startAt)}`
    }).join('\n')

    step = 'CHOOSE_SLOT'
    await updateStep(step, { dynamicOptions: mapOpts })
    const header = msg('slotsFound', 'Encontrei estes horários disponíveis:')
    innerCollect(`${header}\n\n${menuStr}\n\nPor favor, escolha a opção desejada.`)
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── ASK_DATE_EMPTY ─────────────────────────────────────────────────────────
  if (step === 'ASK_DATE_EMPTY') {
    const choice = dynamicMap[incomingText]
    if (choice === 'REASK_DATE') {
      step = 'ASK_DATE'
      await updateStep(step, { dynamicOptions: {} })
      innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
    } else if (choice === 'TRANSFER_HUMAN') {
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'TRANSFER' } })
      innerCollect(msg('transferHuman', 'Certo. Vou transferir sua conversa para um de nossos atendentes. Por favor, aguarde.'))
      return makeResult(botMessages, null, 'TRANSFER', null, session.id)
    } else {
      innerCollect('Opção inválida. Digite 1 para escolher outra data ou 2 para falar com atendente.')
    }
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── CHOOSE_SLOT ────────────────────────────────────────────────────────────
  if (step === 'CHOOSE_SLOT') {
    const slotData = dynamicMap[incomingText]
    if (!slotData) {
      const attempts = session.invalidAttempts + 1
      if (attempts >= 3) {
        await failSession(msg('limitExceeded', 'Limite de tentativas excedido. Agendamento encerrado.'))
        return makeResult(botMessages, null, 'FAILED', null, session.id)
      }
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { invalidAttempts: attempts } })
      innerCollect(msg('invalidSlot', 'Opção inválida. Por favor, escolha o número de um dos horários disponíveis.'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    collected.selectedSlot = slotData
    collected.appointmentDate = formatSlotDateTime(slotData.startAt)
    ctx.data = collected.appointmentDate

    step = 'CONFIRMATION'
    await updateStep(step, { dynamicOptions: { '1': 'CONFIRM_YES', '2': 'CONFIRM_NO' } })

    const confirmMsg = msg('confirmationMessage',
      'Ótimo! Confirme os dados do seu agendamento:\n\nNome: {nome}\nTelefone: {telefone}\nServiço: {planoNome}\nData/Hora: {data}\n\nConfirma? (1 - Sim / 2 - Não)'
    )
    innerCollect(interpolateTemplate(confirmMsg, { ...ctx, data: collected.appointmentDate }))
    return makeResult(botMessages, step, 'ACTIVE', null, session.id)
  }

  // ── CONFIRMATION ───────────────────────────────────────────────────────────
  if (step === 'CONFIRMATION') {
    const choice = dynamicMap[incomingText]
    if (choice === 'CONFIRM_YES' || incomingText === '1' || incomingText === 'sim') {
      // In simulation: do NOT create real appointment
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } })

      const statusLabel = appointmentInitialStatus === 'CONFIRMED' ? 'confirmado' : 'agendado'
      const successMsg = msg('successMessage',
        'Consulta {statusLabel} com sucesso! Em breve você receberá uma confirmação. Qualquer dúvida, entre em contato conosco.'
      )
      innerCollect(interpolateTemplate(successMsg, { ...ctx, data: collected.appointmentDate, statusLabel }))
      innerCollect(`\n🧪 *Modo Simulação*: Agendamento NÃO foi criado no sistema real.\nDados coletados: Nome: ${collected.nome || '-'} | Tel: ${collected.telefone || '-'} | Serviço: ${collected.planoNome || '-'} | Data: ${collected.appointmentDate || '-'}`)
      return makeResult(botMessages, null, 'COMPLETED', null, session.id)
    } else if (choice === 'CONFIRM_NO' || incomingText === '2' || incomingText === 'nao' || incomingText === 'não') {
      step = 'ASK_DATE'
      await updateStep(step, { dynamicOptions: {} })
      innerCollect('Tudo bem! Vamos escolher outra data.\n\n' + msg('askDate', 'Qual melhor data ou período para você?'))
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    } else {
      innerCollect('Opção inválida. Digite 1 para confirmar ou 2 para escolher outra data.')
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }
  }

  // ── LEAD CAPTURE STEPS ────────────────────────────────────────────────────
  if (step === 'ASK_FIRST_TIME' || step === 'ASK_LEAD_NAME' || step === 'ASK_LEAD_PHONE') {
    return await processLeadCaptureSimStep({ instance, session, incomingText, messageText, innerCollect, botMessages })
  }

  innerCollect('Estado de sessão desconhecido. Reinicie a simulação.')
  await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
  return makeResult(botMessages, null, 'FAILED', null, session.id)
}

// ─── Process lead capture steps in simulation ─────────────────────────────────
async function processLeadCaptureSimStep(params: {
  instance: any
  session: any
  incomingText: string
  messageText: string
  innerCollect: (m: string) => void
  botMessages: string[]
}): Promise<SimulateResult> {
  const { instance, session, incomingText, messageText, innerCollect, botMessages } = params

  const collected = session.collectedData
    ? (typeof session.collectedData === 'string' ? JSON.parse(session.collectedData) : session.collectedData) as any
    : {}

  let step = session.currentStepKey

  const updateStep = async (newStep: string, extra?: Record<string, any>) => {
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { currentStepKey: newStep, collectedData: collected, ...extra },
    })
    session.currentStepKey = newStep
    step = newStep
  }

  // ── ASK_FIRST_TIME ─────────────────────────────────────────────────────────
  if (step === 'ASK_FIRST_TIME') {
    const clean = incomingText.trim()
    if (clean !== '1' && clean !== '2') {
      const attempts = (session.invalidAttempts || 0) + 1
      if (attempts >= 3) {
        innerCollect('Limite de tentativas excedido. Atendimento encerrado. Caso precise, envie "oi" para reiniciar.')
        await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED', failedReason: 'Limite excedido' } })
        return makeResult(botMessages, null, 'FAILED', null, session.id)
      }
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { invalidAttempts: attempts } })
      innerCollect('Opção inválida. Por favor, digite 1️⃣ para primeira vez ou 2️⃣ se já fez consulta conosco.')
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    collected.isFirstTime = clean === '1'
    await updateStep('ASK_LEAD_NAME', { invalidAttempts: 0 })
    innerCollect('Ótimo! Por favor, informe seu nome completo:')
    return makeResult(botMessages, 'ASK_LEAD_NAME', 'ACTIVE', null, session.id)
  }

  // ── ASK_LEAD_NAME ──────────────────────────────────────────────────────────
  if (step === 'ASK_LEAD_NAME') {
    const name = messageText.trim() // preservar capitalização
    if (name.length < 2) {
      const attempts = (session.invalidAttempts || 0) + 1
      if (attempts >= 3) {
        innerCollect('Limite de tentativas excedido. Atendimento encerrado. Caso precise, envie "oi" para reiniciar.')
        await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED', failedReason: 'Limite excedido' } })
        return makeResult(botMessages, null, 'FAILED', null, session.id)
      }
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { invalidAttempts: attempts } })
      innerCollect('Por favor, informe seu nome completo (mínimo 2 caracteres).')
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    collected.leadName = name
    await updateStep('ASK_LEAD_PHONE', { invalidAttempts: 0 })
    const firstName = name.split(' ')[0]
    innerCollect(`Perfeito, ${firstName}! Agora informe seu telefone de contato:`)
    return makeResult(botMessages, 'ASK_LEAD_PHONE', 'ACTIVE', null, session.id)
  }

  // ── ASK_LEAD_PHONE ─────────────────────────────────────────────────────────
  if (step === 'ASK_LEAD_PHONE') {
    const cleaned = incomingText.replace(/\D/g, '')
    if (cleaned.length < 10) {
      const attempts = (session.invalidAttempts || 0) + 1
      if (attempts >= 3) {
        innerCollect('Limite de tentativas excedido. Atendimento encerrado. Caso precise, envie "oi" para reiniciar.')
        await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED', failedReason: 'Limite excedido' } })
        return makeResult(botMessages, null, 'FAILED', null, session.id)
      }
      await prisma.lightFlowSession.update({ where: { id: session.id }, data: { invalidAttempts: attempts } })
      innerCollect('Telefone inválido. Por favor, informe o número com DDD (mínimo 10 dígitos).')
      return makeResult(botMessages, step, 'ACTIVE', null, session.id)
    }

    collected.leadPhone = cleaned
    await updateStep('LEAD_COMPLETE', { invalidAttempts: 0 })

    // No simulador: criar Patient REAL com flag de simulação nas notas
    const doctorId = instance.doctorId
    try {
      const existing = await prisma.patient.findFirst({
        where: { doctorId, phone: cleaned }
      })

      if (existing) {
        innerCollect('✅ Obrigado! Seu interesse foi registrado e a equipe do(a) médico(a) entrará em contato em breve para confirmar seu agendamento. 😊')
        innerCollect(`\n🧪 *Modo Simulação*: Paciente já existia no sistema (id: ${existing.id}). Nenhum duplicado criado.`)
      } else {
        const isFirstTime: boolean = collected.isFirstTime !== false
        const firstTimeNote = isFirstTime ? 'Primeira consulta.' : 'Já tem histórico.'
        const leadName: string = collected.leadName || 'Não informado'

        let patientId: string | null = null
        try {
          const newPatient = await prisma.patient.create({
            data: {
              doctorId,
              name: leadName,
              phone: cleaned,
              notes: `Interesse via WhatsApp. ${firstTimeNote} [SIMULAÇÃO]`,
              status: 'PRE_CADASTRO',
              origin: 'CHATBOT',
              active: true,
              chatbotSessionId: session.id,
              leadStatus: 'NOVO'
            }
          })
          patientId = newPatient.id
        } catch (e: any) {
          // Fallback sem chatbotSessionId se a coluna ainda não existir
          if (e?.message?.includes('chatbotSessionId') || e?.code === 'P2009') {
            const newPatient = await prisma.patient.create({
              data: {
                doctorId,
                name: leadName,
                phone: cleaned,
                notes: `Interesse via WhatsApp. ${firstTimeNote} [SIMULAÇÃO]`,
                status: 'PRE_CADASTRO',
                origin: 'CHATBOT',
                active: true,
                leadStatus: 'NOVO'
              }
            })
            patientId = newPatient.id
          } else {
            throw e
          }
        }

        innerCollect('✅ Obrigado! Seu interesse foi registrado e a equipe do(a) médico(a) entrará em contato em breve para confirmar seu agendamento. 😊')
        innerCollect(`\n🧪 *Modo Simulação*: Paciente PRE_CADASTRO criado no sistema.\nNome: ${leadName} | Tel: ${cleaned} | ID: ${patientId || 'N/A'}`)
      }
    } catch (err) {
      console.error('[processLeadCaptureSimStep] Erro ao criar paciente:', err)
      innerCollect('✅ Obrigado! Seu interesse foi registrado.')
      innerCollect('\n🧪 *Modo Simulação*: Erro ao criar paciente no banco. Verifique os logs.')
    }

    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', completedAt: new Date() }
    })

    return makeResult(botMessages, null, 'COMPLETED', null, session.id)
  }

  innerCollect('Estado de lead capture desconhecido. Reinicie a simulação.')
  return makeResult(botMessages, null, 'FAILED', null, session.id)
}

// ─── After phone collected: decide next step ──────────────────────────────────
async function afterPhoneCollected(params: {
  step: string
  session: any
  collected: any
  ctx: Record<string, any>
  cfg: any
  cpfOption: string
  requireConvenio: boolean
  doctorId: string
  instance: any
  messages: any
  msg: (k: string, f: string) => string
  updateStep: (s: string, extra?: any) => Promise<void>
  innerCollect: (m: string) => void
  botMessages: string[]
}): Promise<SimulateResult> {
  const { session, collected, ctx, cpfOption, requireConvenio, doctorId, messages, msg, updateStep, innerCollect, botMessages } = params

  const hasCpf = cpfOption === 'ASK_REQUIRED' || cpfOption === 'ASK_OPTIONAL'

  if (hasCpf) {
    const stepKey = 'ASK_CPF'
    await updateStep(stepKey, { dynamicOptions: {} })
    const extra = cpfOption === 'ASK_OPTIONAL' ? '\n\n(Digite 0 ou "não" para pular)' : ''
    innerCollect(msg('askCpf', 'Por favor, digite seu CPF (apenas números):') + extra)
    return makeResult(botMessages, stepKey, 'ACTIVE', null, session.id)
  }

  if (requireConvenio) {
    const stepKey = 'ASK_CONVENIO'
    const convenios = await prisma.healthPlan.findMany({ where: { doctorId, active: true } })
    if (convenios.length > 0) {
      const mapOpts: Record<string, string> = {}
      const menuStr = convenios.map((c, i) => {
        const idx = String(i + 1)
        mapOpts[idx] = c.id
        return `${idx} - ${c.name}`
      }).join('\n')
      await updateStep(stepKey, { dynamicOptions: mapOpts })
      innerCollect(`${msg('askConvenio', 'Qual o seu convênio/plano de saúde?')}\n\n${menuStr}\n\nSe for particular, digite 0.`)
    } else {
      const dateStep = 'ASK_DATE'
      await updateStep(dateStep, { dynamicOptions: {} })
      innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
      return makeResult(botMessages, dateStep, 'ACTIVE', null, session.id)
    }
    return makeResult(botMessages, stepKey, 'ACTIVE', null, session.id)
  }

  const dateStep = 'ASK_DATE'
  await updateStep(dateStep, { dynamicOptions: {} })
  innerCollect(msg('askDate', 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'))
  return makeResult(botMessages, dateStep, 'ACTIVE', null, session.id)
}

// ─── Reset simulation session ─────────────────────────────────────────────────
export async function resetSimulation(doctorId: string, sessionToken: string): Promise<void> {
  const contactPhone = simPhone(doctorId, sessionToken)
  await prisma.lightFlowSession.updateMany({
    where: { contactPhone, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  })
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeResult(
  botMessages: string[],
  currentStep: string | null,
  sessionStatus: string,
  flowName: string | null,
  sessionId: string | null
): SimulateResult {
  const msgs = typeof botMessages[0] === 'string' && botMessages.length === 1 && Array.isArray(botMessages[0])
    ? botMessages[0] as unknown as string[]
    : botMessages
  return { botMessages: msgs, currentStep, sessionStatus, flowName, sessionId }
}
