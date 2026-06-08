import { Bell, Calendar, CheckCircle, DollarSign, Info } from 'lucide-react'

const NOTIFICATION_TYPES = [
  { icon: Calendar, label: 'Novo agendamento', description: 'Quando um novo agendamento é criado na sua agenda', color: 'text-blue-600', bg: 'bg-blue-50' },
  { icon: CheckCircle, label: 'Atendimento concluído', description: 'Quando um atendimento é marcado como concluído', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { icon: DollarSign, label: 'Lançamento financeiro', description: 'Quando um valor é lançado no módulo financeiro', color: 'text-amber-600', bg: 'bg-amber-50' },
]

export default function ConfigNotificacoes() {
  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Notificações</h1>
        <p className="page-subtitle">Gerencie seus alertas e notificações do sistema</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Notificações in-app</h3>
            <p className="text-sm text-slate-500">Alertas visíveis no ícone do sininho no topo da tela</p>
          </div>
        </div>

        <div className="space-y-3">
          {NOTIFICATION_TYPES.map(n => {
            const Icon = n.icon
            return (
              <div key={n.label} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                <div className={`w-9 h-9 rounded-lg ${n.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${n.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{n.label}</p>
                  <p className="text-xs text-slate-400">{n.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors peer" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-1">Notificações para pacientes</p>
          <p>Notificações automáticas para pacientes via SMS ou email estarão disponíveis em breve. Acompanhe as atualizações da plataforma.</p>
        </div>
      </div>
    </div>
  )
}
