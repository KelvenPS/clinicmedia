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
import { prisma } from './prisma'

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))

// No-op logger compatível com Baileys — suprime todos os logs internos
const logger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: function() { return this },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

// Sockets ativos por instanceKey
const sockets = new Map<string, ReturnType<typeof makeWASocket>>()

// Chaves em processo de encerramento intencional (não deve reconectar)
const stoppingKeys = new Set<string>()

// Callback de processamento de mensagens (registrado pelo chatbot route)
type MessageFn = (instanceId: string, msg: WAMessage) => Promise<void>
let messageHandler: MessageFn | null = null

export function registerMessageHandler(fn: MessageFn) {
  messageHandler = fn
}

// ─── Inicia sessão Baileys para um instanceKey ────────────────────────────────

export async function startSession(instanceKey: string, instanceId: string): Promise<void> {
  // Fecha socket existente sem disparar reconexão
  closeSocket(instanceKey)

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
  })

  sockets.set(instanceKey, sock)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // QR gerado — salva no banco como data URI para exibição direta no frontend
    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr)
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: {
            qrCode: qrDataUrl,
            qrCodeExpiresAt: new Date(Date.now() + 55_000),
            status: 'CONNECTING',
          },
        })
      } catch (e) {
        console.error('[WA] Erro ao salvar QR code:', e)
      }
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
      } catch (e) {
        console.error('[WA] Erro ao atualizar status CONNECTED:', e)
      }
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut

      // Se foi um encerramento intencional (stopSession), não reconecta
      if (stoppingKeys.has(instanceKey)) {
        sockets.delete(instanceKey)
        return
      }

      sockets.delete(instanceKey)

      if (loggedOut) {
        // Sessão encerrada pelo WhatsApp (logout no celular) — limpa tudo
        fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: {
            status: 'DISCONNECTED',
            qrCode: null,
            qrCodeExpiresAt: null,
            phoneNumber: null,
            displayName: null,
            disconnectedAt: new Date(),
          },
        }).catch(() => {})
        console.log(`[WA] Sessão encerrada (logout): ${instanceKey}`)
      } else {
        // Queda de rede ou erro temporário — reconecta em 3s
        console.log(`[WA] Reconectando em 3s: ${instanceKey} (código ${code})`)
        setTimeout(() => startSession(instanceKey, instanceId).catch(console.error), 3000)
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' || !messageHandler) return
    for (const msg of messages) {
      await messageHandler(instanceId, msg).catch(console.error)
    }
  })
}

// ─── Encerra sessão intencionalmente (desconexão do usuário) ─────────────────

export async function stopSession(instanceKey: string): Promise<void> {
  stoppingKeys.add(instanceKey)
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)

  if (sock) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock.ev as any).removeAllListeners()
      await sock.logout()
    } catch { /* socket já encerrado ou não autenticado */ }
  }

  // Remove arquivos de credenciais da sessão
  fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
  stoppingKeys.delete(instanceKey)
}

// ─── Fecha socket sem trigger de reconexão (usado antes de restart) ──────────

function closeSocket(instanceKey: string) {
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)
  if (sock) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock.ev as any).removeAllListeners()
      // Força o fechamento via WebSocket subjacente
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(sock as any).ws?.close?.()
    } catch { /* ignorado */ }
  }
}

// ─── Restaura sessões ativas após reinicialização do servidor ─────────────────

export async function restoreSessions(): Promise<void> {
  const instances = await prisma.whatsAppInstance.findMany({
    where: { status: { in: ['CONNECTED', 'CONNECTING'] } },
  }).catch(() => [] as Awaited<ReturnType<typeof prisma.whatsAppInstance.findMany>>)

  for (const inst of instances) {
    const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
    if (fs.existsSync(sessDir)) {
      console.log(`[WA] Restaurando sessão: ${inst.instanceKey}`)
      startSession(inst.instanceKey, inst.id).catch(console.error)
    } else {
      // Arquivos de sessão perdidos — reseta status
      await prisma.whatsAppInstance.update({
        where: { id: inst.id },
        data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null },
      }).catch(() => {})
    }
  }
}
