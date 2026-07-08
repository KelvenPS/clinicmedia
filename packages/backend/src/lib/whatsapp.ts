import { prisma } from './prisma'

// ─── Logger Estruturado ────────────────────────────────────────────────────────

function logWA(level: 'info' | 'warn' | 'error', instanceKey: string, event: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  console.log(JSON.stringify({ ts, level, module: 'WA', instanceKey, event, ...meta }))
}

// ─── Resolução de JID de entrega ──────────────────────────────────────────────

export function resolveDeliveryJid(input: string): string {
  if (input.endsWith('@s.whatsapp.net')) return input
  if (input.endsWith('@lid')) return input
  if (input.endsWith('@g.us')) throw new Error('Não enviar chatbot para grupos')
  if (input === 'status@broadcast' || input.endsWith('@broadcast')) throw new Error('Não enviar para status')

  const digits = input.replace(/\D/g, '')
  // Add Brazil country code for 10-11 digit numbers (DDD + phone, no CC)
  const normalized = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits
  return `${normalized}@s.whatsapp.net`
}

export interface WhatsAppContactIdentity {
  remoteJid: string;
  deliveryJid: string;
  lidJid?: string;
  phoneJid?: string;
  normalizedPhone?: string;
  displayName?: string;
}

export async function resolveWhatsAppContactIdentity(
  whatsappInstanceId: string,
  remoteJid: string,
  msgRaw?: any
): Promise<WhatsAppContactIdentity> {
  const displayName = msgRaw?.pushName || null
  const deliveryJid = remoteJid
  let lidJid: string | undefined
  let phoneJid: string | undefined
  let normalizedPhone: string | undefined

  if (remoteJid.endsWith('@lid')) {
    lidJid = remoteJid
    logWA('info', 'global', 'whatsapp.contact_identity.lid_detected', { remoteJid })

    // Tenta buscar se já existe mapeamento no banco (por exemplo, na tabela Conversation ou LightFlowSession)
    try {
      const existingConv = await prisma.conversation.findFirst({
        where: {
          instanceId: whatsappInstanceId,
          lidJid: remoteJid,
          normalizedPhone: { not: null }
        },
        select: {
          normalizedPhone: true,
          phoneJid: true
        }
      })
      if (existingConv && existingConv.normalizedPhone) {
        normalizedPhone = existingConv.normalizedPhone
        phoneJid = existingConv.phoneJid || `${normalizedPhone}@s.whatsapp.net`
      } else {
        const lastSession = await prisma.lightFlowSession.findFirst({
          where: {
            instanceId: whatsappInstanceId,
            contactPhone: remoteJid,
          },
          orderBy: { createdAt: 'desc' }
        })
        if (lastSession) {
          const collected = lastSession.collectedData ? (typeof lastSession.collectedData === 'string' ? JSON.parse(lastSession.collectedData) : lastSession.collectedData) as any : {}
          if (collected && collected.telefone) {
            normalizedPhone = collected.telefone.replace(/\D/g, '')
            phoneJid = `${normalizedPhone}@s.whatsapp.net`
          }
        }
      }
    } catch (err) {
      // ignore
    }
  } else if (remoteJid.endsWith('@s.whatsapp.net')) {
    phoneJid = remoteJid
    normalizedPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  }

  // Se veio participantPn da mensagem raw
  let phoneFromPn = msgRaw?.key?.participantPn || msgRaw?.participantPn
  if (phoneFromPn && typeof phoneFromPn === 'string') {
    phoneFromPn = phoneFromPn.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    if (phoneFromPn.length >= 10) {
      normalizedPhone = phoneFromPn
      phoneJid = `${phoneFromPn}@s.whatsapp.net`
    }
  }

  logWA('info', 'global', 'whatsapp.contact_identity.resolved', {
    remoteJid,
    deliveryJid,
    lidJid,
    phoneJid,
    normalizedPhone
  })

  return {
    remoteJid,
    deliveryJid,
    lidJid,
    phoneJid,
    normalizedPhone,
    displayName
  }
}

// ─── Limpeza de inicialização ─────────────────────────────────────────────────

export async function runStartupDatabaseCleanup() {
  try {
    console.log('[StartupCleanup] Iniciando limpeza de dados antigos de teste...')

    // 1. Expirar sessões ativas antigas
    const expiredSessions = await prisma.lightFlowSession.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'EXPIRED' }
    })
    console.log(`[StartupCleanup] Expiradas ${expiredSessions.count} sessões ativas antigas.`)

    // 2. Corrigir conversas antigas com o LID sem sufixo
    const oldLids = ['73444192432134']
    for (const oldLid of oldLids) {
      const lidWithSuffix = `${oldLid}@lid`

      const conversations = await prisma.conversation.findMany({
        where: { contactPhone: oldLid }
      })

      for (const conv of conversations) {
        const existingCorrect = await prisma.conversation.findFirst({
          where: { instanceId: conv.instanceId, contactPhone: lidWithSuffix }
        })

        if (existingCorrect) {
          await prisma.message.deleteMany({ where: { conversationId: conv.id } })
          await prisma.conversation.delete({ where: { id: conv.id } })
        } else {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: {
              contactPhone: lidWithSuffix,
              remoteJid: lidWithSuffix,
              lidJid: lidWithSuffix,
              deliveryJid: lidWithSuffix
            }
          })
        }
      }
    }
    console.log('[StartupCleanup] Limpeza de dados de teste concluída com sucesso.')
  } catch (err) {
    console.error('[StartupCleanup] Erro durante a limpeza de inicialização:', err)
  }
}
