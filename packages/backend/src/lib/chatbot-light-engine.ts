import NodeCache from 'node-cache'
import { prisma } from './prisma'
import { resolveWhatsAppContactIdentity } from './whatsapp'
import { resolveChatbotLightSendTarget, sendRoomWhatsAppMessage, normalizeToWhatsAppJid, checkPhoneOnWhatsApp } from './room-whatsapp'
import { processGuidedStep, interpolateTemplate, startLeadCaptureFlow, processLeadCaptureStep } from './chatbot-light-guided-engine'
import { resolveTemplateVariables, resolveMessageText, TemplateContext } from './chatbot-light-variables'
import { isWithinBusinessHours, flowHasLeadCapture, BusinessHoursConfig } from './chatbot-light-business-hours'


const lightFlowStateCache = new NodeCache({
  stdTTL: 1800, // 30 minutos de inatividade expira o estado
  checkperiod: 60,
})

// Auxiliar para salvar log e enviar mensagem
export async function sendLightMessage(
  instance: any,
  to: string, // JID or phone
  content: string,
  module: string,
  triggerEvent?: string,
  recipientName?: string,
  templateId?: string
): Promise<boolean> {
  const jid = normalizeToWhatsAppJid(to)
  const cleanPhone = jid.replace('@s.whatsapp.net', '')

  const log = await prisma.lightMessageLog.create({
    data: {
      doctorId: instance.doctorId,
      chatbotId: instance.chatbotId ?? null,
      phone: cleanPhone,
      recipientName: recipientName ?? null,
      content,
      module,
      triggerEvent,
      templateId: templateId ?? null,
      status: 'PENDING',
    },
  })

  try {
    const target = await resolveChatbotLightSendTarget(instance.chatbotId)
    if (!target) throw new Error('WhatsApp não conectado — vincule uma Sala em Configurações > Conexão')

    // Resolve canonical WhatsApp JID so 8-digit vs 9-digit Brazilian numbers are handled correctly.
    // onWhatsApp() returns the JID the server actually knows — avoids silent delivery failure.
    const phoneCheck = await checkPhoneOnWhatsApp(target.instanceKey, to).catch(() => null)
    const sendJid = phoneCheck?.jid ?? jid
    if (phoneCheck && !phoneCheck.exists) {
      throw new Error(`Número ${to} não está no WhatsApp`)
    }

    const result = await sendRoomWhatsAppMessage(target.instanceKey, sendJid, content)
    if (!result) throw new Error('Falha no envio do socket')

    await prisma.lightMessageLog.update({
      where: { id: log.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
    return true
  } catch (err: any) {
    const errorMessage = err?.message || String(err)
    await prisma.lightMessageLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage },
    })
    return false
  }
}

export function normalizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function chatbotLightLog(
  level: 'info' | 'warn' | 'error',
  socketInstanceKey: string,
  event: string,
  meta?: Record<string, any>
) {
  const ts = new Date().toISOString()
  console.log(JSON.stringify({
    ts,
    level,
    module: 'CHATBOT_LIGHT',
    instanceKey: socketInstanceKey,
    event,
    ...meta
  }))
}

