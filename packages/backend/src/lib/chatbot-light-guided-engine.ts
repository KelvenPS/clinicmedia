import { prisma } from './prisma'
import { sendLightMessage } from './chatbot-light-engine'

// Timezone Helper: America/Sao_Paulo (UTC-3 constantly since DST ended in 2019)
export function getLocalDateInTz(): Date {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  })
  const parts = formatter.formatToParts(now)
  const map: Record<string, string> = {}
  for (const part of parts) {
    map[part.type] = part.value
  }
  return new Date(
    parseInt(map.year),
    parseInt(map.month) - 1,
    parseInt(map.day),
    parseInt(map.hour),
    parseInt(map.minute),
    parseInt(map.second)
  )
}

function parseLocalDateToUtcDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const localStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  return new Date(`${localStr}-03:00`)
}

// ─── 7. NLP Date Parser ───────────────────────────────────────────────────────
export function parsePreferredDateText(text: string): {
  startDate: Date
  endDate: Date
  period: 'MANHA' | 'TARDE' | 'NOITE' | null
} {
  const clean = text.toLowerCase().trim()
  const nowInSP = getLocalDateInTz()
  
  let startDate = new Date(nowInSP)
  let endDate = new Date(nowInSP)
  endDate.setDate(endDate.getDate() + 7) // Default 7 days search window
  let period: 'MANHA' | 'TARDE' | 'NOITE' | null = null

  if (clean.includes('manhã') || clean.includes('manha') || clean.includes('mãnhã')) {
    period = 'MANHA'
  } else if (clean.includes('tarde')) {
    period = 'TARDE'
  } else if (clean.includes('noite')) {
    period = 'NOITE'
  }

  if (clean.includes('hoje')) {
    startDate = new Date(nowInSP)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(nowInSP)
    endDate.setHours(23, 59, 59, 999)
  } else if (clean.includes('amanhã') || clean.includes('amanha')) {
    const tomorrow = new Date(nowInSP)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    startDate = new Date(tomorrow)
    endDate = new Date(tomorrow)
    endDate.setHours(23, 59, 59, 999)
  } else if (clean.includes('próxima semana') || clean.includes('semana que vem') || clean.includes('proxima semana')) {
    const nextMonday = new Date(nowInSP)
    const currentDay = nowInSP.getDay()
    const daysToMonday = currentDay === 0 ? 1 : 8 - currentDay
    nextMonday.setDate(nowInSP.getDate() + daysToMonday)
    nextMonday.setHours(0, 0, 0, 0)

    const nextSunday = new Date(nextMonday)
    nextSunday.setDate(nextMonday.getDate() + 6)
    nextSunday.setHours(23, 59, 59, 999)

    startDate = nextMonday
    endDate = nextSunday
  } else {
    const daysMap: Record<string, number> = {
      'segunda': 1, 'terça': 2, 'terca': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0
    }
    let matchedDay: number | null = null
    for (const key of Object.keys(daysMap)) {
      if (clean.includes(key)) {
        matchedDay = daysMap[key]
        break
      }
    }

    if (matchedDay !== null) {
      const targetDay = matchedDay
      const currentDay = nowInSP.getDay()
      let daysDiff = targetDay - currentDay
      if (daysDiff <= 0) daysDiff += 7
      
      const targetDate = new Date(nowInSP)
      targetDate.setDate(nowInSP.getDate() + daysDiff)
      targetDate.setHours(0, 0, 0, 0)

      startDate = new Date(targetDate)
      endDate = new Date(targetDate)
      endDate.setHours(23, 59, 59, 999)
    } else {
      const dateRegex = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/
      const match = clean.match(dateRegex)
      if (match) {
        const day = parseInt(match[1], 10)
        const month = parseInt(match[2], 10) - 1
        const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3], 10) : parseInt(match[3], 10)) : nowInSP.getFullYear()
        
        const parsedDate = new Date(year, month, day)
        if (!isNaN(parsedDate.getTime())) {
          startDate = new Date(parsedDate)
          startDate.setHours(0, 0, 0, 0)
          endDate = new Date(parsedDate)
          endDate.setHours(23, 59, 59, 999)
        }
      }
    }
  }

  if (startDate < nowInSP) {
    startDate = new Date(nowInSP)
  }

  return { startDate, endDate, period }
}

