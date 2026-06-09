import { Video, Calendar, Shield, Link, MessageSquare, Clock } from 'lucide-react'

const features = [
  { icon: Calendar, label: 'Agendamento integrado', desc: 'Consultas online vinculadas diretamente à agenda do médico' },
  { icon: Shield, label: 'Sala virtual segura', desc: 'Videoconferência criptografada e em conformidade com LGPD/CFM' },
  { icon: Link, label: 'Link de acesso único', desc: 'Paciente entra com um clique, sem instalação ou cadastro' },
  { icon: MessageSquare, label: 'Chat e prontuário simultâneos', desc: 'Preencha prontuário enquanto realiza o atendimento em vídeo' },
]

export default function ConsultaOnline() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Badge */}
      <div className="flex justify-center mb-8">
        <span className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" />
          Em Desenvolvimento
        </span>
      </div>

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg shadow-violet-500/30 mb-5">
          <Video className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Consulta Online</h1>
        <p className="text-slate-500 leading-relaxed">
          Teleconsulta integrada à plataforma, com sala virtual segura<br />
          e prontuário preenchido em tempo real durante o atendimento.
        </p>
      </div>

      {/* Features coming */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">O que vem por aí</h2>
        <div className="space-y-4">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">
        Este módulo será disponibilizado em uma próxima versão do ClinIQ Pro.
      </p>
    </div>
  )
}
