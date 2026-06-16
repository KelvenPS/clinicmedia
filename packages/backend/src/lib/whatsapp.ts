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

const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(process.cwd(), 'sessions'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logger = { level: 'silent', trace: ()=>{}, debug: ()=>{}, info: ()=>{}, warn: ()=>{}, error: ()=>{}, fatal: ()=>{}, child: function(){ return this } } as any

// ─── Estado em memória ────────────────────────────────────────────────────────

const sockets    = new Map<string, ReturnType<typeof makeWASocket>>()
const stoppingKeys = new Set<string>()
const reconnectAttempts = new Map<string, number>()

// Falhas consecutivas de erro de sessão (badSession/multideviceMismatch). Um único
// 500 isolado costuma ser instabilidade transitória da rede da VPS, não sessão
// corrompida de fato — só forçamos novo QR depois de várias seguidas.
const sessionErrorStreak = new Map<string, number>()
const MAX_SESSION_ERROR_STREAK = 5

// IDs de mensagens WA já processados (evita duplicata mesmo após restart graças ao DB)
const processedMsgs = new Map<string, Set<string>>()

// Geração da sessão — incrementa a cada startSession para cancelar syncAvatars
// que ficaram pendentes de uma sessão anterior (evita N syncs em paralelo).
const sessionGeneration = new Map<string, number>()

// Lock para evitar chamadas concorrentes a startSession para a mesma instanceKey
const startingKeys = new Set<string>()

// Estado de sincronização
interface SyncState { syncing: boolean; total: number; syncedAt: Date | null }
const syncState = new Map<string, SyncState>()

export function getSyncStatus(instanceKey: string): SyncState {
  return syncState.get(instanceKey) ?? { syncing: false, total: 0, syncedAt: null }
}

// ─── Handler de mensagens registrado pelo chatbot route ───────────────────────

type MessageFn = (instanceId: string, msg: WAMessage) => Promise<void>
let messageHandler: MessageFn | null = null

export function registerMessageHandler(fn: MessageFn) {
  messageHandler = fn
}

// ─── Envio de mensagens via Baileys ──────────────────────────────────────────

// Indica se existe um socket Baileys realmente ativo em memória para essa instância.
// O status salvo no banco (CONNECTED/CONNECTING/DISCONNECTED) pode ficar desatualizado
// se o processo reiniciar e a sessão ainda não tiver sido restaurada, ou se a
// reconexão estiver em loop (ex: erro 515) sem nunca abrir a conexão de novo.
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

  // Adiciona ao cache para não duplicar quando o echo chegar via messages.upsert
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
  const sock = sockets.get(instanceKey)
  if (!sock) return
  try {
    await sock.sendPresenceUpdate(typing ? 'composing' : 'paused', jid)
  } catch { /* ignora erros de presença */ }
}

// ─── Marcar mensagens como lidas no WhatsApp ─────────────────────────────────

export async function markMessagesReadWA(
  instanceKey: string,
  keys: Array<{ remoteJid: string; id: string; fromMe?: boolean | null }>,
): Promise<void> {
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
  const convs = await prisma.conversation.findMany({
    where: { instanceId, contactAvatar: null },
    select: { id: true, contactPhone: true, isGroup: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 80,
  })
  for (const conv of convs) {
    // Cancela se o socket morreu ou se uma nova sessão (geração) foi iniciada
    if (!sockets.has(instanceKey) || sessionGeneration.get(instanceKey) !== generation) break
    const jid = conv.isGroup ? `${conv.contactPhone}@g.us` : `${conv.contactPhone}@s.whatsapp.net`
    await refreshContactAvatar(instanceKey, jid, conv.id)
    await new Promise(r => setTimeout(r, 600))
  }
  // Só loga se ainda é a mesma geração (evita log poluído de syncs cancelados)
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

  // 1. Verificar cache em memória (rápido)
  const set = processedMsgs.get(instanceKey)
  if (set?.has(waMessageId)) return

  // 2. Verificar no banco de dados (deduplicação pós-restart)
  const alreadyInDb = await prisma.message.findFirst({
    where: { waMessageId },
    select: { id: true },
  }).catch(() => null)

  if (alreadyInDb) {
    set?.add(waMessageId) // Atualiza cache
    return
  }

  // Adiciona ao cache antes de processar (evita race condition)
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
    } catch { /* silencia erros individuais */ }
  }

  for (const msg of messages) {
    await processMessage(instanceId, msg, instanceKey).catch(() => {})
  }

  syncState.set(instanceKey, { syncing: false, total: synced, syncedAt: new Date() })
  console.log(`[WA] Sync concluído: ${synced} conversas — ${instanceKey}`)
}

