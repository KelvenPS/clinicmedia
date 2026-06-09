import { useState } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import { Menu, X, ChevronRight, Home } from 'lucide-react'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'
import NotificationBell from './NotificationBell'
import SubscriptionGate from './SubscriptionGate'
import PageTransition from './ui/PageTransition'
import { useAuthStore } from '../store/authStore'

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  agenda: 'Agenda',
  pacientes: 'Pacientes',
  prontuario: 'Prontuário',
  avaliacoes: 'Avaliações',
  financeiro: 'Financeiro',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
  perfil: 'Perfil',
  'plano-financeiro': 'Plano',
  equipe: 'Equipe',
  ajuda: 'Ajuda',
  documentacao: 'Documentação',
  'tipos-atendimento': 'Tipos de Atendimento',
  salas: 'Salas',
  documentos: 'Documentos',
  'formas-pagamento': 'Formas de Pagamento',
  planos: 'Planos',
  notificacoes: 'Notificações',
  integracoes: 'Integrações',
  chatbot: 'Chatbot IA',
  'nota-fiscal': 'NFS-e',
  'consulta-online': 'Teleconsulta',
  admin: 'Admin',
  sql: 'SQL Admin',
  gestao: 'Gestão',
}

function Breadcrumbs() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)

  if (parts.length === 0) return null

  const crumbs = parts.map((part, i) => ({
    label: ROUTE_LABELS[part] || part,
    path: '/' + parts.slice(0, i + 1).join('/'),
    isLast: i === parts.length - 1,
  }))

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      <NavLink to="/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
        <Home className="w-3.5 h-3.5" />
      </NavLink>
      {crumbs.map(({ label, path, isLast }) => (
        <span key={path} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          {isLast ? (
            <span className="font-semibold text-slate-700 truncate">{label}</span>
          ) : (
            <NavLink
              to={path}
              className="text-slate-400 hover:text-slate-600 transition-colors truncate"
            >
              {label}
            </NavLink>
          )}
        </span>
      ))}
    </nav>
  )
}

export default function Layout() {
  const location = useLocation()
  const isSettings = location.pathname.startsWith('/configuracoes')
  const { user } = useAuthStore()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = user?.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  const sidebarWidth = sidebarCollapsed ? 68 : 256

  return (
    <SubscriptionGate>
      <div className="flex h-screen bg-slate-50 overflow-hidden">

        {/* ── Mobile overlay ── */}
        {mobileOpen && (
          <div
            className="overlay lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Desktop sidebar (smooth collapse) ── */}
        <div
          className="relative hidden lg:block flex-shrink-0 transition-all duration-300 ease-spring"
          style={{ width: sidebarWidth }}
        >
          <div
            className={`absolute inset-0 transition-all duration-300 ${isSettings ? 'opacity-0 pointer-events-none translate-x-[-10px]' : 'opacity-100 translate-x-0'}`}
          >
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />
          </div>
          <div
            className={`absolute inset-0 transition-all duration-300 ${isSettings ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none translate-x-[10px]'}`}
          >
            <SettingsSidebar />
          </div>
        </div>

        {/* ── Mobile sidebar drawer ── */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 lg:hidden
            transition-transform duration-300 ease-spring
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          style={{ width: 256 }}
        >
          {isSettings ? (
            <SettingsSidebar />
          ) : (
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
            />
          )}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Top bar */}
          <header className="h-14 bg-white border-b border-slate-200/80 flex items-center px-4 gap-3 flex-shrink-0 shadow-sm shadow-slate-200/50">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100
                         active:scale-90 transition-all duration-150"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Abrir menu"
            >
              {mobileOpen
                ? <X className="w-5 h-5" />
                : <Menu className="w-5 h-5" />
              }
            </button>

            {/* Breadcrumbs */}
            <div className="flex-1 min-w-0 hidden sm:block">
              <Breadcrumbs />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 ml-auto">
              <NotificationBell />
              <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center shadow shadow-blue-600/20">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </div>
          </main>
        </div>
      </div>
    </SubscriptionGate>
  )
}
