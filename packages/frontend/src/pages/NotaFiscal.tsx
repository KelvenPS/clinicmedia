import { Receipt, FileText, Building2, BarChart3, Puzzle, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'

const features = [
  { icon: FileText, label: 'Emissão de NFS-e', desc: 'Nota Fiscal de Serviços Eletrônica integrada com prefeituras', color: 'bg-amber-500/10 text-amber-600', border: 'border-amber-100' },
  { icon: Building2, label: 'Múltiplas prefeituras', desc: 'Suporte a diferentes padrões de emissão por município', color: 'bg-orange-500/10 text-orange-600', border: 'border-orange-100' },
  { icon: BarChart3, label: 'Relatórios fiscais', desc: 'Apuração mensal, DAS e controle de impostos automatizado', color: 'bg-amber-500/10 text-amber-600', border: 'border-amber-100' },
  { icon: Puzzle, label: 'Integração financeira', desc: 'Vinculação automática com consultas e recebimentos', color: 'bg-orange-500/10 text-orange-600', border: 'border-orange-100' },
]

const roadmap = [
  { label: 'Integração com prefeituras (ABRASF)', done: true },
  { label: 'Emissão automática pós-consulta', done: true },
  { label: 'Cancelamento e substituição de NFS-e', done: false },
  { label: 'Relatório mensal de competência', done: false },
  { label: 'Envio de nota por e-mail ao paciente', done: false },
]

export default function NotaFiscal() {
  return (
    <div className="max-w-3xl mx-auto animate-page-enter space-y-8">
      {/* Badge */}
      <div className="flex justify-center pt-2 animate-stagger-1">
        <span className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Em Desenvolvimento
        </span>
      </div>

      {/* Hero */}
      <div className="text-center space-y-4 animate-stagger-2">
        <div className="relative inline-block">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 rounded-3xl shadow-2xl shadow-amber-400/30 flex items-center justify-center mx-auto animate-float">
            <Receipt className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center">
            <Clock className="w-3 h-3 text-white" />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">NFS-e</h1>
          <p className="text-slate-500 mt-2 leading-relaxed max-w-lg mx-auto">
            Emissão de Notas Fiscais de Serviços integrada à plataforma.<br />
            Controle fiscal completo sem sair do ClinIQ Pro.
          </p>
        </div>

        {/* Progress bar */}
        <div className="max-w-sm mx-auto">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Progresso do módulo</span>
            <span className="font-semibold text-amber-600">40%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700 ease-out relative"
              style={{ width: '40%' }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] bg-[length:200%_100%] animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger-3">
        {features.map(({ icon: Icon, label, desc, color, border }, idx) => (
          <div
            key={label}
            className={`card-hover flex items-start gap-4 border ${border}`}
            style={{ animationDelay: `${idx * 0.06}s` }}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Roadmap */}
      <div className="card animate-stagger-4">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
          </div>
          <h2 className="font-semibold text-slate-900">Roadmap de desenvolvimento</h2>
        </div>
        <div className="space-y-3">
          {roadmap.map(({ label, done }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                done
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-300'
              }`}>
                {done && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
              </div>
              <span className={`text-sm ${done ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {label}
              </span>
              {!done && (
                <span className="ml-auto text-xs text-slate-300 font-medium">Em breve</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="card bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 animate-stagger-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-semibold text-amber-900">Quer ser avisado quando lançar?</p>
            <p className="text-sm text-amber-700 mt-0.5">Deixe seu interesse e te notificamos no lançamento</p>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-medium text-sm rounded-xl transition-all duration-150 shadow-sm"
          >
            Quero ser notificado
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 pb-4">
        Módulo disponível em uma próxima versão do ClinIQ Pro.
      </p>
    </div>
  )
}
