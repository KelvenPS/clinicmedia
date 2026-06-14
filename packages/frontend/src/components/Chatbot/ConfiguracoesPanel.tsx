import { useState, useEffect, useCallback } from 'react'
import {
  Phone, Wifi, WifiOff, QrCode, Loader2, Save, X, Check,
  AlertCircle, Smartphone, RefreshCw, LogOut, Clock, MessageSquare, Users,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChatbotInstance, type ChatbotSettings, type InstanceStatus } from '../../types/chatbot'
import api from '../../lib/api'

interface SyncStatus {
  syncing: boolean
  total: number
  syncedAt: string | null
  conversationCount: number
}

const DAYS = [
  { key: 'MON', label: 'Seg' }, { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' }, { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' }, { key: 'SAT', label: 'Sáb' },
  { key: 'SUN', label: 'Dom' },
]

// ─── QR Code Modal ────────────────────────────────────────────────────────────

type QrPhase = 'starting' | 'waiting_qr' | 'qr_ready' | 'connected' | 'error'

function WhatsAppQRModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<QrPhase>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const [countdown, setCountdown] = useState(55)

  // Inicia conexão ao montar — Baileys gera o QR diretamente no backend
  const connectMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance/connect').then(r => r.data),
    onSuccess: () => {
      setPhase('waiting_qr')
    },
    onError: () => {
      setErrorMsg('Não foi possível iniciar a conexão. Tente novamente.')
      setPhase('error')
    },
  })

  useEffect(() => {
    connectMutation.mutate()
  }, [])

  // Polling do status a cada 3 segundos enquanto modal está aberto
  const { data: statusData } = useQuery<InstanceStatus>({
    queryKey: ['chatbot-instance-status-modal'],
    queryFn: () => api.get('/chatbot/instance/status').then(r => r.data),
    refetchInterval: phase === 'connected' || phase === 'error' ? false : 3000,
    enabled: phase !== 'error',
  })

  useEffect(() => {
    if (!statusData) return
    if (statusData.status === 'CONNECTED') {
      setPhase('connected')
      queryClient.invalidateQueries({ queryKey: ['chatbot-instance'] })
      const t = setTimeout(onClose, 2500)
      return () => clearTimeout(t)
    }
    if (statusData.qrCode && !statusData.qrCodeExpired) {
      setPhase('qr_ready')
      setCountdown(55)
    } else if (statusData.status === 'CONNECTING' && !statusData.qrCode) {
      if (phase !== 'waiting_qr') setPhase('waiting_qr')
    }
  }, [statusData])

  // Countdown do QR
  useEffect(() => {
    if (phase !== 'qr_ready') return
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  const qrCode = statusData?.qrCode ?? null
  const qrExpired = countdown === 0

  function handleRetry() {
    setPhase('starting')
    setCountdown(55)
    connectMutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Conectar WhatsApp</p>
              <p className="text-[10px] text-slate-400">Escaneie o QR Code com seu celular</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center min-h-[320px] justify-center">

          {/* ── Iniciando ── */}
          {phase === 'starting' && (
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Iniciando conexão...</p>
              <p className="text-xs text-slate-400">Preparando sua instância WhatsApp</p>
            </div>
          )}

          {/* ── Aguardando QR ── */}
          {phase === 'waiting_qr' && (
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mx-auto">
                <QrCode className="w-7 h-7 text-sky-500 animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Gerando QR Code...</p>
              <p className="text-xs text-slate-400">Aguarde alguns segundos</p>
              <div className="flex gap-1 justify-center pt-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── QR Ready ── */}
          {phase === 'qr_ready' && qrCode && !qrExpired && (
            <div className="space-y-4 w-full">
              {/* QR Image */}
              <div className="relative inline-block">
                <div className="bg-white border-2 border-slate-200 rounded-xl p-3 shadow-inner">
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    className="w-52 h-52 object-contain"
                  />
                </div>
                {/* Timer overlay quando quase expirando */}
                {countdown <= 15 && (
                  <div className="absolute inset-0 bg-white/90 rounded-xl flex flex-col items-center justify-center">
                    <Clock className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-sm font-bold text-amber-600">Expirando em {countdown}s</p>
                    <button
                      onClick={handleRetry}
                      className="mt-2 flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Atualizar QR
                    </button>
                  </div>
                )}
              </div>

              {/* Countdown bar */}
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-1000 ${countdown > 20 ? 'bg-emerald-400' : countdown > 10 ? 'bg-amber-400' : 'bg-rose-400'}`}
                  style={{ width: `${(countdown / 55) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">QR válido por {countdown}s</p>

              {/* Instructions */}
              <div className="bg-slate-50 rounded-xl p-3 text-left">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Como escanear</p>
                <ol className="space-y-1.5">
                  {[
                    'Abra o WhatsApp no celular',
                    'Toque em ⋮ Mais opções (Android) ou ⚙️ Ajustes (iPhone)',
                    'Selecione "Aparelhos conectados"',
                    'Toque em "Conectar um aparelho"',
                    'Aponte a câmera para o QR Code',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* ── QR Expirado ── */}
          {phase === 'qr_ready' && qrExpired && (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">QR Code expirou</p>
              <p className="text-xs text-slate-400">O QR Code é válido por 60 segundos</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar novo QR Code
              </button>
            </div>
          )}

          {/* ── Conectado ── */}
          {phase === 'connected' && (
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-base font-bold text-emerald-700">WhatsApp Conectado!</p>
              {statusData?.phoneNumber && (
                <p className="text-xs text-slate-500 font-mono">{statusData.phoneNumber}</p>
              )}
              <p className="text-xs text-slate-400">Fechando automaticamente...</p>
            </div>
          )}

          {/* ── Erro ── */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7 text-rose-400" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Erro na conexão</p>
              <p className="text-xs text-slate-500">{errorMsg}</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-semibold transition-colors mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Painel principal de configurações ────────────────────────────────────────

export default function ConfiguracoesPanel() {
  const queryClient = useQueryClient()
  const [showQRModal, setShowQRModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState<Partial<ChatbotSettings>>({})
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState(false)

  const { data: instance, isLoading: instanceLoading } = useQuery<ChatbotInstance | null>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
    refetchInterval: 10_000,
  })

  const { data: settings, isLoading: settingsLoading } = useQuery<ChatbotSettings | null>({
    queryKey: ['chatbot-settings'],
    queryFn: () => api.get('/chatbot/settings').then(r => r.data),
    retry: 1,
  })

  useEffect(() => {
    if (settings && !settingsDirty) {
      setSettingsForm({
        welcomeMessage: settings.welcomeMessage ?? '',
        offHoursMessage: settings.offHoursMessage ?? '',
        businessHoursStart: settings.businessHoursStart ?? '08:00',
        businessHoursEnd: settings.businessHoursEnd ?? '18:00',
        businessDays: settings.businessDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        autoReply: settings.autoReply ?? true,
        queueEnabled: settings.queueEnabled ?? true,
        maxQueueSize: settings.maxQueueSize ?? 10,
        notificationsEnabled: settings.notificationsEnabled ?? true,
        botType: settings.botType ?? 'LIGHT',
        aiSystemPrompt: settings.aiSystemPrompt ?? '',
        replyGroups: settings.replyGroups ?? true,
        replyCommunities: settings.replyCommunities ?? false,
      })
    }
  }, [settings])

  function updateField(patch: Partial<ChatbotSettings>) {
    setSettingsForm(f => ({ ...f, ...patch }))
    setSettingsDirty(true)
  }

  const saveSettingsMutation = useMutation({
    mutationFn: () => api.put('/chatbot/settings', settingsForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-settings'] })
      setSettingsDirty(false)
      setSavedFeedback(true)
      setTimeout(() => setSavedFeedback(false), 2000)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-instance'] })
    },
  })

  const isConnected  = instance?.status === 'CONNECTED'
  const isConnecting = instance?.status === 'CONNECTING'

  const { data: syncData } = useQuery<SyncStatus>({
    queryKey: ['chatbot-sync-status'],
    queryFn: () => api.get('/chatbot/instance/sync-status').then(r => r.data),
    enabled: isConnected,
    refetchInterval: isConnected ? 5000 : false,
  })

  const handleCloseModal = useCallback(() => {
    setShowQRModal(false)
    queryClient.invalidateQueries({ queryKey: ['chatbot-instance'] })
    queryClient.invalidateQueries({ queryKey: ['chatbot-sync-status'] })
    queryClient.invalidateQueries({ queryKey: ['chatbot-conversations'] })
  }, [queryClient])

  return (
    <>
      {showQRModal && <WhatsAppQRModal onClose={handleCloseModal} />}

      <div className="p-6 h-full overflow-y-auto max-w-2xl space-y-5">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-800">Configurações do Chatbot</h2>
          <p className="text-sm text-slate-500 mt-1">Gerencie a conexão WhatsApp e configure o comportamento do chatbot.</p>
        </div>

        {/* ── Conexão WhatsApp ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Conexão WhatsApp</h3>
              <p className="text-xs text-slate-500 mt-0.5">Vincule um número ao chatbot via QR Code.</p>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Phone className="w-5 h-5 text-emerald-500" />
            </div>
          </div>

          {instanceLoading ? (
            <div className="flex items-center gap-3 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-500">Verificando status...</span>
            </div>
          ) : (
            <>
              {/* Status badge */}
              <div className="flex items-center gap-3 mb-4">
                {isConnected ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-semibold text-emerald-700">Conectado</span>
                  </div>
                ) : isConnecting ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                    <span className="text-xs font-semibold text-amber-700">Conectando...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-full">
                    <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Desconectado</span>
                  </div>
                )}
              </div>

              {/* Info quando conectado */}
              {isConnected && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 mb-4 space-y-3">
                  {/* Número e nome */}
                  {instance?.displayName && (
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-800 text-sm font-bold flex-shrink-0">
                        {instance.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">{instance.displayName}</p>
                        {instance.phoneNumber && (
                          <p className="text-[11px] text-emerald-600 font-mono">{instance.phoneNumber}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status da sincronização */}
                  <div className="border-t border-emerald-200 pt-2.5 space-y-2">
                    {syncData?.syncing ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin flex-shrink-0" />
                        <span className="text-xs text-emerald-700 font-medium">Sincronizando conversas do WhatsApp...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-xs text-emerald-700 font-semibold">
                            {syncData?.conversationCount ?? 0} conversas
                          </span>
                        </div>
                        {syncData?.syncedAt && (
                          <span className="text-[10px] text-emerald-600">
                            Sincronizado {new Date(syncData.syncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Barra de progresso ao sincronizar */}
                    {syncData?.syncing && (
                      <div className="w-full bg-emerald-200 rounded-full h-1">
                        <div className="h-1 bg-emerald-500 rounded-full animate-pulse w-2/3" />
                      </div>
                    )}
                  </div>

                  {instance?.connectedAt && (
                    <p className="text-[10px] text-emerald-600 border-t border-emerald-200 pt-2">
                      Conectado em {new Date(instance.connectedAt).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-2 flex-wrap">
                {!isConnected && (
                  <button
                    onClick={() => setShowQRModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow"
                  >
                    <QrCode className="w-4 h-4" />
                    {isConnecting ? 'Ver QR Code' : 'Conectar WhatsApp'}
                  </button>
                )}

                {isConnected && (
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-sm font-semibold transition-all"
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    Desconectar
                  </button>
                )}
              </div>

              {!isConnected && (
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  Clique em "Conectar WhatsApp" para abrir o QR Code e escanear com o aplicativo.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Configurações Avançadas ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Configurações Avançadas</h3>
            {settingsDirty && !savedFeedback && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Não salvo
              </span>
            )}
            {savedFeedback && (
              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Salvo
              </span>
            )}
          </div>

          {settingsLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-sm text-slate-500">Carregando configurações...</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Toggles */}
              {([
                { key: 'autoReply' as keyof ChatbotSettings, label: 'Resposta Automática', desc: 'Chatbot responde automaticamente às mensagens' },
                { key: 'queueEnabled' as keyof ChatbotSettings, label: 'Fila de Atendimento', desc: 'Organiza conversas em fila para atendimento humano' },
                { key: 'notificationsEnabled' as keyof ChatbotSettings, label: 'Notificações', desc: 'Receba alertas de novas conversas e mensagens' },
              ] as { key: keyof ChatbotSettings; label: string; desc: string }[]).map(field => (
                <div key={field.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{field.label}</p>
                    <p className="text-xs text-slate-400">{field.desc}</p>
                  </div>
                  <button
                    onClick={() => updateField({ [field.key]: !settingsForm[field.key] })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${settingsForm[field.key] ? 'bg-cyan-500' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settingsForm[field.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              ))}

              <hr className="border-slate-100" />

              {/* Grupos e Comunidades */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">Grupos e Comunidades</p>
                </div>
                <div className="space-y-3">
                  {([
                    {
                      key: 'replyGroups' as keyof ChatbotSettings,
                      label: 'Responder mensagens de grupos',
                      desc: 'Receber e visualizar mensagens de grupos do WhatsApp',
                    },
                    {
                      key: 'replyCommunities' as keyof ChatbotSettings,
                      label: 'Responder mensagens de comunidades',
                      desc: 'Receber e visualizar mensagens de comunidades do WhatsApp',
                    },
                  ] as { key: keyof ChatbotSettings; label: string; desc: string }[]).map(field => (
                    <div key={field.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium text-slate-700">{field.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{field.desc}</p>
                      </div>
                      <button
                        onClick={() => updateField({ [field.key]: !settingsForm[field.key] })}
                        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${settingsForm[field.key] ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settingsForm[field.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Horário de atendimento */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Horário de Atendimento</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Início</label>
                    <input
                      type="time"
                      value={settingsForm.businessHoursStart ?? '08:00'}
                      onChange={e => updateField({ businessHoursStart: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                    />
                  </div>
                  <span className="text-slate-400 mt-4">→</span>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Fim</label>
                    <input
                      type="time"
                      value={settingsForm.businessHoursEnd ?? '18:00'}
                      onChange={e => updateField({ businessHoursEnd: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {DAYS.map(d => (
                    <button
                      key={d.key}
                      onClick={() => {
                        const curr = settingsForm.businessDays ?? []
                        const next = curr.includes(d.key) ? curr.filter(x => x !== d.key) : [...curr, d.key]
                        updateField({ businessDays: next })
                      }}
                      className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${
                        (settingsForm.businessDays ?? []).includes(d.key)
                          ? 'bg-cyan-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-slate-100" />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem de Boas-vindas</label>
                <textarea
                  value={settingsForm.welcomeMessage ?? ''}
                  onChange={e => updateField({ welcomeMessage: e.target.value })}
                  rows={3}
                  placeholder="Olá! Bem-vindo à nossa clínica. Como posso ajudar? 😊"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <p className="text-xs text-slate-400 mt-1">Enviada automaticamente no primeiro contato do paciente.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem Fora do Horário</label>
                <textarea
                  value={settingsForm.offHoursMessage ?? ''}
                  onChange={e => updateField({ offHoursMessage: e.target.value })}
                  rows={3}
                  placeholder="Olá! No momento estamos fora do horário de atendimento. Retornamos em breve!"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prompt Global do Agente IA
                  <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">IA</span>
                </label>
                <textarea
                  value={settingsForm.aiSystemPrompt ?? ''}
                  onChange={e => updateField({ aiSystemPrompt: e.target.value })}
                  rows={4}
                  placeholder="Você é um assistente virtual da nossa clínica. Seja sempre cordial e objetivo..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <p className="text-xs text-slate-400 mt-1">Instrução base para todos os fluxos com Agente IA.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tamanho máximo da fila</label>
                <input
                  type="number" min={1} max={100}
                  value={settingsForm.maxQueueSize ?? 10}
                  onChange={e => updateField({ maxQueueSize: parseInt(e.target.value) || 10 })}
                  className="w-32 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                />
                <p className="text-xs text-slate-400 mt-1">Número máximo de conversas simultâneas na fila.</p>
              </div>

              <button
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending || !settingsDirty}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
              >
                {saveSettingsMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4" /> Salvar Configurações</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
