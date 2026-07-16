import { useState } from 'react'
import { Bell, Calendar, CheckCircle, DollarSign, Info, Smartphone } from 'lucide-react'

const NOTIFICATION_TYPES = [
  { icon: Calendar, label: 'Novo agendamento', description: 'Quando um novo agendamento é criado na sua agenda', color: 'text-blue-600', bg: 'bg-blue-50' },
  { icon: CheckCircle, label: 'Atendimento concluído', description: 'Quando um atendimento é marcado como concluído', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { icon: DollarSign, label: 'Lançamento financeiro', description: 'Quando um valor é lançado no módulo financeiro', color: 'text-amber-600', bg: 'bg-amber-50' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center w-10 h-5.5 rounded-full transition-all duration-200 ease-spring flex-shrink-0 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
      style={{ width: 40, height: 22 }}
    >
      <span
        className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-spring"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

export default function ConfigNotificacoes() {
  const [enabled, setEnabled] = useState([true, true, false])

  return (
    <div className="max-w-2xl mx-auto space-y-6 page-stagger">
      <div className="animate-stagger-1">
        <h1 className="page-title">Notificações</h1>
        <p className="page-subtitle">Gerencie seus alertas e notificações do sistema</p>
      </div>

      <div className="card space-y-5 animate-stagger-2">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Notificações in-app</h3>
            <p className="text-sm text-slate-500">Alertas visíveis no ícone do sininho no topo da tela</p>
          </div>
        </div>

        <div className="space-y-3">
          {NOTIFICATION_TYPES.map((n, idx) => {
            const Icon = n.icon
            return (
              <div
                key={n.label}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
                  enabled[idx]
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-white border-slate-100'
                }`}
                onClick={() => setEnabled(prev => prev.map((v, i) => i === idx ? !v : v))}
              >
                <div className={`w-9 h-9 rounded-xl ${n.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${n.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{n.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{n.description}</p>
                </div>
                <Toggle checked={enabled[idx]} onChange={v => setEnabled(prev => prev.map((pv, i) => i === idx ? v : pv))} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3 animate-stagger-3">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <Smartphone className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-sm text-blue-700">
          <p className="font-semibold mb-1">Notificações para pacientes</p>
          <p className="leading-relaxed">Notificações automáticas para pacientes via SMS ou email estarão disponíveis em breve. Acompanhe as atualizações da plataforma.</p>
        </div>
        <div className="ml-auto flex-shrink-0">
          <Info className="w-4 h-4 text-blue-400" />
        </div>
      </div>
    </div>
  )
}
