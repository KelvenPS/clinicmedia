/**
 * room-whatsapp.ts
 * Manages WhatsApp sessions per Sala (room).
 * Each room can have its own WhatsApp connection via RoomWhatsAppConnection.
 * Uses the same Baileys infrastructure as whatsapp.ts but manages RoomWhatsAppConnection records.
 */
import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import NodeCache from 'node-cache'
import { prisma } from './prisma'
import pino from 'pino'
import { resolveTemplateVariables, TemplateContext } from './chatbot-light-variables'
import { handleIncomingMessage } from '../routes/chatbot'

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })

// Room socket registry — keyed by instanceKey
const roomSockets = new Map<string, ReturnType<typeof makeWASocket>>()
const roomReconnectTimers = new Map<string, NodeJS.Timeout>()
const stoppingRoomKeys = new Set<string>()
// Tracks sessions currently in the connecting/authenticating phase (not yet open)
const roomConnecting = new Set<string>()

// ─── Pending Confirmations (SIM/NÃO interactive flow) ────────────────────────

export interface PendingConfirmationData {
  appointmentId: string
  doctorId: string
  patientName: string
  declineContent: string
  instanceKey: string
}

// TTL 24h — patient has a day to respond
const pendingConfirmations = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })

export function registerRoomConfirmationPending(phone: string, data: PendingConfirmationData): void {
  const normalized = phone.replace(/\D/g, '')
  pendingConfirmations.set(normalized, data)
}

function normalizeConfirmText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const SIM_WORDS = new Set(['sim', 's', '1', 'confirmar', 'confirmo', 'ok', 'quero', 'sim!', 'sim.'])
const NAO_WORDS = new Set(['nao', 'n', '2', 'nao quero', 'cancelar', 'recusar', 'nao confirmo', 'nao!', 'nao.'])

const MAX_ROOM_RECONNECT_ATTEMPTS = 5

/**
 * Encaminha mensagens recebidas pela Sala para o motor do Chatbot Light,
 * quando a Sala estiver vinculada como conexão do Chatbot Light do médico
 * (LightSettings.boundRoomId). Reaproveita o mesmo pipeline de persistência
 * de Conversation/Message usado pela conexão própria do Chatbot Light.
 */
async function dispatchToChatbotLight(instanceKey: string, msg: WAMessage): Promise<void> {
  const connection = await prisma.roomWhatsAppConnection.findUnique({
    where: { instanceKey },
    select: { roomId: true, doctorId: true },
  })
  if (!connection) return

  const settings = await prisma.lightSettings.findUnique({
    where: { doctorId: connection.doctorId },
    select: { boundRoomId: true },
  })
  if (!settings?.boundRoomId || settings.boundRoomId !== connection.roomId) return

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { doctorId_type: { doctorId: connection.doctorId, type: 'CHATBOT_LIGHT' } },
    select: { id: true },
  })
  if (!instance) return

  await handleIncomingMessage(instance.id, msg)
}

function logRoom(level: 'info' | 'warn' | 'error', instanceKey: string, event: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  console.log(JSON.stringify({ ts, level, module: 'ROOM_WA', instanceKey, event, ...meta }))
}

/**
 * Start a WhatsApp session for a room.
 * Creates/updates the RoomWhatsAppConnection record as the session progresses.
 */