// ─── Formatting slot ──────────────────────────────────────────────────────────
export function formatSlotDateTime(isoString: string): string {
  const date = new Date(isoString)
  const spDate = new Date(date.getTime())
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const dayName = days[spDate.getDay()]
  const day = String(spDate.getDate()).padStart(2, '0')
  const month = String(spDate.getMonth() + 1).padStart(2, '0')
  const hour = String(spDate.getHours()).padStart(2, '0')
  const minute = String(spDate.getMinutes()).padStart(2, '0')
  return `${dayName}, ${day}/${month} às ${hour}:${minute}`
}

// ─── 8. Query Available Slots ────────────────────────────────────────────────
export async function findAvailableSlots(params: {
  doctorId: string
  preferredDateText: string
  searchWindowDays: number
  durationMinutes: number
  limit: number
}): Promise<{ startAt: string; endAt: string; doctorId: string }[]> {
  const { doctorId, preferredDateText, searchWindowDays, durationMinutes, limit } = params
  
  const { startDate: parsedStart, endDate: parsedEnd, period } = parsePreferredDateText(preferredDateText)
  
  const maxSearchDate = new Date(parsedStart)
  maxSearchDate.setDate(maxSearchDate.getDate() + searchWindowDays)
  const endScanDate = parsedEnd < maxSearchDate ? parsedEnd : maxSearchDate
  
  const rooms = await prisma.room.findMany({
    where: { doctorId, active: true }
  })
  
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { not: 'CANCELLED' },
      date: {
        gte: new Date(parsedStart.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(endScanDate.getTime() + 24 * 60 * 60 * 1000)
      }
    }
  })
  
  const blocks = await prisma.appointmentBlock.findMany({
    where: {
      doctorId,
      date: {
        gte: new Date(parsedStart.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(endScanDate.getTime() + 24 * 60 * 60 * 1000)
      }
    }
  })
  
  const slots: { startAt: string; endAt: string; doctorId: string }[] = []
  const currentDay = new Date(parsedStart)
  currentDay.setHours(0, 0, 0, 0)
  
  const nowUtc = new Date()
  
  while (currentDay <= endScanDate && slots.length < limit) {
    const jsDay = currentDay.getDay()
    const roomDayNum = jsDay === 0 ? 7 : jsDay
    
    const activeRooms = rooms.filter(r => {
      let days: number[] = []
      try {
        days = typeof r.daysOfWeek === 'string' ? JSON.parse(r.daysOfWeek) : (r.daysOfWeek as number[])
      } catch {
        days = []
      }
      return days.includes(roomDayNum)
    })
    
    for (const room of activeRooms) {
      const [startH, startM] = room.startTime.split(':').map(Number)
      const [endH, endM] = room.endTime.split(':').map(Number)
      
      let slotTime = parseLocalDateToUtcDate(currentDay.getFullYear(), currentDay.getMonth() + 1, currentDay.getDate(), startH, startM)
      const roomEndTime = parseLocalDateToUtcDate(currentDay.getFullYear(), currentDay.getMonth() + 1, currentDay.getDate(), endH, endM)
      
      while (slotTime < roomEndTime && slots.length < limit) {
        const slotEnd = new Date(slotTime.getTime() + durationMinutes * 60 * 1000)
        
        if (slotEnd > roomEndTime) break
        
        if (slotTime >= nowUtc) {
          // Check slot local hour in SP (-03:00)
          const slotLocalHour = (slotTime.getUTCHours() - 3 + 24) % 24
          
          let matchesPeriod = true
          if (period === 'MANHA') {
            matchesPeriod = slotLocalHour >= 8 && slotLocalHour < 12
          } else if (period === 'TARDE') {
            matchesPeriod = slotLocalHour >= 12 && slotLocalHour < 18
          } else if (period === 'NOITE') {
            matchesPeriod = slotLocalHour >= 18 && slotLocalHour < 22
          }
          
          if (matchesPeriod) {
            const hasApptConflict = appointments.some(appt => {
              const apptStart = new Date(appt.date)
              const apptEnd = new Date(apptStart.getTime() + appt.duration * 60 * 1000)
              return apptStart < slotEnd && apptEnd > slotTime
            })
            
            const hasBlockConflict = blocks.some(block => {
              const blockStart = new Date(block.date)
              const blockEnd = new Date(block.endDate)
              return blockStart < slotEnd && blockEnd > slotTime
            })
            
            if (!hasApptConflict && !hasBlockConflict) {
              slots.push({
                startAt: slotTime.toISOString(),
                endAt: slotEnd.toISOString(),
                doctorId
              })
            }
          }
        }
        
        slotTime = new Date(slotTime.getTime() + durationMinutes * 60 * 1000)
      }
    }
    
    currentDay.setDate(currentDay.getDate() + 1)
  }
  
  return slots
}

