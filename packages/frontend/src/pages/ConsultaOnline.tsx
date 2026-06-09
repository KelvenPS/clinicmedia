import { Video, Calendar, Shield, Link, MessageSquare, Clock, CheckCircle2, ArrowRight, Play, Users } from 'lucide-react'

const features = [
  { icon: Calendar, label: 'Agendamento integrado', desc: 'Consultas online vinculadas diretamente à agenda do médico', color: 'bg-violet-500/10 text-violet-600' },
  { icon: Shield, label: 'Sala virtual segura', desc: 'Videoconferência criptografada e em conformidade com LGPD/CFM', color: 'bg-purple-500/10 text-purple-600' },
  { icon: Link, label: 'Link de acesso único', desc: 'Paciente entra com um clique, sem instalação ou cadastro', color: 'bg-indigo-500/10 text-indigo-600' },
  { icon: MessageSquare, label: 'Chat e prontuário simultâneos', desc: 'Preencha prontuário enquanto realiza o atendimento em vídeo', color: 'bg-violet-500/10 text-violet-600' },
]

const stats = [
  { value: '~Q3 2025', label: 'Previsão de lançamento' },
  { value: 'CFM', label: 'Compliance médico' },
  { value: 'LGPD', label: 'Proteção de dados' },
  { value: '4K', label: 'Qualidade de vídeo' },
]

const roadmap = [
  { label: 'Infraestrutura de videoconferência', done: true },
  { label: 'Integração com agenda', done: true },
  { label: 'Sala virtual segura (LGPD)', done: false },
  { label: 'Chat em tempo real durante consulta', done: false },
  { label: 'Preenchimento de prontuário simultâneo', done: false },
]

export default function ConsultaOnline() {
  return (
    <div className="max-w-3xl mx-auto animate-page-enter space-y-8">
      {/* Badge */}
      <div className="flex justify-center pt-2 animate-stagger-1">
        <span className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          Em Desenvolvimento
        </span>
      </div>

      {/* Hero */}
      <div className="text-center space-y-5 animate-stagger-2">
        <div className="relative inline-block">
          <div className="w-24 h-24 bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 rounded-3xl shadow-2xl shadow-violet-500/30 flex items-center justify-center mx-auto animate-float">
            <Video className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-violet-400 rounded-full border-2 border-white flex items-center justify-center">
            <Play className="w-3 h-3 text-white fill-white" />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Teleconsulta</h1>
          <p className="text-slate-500 mt-2 leading-relaxed max-w-lg mx-auto">
            Sala virtual segura e prontuário em tempo real durante o atendimento.<br />
            Conformidade com CFM e LGPD.
          </p>
        </div>

        {/* Progress bar */}
        <div className="max-w-sm mx-auto">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Progresso do módulo</span>
            <span className="font-semibold text-violet-600">30%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-700 ease-out relative"
              style={{ width: '30%' }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] bg-[length:200%_100%] animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-stagger-3">
        {stats.map(({ value, label }) => (
          <div key={label} className="card text-center py-4">
            <p className="text-lg font-bold text-violet-700">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger-3">
        {features.map(({ icon: Icon, label, desc, color }, idx) => (
          <div
            key={label}
            className="card-hover flex items-start gap-4"
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
          <div className="w-7 h-7 bg-violet-50 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-violet-600" />
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
      <div className="card bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200 animate-stagger-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-violet-900">Junte-se à lista de interesse</p>
              <p className="text-sm text-violet-700 mt-0.5">Seja o primeiro a usar quando lançar</p>
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white font-medium text-sm rounded-xl transition-all duration-150 shadow-sm"
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
