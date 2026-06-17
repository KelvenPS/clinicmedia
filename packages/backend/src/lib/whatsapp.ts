import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WAMessage,
  type Chat,
  type Contact,
  type proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from './prisma'

// ── Feature Toggles (desabilitar temporariamente para diagnóstico) ────────
const ENABLE_HISTORY_SYNC = process.env.WA_ENABLE_HISTORY_SYNC !== 'false'
const ENABLE_AVATAR_SYNC  = process.env.WA_ENABLE_AVATAR_SYNC !== 'false'
const ENABLE_TYPING       = process.env.WA_ENABLE_TYPING !== 'false'
const ENABLE_READ_RECEIPTS = process.env.WA_ENABLE_READ_RECEIPTS !== 'false'

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logger = { level: 'silent', trace: ()=>{}, debug: ()=>{}, info: ()=>{}, warn: ()=>{}, error: ()=>{}, fatal: ()=>{}, child: function(){ return this } } as any

// ─── Estado em memória ────────────────────────────────────────────────────────

const sockets    = new Map<string, ReturnType<typeof makeWASocket>>()
const stoppingKeys = new Set<string>()
const reconnectAttempts = new Map<string, number>()

// Falhas consecutivas de erro de sessão (badSession/multideviceMismatch).
const sessionErrorStreak = new Map<string, number>()
const MAX_SESSION_ERROR_STREAK = 8

// IDs de mensagens WA já processados (evita duplicata mesmo após restart graças ao DB)
const processedMsgs = new Map<string, Set<string>>()

// Geração da sessão — incrementa a cada startSession para cancelar syncAvatars
const sessionGeneration = new Map<string, number>()

// Locks de instância baseados em Promise para serializar start/stop
const instanceLocks = new Map<string, Promise<void>>()

// Timers de reconexão ativos para cancelamento
const reconnectTimers = new Map<string, NodeJS.Timeout>()

// Rastreio de desconexão para padrão 515 -> 500
const lastDisconnectTimestamp = new Map<string, number>()
const lastDisconnectReasonCode = new Map<string, number>()

// Estado de sincronização
interface SyncState { syncing: boolean; total: number; syncedAt: Date | null }
const syncState = new Map<string, SyncState>()

export function getSyncStatus(instanceKey: string): SyncState {
  return syncState.get(instanceKey) ?? { syncing: false, total: 0, syncedAt: null }
}

// ─── Logger Estruturado ────────────────────────────────────────────────────────

function logWA(level: 'info' | 'warn' | 'error', instanceKey: string, event: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  const activeSockets = sockets.size
  const hasLock = instanceLocks.has(instanceKey)
  console.log(JSON.stringify({ ts, level, module: 'WA', instanceKey, event, activeSockets, hasLock, ...meta }))
}

// ─── Lock por Instância ────────────────────────────────────────────────────────

async function withInstanceLock<T>(instanceKey: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = instanceLocks.get(instanceKey) || Promise.resolve()
  
  const nextLock = (async () => {
    try {
      await currentLock
    } catch {
      // Ignora erro anterior para não travar a fila
    }
    return fn()
  })()
  
  instanceLocks.set(instanceKey, nextLock.then(() => {}, () => {}))
  return nextLock
}

// ─── Handler de mensagens registrado pelo chatbot route ───────────────────────

type MessageFn = (instanceId: string, msg: WAMessage) => Promise<void>
let messageHandler: MessageFn | null = null

export function registerMessageHandler(fn: MessageFn) {
  messageHandler = fn
}

// ─── Envio de mensagens via Baileys ──────────────────────────────────────────

export function isSessionActive(instanceKey: string): boolean {
  return sockets.has(instanceKey)
}

export async function sendWhatsAppMessage(
  instanceKey: string,
  jid: string,
  content: string,
): Promise<{ waMessageId: string } | null> {
  const sock = sockets.get(instanceKey)
  if (!sock) return null

  const result = await sock.sendMessage(jid, { text: content })
  if (!result?.key.id) return null

  const set = processedMsgs.get(instanceKey)
  if (set) set.add(result.key.id)

  return { waMessageId: result.key.id }
}

// ─── Presença / Typing ────────────────────────────────────────────────────────

export async function sendTypingPresence(
  instanceKey: string,
  jid: string,
  typing: boolean,
): Promise<void> {
  if (!ENABLE_TYPING) return
  const sock = sockets.get(instanceKey)
  if (!sock) return
  try {
    await sock.sendPresenceUpdate(typing ? 'composing' : 'paused', jid)
  } catch { /* ignora */ }
}