// Handler de mensagens recebidas específicas para a conexão do Chatbot Light
export async function handleIncomingLightMessage(params: {
  socketInstanceKey: string;
  whatsappInstanceId: string;
  conversationId: string;
  remoteJid: string;
  deliveryJid: string;
  lidJid?: string;
  phoneJid?: string;
  normalizedPhone?: string;
  messageId: string;
  messageText: string;
  msgRaw?: any;
}): Promise<void> {
  const { socketInstanceKey, whatsappInstanceId, conversationId, messageId, messageText, msgRaw } = params

  // 1. Verificar CHATBOT_LIGHT_ENABLED
  const lightEnabled = process.env.CHATBOT_LIGHT_ENABLED !== 'false'
  if (!lightEnabled) {
    chatbotLightLog('info', socketInstanceKey, 'chatbot_light.disabled', { messageId })
    return
  }

  // 2. Normalizar texto recebido
  const incomingText = normalizeText(messageText)

  // 3. Resolver identidade do contato
  const identity = await resolveWhatsAppContactIdentity(whatsappInstanceId, params.remoteJid, msgRaw)
  const { remoteJid, deliveryJid, lidJid, phoneJid, normalizedPhone } = identity

  // contactKey resolver
  const contactKey = normalizedPhone || lidJid || remoteJid
  chatbotLightLog('info', socketInstanceKey, 'chatbot_light.session_contact_key_resolved', { contactKey })

  chatbotLightLog('info', socketInstanceKey, 'chatbot_light.incoming_received', {
    contactPhone: contactKey,
    normalizedPhone,
    remoteJidType: remoteJid.endsWith('@lid') ? 'lid' : 'phone',
    messageId,
    messageText,
  })

  // 4. Filtro CHATBOT_LIGHT_TEST_NUMBERS e JIDS
  const testTargets = [
    ...(process.env.CHATBOT_LIGHT_TEST_NUMBERS?.split(',') ?? []),
    ...(process.env.CHATBOT_LIGHT_TEST_JIDS?.split(',') ?? []),
    ...(process.env.CHATBOT_LIGHT_TEST_TARGETS?.split(',') ?? [])
  ]
    .map((n) => n.trim())
    .filter(Boolean)

  if (testTargets.length > 0) {
    const isAllowed = [
      normalizedPhone,
      phoneJid,
      lidJid,
      remoteJid,
      deliveryJid,
      contactKey
    ].some(val => val && testTargets.includes(val))

    if (!isAllowed) {
      chatbotLightLog('info', socketInstanceKey, 'chatbot_light.test_number_blocked', {
        contactPhone: contactKey,
        normalizedPhone,
        remoteJid,
        messageId
      })
      return
    }
  }

  // 5. Carregar Instância e validar
  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: whatsappInstanceId } })
  if (!instance || instance.type !== 'CHATBOT_LIGHT') {
    chatbotLightLog('error', socketInstanceKey, 'chatbot_light.error', {
      message: 'Instance not found or not CHATBOT_LIGHT',
      whatsappInstanceId
    })
    return
  }

  // 6. Buscar sessão ACTIVE
  const activeSession = await prisma.lightFlowSession.findFirst({
    where: {
      instanceId: whatsappInstanceId,
      contactPhone: contactKey,
      status: 'ACTIVE'
    }
  })

  if (activeSession) {
    // Idempotência
    if (activeSession.lastMessageId === messageId) {
      chatbotLightLog('info', socketInstanceKey, 'chatbot_light.duplicate_message_ignored', {
        messageId,
        sessionId: activeSession.id
      })
      return
    }

    const now = new Date()
    const collected = activeSession.collectedData ? (typeof activeSession.collectedData === 'string' ? JSON.parse(activeSession.collectedData) : activeSession.collectedData) as any : {}
    const sessionDeliveryJid = collected?._contactIdentity?.deliveryJid || deliveryJid

    if (activeSession.expiresAt && activeSession.expiresAt < now) {
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: { status: 'EXPIRED' }
      })
      chatbotLightLog('info', socketInstanceKey, 'chatbot_light.session_expired', { sessionId: activeSession.id })
      await sendLightMessage(instance, sessionDeliveryJid, 'Este atendimento expirou por inatividade. Vamos iniciar novamente.', 'fluxo_guiado')
      // Tentar rodar como nova mensagem
    } else {
      // Atualizar lastMessageId e expiração
      const updatedSession = await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: {
          lastMessageId: messageId,
          lastMessageAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
        }
      })

      chatbotLightLog('info', socketInstanceKey, 'chatbot_light.session_step_processing', {
        sessionId: activeSession.id,
        currentStepKey: activeSession.currentStepKey,
        incomingText
      })

      // Reenvio de menu na sessão ativa WAITING_MENU_OPTION
      const menuCommands = ['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'voltar']
      if (activeSession.currentStepKey === 'WAITING_MENU_OPTION' && menuCommands.includes(incomingText)) {
        if (activeSession.flowId) {
          const fluxo = await prisma.lightFluxo.findUnique({ where: { id: activeSession.flowId } })
          if (fluxo && fluxo.active) {
            chatbotLightLog('info', socketInstanceKey, 'chatbot_light.menu_resent', {
              sessionId: activeSession.id,
              flowId: fluxo.id
            })
            await sendLightMessage(instance, sessionDeliveryJid, fluxo.welcomeMessage, 'fluxo', fluxo.name)
            return
          }
        }
      }

      // Interceptador de comandos globais
      if (incomingText === 'cancelar') {
        await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { status: 'CANCELLED' }
        })
        chatbotLightLog('info', socketInstanceKey, 'chatbot_light.global_command', { command: 'cancelar', sessionId: activeSession.id })
        await sendLightMessage(instance, sessionDeliveryJid, 'Agendamento cancelado com sucesso. Qualquer dúvida, estou à disposição!', 'fluxo_guiado')
        return
      } else if (incomingText === 'atendente' || incomingText === 'humano') {
        await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { status: 'TRANSFER' }
        })
        chatbotLightLog('info', socketInstanceKey, 'chatbot_light.global_command', { command: 'atendente', sessionId: activeSession.id })
        await sendLightMessage(instance, sessionDeliveryJid, 'Certo. Vou transferir sua conversa para um de nossos atendentes. Por favor, aguarde.', 'fluxo_guiado')
        return
      } else if (incomingText === 'voltar') {
        let prevStep = 'CHOOSE_PLAN'
        const currentStep = activeSession.currentStepKey

        // Carregar config para saber quais passos estavam ativos
        let actionConfig: any = null
        let requireConvenio = false
        let cpfOption = 'DONT_ASK'
        if (activeSession.actionConfigId) {
          actionConfig = await prisma.lightSystemActionConfig.findUnique({
            where: { id: activeSession.actionConfigId }
          })
          if (actionConfig) {
            const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
            requireConvenio = cfg.requireConvenio === true || cfg.requireConvenio === 'true'
            cpfOption = cfg.cpfOption || ((cfg.requireCpf === true || cfg.requireCpf === 'true') ? 'ASK_REQUIRED' : 'DONT_ASK')
          }
        }

        if (currentStep === 'ASK_NAME') prevStep = 'CHOOSE_PLAN'
        else if (currentStep === 'ASK_PHONE_CONFIRM' || currentStep === 'ASK_PHONE_TEXT') prevStep = 'ASK_NAME'
        else if (currentStep === 'ASK_CPF') {
          const hasConfirm = actionConfig && (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config).useWhatsappPhone;
          const canUseWhatsappAsPhone = !!collected._contactIdentity?.normalizedPhone;
          const useWhatsappPhone = (hasConfirm === true || hasConfirm === 'true') && canUseWhatsappAsPhone;
          prevStep = useWhatsappPhone ? 'ASK_PHONE_CONFIRM' : 'ASK_PHONE_TEXT';
        }
        else if (currentStep === 'ASK_CONVENIO') {
          if (cpfOption === 'ASK_REQUIRED' || cpfOption === 'ASK_OPTIONAL') {
            prevStep = 'ASK_CPF'
          } else {
            const hasConfirm = actionConfig && (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config).useWhatsappPhone;
            const canUseWhatsappAsPhone = !!collected._contactIdentity?.normalizedPhone;
            const useWhatsappPhone = (hasConfirm === true || hasConfirm === 'true') && canUseWhatsappAsPhone;
            prevStep = useWhatsappPhone ? 'ASK_PHONE_CONFIRM' : 'ASK_PHONE_TEXT';
          }
        }
        else if (currentStep === 'ASK_DATE') {
          if (requireConvenio) {
            prevStep = 'ASK_CONVENIO'
          } else if (cpfOption === 'ASK_REQUIRED' || cpfOption === 'ASK_OPTIONAL') {
            prevStep = 'ASK_CPF'
          } else {
            const hasConfirm = actionConfig && (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config).useWhatsappPhone;
            const canUseWhatsappAsPhone = !!collected._contactIdentity?.normalizedPhone;
            const useWhatsappPhone = (hasConfirm === true || hasConfirm === 'true') && canUseWhatsappAsPhone;
            prevStep = useWhatsappPhone ? 'ASK_PHONE_CONFIRM' : 'ASK_PHONE_TEXT';
          }
        }
        else if (currentStep === 'CHOOSE_SLOT') prevStep = 'ASK_DATE'
        else if (currentStep === 'CONFIRMATION') prevStep = 'CHOOSE_SLOT'

        const updated = await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { currentStepKey: prevStep }
        })

        chatbotLightLog('info', socketInstanceKey, 'chatbot_light.global_command', { command: 'voltar', sessionId: activeSession.id, prevStep })
        await sendLightMessage(instance, sessionDeliveryJid, 'Voltando ao passo anterior...', 'fluxo_guiado')
        await processGuidedStep(instance, updated, '')
        return
      } else {
        // Se a sessão está aguardando a opção de menu
        if (activeSession.currentStepKey === 'WAITING_MENU_OPTION') {
          if (!activeSession.flowId) {
            chatbotLightLog('error', socketInstanceKey, 'chatbot_light.error', {
              message: 'Session flowId is missing',
              sessionId: activeSession.id
            })
            return
          }

          const fluxo = await prisma.lightFluxo.findUnique({ where: { id: activeSession.flowId } })
          if (!fluxo || !fluxo.active) {
            chatbotLightLog('error', socketInstanceKey, 'chatbot_light.error', {
              message: 'Session flow not found or inactive',
              flowId: activeSession.flowId
            })
            await prisma.lightFlowSession.update({
              where: { id: activeSession.id },
              data: { status: 'FAILED', failedReason: 'Fluxo inativo ou não encontrado.' }
            })
            return
          }

          let options: any[] = []
          try {
            options = typeof fluxo.options === 'string' ? JSON.parse(fluxo.options) : (fluxo.options as any[])
          } catch {
            options = []
          }

          // Procurar por triggers da opção correspondente
          const matchedOption = options.find(o =>
            o.triggers.split(',').map((t: string) => normalizeText(t)).includes(incomingText)
          )

          if (matchedOption) {
            chatbotLightLog('info', socketInstanceKey, 'chatbot_light.option_selected', {
              flowId: fluxo.id,
              option: matchedOption.input,
              actionType: matchedOption.actionType
            })

            const actionType = matchedOption.actionType
            const response = await resolveMessageText({ text: matchedOption.response, templateId: matchedOption.templateId }, {}, prisma)

            if (actionType === 'START_LEAD_CAPTURE') {
              // Lead capture direto (sem LightSystemActionConfig vinculado)
              if (response) {
                await sendLightMessage(instance, sessionDeliveryJid, response, 'fluxo', fluxo.name)
              }
              const updatedLeadSession = await prisma.lightFlowSession.update({
                where: { id: activeSession.id },
                data: {
                  currentStepKey: 'ASK_FIRST_TIME',
                  collectedData: collected,
                  dynamicOptions: {}
                }
              })
              await startLeadCaptureFlow(instance, updatedLeadSession, prisma)
              chatbotLightLog('info', socketInstanceKey, 'chatbot_light.lead_capture_started', { sessionId: activeSession.id })
            } else if (actionType === 'OPEN_MENU') {
              await sendLightMessage(instance, sessionDeliveryJid, response || fluxo.welcomeMessage, 'fluxo', fluxo.name)
              // Mantém WAITING_MENU_OPTION
            } else if (actionType === 'SYSTEM_ACTION') {
              const actionKey = matchedOption.systemActionKey
              const configId = matchedOption.systemActionConfigId
              const transMsg = matchedOption.transitionMessage || response

              // Validar a systemActionConfig
              const actionConfig = configId ? await prisma.lightSystemActionConfig.findUnique({ where: { id: configId } }) : null

              if (!actionConfig || !actionConfig.active || actionConfig.instanceId !== whatsappInstanceId || actionConfig.actionKey !== actionKey) {
                chatbotLightLog('warn', socketInstanceKey, 'chatbot_light.system_action_config_invalid', {
                  configId,
                  actionKey,
                  instanceId: whatsappInstanceId
                })
                await sendLightMessage(instance, sessionDeliveryJid, 'Não consegui iniciar essa ação agora. Vou transferir você para um atendente.', 'fluxo')
                await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: { status: 'FAILED', failedReason: 'Ação do sistema inválida ou inativa.' }
                })
                return
              }

              chatbotLightLog('info', socketInstanceKey, 'chatbot_light.system_action_started', {
                actionKey,
                configId,
                sessionId: activeSession.id
              })

              if (actionKey === 'LEAD_CAPTURE') {
                if (transMsg) {
                  await sendLightMessage(instance, sessionDeliveryJid, transMsg, 'fluxo', fluxo.name)
                }

                // Transicionar sessão para o fluxo de lead capture
                const updatedLeadSession = await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: {
                    actionConfigId: configId,
                    currentStepKey: 'ASK_FIRST_TIME',
                    collectedData: collected,
                    dynamicOptions: {}
                  }
                })

                await startLeadCaptureFlow(instance, updatedLeadSession, prisma)

                chatbotLightLog('info', socketInstanceKey, 'chatbot_light.lead_capture_started', {
                  sessionId: activeSession.id
                })
                return
              } else if (actionKey === 'SCHEDULE_APPOINTMENT') {
                if (transMsg) {
                  await sendLightMessage(instance, sessionDeliveryJid, transMsg, 'fluxo', fluxo.name)
                }

                // Transicionar sessão para os passos guiados
                const updatedSessionForAction = await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: {
                    actionConfigId: configId,
                    currentStepKey: 'CHOOSE_PLAN',
                    collectedData: collected, // manter identidade do contato
                    dynamicOptions: {}
                  }
                })

                // Carregar opções de planos/serviços
                const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
                const planSource = cfg.planSource || 'DOCTOR_SERVICES'
                let menuStr = ''
                const dynamicMap: Record<string, string> = {}

                if (planSource === 'DOCTOR_CONVENIOS') {
                  const convenios = await prisma.healthPlan.findMany({
                    where: { doctorId: instance.doctorId, active: true }
                  })
                  if (convenios.length === 0) {
                    await sendLightMessage(instance, sessionDeliveryJid, 'Desculpe, não há convênios cadastrados para agendamento no momento.', 'fluxo')
                    await prisma.lightFlowSession.update({ where: { id: activeSession.id }, data: { status: 'FAILED' } })
                    return
                  }
                  menuStr = convenios.map((c, i) => {
                    const idx = String(i + 1)
                    dynamicMap[idx] = c.id
                    return `${idx} - ${c.name}`
                  }).join('\n')
                } else if (planSource === 'CUSTOM') {
                  const customItems: any[] = cfg.customItems || []
                  if (customItems.length === 0) {
                    await sendLightMessage(instance, sessionDeliveryJid, 'Desculpe, nenhum item personalizado configurado para agendamento no momento.', 'fluxo')
                    await prisma.lightFlowSession.update({ where: { id: activeSession.id }, data: { status: 'FAILED' } })
                    return
                  }
                  menuStr = customItems.map((item: any, i: number) => {
                    const idx = String(i + 1)
                    // Use id if available, otherwise use label as identifier
                    dynamicMap[idx] = item.id || item.label
                    const display = item.displayValue ? ` (${item.displayValue})` : ''
                    return `${idx} - ${item.label}${display}`
                  }).join('\n')
                } else {
                  const services = await prisma.appointmentType.findMany({
                    where: { doctorId: instance.doctorId, active: true }
                  })
                  if (services.length === 0) {
                    await sendLightMessage(instance, sessionDeliveryJid, 'Desculpe, não há serviços/procedimentos cadastrados para agendamento no momento.', 'fluxo')
                    await prisma.lightFlowSession.update({ where: { id: activeSession.id }, data: { status: 'FAILED' } })
                    return
                  }
                  menuStr = services.map((s, i) => {
                    const idx = String(i + 1)
                    dynamicMap[idx] = s.id
                    const price = s.baseValue ? ` (R$ ${s.baseValue.toFixed(2)})` : ''
                    return `${idx} - ${s.name}${price}`
                  }).join('\n')
                }

                await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: { dynamicOptions: dynamicMap }
                })

                const messagesCfg = cfg.messages || {}
                const askPlanMsg = messagesCfg.askPlan || 'Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)'
                const interpolatedPlanMsg = interpolateTemplate(askPlanMsg, { opcoes: menuStr })

                await sendLightMessage(instance, sessionDeliveryJid, interpolatedPlanMsg, 'fluxo')
              } else {
                await sendLightMessage(instance, sessionDeliveryJid, 'Desculpe, esta ação ainda não está implementada no sistema.', 'fluxo')
                await prisma.lightFlowSession.update({ where: { id: activeSession.id }, data: { status: 'COMPLETED' } })
              }
            } else if (matchedOption.nextFlowId) {
              const nextFlow = await prisma.lightFluxo.findUnique({ where: { id: matchedOption.nextFlowId } })
              if (nextFlow && nextFlow.active) {
                if (response) {
                  await sendLightMessage(instance, sessionDeliveryJid, response, 'fluxo', fluxo.name)
                }
                await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: { flowId: nextFlow.id }
                })
                await sendLightMessage(instance, sessionDeliveryJid, nextFlow.welcomeMessage, 'fluxo', nextFlow.name)
              } else {
                if (response) {
                  await sendLightMessage(instance, sessionDeliveryJid, response, 'fluxo', fluxo.name)
                }
                await prisma.lightFlowSession.update({
                  where: { id: activeSession.id },
                  data: { status: 'COMPLETED' }
                })
              }
            } else {
              if (response) {
                await sendLightMessage(instance, sessionDeliveryJid, response, 'fluxo', fluxo.name)
              }
              await prisma.lightFlowSession.update({
                where: { id: activeSession.id },
                data: { status: 'COMPLETED' }
              })
            }
          } else {
            // Opção inválida
            const newAttempts = activeSession.invalidAttempts + 1
            if (newAttempts >= fluxo.maxAttempts) {
              await sendLightMessage(instance, sessionDeliveryJid, fluxo.fallbackMessage, 'fluxo', fluxo.name)
              await prisma.lightFlowSession.update({
                where: { id: activeSession.id },
                data: { status: 'FAILED', failedReason: 'Excedeu número máximo de tentativas.' }
              })
            } else {
              await prisma.lightFlowSession.update({
                where: { id: activeSession.id },
                data: { invalidAttempts: newAttempts }
              })
              await sendLightMessage(
                instance,
                sessionDeliveryJid,
                `Opção inválida. Selecione uma opção válida do menu:\n\n${fluxo.welcomeMessage}`,
                'fluxo',
                fluxo.name
              )
            }
          }
          return
        }

        // Caso a sessão esteja em outro passo guiado
        await processGuidedStep(instance, activeSession, incomingText)
        return
      }
    }
  }

  // 7. Se sessão não existe, tentar bater com gatilhos
  chatbotLightLog('info', socketInstanceKey, 'chatbot_light.flow_search_started', { incomingText })

  // Escopado pelo chatbot da instância — cada chatbot só responde com seus
  // próprios fluxos (multi-chatbot, jul/2026). Fluxos legados sem chatbotId
  // (pré-migration) continuam batendo pelo doctorId como fallback.
  const fluxos = await prisma.lightFluxo.findMany({
    where: instance.chatbotId
      ? { chatbotId: instance.chatbotId, active: true }
      : { doctorId: instance.doctorId, chatbotId: null, active: true },
  })

  const matchedFlow = fluxos.find(f =>
    f.keywords.split(',').map(k => normalizeText(k)).includes(incomingText)
  )

  if (matchedFlow) {
    chatbotLightLog('info', socketInstanceKey, 'chatbot_light.flow_matched', { flowId: matchedFlow.id, flowName: matchedFlow.name })

    // Horário de funcionamento — fora do horário, fluxos normais são
    // substituídos pela mensagem configurada, exceto quando o fluxo captura
    // lead/pré-agendamento e isso foi explicitamente permitido fora do horário.
    const lightSettings = await prisma.lightSettings.findUnique({
      where: { doctorId: instance.doctorId },
      select: { businessHours: true },
    })
    const businessHours = lightSettings?.businessHours as BusinessHoursConfig | null
    if (businessHours?.enabled && !isWithinBusinessHours(businessHours)) {
      const allowedOffHours = businessHours.allowLeadCaptureOffHours && flowHasLeadCapture(matchedFlow.options)
      if (!allowedOffHours) {
        await sendLightMessage(instance, deliveryJid, businessHours.offHoursMessage, 'fluxo_guiado')
        chatbotLightLog('info', socketInstanceKey, 'chatbot_light.off_hours_blocked', { flowId: matchedFlow.id })
        return
      }
    }

    // Cancelar sessões anteriores ativas
    await prisma.lightFlowSession.updateMany({
      where: { instanceId: whatsappInstanceId, contactPhone: contactKey, status: 'ACTIVE' },
      data: { status: 'CANCELLED' }
    })

    // Criar nova sessão
    const newSession = await prisma.lightFlowSession.create({
      data: {
        instanceId: whatsappInstanceId,
        conversationId,
        contactPhone: contactKey,
        flowId: matchedFlow.id,
        currentStepKey: 'WAITING_MENU_OPTION',
        status: 'ACTIVE',
        lastMessageId: messageId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        collectedData: {
          _contactIdentity: {
            remoteJid,
            deliveryJid,
            lidJid,
            phoneJid,
            normalizedPhone
          }
        },
        dynamicOptions: {}
      }
    })

    chatbotLightLog('info', socketInstanceKey, 'chatbot_light.session_created', { sessionId: newSession.id })

    // Enviar mensagem de abertura
    await sendLightMessage(instance, deliveryJid, matchedFlow.welcomeMessage, 'fluxo', matchedFlow.name)
    chatbotLightLog('info', socketInstanceKey, 'chatbot_light.opening_sent', { flowId: matchedFlow.id })

    // Incrementar execuções
    await prisma.lightFluxo.update({
      where: { id: matchedFlow.id },
      data: { executions: { increment: 1 } },
    }).catch(() => {})
    return
  }

  // 8. Tentar bater com respostas rápidas (mesmo escopo por chatbot acima)
  const quickReply = await prisma.lightQuickReply.findFirst({
    where: instance.chatbotId
      ? { chatbotId: instance.chatbotId, keyword: { equals: incomingText, mode: 'insensitive' }, active: true }
      : { doctorId: instance.doctorId, chatbotId: null, keyword: { equals: incomingText, mode: 'insensitive' }, active: true },
  })

  if (quickReply) {
    const text = await resolveMessageText({ text: quickReply.response, templateId: quickReply.templateId }, {}, prisma)
    await sendLightMessage(instance, deliveryJid, text, 'resposta_rapida', undefined, undefined, quickReply.templateId ?? undefined)
    return
  }

  chatbotLightLog('info', socketInstanceKey, 'chatbot_light.flow_not_matched', { incomingText })
}

