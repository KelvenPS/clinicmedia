import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Settings2,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const PAINEL_SECTIONS = [
  {
    label: 'Painel',
    items: [
      { to: '/financeiro/resumo', label: 'Resumo' },
      { to: '/financeiro/fluxo-caixa', label: 'Fluxo de caixa' },
    ],
  },
  {
    label: 'Transações',
    items: [
      { to: '/financeiro/extrato', label: 'Extrato' },
      { to: '/financeiro/receitas', label: 'Receitas' },
      { to: '/financeiro/despesas', label: 'Despesas' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/financeiro/analise-receitas', label: 'Análise de receitas' },
      { to: '/financeiro/analise-despesas', label: 'Análise de despesas' },
    ],
  },
]

const CONFIG_SECTION = {
  label: 'Configurações',
  items: [
    { to: '/financeiro/categorias', label: 'Categorias financeiras' },
    { to: '/financeiro/contas-bancarias', label: 'Contas bancárias' },
    { to: '/financeiro/centros-custo', label: 'Centros de custo' },
    { to: '/financeiro/outras-configuracoes', label: 'Outras configurações' },
  ],
}

export default function FinanceiroSidebar() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isSecretary = user?.role === 'SECRETARY'
  const sections = isSecretary ? PAINEL_SECTIONS : [...PAINEL_SECTIONS, CONFIG_SECTION]

  const initials = user?.name
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-screen flex-shrink-0 select-none">
      <div className="px-4 py-4 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600/20 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <DollarSign className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm leading-tight">Financeiro</h1>
              <p className="text-slate-500 text-xs mt-0.5">Painel Financeiro</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-150"
            title="Voltar ao sistema"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-4 scrollbar-none">
        {sections.map(({ label, items }) => (
          <div key={label}>
            <p className="section-label mb-2 text-slate-500 px-2">{label}</p>
            <div className="space-y-0.5">
              {items.map(({ to, label: itemLabel }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex-1 text-sm">{itemLabel}</span>
                      {isActive && (
                        <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 animate-fade-in" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/8 p-3 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors duration-150">
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 shadow-md shadow-emerald-700/30">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold leading-none">{initials}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-snug">{user?.name}</p>
            <p className="text-slate-500 text-xs truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