// ─── Inicia sessão Baileys ────────────────────────────────────────────────────

export async function startSession(instanceKey: string, instanceId: string): Promise<void> {
  // Proteção contra chamadas concorrentes — se já está iniciando esta sessão, ignora
  if (startingKeys.has(instanceKey)) {
    console.log(`[WA] startSession ignorado (já em andamento): ${instanceKey}`)
    return
  }
  startingKeys.add(instanceKey)

  closeSocket(instanceKey)

  // Incrementa a geração para cancelar syncAvatars pendentes da sessão anterior
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
    // Histórico completo logo na conexão sobrecarrega o handshake inicial (upload
    // de pre-keys) em redes mais lentas, causando timeout e badSession em loop.
    // Conversas continuam chegando normalmente via messages.upsert em tempo real.
    syncFullHistory: false,
    // Dá mais tempo pras respostas do WhatsApp antes de declarar timeout —
    // o default da lib é curto demais para esta VPS.
    defaultQueryTimeoutMs: 60_000,
    connectTimeoutMs: 60_000,
    // Mantém o socket vivo com pings periódicos — sem isso, conexões em VPS com
    // NAT/firewall mais agressivo caem sozinhas por ociosidade e voltam como
    // badSession/connectionLost no reconnect seguinte.
    keepAliveIntervalMs: 25_000,
    markOnlineOnConnect: false,
  })

  sockets.set(instanceKey, sock)
  startingKeys.delete(instanceKey) // Libera o lock agora que o socket foi criado

  // ── Conexão ──────────────────────────────────────────────────────────────────

  // Timer que loga conexão estável após 30s sem cair de novo (apenas telemetria).
  let stableTimer: NodeJS.Timeout | null = null

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
          data: { status: 'CONNECTED', qrCode: null, qrCodeExpiresAt: null, connectedAt: new Date(), phoneNumber: phone || null, displayName: sock.user?.name ?? null },
        })

        // ── Zera reconnectAttempts imediatamente ao conectar ──
        // O backoff delay volta ao mínimo (3s) assim que a conexão abre.
        reconnectAttempts.set(instanceKey, 0)
        console.log(`[WA] Conectado: ${instanceKey} (${phone})`)

        // Usa a geração atual para cancelar syncs de sessões anteriores
        const currentGen = sessionGeneration.get(instanceKey) ?? gen
        setTimeout(() => syncAvatars(instanceKey, instanceId, currentGen).catch(() => {}), 8000)

        // sessionErrorStreak só é zerado depois que a conexão fica estável por
        // 30s — se a conexão abre e cai em segundos (falso open), o streak
        // precisa continuar acumulando para eventualmente limpar a sessão
        // corrompida e pedir novo QR Code.
        stableTimer = setTimeout(() => {
          if (sockets.has(instanceKey)) {
            sessionErrorStreak.delete(instanceKey)
            console.log(`[WA] Conexão estável (30s), streak zerado: ${instanceKey}`)
          }
        }, 30_000)
      } catch (e) { console.error('[WA] Erro ao atualizar CONNECTED:', e) }
    }

    if (connection === 'close') {
      if (stableTimer) { clearTimeout(stableTimer); stableTimer = null }

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut

      if (stoppingKeys.has(instanceKey)) { sockets.delete(instanceKey); return }
      sockets.delete(instanceKey)

      const attempts = (reconnectAttempts.get(instanceKey) ?? 0) + 1
      reconnectAttempts.set(instanceKey, attempts)

      // badSession (500) e multideviceMismatch (411) podem ser instabilidade
      // transitória de rede (comum em VPS) e não necessariamente sessão corrompida.
      // Só consideramos a sessão de fato corrompida quando o MESMO tipo de erro se
      // repete várias vezes seguidas — uma ocorrência isolada não derruba as
      // credenciais e força QR novo sem necessidade.
      //
      // NOTA: código 515 (restartRequired / stream restart) NÃO é erro de sessão —
      // é o WhatsApp pedindo para reiniciar o stream, comportamento normal em
      // conexões de longa duração. Não deve contar no streak.
      const isSessionError =
        code === DisconnectReason.badSession ||
        code === DisconnectReason.multideviceMismatch
      const sessionErrors = isSessionError ? (sessionErrorStreak.get(instanceKey) ?? 0) + 1 : 0
      if (isSessionError) sessionErrorStreak.set(instanceKey, sessionErrors)
      else if (!isSessionError && code !== 515) sessionErrorStreak.delete(instanceKey)

      const sessionCorrupted = isSessionError && sessionErrors >= MAX_SESSION_ERROR_STREAK

      if (loggedOut || sessionCorrupted) {
        // Remove os listeners ANTES de apagar os arquivos — o Baileys pode
        // disparar um 'creds.update' final durante o teardown da conexão,
        // o que chamaria saveCreds() e recriaria creds.json com as MESMAS
        // credenciais corrompidas logo após o rmSync, anulando o wipe.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(sock.ev as any).removeAllListeners()
        } catch { /* ignorado */ }

        // O cleanup (limpar memória + marcar DISCONNECTED no banco) precisa
        // acontecer mesmo que a remoção dos arquivos falhe — senão o próximo
        // reconnect reaproveita as MESMAS credenciais corrompidas e repete o
        // ciclo de falha indefinidamente sem nunca pedir QR novo.
        try {
          fs.rmSync(path.join(SESSIONS_DIR, instanceKey), { recursive: true, force: true })
        } catch (e) {
          console.error(`[WA] Falha ao remover sessão em disco (${instanceKey}):`, e)
        }
        processedMsgs.delete(instanceKey)
        syncState.delete(instanceKey)
        reconnectAttempts.delete(instanceKey)
        sessionErrorStreak.delete(instanceKey)
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: { status: 'DISCONNECTED', qrCode: null, qrCodeExpiresAt: null, phoneNumber: null, displayName: null, disconnectedAt: new Date() },
        }).catch(e => console.error(`[WA] Falha ao marcar DISCONNECTED (${instanceKey}):`, e))
        console.log(
          loggedOut
            ? `[WA] Logout: ${instanceKey}`
            : `[WA] Sessão irrecuperável (código ${code}, ${sessionErrors} falhas seguidas): ${instanceKey}. Necessário reconectar via QR Code.`
        )
      } else {
        // Marca CONNECTING imediatamente — se o banco continuar dizendo
        // CONNECTED enquanto não há socket vivo, o health watchdog (a cada
        // 60s) entende a instância como "zumbi" e dispara seu PRÓPRIO
        // startSession() para a mesma instanceKey, correndo em paralelo com
        // este retry agendado. Dois sockets Baileys escrevendo nas mesmas
        // credenciais ao mesmo tempo é exatamente o que faz o WhatsApp
        // rejeitar a sessão (bad session) mesmo em um pareamento novo.
        await prisma.whatsAppInstance.update({
          where: { instanceKey },
          data: { status: 'CONNECTING' },
        }).catch(() => {})

        // Mantém tentando reconectar indefinidamente com backoff progressivo
        // (cap em 60s) — credenciais só são descartadas em logout real ou
        // sessão comprovadamente corrompida (acima). Instabilidade de rede na
        // VPS não deve exigir reconexão manual via QR Code.
        const delay = Math.min(3000 * attempts, 60_000)
        console.log(`[WA] Reconectando em ${delay / 1000}s: ${instanceKey} (código ${code}, tentativa ${attempts})`)
        setTimeout(() => startSession(instanceKey, instanceId).catch(console.error), delay)
      }
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // ── Histórico inicial ─────────────────────────────────────────────────────────

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    console.log(`[WA] Histórico recebido: ${chats.length} chats, ${messages.length} msgs`)
    await syncHistory(instanceId, instanceKey, chats, contacts, messages).catch(console.error)
  })

  // ── Novos chats ───────────────────────────────────────────────────────────────

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
      } catch { /* silencioso */ }
    }
  })

  // ── Atualização de contatos ───────────────────────────────────────────────────

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
    if (type !== 'notify' && type !== 'append') return
    for (const msg of messages) {
      await processMessage(instanceId, msg, instanceKey).catch(console.error)
    }
  })

  // ── Atualização de status de entrega/leitura ──────────────────────────────────

  sock.ev.on('message-receipt.update', async (receipts) => {
    for (const { key, receipt } of receipts) {
      if (!key.id || !key.fromMe) continue // só atualiza msgs que enviamos nós

      // Determina novo status baseado no receipt
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

  // ── Atualização de mensagens (edição, reação, etc.) ──────────────────────────

  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      if (!key.id || !key.fromMe) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (update as any).status as number | undefined
      if (status === undefined) continue

      // Baileys status: 2=SENT, 3=DELIVERED, 4=READ
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
  // Libera lock caso startSession falhe antes de criar o socket
  startingKeys.delete(instanceKey)
}

// ─── Encerra sessão ───────────────────────────────────────────────────────────

export async function stopSession(instanceKey: string): Promise<void> {
  stoppingKeys.add(instanceKey)
  const sock = sockets.get(instanceKey)
  sockets.delete(instanceKey)
  processedMsgs.delete(instanceKey)
  syncState.delete(instanceKey)
  reconnectAttempts.delete(instanceKey)
  sessionErrorStreak.delete(instanceKey)

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

// ─── Health Watchdog ──────────────────────────────────────────────────────────
// Verifica periodicamente se instâncias marcadas como CONNECTED no banco
// realmente têm um socket ativo em memória. Se não, tenta restaurar.
// Também detecta instâncias com active=true que estão DISCONNECTED há muito
// tempo e têm credenciais em disco (sessão que morreu sem reconectar).

let watchdogInterval: NodeJS.Timeout | null = null

export function startHealthWatchdog(): void {
  if (watchdogInterval) return // já está rodando

  const WATCHDOG_INTERVAL_MS = 60_000 // 1 minuto

  watchdogInterval = setInterval(async () => {
    try {
      // 1. Instâncias que o banco diz CONNECTED mas não têm socket em memória
      const connectedInstances = await prisma.whatsAppInstance.findMany({
        where: { status: 'CONNECTED' },
        select: { id: true, instanceKey: true },
      }).catch(() => [])

      for (const inst of connectedInstances) {
        if (!sockets.has(inst.instanceKey) && !startingKeys.has(inst.instanceKey)) {
          const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
          if (fs.existsSync(sessDir)) {
            console.log(`[WA] Watchdog: restaurando sessão zumbi (CONNECTED sem socket): ${inst.instanceKey}`)
            startSession(inst.instanceKey, inst.id).catch(console.error)
          } else {
            // Sem credenciais em disco — marcar como DISCONNECTED
            console.log(`[WA] Watchdog: marcando DISCONNECTED (sem credenciais): ${inst.instanceKey}`)
            await prisma.whatsAppInstance.update({
              where: { id: inst.id },
              data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
            }).catch(() => {})
          }
        }
      }

      // 2. Instâncias DISCONNECTED com active=true que têm credenciais em disco
      //    (sessão que caiu e o reconnect falhou, mas as credenciais ainda existem)
      const disconnectedInstances = await prisma.whatsAppInstance.findMany({
        where: {
          status: 'DISCONNECTED',
          active: true,
          // Só tenta restaurar se desconectou há mais de 2 minutos
          // (evita conflito com reconexão que já está em andamento)
          disconnectedAt: { lt: new Date(Date.now() - 120_000) },
        },
        select: { id: true, instanceKey: true },
      }).catch(() => [])

      for (const inst of disconnectedInstances) {
        if (!sockets.has(inst.instanceKey) && !startingKeys.has(inst.instanceKey)) {
          const sessDir = path.join(SESSIONS_DIR, inst.instanceKey)
          if (fs.existsSync(sessDir)) {
            console.log(`[WA] Watchdog: tentando restaurar sessão DISCONNECTED com credenciais: ${inst.instanceKey}`)
            startSession(inst.instanceKey, inst.id).catch(console.error)
          }
        }
      }
    } catch (e) {
      console.error('[WA] Watchdog erro:', e)
    }
  }, WATCHDOG_INTERVAL_MS)

  console.log('[WA] Health watchdog iniciado (intervalo: 60s)')
}