export async function startRoomSession(connectionId: string, instanceKey: string): Promise<void> {
  if (stoppingRoomKeys.has(instanceKey)) return
  if (roomSockets.has(instanceKey) || roomConnecting.has(instanceKey)) {
    logRoom('info', instanceKey, 'session.start_ignored_active')
    return
  }

  // Cancel any pending reconnect
  const oldTimer = roomReconnectTimers.get(instanceKey)
  if (oldTimer) { clearTimeout(oldTimer); roomReconnectTimers.delete(instanceKey) }

  logRoom('info', instanceKey, 'session.start')

  const sessDir = path.join(SESSIONS_DIR, 'room_' + instanceKey)
  fs.mkdirSync(sessDir, { recursive: true })

  roomConnecting.add(instanceKey)

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['ClinIQ-Room', 'Safari', '1.0'],
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60_000,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      markOnlineOnConnect: false,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr)
          await prisma.roomWhatsAppConnection.update({
            where: { id: connectionId },
            data: {
              qrCode: qrDataUrl,
              qrCodeExpiresAt: new Date(Date.now() + 55_000),
              status: 'CONNECTING',
            },
          })
          logRoom('info', instanceKey, 'qr.generated')
        } catch (e) {
          logRoom('error', instanceKey, 'qr.save_failed', { error: String(e) })
        }
      }

      if (connection === 'open') {
        roomConnecting.delete(instanceKey)
        roomSockets.set(instanceKey, sock)
        const phoneRaw = sock.user?.id ?? ''
        const phone = phoneRaw.split(':')[0].split('@')[0]
        try {
          await prisma.roomWhatsAppConnection.update({
            where: { id: connectionId },
            data: {
              status: 'CONNECTED',
              qrCode: null,
              qrCodeExpiresAt: null,
              phoneNumber: phone || null,
              displayName: sock.user?.name ?? null,
              connectedAt: new Date(),
              lastSyncAt: new Date(),
              reconnectAttempts: 0,
            },
          })
          logRoom('info', instanceKey, 'session.connected', { phone })
        } catch (e) {
          logRoom('error', instanceKey, 'connected.update_failed', { error: String(e) })
        }
      }

      if (connection === 'close') {
        roomConnecting.delete(instanceKey)
        roomSockets.delete(instanceKey)
        const boom = lastDisconnect?.error as Boom | undefined
        const code = boom?.output?.statusCode
        const loggedOut = code === DisconnectReason.loggedOut

        logRoom('warn', instanceKey, 'session.closed', { code, loggedOut })

        try {
          const conn = await prisma.roomWhatsAppConnection.findUnique({ where: { id: connectionId } })
          if (!conn) return

          const attempts = (conn.reconnectAttempts ?? 0) + 1
          await prisma.roomWhatsAppConnection.update({
            where: { id: connectionId },
            data: {
              status: 'DISCONNECTED',
              qrCode: null,
              disconnectedAt: new Date(),
              reconnectAttempts: attempts,
            },
          })

          if (!loggedOut && !stoppingRoomKeys.has(instanceKey) && attempts <= MAX_ROOM_RECONNECT_ATTEMPTS) {
            const delay = Math.min(5000 * attempts, 30_000)
            logRoom('info', instanceKey, 'reconnect.scheduled', { delay, attempts })
            const timer = setTimeout(() => {
              roomReconnectTimers.delete(instanceKey)
              startRoomSession(connectionId, instanceKey).catch(err =>
                logRoom('error', instanceKey, 'reconnect.failed', { error: String(err) })
              )
            }, delay)
            roomReconnectTimers.set(instanceKey, timer)
          }
        } catch (e) {
          logRoom('error', instanceKey, 'close.update_failed', { error: String(e) })
        }
      }
    })

    // ── SIM/NÃO interactive confirmation + Chatbot Light dispatch ─────────────
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return
      for (const msg of msgs) {
        if (!msg.message || msg.key.fromMe) continue
        const fromJid = msg.key.remoteJid
        if (!fromJid || fromJid.endsWith('@g.us')) continue

        const textContent = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          ''
        ).trim()

        const phone = fromJid.split('@')[0].split(':')[0]
        const pending = textContent ? pendingConfirmations.get<PendingConfirmationData>(phone) : undefined

        let consumedByConfirmation = false

        if (pending && textContent) {
          const normalized = normalizeConfirmText(textContent)
          const isSim = SIM_WORDS.has(normalized)
          const isNao = NAO_WORDS.has(normalized)

          if (isSim || isNao) {
            consumedByConfirmation = true
            pendingConfirmations.del(phone)

            try {
              if (isSim) {
                await prisma.appointment.update({
                  where: { id: pending.appointmentId },
                  data: { status: 'CONFIRMED' },
                })
                await sock.sendMessage(fromJid, {
                  text: `Perfeito, ${pending.patientName}! Sua consulta foi confirmada. Até logo! 😊`,
                })
                await prisma.notification.create({
                  data: {
                    userId: pending.doctorId,
                    title: 'Consulta confirmada',
                    message: `${pending.patientName} confirmou a consulta pelo WhatsApp.`,
                    type: 'SUCCESS',
                    link: '/agenda',
                  },
                })
                logRoom('info', instanceKey, 'confirmation.sim', { phone, appointmentId: pending.appointmentId })
              } else {
                await sock.sendMessage(fromJid, { text: pending.declineContent })
                await prisma.notification.create({
                  data: {
                    userId: pending.doctorId,
                    title: 'Consulta não confirmada',
                    message: `${pending.patientName} não confirmou a consulta. Entre em contato para reagendar.`,
                    type: 'WARNING',
                    link: '/agenda',
                  },
                })
                logRoom('info', instanceKey, 'confirmation.nao', { phone, appointmentId: pending.appointmentId })
              }
            } catch (err) {
              logRoom('error', instanceKey, 'confirmation.process_error', { error: String(err) })
            }
          }
        }

        if (!consumedByConfirmation) {
          try {
            await dispatchToChatbotLight(instanceKey, msg)
          } catch (err) {
            logRoom('error', instanceKey, 'light_dispatch.failed', { error: String(err) })
          }
        }
      }
    })

  } catch (err) {
    roomConnecting.delete(instanceKey)
    logRoom('error', instanceKey, 'session.start_failed', { error: String(err) })
    await prisma.roomWhatsAppConnection.update({
      where: { id: connectionId },
      data: { status: 'DISCONNECTED' },
    }).catch(() => {})
    throw err
  }
}

