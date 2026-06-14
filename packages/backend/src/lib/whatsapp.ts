import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WAMessage,
  type Chat,
  type Contact,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from './prisma'

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))

const logger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child: function() { return this },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

// ─── Estado em memória ────────────────────────────────────────────────────────

const sockets    = new Map<string, ReturnType<typeof makeWASocket>>()
const stoppingKeys = new Set<string>()

// Deduplicação de mensagens por instanceKey
const processedMsgs = new Map<string, Set<string>>()

// Estado de sincronização por instanceKey
interface SyncState { syncing: boolean; total: number; syncedAt: Date | null }
const syncState = new Map<string, SyncState>()

export function getSyncStatus(instanceKey: string): SyncState {
  return syncState.get(instanceKey) ?? { syncing: false, total: 0, syncedAt: null }
}

// ─── Callbacks registrados pelo chatbot route ─────────────────────────────────

type MessageFn = (instanceId: string, msg: WAMessage) => Promise<void>
let messageHandler: MessageFn | null = null

export function registerMessageHandler(fn: MessageFn) {
  messageHandler = fn
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLong(v: unknown): number {
  if (!v) return 0
  if (typeof v === 'number') return v
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

async function processMessage(instanceId: string, msg: WAMessage, instanceKey: string) {
  if (!msg.message || !msg.key.remoteJid) return

  // Deduplicação por ID de mensagem WhatsApp
  const msgId = msg.key.id
  if (msgId) {
    const set = processedMsgs.get(instanceKey)
    if (set) {
      if (set.has(msgId)) return
      set.add(msgId)
      if (set.size > 20_000) {
        const arr = [...set]
        arr.slice(0, 10_000).forEach(id => set.delete(id))
      }
    }
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
  syncState.set(instanceKey, { syncing: true, total: 0, syncedAt: null })

  // Mapa nome dos contatos WhatsApp
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

    try {
      const existing = await prisma.conversation.findFirst({
        where: { instanceId, contactPhone },
      })

      if (!existing) {
        await prisma.conversation.create({
          data: {
            instanceId,
            contactPhone,
            contactName,
            isGroup,
            lastMessage: null,
            lastMessageAt: lastMsgAt,
            unreadCount: unread,
            status: unread > 0 ? 'WAITING' : 'OPEN',
            category: unread > 0 ? 'AGUARDANDO' : 'ATENDIMENTO',
          },
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
    } catch { /* silencia erros individuais */ }
  }

  // Processa mensagens históricas (vindas no payload da history.set)
  for (const msg of messages) {
    await processMessage(instanceId, msg, instanceKey).catch(() => {})
  }

  syncState.set(instanceKey, { syncing: false, total: synced, syncedAt: new Date() })
  console.log(`[WA] Sync concluído: ${synced} conversas — ${instanceKey}`)
}

// ─── Inicia sessão Baileys ────────────────────────────────────────────────────

export async function startSession(instanceKey: string, instanceId: string): Promise<void> {
  closeSocket(instanceKey)

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
    syncFullHistory: true,
  })

  sockets.set(instanceKey, sock)

  // ── Conexão ──────────────────────────────────────────────────────────────────

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr)
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: { qrCode: qrDataUrl, qrCodeExpiresAt: new Date(Date.now() + 55_000), status: 'CONNECTING' },
        })
      } catch (e) { console.error('[WA] Erro ao salvar QR:', e) }
    }

    if (connection === 'open') {
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
          },
        })
        console.log(`[WA] Conectado: ${instanceKey} (${phone})`)
      } catch (e) { console.error('[WA] Erro ao atualizar CONNECTED:', e) }
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut

      if (stoppingKeys.has(instanceKey)) {
        sockets.delete(instanceKey)
        return
      }

      sockets.delete(instanceKey)

      if (loggedOut) {
        fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
        processedMsgs.delete(instanceKey)
        syncState.delete(instanceKey)
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null,
                  phoneNumber: null, displayName: null, disconnectedAt: new Date() },
        }).catch(() => {})
        console.log(`[WA] Logout: ${instanceKey}`)
      } else {
        console.log(`[WA] Reconectando em 3s: ${instanceKey} (código ${code})`)
        setTimeout(() => startSession(instanceKey, instanceId).catch(console.error), 3000)
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // ── Histórico inicial (disparado pelo WhatsApp ao conectar) ───────────────────

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    console.log(`[WA] Histórico recebido: ${chats.length} chats, ${messages.length} msgs`)
    await syncHistory(instanceId, instanceKey, chats, contacts, messages).catch(console.error)
  })

  // ── Novos chats descobertos após a conexão inicial ────────────────────────────

  sock.ev.on('chats.upsert', async (chats) => {
    for (const chat of chats) {
      const jid = chat.id ?? ''
      if (!jid || jid === 'status@broadcast') continue
      const contactPhone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
      const isGroup = jid.endsWith('@g.us')
      const unread = Math.max(0, chat.unreadCount ?? 0)
      const ts = toLong(chat.conversationTimestamp)
      const lastMsgAt = ts > 0 ? new Date(ts * 1000) : null

      try {
        const existing = await prisma.conversation.findFirst({ where: { instanceId, contactPhone } })
        if (!existing) {
          await prisma.conversation.create({
            data: {
              instanceId, contactPhone,
              contactName: chat.name || null, isGroup,
              lastMessage: null, lastMessageAt: lastMsgAt,
              unreadCount: unread,
              status: unread > 0 ? 'WAITING' : 'OPEN',
              category: unread > 0 ? 'AGUARDANDO' : 'ATENDIMENTO',
            },
          })
        }
      } catch { /* silencioso */ }
    }
  })

  // ── Atualização de nomes de contatos ─────────────────────────────────────────

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

  // ── Mensagens em tempo real e históricas ──────────────────────────────────────

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = nova mensagem em tempo real
    // 'append' = mensagem histórica durante sincronização
    if (type !== 'notify' && type !== 'append') return
    for (const msg of messages) {
      await processMessage(instanceId, msg, instanceKey).catch(console.error)
    }
  })
}

// ─── Encerra sessão ───────────────────────────────────────────────────────────

export async function stopSession(instanceKey: string): Promise<void> {
  stoppingKeys.add(instanceKey)
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)
  processedMsgs.delete(instanceKey)
  syncState.delete(instanceKey)

  if (sock) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock.ev as any).removeAllListeners()
      await sock.logout()
    } catch { /* socket já encerrado */ }
  }

  fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
  stoppingKeys.delete(instanceKey)
}

// ─── Fecha socket interno ─────────────────────────────────────────────────────

function closeSocket(instanceKey: string) {
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)
  if (sock) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock.ev as any).removeAllListeners()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock as any).ws?.close?.()
    } catch { /* ignorado */ }
  }
}

// ─── Restaura sessões ao reiniciar o servidor ─────────────────────────────────

export async function restoreSessions(): Promise<void> {
  const instances = await prisma.whatsAppInstance.findMany({
    where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
  }).catch(() => [] as Awaited<ReturnType<typeof prisma.whatsAppInstance.findMany>>)

  for (const inst of instances) {
    const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
    if (fs.existsSync(sessDir)) {
      console.log(`[WA] Restaurando: ${inst.instanceKey}`)
      startSession(inst.instanceKey, inst.id).catch(console.error)
    } else {
      await prisma.whatsAppInstance.update({
        where: { id: inst.id },
        data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null },
      }).catch(() => {})
    }
  }
}