// ─── Marcar mensagens como lidas no WhatsApp ─────────────────────────────────

export async function markMessagesReadWA(
  instanceKey: string,
  keys: Array<{ remoteJid: string; id: string; fromMe?: boolean | null }>,
): Promise<void> {
  if (!ENABLE_READ_RECEIPTS) return
  const sock = sockets.get(instanceKey)
  if (!sock || keys.length === 0) return
  try {
    await sock.readMessages(keys as Parameters<typeof sock.readMessages>[0])
  } catch { /* ignora */ }
}

// ─── Avatar / Foto de perfil ─────────────────────────────────────────────────

export async function refreshContactAvatar(
  instanceKey: string,
  jid: string,
  conversationId: string,
): Promise<string | null> {
  const sock = sockets.get(instanceKey)
  if (!sock) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = await (sock as any).profilePictureUrl(jid, 'image') as string | undefined
    if (url) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { contactAvatar: url } })
      return url
    }
  } catch { /* sem foto */ }
  return null
}

async function syncAvatars(instanceKey: string, instanceId: string, generation: number): Promise<void> {
  if (!ENABLE_AVATAR_SYNC) {
    logWA('info', instanceKey, 'sync_avatars.disabled')
    return
  }
  const convs = await prisma.conversation.findMany({
    where: { instanceId, contactAvatar: null },
    select: { id: true, contactPhone: true, isGroup: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 80,
  })
  for (const conv of convs) {
    if (!sockets.has(instanceKey) || sessionGeneration.get(instanceKey) !== generation) break
    const jid = conv.isGroup ? `${conv.contactPhone}@g.us` : `${conv.contactPhone}@s.whatsapp.net`
    await refreshContactAvatar(instanceKey, jid, conv.id)
    await new Promise(r => setTimeout(r, 600))
  }
  if (sessionGeneration.get(instanceKey) === generation) {
    console.log(`[WA] Avatar sync concluído: ${instanceKey}`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLong(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

// ─── Processamento de mensagem individual ─────────────────────────────────────

async function processMessage(instanceId: string, msg: WAMessage, instanceKey: string) {
  if (!msg.message || !msg.key.remoteJid) return

  const waMessageId = msg.key.id
  if (!waMessageId) return

  const set = processedMsgs.get(instanceKey)
  if (set?.has(waMessageId)) return

  const alreadyInDb = await prisma.message.findFirst({
    where: { waMessageId },
    select: { id: true },
  }).catch(() => null)

  if (alreadyInDb) {
    set?.add(waMessageId)
    return
  }

  set?.add(waMessageId)
  if (set && set.size > 20_000) {
    const arr = [...set]
    arr.slice(0, 10_000).forEach(id => set.delete(id))
  }

  if (messageHandler) {
    await messageHandler(instanceId, msg)
  }
}

// ─── Sincronização do histórico de chats ─────────────────────────────────────

async function syncHistory(
  instanceId: string,
  instanceKey: string,
  chats: Chat[],
  contacts: Contact[],
  messages: WAMessage[],
) {
  if (!ENABLE_HISTORY_SYNC) {
    logWA('info', instanceKey, 'sync_history.disabled')
    return
  }
  syncState.set(instanceKey, { syncing: true, total: 0, syncedAt: null })

  const nameMap = new Map<string, string>()
  for (const c of contacts) {
    const name = c.name || c.notify
    if (c.id && name) nameMap.set(c.id, name)
  }

  let synced = 0

  for (const chat of chats) {
    const jid = chat.id ?? ''
    if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue

    const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
    const isGroup = jid.endsWith('@g.us')
    const contactName = chat.name || nameMap.get(jid) || null
    const unread = Math.max(0, chat.unreadCount ?? 0)
    const ts = toLong(chat.conversationTimestamp)
    const lastMsgAt = ts > 0 ? new Date(ts * 1000) : null

    const category = isGroup ? 'GRUPOS' : (unread > 0 ? 'AGUARDANDO' : 'ATENDIMENTO')
    const status   = isGroup ? 'OPEN'   : (unread > 0 ? 'WAITING'    : 'OPEN')

    try {
      const existing = await prisma.conversation.findFirst({ where: { instanceId, contactPhone } })

      if (!existing) {
        await prisma.conversation.create({
          data: { instanceId, contactPhone, contactName, isGroup, lastMessage: null, lastMessageAt: lastMsgAt, unreadCount: unread, status, category },
        })
        synced++
      } else {
        const needsUpdate =
          (contactName && !existing.contactName) ||
          (lastMsgAt && (!existing.lastMessageAt || lastMsgAt > existing.lastMessageAt))

        if (needsUpdate) {
          await prisma.conversation.update({
            where: { id: existing.id },
            data: {
              contactName: contactName || existing.contactName,
              lastMessageAt: lastMsgAt || existing.lastMessageAt,
              unreadCount: Math.max(existing.unreadCount, unread),
            },
          })
        }
        synced++
      }
    } catch { /* silencia erros */ }
  }

  for (const msg of messages) {
    await processMessage(instanceId, msg, instanceKey).catch(() => {})
  }

  syncState.set(instanceKey, { syncing: false, total: synced, syncedAt: new Date() })
  console.log(`[WA] Sync concluído: ${synced} conversas — ${instanceKey}`)
}

// ─── Inicia sessão Baileys ────────────────────────────────────────────────────

export async function startSession(instanceKey: string, instanceId: string): Promise<void> {
  return withInstanceLock(instanceKey, async () => {
    logWA('info', instanceKey, 'session.start_attempt')

    // Cancela timers de reconexão antigos pendentes
    const oldTimer = reconnectTimers.get(instanceKey)
    if (oldTimer) {
      clearTimeout(oldTimer)
      reconnectTimers.delete(instanceKey)
      logWA('info', instanceKey, 'reconnect.cancelled_existing')
    }

    // Se já existe um socket ativo em memória, ignora a inicialização concorrente
    if (sockets.has(instanceKey)) {
      logWA('info', instanceKey, 'session.start_ignored_active_socket_exists')
      return
    }

    // Fecha socket antigo por segurança (caso exista algum zumbi)
    closeSocket(instanceKey)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Incrementa a geração para cancelar syncAvatars pendentes
    const gen = (sessionGeneration.get(instanceKey) ?? 0) + 1
    sessionGeneration.set(instanceKey, gen)

    processedMsgs.set(instanceKey, new Set())
    syncState.set(instanceKey, { syncing: false, total: 0, syncedAt: null })

    const sessDir = path.join(SESSIONS_DIR, instanceKey)
    fs.mkdirSync(sessDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(sessDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['ClinicMedia', 'Safari', '1.0'],
      getMessage: async () => undefined,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60_000,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      markOnlineOnConnect: false,
    })

    sockets.set(instanceKey, sock)
    logWA('info', instanceKey, 'socket.created')

    let stableTimer: NodeJS.Timeout | null = null

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr)
          await prisma.whatsAppInstance.update({
            where: { instanceKey },
            data: { qrCode: qrDataUrl, qrCodeExpiresAt: new Date(Date.now() + 55_000), status: 'CONNECTING' },
          })
          logWA('info', instanceKey, 'qr.generated')
        } catch (e) {
          logWA('error', instanceKey, 'qr.save_failed', { error: String(e) })
        }
      }

      if (connection === 'open') {
        if (stableTimer) { clearTimeout(stableTimer); stableTimer = null }
        
        const phoneRaw = sock.user?.id ?? ''
        const phone = phoneRaw.split(':')[0].split('@')[0]
        try {
          await prisma.whatsAppInstance.update({
            where: { instanceKey },
            data: {
              status: 'CONNECTED',
              qrCode: null,
              qrCodeExpiresAt: null,
              connectedAt: new Date(),
              phoneNumber: phone || null,
              displayName: sock.user?.name ?? null,
              reconnectAttempts: 0,
              quarantinedAt: null,
              lastDisconnectCode: null
            },
          })

          logWA('info', instanceKey, 'session.connected', { phone, displayName: sock.user?.name })

          const currentGen = sessionGeneration.get(instanceKey) ?? gen
          setTimeout(() => syncAvatars(instanceKey, instanceId, currentGen).catch(() => {}), 8000)

          stableTimer = setTimeout(() => {
            if (sockets.has(instanceKey)) {
              reconnectAttempts.delete(instanceKey)
              sessionErrorStreak.delete(instanceKey)
              logWA('info', instanceKey, 'session.stable_counters_reset')
            }
          }, 30_000)
        } catch (e) {
          logWA('error', instanceKey, 'session.connected_update_failed', { error: String(e) })
        }
      }

      if (connection === 'close') {
        if (stableTimer) { clearTimeout(stableTimer); stableTimer = null }

        const code = (lastDisconnect?.error as Boom)?.output?.statusCode
        const loggedOut = code === DisconnectReason.loggedOut

        logWA('warn', instanceKey, 'session.disconnect', { code, error: lastDisconnect?.error?.message })

        if (stoppingKeys.has(instanceKey)) {
          sockets.delete(instanceKey)
          logWA('info', instanceKey, 'session.close_ignored_stopping')
          return
        }
        sockets.delete(instanceKey)

        const lastCode = lastDisconnectReasonCode.get(instanceKey)
        const lastTime = lastDisconnectTimestamp.get(instanceKey) ?? 0
        const now = Date.now()
        const timeSinceLastDisconnect = now - lastTime

        lastDisconnectTimestamp.set(instanceKey, now)
        lastDisconnectReasonCode.set(instanceKey, code ?? 0)

        // Código 515 (restartRequired)
        if (code === 515) {
          logWA('info', instanceKey, 'session.restart_required', { code })
          const delay = 100
          const timer = setTimeout(() => {
            reconnectTimers.delete(instanceKey)
            startSession(instanceKey, instanceId).catch(err => {
              logWA('error', instanceKey, 'session.restart_failed', { error: String(err) })
            })
          }, delay)
          reconnectTimers.set(instanceKey, timer)
          return
        }

        const isSessionError =
          code === DisconnectReason.badSession ||
          code === DisconnectReason.multideviceMismatch

        let sessionErrors = 0
        if (isSessionError) {
          const wasAfter515 = lastCode === 515 && timeSinceLastDisconnect < 10_000
          if (wasAfter515) {
            logWA('warn', instanceKey, 'session.bad_session_after_515_ignored', { timeSinceLastDisconnect })
            sessionErrors = sessionErrorStreak.get(instanceKey) ?? 0
          } else {
            sessionErrors = (sessionErrorStreak.get(instanceKey) ?? 0) + 1
            sessionErrorStreak.set(instanceKey, sessionErrors)
            logWA('warn', instanceKey, 'session.error_streak_incremented', { code, sessionErrors })
          }
        } else if (code !== 515) {
          sessionErrorStreak.delete(instanceKey)
        }

        const attempts = (reconnectAttempts.get(instanceKey) ?? 0) + 1
        reconnectAttempts.set(instanceKey, attempts)

        // Atualiza tentativas no banco de dados
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: { reconnectAttempts: attempts },
        }).catch(() => {})

        const sessionCorrupted = isSessionError && sessionErrors >= MAX_SESSION_ERROR_STREAK

        if (loggedOut || sessionCorrupted) {
          logWA('error', instanceKey, 'session.unrecoverable_error', { loggedOut, sessionCorrupted, code, sessionErrors })

          if (sessionCorrupted && !loggedOut) {
            try {
              await prisma.whatsAppInstance.update({
                where: { instanceKey },
                data: {
                  status: 'QUARANTINED',
                  lastDisconnectCode: code,
                  quarantinedAt: new Date(),
                  qrCode: null,
                  qrCodeExpiresAt: null
                }
              })
              logWA('warn', instanceKey, 'session.quarantined_saved_to_db')
            } catch (e) {
              logWA('error', instanceKey, 'session.quarantine_db_update_failed', { error: String(e) })
            }

            closeSocket(instanceKey)
            processedMsgs.delete(instanceKey)
            syncState.delete(instanceKey)
            reconnectAttempts.delete(instanceKey)
            sessionErrorStreak.delete(instanceKey)
            return
          }

          closeSocket(instanceKey)
          try {
            fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
            logWA('info', instanceKey, 'session.files_removed')
          } catch (e) {
            logWA('error', instanceKey, 'session.files_removal_failed', { error: String(e) })
          }

          processedMsgs.delete(instanceKey)
          syncState.delete(instanceKey)
          reconnectAttempts.delete(instanceKey)
          sessionErrorStreak.delete(instanceKey)

          await prisma.whatsAppInstance.update({
            where: { instanceKey },
            data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null, phoneNumber: null, displayName: null, disconnectedAt: new Date() },
          }).catch(e => logWA('error', instanceKey, 'session.disconnect_db_update_failed', { error: String(e) }))
          
          console.log(
            loggedOut
              ? `[WA] Logout: ${instanceKey}`
              : `[WA] Sessão irrecuperável: ${instanceKey}.`
          )
        } else {
          await prisma.whatsAppInstance.update({
            where: { instanceKey },
            data: { status: 'CONNECTING' },
          }).catch(() => {})

          const delay = Math.min(3000 * attempts, 60_000)
          logWA('info', instanceKey, 'session.reconnect_scheduled', { delay, attempts })

          const timer = setTimeout(() => {
            reconnectTimers.delete(instanceKey)
            startSession(instanceKey, instanceId).catch(err => {
              logWA('error', instanceKey, 'session.reconnect_failed', { error: String(err) })
            })
          }, delay)
          reconnectTimers.set(instanceKey, timer)
        }
      }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      logWA('info', instanceKey, 'history.received', { chats: chats.length, contacts: contacts.length, messages: messages.length })
      await syncHistory(instanceId, instanceKey, chats, contacts, messages).catch(console.error)
    })

    sock.ev.on('chats.upsert', async (chats) => {
      for (const chat of chats) {
        const jid = chat.id ?? ''
        if (!jid || jid === 'status@broadcast') continue
        const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
        const isGroup = jid.endsWith('@g.us')
        const unread = Math.max(0, chat.unreadCount ?? 0)
        const ts = toLong(chat.conversationTimestamp)
        const lastMsgAt = ts > 0 ? new Date(ts * 1000) : null

        const chatCategory = isGroup ? 'GRUPOS' : (unread > 0 ? 'AGUARDANDO' : 'ATENDIMENTO')
        const chatStatus   = isGroup ? 'OPEN'   : (unread > 0 ? 'WAITING'    : 'OPEN')

        try {
          const existing = await prisma.conversation.findFirst({ where: { instanceId, contactPhone } })
          if (!existing) {
            await prisma.conversation.create({
              data: { instanceId, contactPhone, contactName: chat.name || null, isGroup, lastMessage: null, lastMessageAt: lastMsgAt, unreadCount: unread, status: chatStatus, category: chatCategory },
            })
          }
        } catch { /* ignorado */ }
      }
    })

    sock.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        const name = contact.name || contact.notify
        if (!name || !contact.id) continue
        const phone = contact.id.replace('@s.whatsapp.net', '').replace('@g.us', '')
        await prisma.conversation.updateMany({
          where: { instanceId, contactPhone: phone, contactName: null },
          data: { contactName: name },
        }).catch(() => {})
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return
      for (const msg of messages) {
        await processMessage(instanceId, msg, instanceKey).catch(console.error)
      }
    })

    sock.ev.on('message-receipt.update', async (receipts) => {
      for (const { key, receipt } of receipts) {
        if (!key.id || !key.fromMe) continue

        let newStatus: 'SENT' | 'DELIVERED' | 'READ' | null = null
        if (receipt.readTimestamp || receipt.playedTimestamp) {
          newStatus = 'READ'
        } else if (receipt.receiptTimestamp) {
          newStatus = 'DELIVERED'
        }

        if (!newStatus) continue

        await prisma.message.updateMany({
          where: { waMessageId: key.id },
          data: { status: newStatus },
        }).catch(() => {})
      }
    })

    sock.ev.on('messages.update', async (updates) => {
      for (const { key, update } of updates) {
        if (!key.id || !key.fromMe) continue
        const status = (update as any).status as number | undefined
        if (status === undefined) continue

        const statusMap: Record<number, 'SENT' | 'DELIVERED' | 'READ'> = {
          2: 'SENT', 3: 'DELIVERED', 4: 'READ',
        }
        const newStatus = statusMap[status]
        if (!newStatus) continue

        await prisma.message.updateMany({
          where: { waMessageId: key.id },
          data: { status: newStatus },
        }).catch(() => {})
      }
    })
  })
}

