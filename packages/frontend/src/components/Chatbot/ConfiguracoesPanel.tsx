import { useState, useEffect } from 'react'
import { Phone, Wifi, WifiOff, QrCode, Loader2, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChatbotInstance, type ChatbotSettings } from '../../types/chatbot'
import api from '../../lib/api'

const DAYS = [
  { key: 'MON', label: 'Seg' }, { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' }, { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' }, { key: 'SAT', label: 'Sáb' },
  { key: 'SUN', label: 'Dom' },
]

export default function ConfiguracoesPanel() {
  const queryClient = useQueryClient()
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState<Partial<ChatbotSettings>>({})
  const [settingsDirty, setSettingsDirty] = useState(false)

  const { data: instance, isLoading: instanceLoading } = useQuery<ChatbotInstance>({
    queryKey: ['chatbot-instance'],
    queryFn: () => api.get('/chatbot/instance').then(r => r.data),
    retry: 1,
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
    },
  })

  const createInstanceMutation = useMutation({
    mutationFn: () => api.post('/chatbot/instance'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chatbot-instance'] }),
  })

  const getQrMutation = useMutation({
    mutationFn: () => api.get('/chatbot/instance/qr').then(r => r.data),
    onSuccess: (data) => setQrResult(data?.message || data?.qr || JSON.stringify(data)),
  })

  async function handleConnect() {
    try { await createInstanceMutation.mutateAsync() } catch { /* already exists */ }
    await getQrMutation.mutateAsync()
  }

  const isConnected = instance?.status === 'CONNECTED'
  const isConnecting = instance?.status === 'CONNECTING'

  return (
    <div className="p-6 h-full overflow-y-auto max-w-2xl space-y-5">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Configurações do Chatbot</h2>
        <p className="text-sm text-slate-500 mt-1">Gerencie a conexão WhatsApp e configure o comportamento do chatbot.</p>
      </div>

      {/* WhatsApp connection */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Conexão WhatsApp</h3>
            <p className="text-xs text-slate-500 mt-0.5">Conecte seu número de WhatsApp ao chatbot.</p>
          </div>
          <div className="p-2 bg-emerald-50 rounded-lg"><Phone className="w-5 h-5 text-emerald-500" /></div>
        </div>

        {instanceLoading ? (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            <span className="text-sm text-slate-500">Verificando...</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              {isConnected ? (
                <><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><Wifi className="w-4 h-4 text-emerald-500" /></div><span className="text-sm font-medium text-emerald-600">Conectado</span></>
              ) : isConnecting ? (
                <><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /><Loader2 className="w-4 h-4 text-amber-500 animate-spin" /></div><span className="text-sm font-medium text-amber-600">Conectando...</span></>
              ) : (
                <><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /><WifiOff className="w-4 h-4 text-slate-400" /></div><span className="text-sm font-medium text-slate-500">Desconectado</span></>
              )}
            </div>

            {isConnected && instance?.instanceKey && (
              <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chave da Instância</span>
                  <p className="text-xs font-mono text-slate-700 mt-0.5 break-all">{instance.instanceKey}</p>
                </div>
                {instance.webhookUrl && (
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Webhook URL</span>
                    <p className="text-xs font-mono text-slate-700 mt-0.5 break-all">{instance.webhookUrl}</p>
                  </div>
                )}
              </div>
            )}

            {qrResult && (
              <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <QrCode className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-cyan-700 mb-1">QR Code / Instrução</p>
                    <p className="text-xs text-cyan-700 leading-relaxed break-all font-mono">{qrResult}</p>
                  </div>
                </div>
              </div>
            )}

            {!isConnected && (
              <button
                onClick={handleConnect}
                disabled={createInstanceMutation.isPending || getQrMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {(createInstanceMutation.isPending || getQrMutation.isPending)
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</>
                  : <><QrCode className="w-4 h-4" /> Conectar WhatsApp</>
                }
              </button>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Quando conectado, escaneie o QR Code com seu WhatsApp para vincular o número ao chatbot.
            </p>
          </>
        )}
      </div>

      {/* Settings form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">Configurações Avançadas</h3>
          {settingsDirty && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Não salvo</span>
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
              { key: 'autoReply' as keyof ChatbotSettings, label: 'Resposta Automática', desc: 'Ativar chatbot para responder automaticamente' },
              { key: 'queueEnabled' as keyof ChatbotSettings, label: 'Fila de Atendimento', desc: 'Organizar conversas em fila para humanos' },
              { key: 'notificationsEnabled' as keyof ChatbotSettings, label: 'Notificações', desc: 'Receber notificações de novas conversas' },
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

            {/* Business hours */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Horário de Atendimento</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Início</label>
                  <input type="time" value={settingsForm.businessHoursStart ?? '08:00'}
                    onChange={e => updateField({ businessHoursStart: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                  />
                </div>
                <span className="text-slate-400 mt-4">→</span>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Fim</label>
                  <input type="time" value={settingsForm.businessHoursEnd ?? '18:00'}
                    onChange={e => updateField({ businessHoursEnd: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
                  />
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                {DAYS.map(d => (
                  <button key={d.key}
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
                rows={3} placeholder="Olá! Bem-vindo à nossa clínica. Como posso ajudar? 😊"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400"
              />
              <p className="text-xs text-slate-400 mt-1">Enviada ao primeiro contato do paciente.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mensagem Fora do Horário</label>
              <textarea
                value={settingsForm.offHoursMessage ?? ''}
                onChange={e => updateField({ offHoursMessage: e.target.value })}
                rows={3} placeholder="Olá! No momento estamos fora do horário de atendimento..."
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
                rows={4} placeholder="Você é um assistente virtual da nossa clínica..."
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
            </div>

            <button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending || !settingsDirty}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
            >
              {saveSettingsMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : <><Save className="w-4 h-4" /> Salvar Configurações</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