// ─── 11. Transactional Appointment Creator ────────────────────────────────────
export async function createAppointmentFromChatbot(params: {
  doctorId: string
  patientName: string
  patientPhone: string
  patientCpf?: string
  patientConvenioId?: string
  serviceId: string
  startAt: string
  endAt: string
  source: string
  initialStatus?: string
}) {
  const { doctorId, patientName, patientPhone, patientCpf, patientConvenioId, serviceId, startAt, endAt, source, initialStatus } = params

  const cleanPhone = patientPhone.replace(/\D/g, '')
  const duration = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000)

  return await prisma.$transaction(async (tx) => {
    // Re-verify slot availability
    const conflicts = await tx.appointment.findMany({
      where: {
        doctorId,
        status: { not: 'CANCELLED' },
        date: {
          gte: new Date(new Date(startAt).getTime() - 2 * 60 * 60 * 1000), // Buffer
          lte: new Date(endAt)
        }
      }
    })
    
    const hasApptConflict = conflicts.some(appt => {
      const apptStart = new Date(appt.date)
      const apptEnd = new Date(apptStart.getTime() + appt.duration * 60 * 1000)
      return apptStart < new Date(endAt) && apptEnd > new Date(startAt)
    })

    if (hasApptConflict) {
      throw new Error('SLOT_OCCUPIED')
    }

    const blocks = await tx.appointmentBlock.findMany({
      where: {
        doctorId,
        date: {
          gte: new Date(new Date(startAt).getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(endAt)
        }
      }
    })

    const hasBlockConflict = blocks.some(block => {
      const blockStart = new Date(block.date)
      const blockEnd = new Date(block.endDate)
      return blockStart < new Date(endAt) && blockEnd > new Date(startAt)
    })

    if (hasBlockConflict) {
      throw new Error('SLOT_BLOCKED')
    }

    // Find or create patient
    let patient: any = null
    if (patientCpf) {
      patient = await tx.patient.findUnique({
        where: { cpf: patientCpf }
      })
    }
    
    if (!patient) {
      patient = await tx.patient.findFirst({
        where: { doctorId, phone: cleanPhone }
      })
    }

    if (!patient) {
      patient = await tx.patient.create({
        data: {
          doctorId,
          name: patientName,
          phone: cleanPhone,
          cpf: patientCpf || null,
          active: true
        }
      })
    } else {
      const updateData: any = {}
      if (!patient.cpf && patientCpf) updateData.cpf = patientCpf
      if (Object.keys(updateData).length > 0) {
        patient = await tx.patient.update({
          where: { id: patient.id },
          data: updateData
        })
      }
    }

    if (patientConvenioId) {
      await tx.patientPlan.upsert({
        where: {
          patientId_healthPlanId: {
            patientId: patient.id,
            healthPlanId: patientConvenioId
          }
        },
        create: {
          patientId: patient.id,
          healthPlanId: patientConvenioId
        },
        update: {}
      }).catch(() => {})
    }

    const service = await tx.appointmentType.findUnique({
      where: { id: serviceId }
    })

    let resolvedStatus: any = 'SCHEDULED'
    if (initialStatus === 'CONFIRMED') resolvedStatus = 'CONFIRMED'

    const appointment = await tx.appointment.create({
      data: {
        patientId: patient.id,
        doctorId,
        createdById: doctorId,
        title: `${patientName} - ${service?.name || 'Consulta'} (WhatsApp)`,
        date: new Date(startAt),
        duration,
        status: resolvedStatus,
        type: service?.name || 'Consulta',
        value: service?.baseValue || null,
        notes: `Criado via Chatbot Light (${source}).`
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
      }
    })

    return appointment
  })
}

