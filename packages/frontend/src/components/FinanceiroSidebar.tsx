import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  LineChart,
  Wallet,
  Tags,
  Building2,
  FolderTree,
  Settings2,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

interface FinanceiroSidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const PAINEL_SECTIONS = [
  {
    label: 'Painel',
    items: [
      { to: '/financeiro/resumo', label: 'Resumo', icon: LayoutDashboard },
      { to: '/financeiro/fluxo-caixa', label: 'Fluxo de caixa', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Transações',
    items: [
      { to: '/financeiro/extrato', label: 'Extrato', icon: Receipt },
      { to: '/financeiro/receitas', label: 'Receitas', icon: TrendingUp },
      { to: '/financeiro/despesas', label: 'Despesas', icon: TrendingDown },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/financeiro/analise-receitas', label: 'Análise de receitas', icon: BarChart3 },
      { to: '/financeiro/analise-despesas', label: 'Análise de despesas', icon: PieChart },
      { to: '/financeiro/analise-avancada', label: 'Análise avançada', icon: LineChart },
    ],
  },
]

const CONFIG_SECTION = {
  label: 'Configurações',
  items: [
    { to: '/financeiro/formas-pagamento', label: 'Formas de pagamento', icon: Wallet },
    { to: '/financeiro/categorias', label: 'Categorias financeiras', icon: Tags },
    { to: '/financeiro/contas-bancarias', label: 'Contas bancárias', icon: Building2 },
    { to: '/financeiro/centros-custo', label: 'Centros de custo', icon: FolderTree },
    { to: '/financeiro/outras-configuracoes', label: 'Outras configurações', icon: Settings2 },
  ],
}

export default function FinanceiroSidebar({ collapsed = false, onToggleCollapse }: FinanceiroSidebarProps) {
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
    <aside
      className="bg-slate-900 flex flex-col h-screen flex-shrink-0 select-none overflow-hidden"
      style={{
        width: collapsed ? 68 : 256,
        transition: 'width 0.32s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Header */}
      <div className="px-2.5 py-3.5 border-b border-white/8 flex-shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-emerald-600/20 rounded-xl flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-white font-bold text-sm leading-tight truncate">Financeiro</h1>
                <p className="text-slate-500 text-[11px]">Painel Financeiro</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-150"
                title="Voltar ao Painel"
              >
                <Home className="w-4 h-4" />
              </button>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-150"
                  title="Recolher sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between min-w-0">
            <div
              onClick={() => navigate('/dashboard')}
              className="w-7 h-7 bg-emerald-600/20 rounded-lg flex items-center justify-center border border-emerald-500/20 cursor-pointer hover:bg-emerald-600/30 transition-colors"
              title="Voltar ao Painel"
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="w-7 h-7 flex items-center justify-center text-cyan-400 hover:text-white hover:bg-cyan-500/20 rounded-lg transition-all duration-150"
                title="Expandir sidebar"
              >
                <PanelLeft className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-3 scrollbar-none">
        {sections.map(({ label, items }) => (
          <div key={label}>
            {!collapsed && (
              <p className="section-label mb-2 text-slate-500 px-2">{label}</p>
            )}
            <div className="space-y-0.5">
              {items.map(({ to, label: itemLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`w-4.5 h-4.5 flex-shrink-0 transition-all duration-200 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-white group-hover:scale-110'
                      }`} />
                      <span
                        className="flex-1 text-sm overflow-hidden transition-all duration-300 whitespace-nowrap"
                        style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                      >
                        {itemLabel}
                      </span>
                      {isActive && !collapsed && (
                        <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 animate-fade-in" />
                      )}
                      {collapsed && <span className="tooltip">{itemLabel}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Footer Profile */}
      <div className="border-t border-white/8 p-3 flex-shrink-0">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors duration-150 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 shadow-md shadow-emerald-700/30">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold leading-none">{initials}</span>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-snug">{user?.name}</p>
              <p className="text-slate-500 text-xs truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
