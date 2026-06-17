import NodeCache from 'node-cache'
import { prisma } from './prisma'
import { sendWhatsAppMessage, isSessionActive } from './whatsapp'
import { processGuidedStep } from './chatbot-light-guided-engine'


const lightFlowStateCache = new NodeCache({
  stdTTL: 1800, // 30 minutos de inatividade expira o estado
  checkperiod: 60,
})

// Auxiliar para salvar log e enviar mensagem
export async function sendLightMessage(
  instance: any,
  phone: string,
  content: string,
  module: string,
  triggerEvent?: string
): Promise<boolean> {
  const cleanPhone = phone.replace(/\D/g, '')
  const jid = `${cleanPhone}@s.whatsapp.net`

  const log = await prisma.lightMessageLog.create({
    data: {
      doctorId: instance.doctorId,
      phone: cleanPhone,
      content,
      module,
      triggerEvent,
      status: 'PENDING',
    },
  })

  try {
    const result = await sendWhatsAppMessage(instance.instanceKey, jid, content)
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

// Handler de mensagens recebidas específicas para a conexão do Chatbot Light
export async function handleIncomingLightMessage(instanceId: string, msg: any): Promise<void> {
  const remoteJid = msg.key.remoteJid ?? ''
  const fromMe = msg.key.fromMe ?? false
  const pushName = msg.pushName ?? ''
  const mc = msg.message ?? {}

  // Evita loops com mensagens enviadas por nós mesmos
  if (fromMe) return

  let content = ''
  if (mc.conversation) {
    content = mc.conversation
  } else if (mc.extendedTextMessage?.text) {
    content = mc.extendedTextMessage.text
  } else {
    return // O chatbot light ignora mídias por enquanto
  }

  const incomingText = content.trim().toLowerCase()
  const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')
  const isGroup = remoteJid.endsWith('@g.us')

  // Chatbot light não atua em grupos
  if (isGroup) return

  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } })
  if (!instance || instance.type !== 'CHATBOT_LIGHT') return

  // ─── 1. Check if there is an active guided session ──────────────────────────
  const activeSession = await prisma.lightFlowSession.findFirst({
    where: {
      instanceId,
      contactPhone,
      status: 'ACTIVE'
    }
  })

  if (activeSession) {
    const now = new Date()
    if (activeSession.expiresAt && activeSession.expiresAt < now) {
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: { status: 'EXPIRED' }
      })
      await sendLightMessage(instance, contactPhone, 'Este atendimento expirou por inatividade. Vamos iniciar novamente.', 'fluxo_guiado')
      // Fall through to try triggering standard keywords as a new interaction
    } else {
      // Refresh expiration
      await prisma.lightFlowSession.update({
        where: { id: activeSession.id },
        data: {
          lastMessageAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
        }
      })

      // Global Commands Interceptor
      if (incomingText === 'menu') {
        await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { status: 'CANCELLED' }
        })
        const stateKey = `${instanceId}:${contactPhone}`
        lightFlowStateCache.del(stateKey)
        // Fall through to try standard keyword flows
      } else if (incomingText === 'cancelar') {
        await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { status: 'CANCELLED' }
        })
        await sendLightMessage(instance, contactPhone, 'Agendamento cancelado com sucesso. Qualquer dúvida, estou à disposição!', 'fluxo_guiado')
        return
      } else if (incomingText === 'atendente' || incomingText === 'humano') {
        await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { status: 'TRANSFER' }
        })
        await sendLightMessage(instance, contactPhone, 'Certo. Vou transferir sua conversa para um de nossos atendentes. Por favor, aguarde.', 'fluxo_guiado')
        return
      } else if (incomingText === 'voltar') {
        let prevStep = 'CHOOSE_PLAN'
        const currentStep = activeSession.currentStepKey
        
        if (currentStep === 'ASK_NAME') prevStep = 'CHOOSE_PLAN'
        else if (currentStep === 'ASK_PHONE_CONFIRM' || currentStep === 'ASK_PHONE_TEXT') prevStep = 'ASK_NAME'
        else if (currentStep === 'ASK_CPF') prevStep = 'ASK_PHONE_TEXT'
        else if (currentStep === 'ASK_CONVENIO') prevStep = 'ASK_PHONE_TEXT'
        else if (currentStep === 'ASK_DATE') {
          const collected = activeSession.collectedData ? (typeof activeSession.collectedData === 'string' ? JSON.parse(activeSession.collectedData) : activeSession.collectedData) as any : {}
          prevStep = collected.cpf ? 'ASK_CPF' : 'ASK_NAME'
        }
        else if (currentStep === 'CHOOSE_SLOT') prevStep = 'ASK_DATE'
        else if (currentStep === 'CONFIRMATION') prevStep = 'CHOOSE_SLOT'

        const updated = await prisma.lightFlowSession.update({
          where: { id: activeSession.id },
          data: { currentStepKey: prevStep }
        })
        
        await sendLightMessage(instance, contactPhone, 'Voltando ao passo anterior...', 'fluxo_guiado')
        await processGuidedStep(instance, updated, '')
        return
      } else {
        await processGuidedStep(instance, activeSession, incomingText)
        return
      }
    }
  }

  const stateKey = `${instanceId}:${contactPhone}`
  const state = lightFlowStateCache.get<{ activeFlowId: string; attempts: number }>(stateKey)

  if (!state) {
    // 1. Tentar encontrar se a mensagem bate com palavra-chave de fluxo ativo
    const fluxos = await prisma.lightFluxo.findMany({
      where: { doctorId: instance.doctorId, active: true },
    })

    const matchedFlow = fluxos.find(f =>
      f.keywords.split(',').map(k => k.trim().toLowerCase()).includes(incomingText)
    )

    if (matchedFlow) {
      // Inicia estado do fluxo
      lightFlowStateCache.set(stateKey, { activeFlowId: matchedFlow.id, attempts: 0 })
      await sendLightMessage(instance, contactPhone, matchedFlow.welcomeMessage, 'fluxo', matchedFlow.name)

      // Incrementa execuções
      await prisma.lightFluxo.update({
        where: { id: matchedFlow.id },
        data: { executions: { increment: 1 } },
      }).catch(() => {})
      return
    }

    // 2. Tentar encontrar se bate com palavra-chave de respostas rápidas
    const quickReply = await prisma.lightQuickReply.findFirst({
      where: {
        doctorId: instance.doctorId,
        keyword: { equals: incomingText, mode: 'insensitive' },
        active: true,
      },
    })

    if (quickReply) {
      await sendLightMessage(instance, contactPhone, quickReply.response, 'resposta_rapida')
      return
    }
  } else {
    // Carregar fluxo ativo
    const fluxo = await prisma.lightFluxo.findUnique({ where: { id: state.activeFlowId } })
    if (!fluxo || !fluxo.active) {
      lightFlowStateCache.del(stateKey)
      return
    }

    let options: any[] = []
    try {
      options = typeof fluxo.options === 'string' ? JSON.parse(fluxo.options) : (fluxo.options as any[])
    } catch {
      options = []
    }

    // Procura por triggers/números da opção correspondente
    const matchedOption = options.find(o =>
      o.triggers.split(',').map((t: string) => t.trim().toLowerCase()).includes(incomingText)
    )

    if (matchedOption) {
      const actionType = matchedOption.actionType
      const response = matchedOption.response ?? ''

      if (actionType === 'OPEN_MENU') {
        // Retorna para o menu
        lightFlowStateCache.set(stateKey, { activeFlowId: fluxo.id, attempts: 0 })
        await sendLightMessage(instance, contactPhone, response || fluxo.welcomeMessage, 'fluxo', fluxo.name)
      } else if (actionType === 'SYSTEM_ACTION') {
        const actionKey = matchedOption.systemActionKey
        const configId = matchedOption.systemActionConfigId
        const transMsg = matchedOption.transitionMessage || response

        if (!configId) {
          await sendLightMessage(instance, contactPhone, 'Desculpe, esta ação do sistema não está configurada corretamente.', 'fluxo')
          lightFlowStateCache.del(stateKey)
          return
        }

        if (actionKey === 'SCHEDULE_APPOINTMENT') {
          if (transMsg) {
            await sendLightMessage(instance, contactPhone, transMsg, 'fluxo', fluxo.name)
          }
          lightFlowStateCache.del(stateKey)

          // Cancel previous active sessions for this contact
          await prisma.lightFlowSession.updateMany({
            where: { instanceId, contactPhone, status: 'ACTIVE' },
            data: { status: 'CANCELLED' }
          })

          // Create new guided session
          const session = await prisma.lightFlowSession.create({
            data: {
              instanceId,
              contactPhone,
              flowId: fluxo.id,
              actionConfigId: configId,
              currentStepKey: 'CHOOSE_PLAN',
              status: 'ACTIVE',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              collectedData: {},
              dynamicOptions: {}
            }
          })

          // Load configuration to resolve plans/services and message templates
          const actionConfig = await prisma.lightSystemActionConfig.findUnique({
            where: { id: configId }
          })

          if (!actionConfig || !actionConfig.active) {
            await sendLightMessage(instance, contactPhone, 'Desculpe, esta ação de agendamento está inativa no momento.', 'fluxo')
            await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED', failedReason: 'Configuração inativa ou não encontrada.' } })
            return
          }

          const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
          const planSource = cfg.planSource || 'DOCTOR_SERVICES'
          let menuStr = ''
          const dynamicMap: Record<string, string> = {}

          if (planSource === 'DOCTOR_CONVENIOS') {
            const convenios = await prisma.healthPlan.findMany({
              where: { doctorId: instance.doctorId, active: true }
            })
            if (convenios.length === 0) {
              await sendLightMessage(instance, contactPhone, 'Desculpe, não há convênios cadastrados para agendamento no momento.', 'fluxo')
              await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
              return
            }
            menuStr = convenios.map((c, i) => {
              const idx = String(i + 1)
              dynamicMap[idx] = c.id
              return `${idx} - ${c.name}`
            }).join('\n')
          } else {
            // Default: DOCTOR_SERVICES / AppointmentType
            const services = await prisma.appointmentType.findMany({
              where: { doctorId: instance.doctorId, active: true }
            })
            if (services.length === 0) {
              await sendLightMessage(instance, contactPhone, 'Desculpe, não há serviços/procedimentos cadastrados para agendamento no momento.', 'fluxo')
              await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
              return
            }
            menuStr = services.map((s, i) => {
              const idx = String(i + 1)
              dynamicMap[idx] = s.id
              const price = s.baseValue ? ` (R$ ${s.baseValue.toFixed(2)})` : ''
              return `${idx} - ${s.name}${price}`
            }).join('\n')
          }

          // Update session options
          await prisma.lightFlowSession.update({
            where: { id: session.id },
            data: { dynamicOptions: dynamicMap }
          })

          const messages = cfg.messages || {}
          const askPlanMsg = messages.askPlan || 'Temos os seguintes planos/serviços disponíveis:\n\n{opcoes}\n\nQual opção você deseja? (Digite o número)'
          const interpolatedPlanMsg = askPlanMsg.replace('{opcoes}', menuStr)

          await sendLightMessage(instance, contactPhone, interpolatedPlanMsg, 'fluxo')
        } else {
          await sendLightMessage(instance, contactPhone, 'Desculpe, esta ação ainda não está implementada no sistema.', 'fluxo')
          lightFlowStateCache.del(stateKey)
        }
      } else if (actionType === 'START_PLAN_SCHEDULING') {
        if (response) {
          await sendLightMessage(instance, contactPhone, response, 'fluxo', fluxo.name)
        }
        lightFlowStateCache.del(stateKey)

        // Cancel previous active sessions for this contact
        await prisma.lightFlowSession.updateMany({
          where: { instanceId, contactPhone, status: 'ACTIVE' },
          data: { status: 'CANCELLED' }
        })

        // Create new guided session
        const session = await prisma.lightFlowSession.create({
          data: {
            instanceId,
            contactPhone,
            flowId: fluxo.id,
            currentStepKey: 'CHOOSE_PLAN',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            collectedData: {},
            dynamicOptions: {}
          }
        })

        // Load plans / services based on configuration
        const planSource = matchedOption.planSource || 'DOCTOR_SERVICES'
        let menuStr = ''
        const dynamicMap: Record<string, string> = {}

        if (planSource === 'DOCTOR_CONVENIOS') {
          const convenios = await prisma.healthPlan.findMany({
            where: { doctorId: instance.doctorId, active: true }
          })
          if (convenios.length === 0) {
            await sendLightMessage(instance, contactPhone, 'Desculpe, não há convênios cadastrados para agendamento no momento.', 'fluxo')
            await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
            return
          }
          menuStr = convenios.map((c, i) => {
            const idx = String(i + 1)
            dynamicMap[idx] = c.id
            return `${idx} - ${c.name}`
          }).join('\n')
        } else {
          // Default: DOCTOR_SERVICES / AppointmentType
          const services = await prisma.appointmentType.findMany({
            where: { doctorId: instance.doctorId, active: true }
          })
          if (services.length === 0) {
            await sendLightMessage(instance, contactPhone, 'Desculpe, não há serviços/procedimentos cadastrados para agendamento no momento.', 'fluxo')
            await prisma.lightFlowSession.update({ where: { id: session.id }, data: { status: 'FAILED' } })
            return
          }
          menuStr = services.map((s, i) => {
            const idx = String(i + 1)
            dynamicMap[idx] = s.id
            const price = s.baseValue ? ` (R$ ${s.baseValue.toFixed(2)})` : ''
            return `${idx} - ${s.name}${price}`
          }).join('\n')
        }

        // Update session options
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { dynamicOptions: dynamicMap }
        })

        await sendLightMessage(instance, contactPhone, `Temos os seguintes planos/serviços disponíveis:\n\n${menuStr}\n\nQual opção você deseja? (Digite o número)`, 'fluxo')
      } else if (matchedOption.nextFlowId) {
        // Próximo fluxo encadeado
        const nextFlow = await prisma.lightFluxo.findUnique({ where: { id: matchedOption.nextFlowId } })
        if (nextFlow && nextFlow.active) {
          if (response) {
            await sendLightMessage(instance, contactPhone, response, 'fluxo', fluxo.name)
          }
          lightFlowStateCache.set(stateKey, { activeFlowId: nextFlow.id, attempts: 0 })
          await sendLightMessage(instance, contactPhone, nextFlow.welcomeMessage, 'fluxo', nextFlow.name)
        } else {
          if (response) {
            await sendLightMessage(instance, contactPhone, response, 'fluxo', fluxo.name)
          }
          lightFlowStateCache.del(stateKey)
        }
      } else {
        // Envia resposta e encerra
        if (response) {
          await sendLightMessage(instance, contactPhone, response, 'fluxo', fluxo.name)
        }
        lightFlowStateCache.del(stateKey)
      }
    } else {
      // Opção inválida
      const newAttempts = state.attempts + 1
      if (newAttempts >= fluxo.maxAttempts) {
        await sendLightMessage(instance, contactPhone, fluxo.fallbackMessage, 'fluxo', fluxo.name)
        lightFlowStateCache.del(stateKey)
      } else {
        lightFlowStateCache.set(stateKey, { activeFlowId: fluxo.id, attempts: newAttempts })
        await sendLightMessage(
          instance,
          contactPhone,
          `Opção inválida. Selecione uma opção válida do menu:\n\n${fluxo.welcomeMessage}`,
          'fluxo',
          fluxo.name
        )
      }
    }
  }
}