// Disparador de mensagens automáticas com interpolação de variáveis
export async function triggerLightAutomatedMessage(
  doctorId: string,
  event: string,
  contextData: TemplateContext & { patientPhone: string }
): Promise<void> {
  try {
    // Um evento pode ter uma automação configurada em mais de um chatbot da
    // mesma conta (cada um com seu próprio número) — dispara em todos os que
    // estiverem ativos e com template válido (multi-chatbot, jul/2026).
    const configs = await prisma.lightIntegrationConfig.findMany({
      where: {
        doctorId,
        triggerEvent: event,
        enabled: true,
      },
      include: {
        template: true,
      },
    })

    for (const config of configs) {
      if (!config.template || !config.template.active) continue
      if (!config.chatbotId) continue

      const instance = await prisma.whatsAppInstance.findUnique({ where: { chatbotId: config.chatbotId } })
      if (!instance) continue

      const interpolatedText = resolveTemplateVariables(config.template.content, contextData)

      const sendFn = async () => {
        const target = await resolveChatbotLightSendTarget(config.chatbotId!)
        if (!target) {
          await prisma.lightMessageLog.create({
            data: {
              doctorId,
              chatbotId: config.chatbotId,
              phone: normalizeToWhatsAppJid(contextData.patientPhone).replace('@s.whatsapp.net', ''),
              recipientName: contextData.patientName ?? null,
              content: interpolatedText,
              module: config.module,
              triggerEvent: event,
              templateId: config.templateId,
              status: 'FAILED',
              errorMessage: 'WhatsApp desconectado — vincule uma Sala em Configurações > Conexão',
            },
          })
          return
        }
        await sendLightMessage(instance, contextData.patientPhone, interpolatedText, config.module, event, contextData.patientName, config.templateId ?? undefined)
      }

      if (config.delayMinutes > 0) {
        setTimeout(sendFn, config.delayMinutes * 60 * 1000)
      } else {
        await sendFn()
      }
    }
  } catch (err) {
    console.error('[triggerLightAutomatedMessage] Erro:', err)
  }
}