// ─── Encerra sessão ───────────────────────────────────────────────────────────

export async function stopSession(instanceKey: string): Promise<void> {
  return withInstanceLock(instanceKey, async () => {
    logWA('info', instanceKey, 'session.stop_attempt')
    stoppingKeys.add(instanceKey)
    
    // Cancela timers de reconexão pendentes
    const oldTimer = reconnectTimers.get(instanceKey)
    if (oldTimer) {
      clearTimeout(oldTimer)
      reconnectTimers.delete(instanceKey)
    }

    const sock = sockets.get(instanceKey)
    sockets.delete(instanceKey)
    processedMsgs.delete(instanceKey)
    syncState.delete(instanceKey)
    reconnectAttempts.delete(instanceKey)
    sessionErrorStreak.delete(instanceKey)

    if (sock) {
      try {
        ;(sock.ev as any).removeAllListeners()
        await sock.logout()
        logWA('info', instanceKey, 'socket.logout_done')
      } catch (e) {
        logWA('warn', instanceKey, 'socket.logout_failed_or_already_closed', { error: String(e) })
      }
    }

    try {
      fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
      logWA('info', instanceKey, 'session.files_removed_on_stop')
    } catch (e) {
      logWA('error', instanceKey, 'session.files_removal_failed_on_stop', { error: String(e) })
    }
    stoppingKeys.delete(instanceKey)
  })
}

