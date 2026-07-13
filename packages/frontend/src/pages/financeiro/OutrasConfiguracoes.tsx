import { useNavigate } from 'react-router-dom'
import {
  DollarSign,
  CreditCard,
  HeartPulse,
  ArrowRight,
  Info,
  Repeat,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'

export default function OutrasConfiguracoes() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6 page-stagger">
      <PageHeader
        title="Outras Configurações"
        subtitle="Configurações gerais do módulo financeiro"
      />

      {/* Moeda */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Moeda Padrão</h3>
            <p className="text-sm text-slate-500 mt-1">
              O sistema utiliza <strong>BRL (R$ — Real Brasileiro)</strong> como moeda padrão para todas as transações financeiras.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-full">
              <DollarSign className="w-3.5 h-3.5" />
              BRL — Real Brasileiro
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Configurações Relacionadas</h2>

        <button
          onClick={() => navigate('/configuracoes/formas-pagamento')}
          className="w-full card-hover flex items-center gap-4 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Formas de Pagamento</p>
            <p className="text-xs text-slate-400 mt-0.5">PIX, cartão, transferência, dinheiro e outras formas</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>

        <button
          onClick={() => navigate('/configuracoes/plano-financeiro')}
          className="w-full card-hover flex items-center gap-4 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Planos de Saúde</p>
            <p className="text-xs text-slate-400 mt-0.5">Convênios, tabelas e valores por plano</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      </div>

      {/* Repasse automático info */}
      <div className="card border border-blue-100 bg-blue-50/40">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-900">Lançamento Financeiro</h3>
            <p className="text-sm text-blue-700/80 mt-1 leading-relaxed">
              O lançamento financeiro é feito ao clicar em <strong>Cobrar</strong> na consulta. O valor de repasse usa truncamento para manter a precisão: 60,469 → 60,46.
            </p>
            <div className="mt-3 flex items-start gap-2 bg-white/60 rounded-xl p-3 border border-blue-100">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Para configurar o valor padrão por tipo de atendimento, acesse
                {' '}<button onClick={() => navigate('/configuracoes/tipos-atendimento')} className="underline font-medium">Tipos de Atendimento</button>.
                Para configurar valores por plano de saúde, acesse
                {' '}<button onClick={() => navigate('/configuracoes/plano-financeiro')} className="underline font-medium">Planos de Saúde</button>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* General info */}
      <div className="card border border-slate-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sobre o Módulo Financeiro</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                Todas as transações são vinculadas ao médico/clínica cadastrado no sistema
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                Receitas e despesas podem ser lançadas manualmente ou geradas automaticamente via agenda
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                O extrato pode ser exportado em CSV para importação em outros sistemas contábeis
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                Relatórios de fluxo de caixa e análises estão disponíveis no menu lateral
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
