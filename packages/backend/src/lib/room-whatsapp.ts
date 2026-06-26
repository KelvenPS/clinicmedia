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
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from './prisma'
import pino from 'pino'

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))
const logger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })

// Room socket registry — keyed by instanceKey
const roomSockets = new Map<string, ReturnType<typeof makeWASocket>>()
const roomReconnectTimers = new Map<string, NodeJS.Timeout>()
const stoppingRoomKeys = new Set<string>()

const MAX_ROOM_RECONNECT_ATTEMPTS = 5

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
  if (roomSockets.has(instanceKey)) {
    logRoom('info', instanceKey, 'session.start_ignored_active')
    return
  }

  // Cancel any pending reconnect
  const oldTimer = roomReconnectTimers.get(instanceKey)
  if (oldTimer) { clearTimeout(oldTimer); roomReconnectTimers.delete(instanceKey) }

  logRoom('info', instanceKey, 'session.start')

  const sessDir = path.join(SESSIONS_DIR, 'room_' + instanceKey)
  fs.mkdirSync(sessDir, { recursive: true })

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

    roomSockets.set(instanceKey, sock)

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
  } catch (err) {
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