function closeSocket(instanceKey: string) {
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)
  if (sock) {
    try {
      ;(sock.ev as any).removeAllListeners()
      ;(sock as any).ws?.close?.()
      if (typeof (sock as any).end === 'function') {
        ;(sock as any).end()
      }
      logWA('info', instanceKey, 'socket.closed_internally')
    } catch (e) {
      logWA('warn', instanceKey, 'socket.close_failed', { error: String(e) })
    }
  }
}

// ─── Restaura sessões ao reiniciar o servidor ─────────────────────────────────

export async function restoreSessions(): Promise<void> {
  logWA('info', 'global', 'restore_sessions.started')
  const instances = await prisma.whatsAppInstance.findMany({
    where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
  }).catch(() => [] as Awaited<ReturnType<typeof prisma.whatsAppInstance.findMany>>)

  for (const inst of instances) {
    const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
    if (fs.existsSync(sessDir)) {
      logWA('info', inst.instanceKey, 'restore_sessions.restoring')
      startSession(inst.instanceKey, inst.id).catch(err => {
        logWA('error', inst.instanceKey, 'restore_sessions.failed_to_start', { error: String(err) })
      })
    } else {
      logWA('warn', inst.instanceKey, 'restore_sessions.no_files_found_disconnecting')
      await prisma.whatsAppInstance.update({
        where: { id: inst.id },
        data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null },
      }).catch(() => {})
    }
  }
}