/**
 * Stop a room WhatsApp session (logout or graceful stop).
 */
export async function stopRoomSession(instanceKey: string, logout = false): Promise<void> {
  stoppingRoomKeys.add(instanceKey)

  const timer = roomReconnectTimers.get(instanceKey)
  if (timer) { clearTimeout(timer); roomReconnectTimers.delete(instanceKey) }

  roomConnecting.delete(instanceKey)

  const sock = roomSockets.get(instanceKey)
  if (sock) {
    try {
      if (logout) await sock.logout()
      sock.end(undefined)
    } catch { /* ignore */ }
    roomSockets.delete(instanceKey)
  }

  stoppingRoomKeys.delete(instanceKey)
  logRoom('info', instanceKey, 'session.stopped', { logout })
}

/**
 * Reset session files to force new QR code on next connect.
 */
export function resetRoomSessionFiles(instanceKey: string): void {
  const sessDir = path.join(SESSIONS_DIR, 'room_' + instanceKey)
  if (fs.existsSync(sessDir)) {
    fs.rmSync(sessDir, { recursive: true, force: true })
    logRoom('info', instanceKey, 'session.files_reset')
  }
}

export function isRoomSessionActive(instanceKey: string): boolean {
  return roomSockets.has(instanceKey)
}

export function getRoomSocket(instanceKey: string) {
  return roomSockets.get(instanceKey)
}

/**
 * Envia uma mensagem de texto pelo socket de uma sala (usado pelo Chatbot Light
 * quando sua conexão está vinculada a uma Sala, eliminando a conexão própria).
 */
export async function sendRoomWhatsAppMessage(
  instanceKey: string,
  jid: string,
  content: string,
): Promise<{ waMessageId: string } | null> {
  const sock = roomSockets.get(instanceKey)
  if (!sock) return null

  const rawDigits = jid.replace(/\D/g, '')
  // Add Brazil country code for 10-11 digit numbers (DDD + phone, no CC)
  const normalized = (rawDigits.length === 10 || rawDigits.length === 11) ? `55${rawDigits}` : rawDigits
  const resolvedJid = jid.includes('@') ? jid : `${normalized}@s.whatsapp.net`
  try {
    const result = await sock.sendMessage(resolvedJid, { text: content })
    if (!result?.key.id) return null

    logRoom('info', instanceKey, 'message.sent', { messageId: result.key.id, source: 'CHATBOT_LIGHT' })
    return { waMessageId: result.key.id }
  } catch (err) {
    logRoom('error', instanceKey, 'message.send_failed', { jid: resolvedJid, error: String(err) })
    return null
  }
}

/**
 * Resolve a conexão WhatsApp da Sala vinculada ao Chatbot Light de um médico
 * (via LightSettings.boundRoomId). Retorna null se não houver vínculo ou a
 * sala não estiver conectada.
 */
export async function resolveChatbotLightBinding(doctorId: string): Promise<{
  roomId: string
  instanceKey: string
  connected: boolean
} | null> {
  const settings = await prisma.lightSettings.findUnique({
    where: { doctorId },
    select: { boundRoomId: true },
  })
  if (!settings?.boundRoomId) return null

  const connection = await prisma.roomWhatsAppConnection.findUnique({
    where: { roomId: settings.boundRoomId },
  })
  if (!connection) return null

  return {
    roomId: settings.boundRoomId,
    instanceKey: connection.instanceKey,
    connected: connection.status === 'CONNECTED' && roomSockets.has(connection.instanceKey),
  }
}