// ─── 10. Audit Logging ────────────────────────────────────────────────────────
async function auditLogAction(params: {
  instanceId: string
  actionConfigId: string
  actionKey: string
  contactPhone: string
  sessionId: string
  status: string
  stepKey: string
  message: string
  metadata?: any
}) {
  console.log(`[ACTION LOG] [${params.status}] ${params.message}`)
  await prisma.lightSystemActionLog.create({
    data: {
      instanceId: params.instanceId,
      actionConfigId: params.actionConfigId,
      actionKey: params.actionKey,
      contactPhone: params.contactPhone,
      sessionId: params.sessionId,
      status: params.status,
      stepKey: params.stepKey,
      message: params.message,
      metadata: params.metadata || {}
    }
  }).catch(err => console.error('[auditLogAction failed]', err))
}

async function updateConversationPhoneMapping(
  conversationId: string | null,
  instanceId: string,
  contactPhone: string,
  realPhone: string
) {
  const cleanPhone = realPhone.replace(/\D/g, '')
  const phoneJid = `${cleanPhone}@s.whatsapp.net`

  try {
    if (conversationId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          normalizedPhone: cleanPhone,
          phoneJid
        }
      })
    } else {
      await prisma.conversation.updateMany({
        where: { instanceId, contactPhone },
        data: {
          normalizedPhone: cleanPhone,
          phoneJid
        }
      })
    }
  } catch (err) {
    console.error('[updateConversationPhoneMapping] Error:', err)
  }
}