// ─── Health Watchdog ──────────────────────────────────────────────────────────

let watchdogInterval: NodeJS.Timeout | null = null

export function startHealthWatchdog(): void {
  if (watchdogInterval) return

  const WATCHDOG_INTERVAL_MS = 60_000

  watchdogInterval = setInterval(async () => {
    try {
      logWA('info', 'global', 'watchdog.check_started')
      
      // 1. Instâncias que o banco diz CONNECTED mas não têm socket em memória
      const connectedInstances = await prisma.whatsAppInstance.findMany({
        where: { status: 'CONNECTED' },
        select: { id: true, instanceKey: true },
      }).catch(() => [])

      for (const inst of connectedInstances) {
        if (!sockets.has(inst.instanceKey)) {
          const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
          if (fs.existsSync(sessDir)) {
            logWA('warn', inst.instanceKey, 'watchdog.zombie_detected_restoring')
            startSession(inst.instanceKey, inst.id).catch(console.error)
          } else {
            logWA('warn', inst.instanceKey, 'watchdog.zombie_no_files_disconnecting')
            await prisma.whatsAppInstance.update({
              where: { id: inst.id },
              data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
            }).catch(() => {})
          }
        }
      }

      // 2. Instâncias DISCONNECTED com active=true que têm credenciais em disco
      const disconnectedInstances = await prisma.whatsAppInstance.findMany({
        where: {
          status: 'DISCONNECTED',
          active: true,
          disconnectedAt: { lt: new Date(Date.now() - 120_000) },
        },
        select: { id: true, instanceKey: true },
      }).catch(() => [])

      for (const inst of disconnectedInstances) {
        if (!sockets.has(inst.instanceKey)) {
          const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
          if (fs.existsSync(sessDir)) {
            logWA('info', inst.instanceKey, 'watchdog.disconnected_with_files_restoring')
            startSession(inst.instanceKey, inst.id).catch(console.error)
          }
        }
      }
    } catch (e) {
      logWA('error', 'global', 'watchdog.error', { error: String(e) })
    }
  }, WATCHDOG_INTERVAL_MS)

  logWA('info', 'global', 'watchdog.started', { interval: WATCHDOG_INTERVAL_MS })
}
