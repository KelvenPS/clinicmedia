import { Receipt, FileText, Building2, BarChart3, Puzzle, Clock } from 'lucide-react'

const features = [
  { icon: FileText, label: 'Emissão de NFS-e', desc: 'Nota Fiscal de Serviços Eletrônica integrada com prefeituras' },
  { icon: Building2, label: 'Múltiplas prefeituras', desc: 'Suporte a diferentes padrões de emissão por município' },
  { icon: BarChart3, label: 'Relatórios fiscais', desc: 'Apuração mensal, DAS e controle de impostos automatizado' },
  { icon: Puzzle, label: 'Integração financeira', desc: 'Vinculação automática com consultas e recebimentos' },
]

export default function NotaFiscal() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Badge */}
      <div className="flex justify-center mb-8">
        <span className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5" />
          Em Desenvolvimento
        </span>
      </div>

      {/* Hero */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg shadow-amber-400/30 mb-5">
          <Receipt className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Nota Fiscal</h1>
        <p className="text-slate-500 leading-relaxed">
          Emissão de Notas Fiscais de Serviços integrada à plataforma.<br />
          Controle fiscal completo sem sair do ClinIQ Pro.
        </p>
      </div>

      {/* Features coming */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">O que vem por aí</h2>
        <div className="space-y-4">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-amber-600" />
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