// ─── Step State Machine Engine ────────────────────────────────────────────────
export async function processGuidedStep(
  instance: any,
  session: any,
  incomingText: string
): Promise<void> {
  const contactPhone = session.contactPhone
  const actionConfigId = session.actionConfigId
  
  if (!actionConfigId) {
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', failedReason: 'Nenhuma configuração vinculada.' }
    })
    return
  }

  // Load config rules from LightSystemActionConfig
  const actionConfig = await prisma.lightSystemActionConfig.findUnique({
    where: { id: actionConfigId }
  })
  
  if (!actionConfig || !actionConfig.active) {
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', failedReason: 'Configuração inativa ou não encontrada.' }
    })
    return
  }

  const cfg = (typeof actionConfig.config === 'string' ? JSON.parse(actionConfig.config) : actionConfig.config) as any
  
  // Resolve config variables with safe fallbacks
  const planSource = cfg.planSource || 'DOCTOR_SERVICES'
  const limitSlots = parseInt(cfg.limitSlots) || 3
  const searchWindowDays = parseInt(cfg.searchWindowDays) || 15
  const durationMinutes = parseInt(cfg.durationMinutes) || 30
  const requireCpf = cfg.requireCpf === true || cfg.requireCpf === 'true'
  const requireConvenio = cfg.requireConvenio === true || cfg.requireConvenio === 'true'
  const appointmentInitialStatus = cfg.appointmentInitialStatus || 'SCHEDULED'

  // Messages configuration
  const messages = cfg.messages || {}
  const askNameMsg = messages.askName || 'Para prosseguir, qual o seu nome completo?'
  const askPhoneConfirmMsg = messages.askPhoneConfirm || 'Posso usar este número de WhatsApp como telefone de contato?\n\n1 - Sim\n2 - Informar outro número'
  const askPhoneTextMsg = messages.askPhoneText || 'Por favor, informe seu telefone com DDD:'
  const askCpfMsg = messages.askCpf || 'Por favor, digite seu CPF (apenas números):'
  const askDateMsg = messages.askDate || 'Qual melhor data ou período para você?\n(Ex: amanhã, sexta-feira, próxima semana pela tarde)'
  const successMsgTemplate = messages.success || 'Agendamento confirmado com sucesso!\n\nConsulta: {planoNome}\nData: {data}'
  const noSlotsMsg = messages.noSlots || 'Infelizmente não encontrei horários livres para este período. O que deseja fazer?\n\n1 - Escolher outra data\n2 - Falar com atendente'
  const summaryMsg = messages.summary || 'Confira os dados do seu agendamento:'
  const cancelMsg = messages.cancel || 'Tudo bem, o agendamento não foi confirmado.'

  const collected = session.collectedData ? (typeof session.collectedData === 'string' ? JSON.parse(session.collectedData) : session.collectedData) as any : {}
  const dynamicMap = session.dynamicOptions ? (typeof session.dynamicOptions === 'string' ? JSON.parse(session.dynamicOptions) : session.dynamicOptions) as any : {}

  const contactIdentity = collected._contactIdentity || {}
  const canUseWhatsappAsPhone = !!contactIdentity.normalizedPhone
  const useWhatsappPhone = (cfg.useWhatsappPhone === true || cfg.useWhatsappPhone === 'true') && canUseWhatsappAsPhone

  const doctorId = instance.doctorId
  let step = session.currentStepKey

  const sendStepMessage = async (msg: string) => {
    await sendLightMessage(instance, contactPhone, msg, 'fluxo_guiado')
  }

  const failSession = async (msg: string) => {
    await sendStepMessage(msg)
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', failedReason: msg }
    })
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'FAILED',
      stepKey: step,
      message: `Sessão falhou no passo: ${step}`
    })
  }

  // Step 1: PLAN CHOOSING
  if (step === 'CHOOSE_PLAN') {
    const selectedId = dynamicMap[incomingText]
    if (!selectedId) {
      const attempts = session.invalidAttempts + 1
      if (attempts >= 3) {
        return failSession('Limite de tentativas inválidas excedido. Agendamento encerrado.')
      }
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { invalidAttempts: attempts }
      })
      await sendStepMessage('Opção inválida. Selecione o número correspondente ao plano desejado.')
      return
    }

    collected.serviceId = selectedId
    if (planSource === 'DOCTOR_CONVENIOS') {
      const plan = await prisma.healthPlan.findUnique({ where: { id: selectedId } })
      collected.planoNome = plan?.name || 'Convênio'
    } else {
      const service = await prisma.appointmentType.findUnique({ where: { id: selectedId } })
      collected.planoNome = service?.name || 'Serviço'
    }

    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `Plano selecionado: ${collected.planoNome}`
    })

    step = 'ASK_NAME'
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: {
        currentStepKey: step,
        collectedData: collected,
        dynamicOptions: {},
        invalidAttempts: 0
      }
    })
    await sendStepMessage(askNameMsg)
    return
  }

  // Step 2: NAME COLLECTION
  if (step === 'ASK_NAME') {
    if (incomingText.length < 3) {
      await sendStepMessage('Por favor, informe seu nome completo para registro.')
      return
    }
    collected.nome = incomingText
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `Nome coletado: ${collected.nome}`
    })

    if (useWhatsappPhone) {
      step = 'ASK_PHONE_CONFIRM'
      const newMap = { "1": "CONFIRM_YES", "2": "CONFIRM_NO" }
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: {
          currentStepKey: step,
          collectedData: collected,
          dynamicOptions: newMap,
          invalidAttempts: 0
        }
      })
      await sendStepMessage(askPhoneConfirmMsg)
      return
    } else {
      step = 'ASK_PHONE_TEXT'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: {
          currentStepKey: step,
          collectedData: collected,
          dynamicOptions: {},
          invalidAttempts: 0
        }
      })
      await sendStepMessage(askPhoneTextMsg)
      return
    }
  }

  // Step 3: WHATSAPP PHONE CONFIRMATION
  if (step === 'ASK_PHONE_CONFIRM') {
    const choice = dynamicMap[incomingText]
    if (choice === 'CONFIRM_YES') {
      collected.telefone = contactPhone
      await updateConversationPhoneMapping(session.conversationId, instance.id, contactPhone, contactPhone)
      await auditLogAction({
        instanceId: instance.id,
        actionConfigId,
        actionKey: actionConfig.actionKey,
        contactPhone,
        sessionId: session.id,
        status: 'INPUT_COLLECTED',
        stepKey: step,
        message: `Telefone confirmado: ${collected.telefone}`
      })
      
      if (requireCpf) {
        step = 'ASK_CPF'
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected, dynamicOptions: {} }
        })
        await sendStepMessage(askCpfMsg)
      } else if (requireConvenio) {
        step = 'ASK_CONVENIO'
        const convenios = await prisma.healthPlan.findMany({ where: { doctorId, active: true } })
        if (convenios.length > 0) {
          const mapOpts: Record<string, string> = {}
          const menuStr = convenios.map((c, i) => {
            const idx = String(i + 1)
            mapOpts[idx] = c.id
            return `${idx} - ${c.name}`
          }).join('\n')
          await prisma.lightFlowSession.update({
            where: { id: session.id },
            data: { currentStepKey: step, collectedData: collected, dynamicOptions: mapOpts }
          })
          const askConvMsg = messages.askConvenio || 'Qual o seu convênio/plano de saúde?'
          await sendStepMessage(`${askConvMsg}\n\n${menuStr}\n\nSe for particular, digite 0.`)
        } else {
          step = 'ASK_DATE'
          await prisma.lightFlowSession.update({
            where: { id: session.id },
            data: { currentStepKey: step, collectedData: collected }
          })
          await sendStepMessage(askDateMsg)
        }
      } else {
        step = 'ASK_DATE'
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected }
        })
        await sendStepMessage(askDateMsg)
      }
      return;
    } else if (choice === 'CONFIRM_NO') {
      step = 'ASK_PHONE_TEXT'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, dynamicOptions: {} }
      })
      await sendStepMessage(askPhoneTextMsg)
      return
    } else {
      await sendStepMessage('Escolha inválida. Digite 1 ou 2.')
      return
    }
  }

  // Step 4: TELEFONE TEXT COLLECTION
  if (step === 'ASK_PHONE_TEXT') {
    const cleaned = incomingText.replace(/\D/g, '')
    if (cleaned.length < 10) {
      await sendStepMessage('Telefone inválido. Digite o número com o DDD.')
      return
    }
    collected.telefone = cleaned
    await updateConversationPhoneMapping(session.conversationId, instance.id, contactPhone, cleaned)
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `Telefone informado: ${collected.telefone}`
    })

    if (requireCpf) {
      step = 'ASK_CPF'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, collectedData: collected }
      })
      await sendStepMessage(askCpfMsg)
    } else if (requireConvenio) {
      step = 'ASK_CONVENIO'
      const convenios = await prisma.healthPlan.findMany({ where: { doctorId, active: true } })
      if (convenios.length > 0) {
        const mapOpts: Record<string, string> = {}
        const menuStr = convenios.map((c, i) => {
          const idx = String(i + 1)
          mapOpts[idx] = c.id
          return `${idx} - ${c.name}`
        }).join('\n')
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected, dynamicOptions: mapOpts }
        })
        const askConvMsg = messages.askConvenio || 'Qual o seu convênio/plano de saúde?'
        await sendStepMessage(`${askConvMsg}\n\n${menuStr}\n\nSe for particular, digite 0.`)
      } else {
        step = 'ASK_DATE'
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected }
        })
        await sendStepMessage(askDateMsg)
      }
    } else {
      step = 'ASK_DATE'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, collectedData: collected }
      })
      await sendStepMessage(askDateMsg)
    }
    return
  }

  // Step 5: CPF COLLECTION
  if (step === 'ASK_CPF') {
    const cleanedCpf = incomingText.replace(/\D/g, '')
    if (cleanedCpf.length !== 11) {
      await sendStepMessage('CPF inválido. Por favor, informe os 11 dígitos do seu CPF.')
      return
    }
    collected.cpf = cleanedCpf
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `CPF coletado`
    })

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
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected, dynamicOptions: mapOpts }
        })
        const askConvMsg = messages.askConvenio || 'Qual o seu convênio/plano de saúde?'
        await sendStepMessage(`${askConvMsg}\n\n${menuStr}\n\nSe for particular, digite 0.`)
      } else {
        step = 'ASK_DATE'
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: { currentStepKey: step, collectedData: collected }
        })
        await sendStepMessage(askDateMsg)
      }
    } else {
      step = 'ASK_DATE'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, collectedData: collected }
      })
      await sendStepMessage(askDateMsg)
    }
    return
  }

  // Step 6: CONVENIO COLLECTION
  if (step === 'ASK_CONVENIO') {
    if (incomingText === '0') {
      collected.convenioId = null
      collected.convenioNome = 'Particular'
    } else {
      const convId = dynamicMap[incomingText]
      if (!convId) {
        await sendStepMessage('Opção inválida. Digite o número do seu convênio ou 0 para Particular.')
        return
      }
      collected.convenioId = convId
      const plan = await prisma.healthPlan.findUnique({ where: { id: convId } })
      collected.convenioNome = plan?.name || 'Convênio'
    }

    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `Convênio selecionado: ${collected.convenioNome}`
    })
    
    step = 'ASK_DATE'
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { currentStepKey: step, collectedData: collected, dynamicOptions: {} }
    })
    await sendStepMessage(askDateMsg)
    return
  }

  // Step 7: PREFERRED DATE
  if (step === 'ASK_DATE') {
    collected.dataPreferida = incomingText
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'INPUT_COLLECTED',
      stepKey: step,
      message: `Período solicitado: ${collected.dataPreferida}`
    })

    const slots = await findAvailableSlots({
      doctorId,
      preferredDateText: incomingText,
      searchWindowDays,
      durationMinutes,
      limit: limitSlots
    })

    if (slots.length === 0) {
      step = 'ASK_DATE_EMPTY'
      const newMap = { "1": "REASK_DATE", "2": "TRANSFER_HUMAN" }
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, collectedData: collected, dynamicOptions: newMap }
      })
      await sendStepMessage(noSlotsMsg)
      return
    }

    const mapOpts: Record<string, any> = {}
    const menuStr = slots.map((s, i) => {
      const idx = String(i + 1)
      mapOpts[idx] = s
      return `${idx} - ${formatSlotDateTime(s.startAt)}`
    }).join('\n')

    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'SLOTS_FOUND',
      stepKey: step,
      message: `Encontrados ${slots.length} slots`
    })

    step = 'CHOOSE_SLOT'
    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: { currentStepKey: step, collectedData: collected, dynamicOptions: mapOpts }
    })

    const slotsFoundHeader = messages.slotsFound || 'Encontrei estes horários disponíveis:'
    await sendStepMessage(`${slotsFoundHeader}\n\n${menuStr}\n\nPor favor, escolha a opção desejada.`)
    return
  }

  // Step 7.1: EMPTY DATE OPTION
  if (step === 'ASK_DATE_EMPTY') {
    const choice = dynamicMap[incomingText]
    if (choice === 'REASK_DATE') {
      step = 'ASK_DATE'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, dynamicOptions: {} }
      })
      await sendStepMessage(askDateMsg)
      return
    } else if (choice === 'TRANSFER_HUMAN') {
      await sendStepMessage('Certo. Vou transferir sua conversa para um de nossos atendentes. Por favor, aguarde.')
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { status: 'TRANSFER' }
      })
      await auditLogAction({
        instanceId: instance.id,
        actionConfigId,
        actionKey: actionConfig.actionKey,
        contactPhone,
        sessionId: session.id,
        status: 'TRANSFER',
        stepKey: step,
        message: 'Paciente transferido para humano'
      })
      return
    } else {
      await sendStepMessage('Escolha inválida. Digite 1 ou 2.')
      return
    }
  }

  // Step 8: SLOT CHOICE
  if (step === 'CHOOSE_SLOT') {
    const chosenSlot = dynamicMap[incomingText]
    if (!chosenSlot) {
      await sendStepMessage('Opção inválida. Digite o número correspondente ao horário desejado.')
      return
    }

    collected.horarioEscolhido = chosenSlot.startAt
    collected.horarioFimEscolhido = chosenSlot.endAt
    
    await auditLogAction({
      instanceId: instance.id,
      actionConfigId,
      actionKey: actionConfig.actionKey,
      contactPhone,
      sessionId: session.id,
      status: 'SLOT_SELECTED',
      stepKey: step,
      message: `Slot escolhido: ${chosenSlot.startAt}`
    })

    step = 'CONFIRMATION'
    const newMap = { "1": "CONFIRM_APPOINTMENT", "2": "CHANGE_SLOT", "3": "CANCEL_SESSION" }

    await prisma.lightFlowSession.update({
      where: { id: session.id },
      data: {
        currentStepKey: step,
        collectedData: collected,
        dynamicOptions: newMap
      }
    })

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { name: true }
    })

    const dataFormatted = formatSlotDateTime(chosenSlot.startAt)

    await sendStepMessage(
      `${summaryMsg}\n\n` +
      `👤 Nome: ${collected.nome}\n` +
      `📞 Telefone: ${collected.telefone}\n` +
      `💼 Plano/Serviço: ${collected.planoNome}\n` +
      `🩺 Médico: ${doctor?.name || 'Médico'}\n` +
      `📅 Data/Horário: ${dataFormatted}\n\n` +
      `1 - Sim, confirmar agendamento\n` +
      `2 - Escolher outro horário\n` +
      `3 - Cancelar`
    )
    return
  }

  // Step 9: CONFIRMATION STAGE
  if (step === 'CONFIRMATION') {
    const choice = dynamicMap[incomingText]
    if (choice === 'CONFIRM_APPOINTMENT') {
      try {
        const freshSession = await prisma.lightFlowSession.findUnique({
          where: { id: session.id }
        })
        if (!freshSession || freshSession.status !== 'ACTIVE') {
          return
        }

        const appt = await createAppointmentFromChatbot({
          doctorId,
          patientName: collected.nome,
          patientPhone: collected.telefone,
          patientCpf: collected.cpf,
          patientConvenioId: collected.convenioId,
          serviceId: collected.serviceId,
          startAt: collected.horarioEscolhido,
          endAt: collected.horarioFimEscolhido,
          source: 'WHATSAPP_CHATBOT_LIGHT',
          initialStatus: appointmentInitialStatus
        })

        collected.appointmentId = appt.id
        
        await prisma.lightFlowSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            collectedData: collected,
            completedAt: new Date()
          }
        })

        await auditLogAction({
          instanceId: instance.id,
          actionConfigId,
          actionKey: actionConfig.actionKey,
          contactPhone,
          sessionId: session.id,
          status: 'COMPLETED',
          stepKey: step,
          message: `Agendamento criado com sucesso ID: ${appt.id}`
        })

        const dateFormatted = formatSlotDateTime(collected.horarioEscolhido)
        const successMsg = successMsgTemplate
          .replace('{nome}', collected.nome)
          .replace('{planoNome}', collected.planoNome)
          .replace('{medico}', appt.doctor?.name || 'Médico')
          .replace('{data}', dateFormatted)

        await sendStepMessage(successMsg)
        return
      } catch (err: any) {
        if (err.message === 'SLOT_OCCUPIED' || err.message === 'SLOT_BLOCKED') {
          step = 'ASK_DATE'
          await prisma.lightFlowSession.update({
            where: { id: session.id },
            data: { currentStepKey: step, dynamicOptions: {} }
          })
          await sendStepMessage('Esse horário acabou de ser ocupado. Por favor, escolha uma outra data ou período:')
          return
        }
        console.error('[GuidedFlow Config-Driven Confirmation Error]', err)
        return failSession('Desculpe, ocorreu um erro ao registrar seu agendamento no sistema. Por favor, tente novamente mais tarde.')
      }
    } else if (choice === 'CHANGE_SLOT') {
      step = 'ASK_DATE'
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { currentStepKey: step, dynamicOptions: {} }
      })
      await sendStepMessage(askDateMsg)
      return
    } else if (choice === 'CANCEL_SESSION') {
      await prisma.lightFlowSession.update({
        where: { id: session.id },
        data: { status: 'CANCELLED' }
      })
      await sendStepMessage(cancelMsg)
      await auditLogAction({
        instanceId: instance.id,
        actionConfigId,
        actionKey: actionConfig.actionKey,
        contactPhone,
        sessionId: session.id,
        status: 'CANCELLED',
        stepKey: step,
        message: 'Sessão cancelada pelo usuário'
      })
      return
    } else {
      await sendStepMessage('Para confirmar o agendamento, responda:\n\n1 - Sim, confirmar\n2 - Escolher outro horário\n3 - Cancelar')
      return
    }
  }
}