/**
 * Resolve o alvo de envio para mensagens automáticas do Chatbot Light.
 * Retorna null se não houver Sala vinculada ou a conexão não estiver ativa.
 */
export async function resolveChatbotLightSendTarget(doctorId: string): Promise<{ instanceKey: string } | null> {
  const binding = await resolveChatbotLightBinding(doctorId)
  if (!binding || !binding.connected) return null
  return { instanceKey: binding.instanceKey }
}

/**
 * Restore active room sessions on server startup.
 */
export async function restoreRoomSessions(): Promise<void> {
  try {
    const connections = await prisma.roomWhatsAppConnection.findMany({
      where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
    })

    logRoom('info', 'startup', 'restore.begin', { count: connections.length })

    for (const conn of connections) {
      startRoomSession(conn.id, conn.instanceKey).catch(err =>
        logRoom('error', conn.instanceKey, 'restore.failed', { error: String(err) })
      )
    }
  } catch (err) {
    logRoom('error', 'startup', 'restore.error', { error: String(err) })
  }
}

let roomWatchdogInterval: NodeJS.Timeout | null = null

/**
 * Watchdog for room WhatsApp connections — mirrors startHealthWatchdog from whatsapp.ts.
 * Every 60s it checks for connections that the DB marks CONNECTED but have no active
 * socket in memory (zombie state), and attempts to restore them. Also resets the
 * reconnect attempt counter so connections with valid session files can recover after
 * hitting the MAX_ROOM_RECONNECT_ATTEMPTS cap.
 */
export function startRoomHealthWatchdog(): void {
  if (roomWatchdogInterval) return

  const WATCHDOG_INTERVAL_MS = 60_000

  roomWatchdogInterval = setInterval(async () => {
    try {
      // 1. CONNECTED in DB but socket not in memory and not connecting → zombie, restore
      const connectedConns = await prisma.roomWhatsAppConnection.findMany({
        where: { status: 'CONNECTED' },
        select: { id: true, instanceKey: true },
      }).catch(() => [] as { id: string; instanceKey: string }[])

      for (const conn of connectedConns) {
        if (!roomSockets.has(conn.instanceKey) && !roomConnecting.has(conn.instanceKey)) {
          const sessDir = path.join(SESSIONS_DIR, 'room_' + conn.instanceKey)
          if (fs.existsSync(sessDir)) {
            logRoom('warn', conn.instanceKey, 'watchdog.zombie_detected_restoring')
            startRoomSession(conn.id, conn.instanceKey).catch(err =>
              logRoom('error', conn.instanceKey, 'watchdog.restore_failed', { error: String(err) })
            )
          } else {
            logRoom('warn', conn.instanceKey, 'watchdog.zombie_no_files_disconnecting')
            await prisma.roomWhatsAppConnection.update({
              where: { id: conn.id },
              data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
            }).catch(() => {})
          }
        }
      }

      // 2. DISCONNECTED with session files and reconnect cap exhausted → reset and retry
      const disconnectedConns = await prisma.roomWhatsAppConnection.findMany({
        where: {
          status: 'DISCONNECTED',
          disconnectedAt: { lt: new Date(Date.now() - 120_000) },
          reconnectAttempts: { gt: MAX_ROOM_RECONNECT_ATTEMPTS },
        },
        select: { id: true, instanceKey: true },
      }).catch(() => [] as { id: string; instanceKey: string }[])

      for (const conn of disconnectedConns) {
        if (roomSockets.has(conn.instanceKey) || roomConnecting.has(conn.instanceKey)) continue
        const sessDir = path.join(SESSIONS_DIR, 'room_' + conn.instanceKey)
        if (fs.existsSync(sessDir)) {
          logRoom('info', conn.instanceKey, 'watchdog.retrying_after_cap')
          await prisma.roomWhatsAppConnection.update({
            where: { id: conn.id },
            data: { reconnectAttempts: 0 },
          }).catch(() => {})
          startRoomSession(conn.id, conn.instanceKey).catch(err =>
            logRoom('error', conn.instanceKey, 'watchdog.retry_failed', { error: String(err) })
          )
        }
      }
    } catch (e) {
      logRoom('error', 'global', 'room_watchdog.error', { error: String(e) })
    }
  }, WATCHDOG_INTERVAL_MS)

  logRoom('info', 'global', 'room_watchdog.started', { intervalMs: WATCHDOG_INTERVAL_MS })
}