// Scheduler em background para varredura de lembretes agendados e atrasos
let schedulerInterval: NodeJS.Timeout | null = null

export function startLightScheduler() {
  if (schedulerInterval) return

  const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

  schedulerInterval = setInterval(async () => {
    try {
      await checkScheduledReminders()
    } catch (err) {
      console.error('[startLightScheduler] Erro no scheduler:', err)
    }
  }, SCHEDULER_INTERVAL_MS)

  // Executa uma varredura também no startup
  checkScheduledReminders().catch(err =>
    console.error('[startLightScheduler] Erro no check inicial:', err)
  )

  console.log('[startLightScheduler] Scheduler de lembretes automáticos iniciado')
}

// Mapeamento de status de consulta (EN → PT-BR) para o scheduler
const SCHEDULER_STATUS_MAP: Record<string, string> = {
  CONFIRMED:   'Confirmada',
  SCHEDULED:   'Agendada',
  CANCELLED:   'Cancelada',
  COMPLETED:   'Concluída',
  NO_SHOW:     'Não compareceu',
  WAITING:     'Aguardando',
  IN_PROGRESS: 'Em atendimento',
}

const BR_TZ = 'America/Sao_Paulo'

function schedulerFormatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: BR_TZ })
}

function schedulerFormatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: BR_TZ })
}