// Disparador de mensagens automáticas com interpolação de variáveis
export async function triggerLightAutomatedMessage(
  doctorId: string,
  event: string,
  contextData: {
    patientName: string
    patientPhone: string
    appointmentDate?: string
    appointmentTime?: string
    doctorName?: string
    paymentValue?: string
    link?: string
    [key: string]: any
  }
): Promise<void> {
  try {
    const config = await prisma.lightIntegrationConfig.findFirst({
      where: {
        doctorId,
        triggerEvent: event,
        enabled: true,
      },
      include: {
        template: true,
      },
    })

    if (!config || !config.template || !config.template.active) {
      return
    }

    const instance = await prisma.whatsAppInstance.findUnique({
      where: {
        doctorId_type: {
          doctorId,
          type: 'CHATBOT_LIGHT',
        },
      },
    })

    if (!instance) {
      return
    }

    let interpolatedText = config.template.content
    interpolatedText = interpolatedText
      .replace(/\{nome\}/g, contextData.patientName ?? '')
      .replace(/\{data\}/g, contextData.appointmentDate ?? '')
      .replace(/\{hora\}/g, contextData.appointmentTime ?? '')
      .replace(/\{medico\}/g, contextData.doctorName ?? '')
      .replace(/\{valor\}/g, contextData.paymentValue ?? '')
      .replace(/\{link\}/g, contextData.link ?? '')

    const sendFn = async () => {
      if (instance.status !== 'CONNECTED') {
        // Registrar log de erro no banco
        await prisma.lightMessageLog.create({
          data: {
            doctorId,
            phone: contextData.patientPhone.replace(/\D/g, ''),
            content: interpolatedText,
            module: config.module,
            triggerEvent: event,
            status: 'FAILED',
            errorMessage: 'WhatsApp desconectado',
          },
        })
        return
      }
      await sendLightMessage(instance, contextData.patientPhone, interpolatedText, config.module, event)
    }

    if (config.delayMinutes > 0) {
      setTimeout(sendFn, config.delayMinutes * 60 * 1000)
    } else {
      await sendFn()
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

export async function checkScheduledReminders() {
  const now = Date.now()

  // 1. Lembrete 24h antes da consulta (APPOINTMENT_REMINDER_24H)
  const range24hStart = new Date(now + 23.5 * 60 * 60 * 1000)
  const range24hEnd = new Date(now + 24.5 * 60 * 60 * 1000)

  const appts24h = await prisma.appointment.findMany({
    where: {
      status: 'SCHEDULED',
      isBlocked: false,
      reminder24hSent: false,
      date: { gte: range24hStart, lte: range24hEnd },
    },
    include: {
      patient: true,
      doctor: true,
    },
  })

  for (const appt of appts24h) {
    await triggerLightAutomatedMessage(appt.doctorId, 'APPOINTMENT_REMINDER_24H', {
      patientName: appt.patient.name,
      patientPhone: appt.patient.phone,
      appointmentDate: appt.date.toLocaleDateString('pt-BR'),
      appointmentTime: appt.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      doctorName: appt.doctor.name,
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
      status: 'SCHEDULED',
      isBlocked: false,
      reminder2hSent: false,
      date: { gte: range2hStart, lte: range2hEnd },
    },
    include: {
      patient: true,
      doctor: true,
    },
  })

  for (const appt of appts2h) {
    await triggerLightAutomatedMessage(appt.doctorId, 'APPOINTMENT_REMINDER_2H', {
      patientName: appt.patient.name,
      patientPhone: appt.patient.phone,
      appointmentDate: appt.date.toLocaleDateString('pt-BR'),
      appointmentTime: appt.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      doctorName: appt.doctor.name,
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
          patient: true,
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
        doctorName: tx.doctor.name,
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