/**
 * Tenta enviar uma mensagem de confirmação de agendamento via WhatsApp da sala.
 * Se houver uma configuração CONFIRM_APPOINTMENT ativa, envia o template SIM/NÃO
 * e registra a pendência. Caso contrário, usa o template APPOINTMENT_CONFIRMATION
 * ou uma mensagem padrão. Retorna true se enviada, false caso contrário.
 */
export async function tryRoomWhatsAppConfirmation(
  roomId: string,
  data: {
    appointmentId: string
    patientName: string
    patientPhone: string
    appointmentDate: string
    appointmentTime: string
    doctorName: string
    doctorId: string
  }
): Promise<boolean> {
  try {
    const connection = await prisma.roomWhatsAppConnection.findFirst({
      where: { roomId, status: 'CONNECTED' },
    })
    if (!connection) return false

    const sock = roomSockets.get(connection.instanceKey)
    if (!sock) return false

    const room = await prisma.room.findUnique({
      where: { id: connection.roomId },
      select: { address: true, logradouro: true, numero: true, bairro: true },
    }).catch(() => null)

    const roomAddressParts = [(room as any)?.logradouro, (room as any)?.numero, (room as any)?.bairro].filter(Boolean)
    const clinicAddress = roomAddressParts.length > 0 ? roomAddressParts.join(', ') : ((room as any)?.address ?? undefined)

    const ctx: TemplateContext = {
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      doctorName: data.doctorName,
      clinicAddress,
    }

    let content: string
    let isPendingConfirm = false
    let declineContent = ''

    // 1. Check for active CONFIRM_APPOINTMENT system action (interactive SIM/NÃO)
    try {
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { doctorId_type: { doctorId: data.doctorId, type: 'CHATBOT_LIGHT' } },
        select: { id: true },
      })
      if (instance) {
        const confirmAction = await prisma.lightSystemActionConfig.findFirst({
          where: { instanceId: instance.id, actionKey: 'CONFIRM_APPOINTMENT', active: true },
        })
        if (confirmAction) {
          const cfg = confirmAction.config as Record<string, string>
          if (cfg?.confirmationMessage) {
            content = resolveTemplateVariables(cfg.confirmationMessage, ctx)
            declineContent = resolveTemplateVariables(
              cfg.declineMessage || 'Entendemos! Nossa equipe entrará em contato para encontrar um horário melhor para você.',
              ctx
            )
            isPendingConfirm = true
          }
        }
      }
    } catch { /* non-fatal — fall through to regular template */ }

    // 2. Fall back to APPOINTMENT_CONFIRMATION integration template
    if (!content!) {
      try {
        const config = await prisma.lightIntegrationConfig.findFirst({
          where: { doctorId: data.doctorId, triggerEvent: 'APPOINTMENT_CONFIRMATION', enabled: true },
          include: { template: { select: { content: true, active: true } } },
        })
        if (config?.template?.active && config.template.content) {
          content = resolveTemplateVariables(config.template.content, ctx)
        }
      } catch { /* non-fatal */ }
    }

    // 3. Default fallback message
    if (!content!) {
      content = `Olá ${data.patientName}! Sua consulta com ${data.doctorName} foi agendada para ${data.appointmentDate} às ${data.appointmentTime}. Até logo!`
    }

    const phone = data.patientPhone.replace(/\D/g, '')
    const jid = `${phone}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: content })

    if (isPendingConfirm) {
      registerRoomConfirmationPending(phone, {
        appointmentId: data.appointmentId,
        doctorId: data.doctorId,
        patientName: data.patientName,
        declineContent,
        instanceKey: connection.instanceKey,
      })
    }

    logRoom('info', connection.instanceKey, 'appointment.confirmation.sent', { roomId, phone, interactive: isPendingConfirm })
    return true
  } catch (err) {
    logRoom('error', 'room-wa', 'appointment.confirmation.failed', { roomId, error: String(err) })
    return false
  }
}