function buildRoomAddress(room: any): string | undefined {
  const parts = [room?.logradouro, room?.numero, room?.bairro].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  return room?.address ?? undefined
}

export async function checkScheduledReminders() {
  const now = Date.now()

  // 1. Lembrete 24h antes da consulta (APPOINTMENT_REMINDER_24H)
  const range24hStart = new Date(now + 23.5 * 60 * 60 * 1000)
  const range24hEnd = new Date(now + 24.5 * 60 * 60 * 1000)

  const appts24h = await prisma.appointment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      isBlocked: false,
      reminder24hSent: false,
      date: { gte: range24hStart, lte: range24hEnd },
    },
    include: {
      patient: {
        include: {
          patientPlans: { include: { healthPlan: true }, take: 1 },
        },
      },
      doctor: true,
      room: { include: { whatsappConnection: true } },
    },
  })

  for (const appt of appts24h) {
    const apptValue = (appt as any).value
    await triggerLightAutomatedMessage(appt.doctorId, 'APPOINTMENT_REMINDER_24H', {
      patientName:       appt.patient.name,
      patientPhone:      appt.patient.phone,
      patientCpf:        appt.patient.cpf ?? undefined,
      patientPlan:       (appt.patient as any).patientPlans?.[0]?.healthPlan?.name,
      patientWalletNumber: (appt.patient as any).patientPlans?.[0]?.walletNumber,
      appointmentDate:   schedulerFormatDate(appt.date),
      appointmentTime:   schedulerFormatTime(appt.date),
      appointmentType:   appt.type ?? 'Consulta',
      appointmentStatus: SCHEDULER_STATUS_MAP[appt.status] ?? appt.status,
      doctorName:        appt.doctor.name,
      doctorSpecialty:   (appt.doctor as any).specialty ?? undefined,
      doctorCrm:         (appt.doctor as any).crm ?? undefined,
      clinicAddress:     buildRoomAddress(appt.room),
      clinicName:        (appt.room as any)?.name,
      clinicPhone:       (appt.room as any)?.whatsappConnection?.phoneNumber,
      teleconsultaLink:  (appt.room as any)?.teleconsultaLink,
      paymentValue:      apptValue != null ? `R$ ${Number(apptValue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
    })
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { reminder24hSent: true },
    })
  }

  // 2. Lembrete 2h antes da consulta (APPOINTMENT_REMINDER_2H)
  const range2hStart = new Date(now + 1.5 * 60 * 60 * 1000)
  const range2hEnd = new Date(now + 2.5 * 60 * 60 * 1000)

  const appts2h = await prisma.appointment.findMany({
    where: {
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      isBlocked: false,
      reminder2hSent: false,
      date: { gte: range2hStart, lte: range2hEnd },
    },
    include: {
      patient: {
        include: {
          patientPlans: { include: { healthPlan: true }, take: 1 },
        },
      },
      doctor: true,
      room: { include: { whatsappConnection: true } },
    },
  })

  for (const appt of appts2h) {
    const apptValue2h = (appt as any).value
    await triggerLightAutomatedMessage(appt.doctorId, 'APPOINTMENT_REMINDER_2H', {
      patientName:       appt.patient.name,
      patientPhone:      appt.patient.phone,
      patientCpf:        appt.patient.cpf ?? undefined,
      patientPlan:       (appt.patient as any).patientPlans?.[0]?.healthPlan?.name,
      patientWalletNumber: (appt.patient as any).patientPlans?.[0]?.walletNumber,
      appointmentDate:   schedulerFormatDate(appt.date),
      appointmentTime:   schedulerFormatTime(appt.date),
      appointmentType:   appt.type ?? 'Consulta',
      appointmentStatus: SCHEDULER_STATUS_MAP[appt.status] ?? appt.status,
      doctorName:        appt.doctor.name,
      doctorSpecialty:   (appt.doctor as any).specialty ?? undefined,
      doctorCrm:         (appt.doctor as any).crm ?? undefined,
      clinicAddress:     buildRoomAddress(appt.room),
      clinicName:        (appt.room as any)?.name,
      clinicPhone:       (appt.room as any)?.whatsappConnection?.phoneNumber,
      teleconsultaLink:  (appt.room as any)?.teleconsultaLink,
      paymentValue:      apptValue2h != null ? `R$ ${Number(apptValue2h).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
    })
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { reminder2hSent: true },
    })
  }

  // 3. Aviso de pagamento em atraso (PAYMENT_OVERDUE)
  const overdueTx = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      overdueReminderSent: false,
      date: { lt: new Date() },
    },
    include: {
      appointment: {
        include: {
          patient: {
            include: {
              patientPlans: { include: { healthPlan: true }, take: 1 },
            },
          },
          room: { include: { whatsappConnection: true } },
        },
      },
      doctor: true,
    },
  })

  for (const tx of overdueTx) {
    if (tx.appointment?.patient.phone) {
      await triggerLightAutomatedMessage(tx.doctorId, 'PAYMENT_OVERDUE', {
        patientName: tx.appointment.patient.name,
        patientPhone: tx.appointment.patient.phone,
        patientCpf: tx.appointment.patient.cpf ?? undefined,
        patientPlan: (tx.appointment.patient as any).patientPlans?.[0]?.healthPlan?.name,
        patientWalletNumber: (tx.appointment.patient as any).patientPlans?.[0]?.walletNumber,
        doctorName: tx.doctor.name,
        doctorCrm: (tx.doctor as any).crm ?? undefined,
        clinicName: (tx.appointment as any).room?.name,
        clinicPhone: (tx.appointment as any).room?.whatsappConnection?.phoneNumber,
        clinicAddress: buildRoomAddress((tx.appointment as any).room),
        paymentValue: String(tx.amount),
        link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pagar/${tx.id}`,
      })
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { overdueReminderSent: true },
      })
    }
  }
}
