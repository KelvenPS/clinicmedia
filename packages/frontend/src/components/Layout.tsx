import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, ChevronRight, Home, Settings, LogOut, User as UserIcon } from 'lucide-react'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'
import NotificationBell from './NotificationBell'
import SubscriptionGate from './SubscriptionGate'
import PageTransition from './ui/PageTransition'
import SettingsMobileNav from './SettingsMobileNav'
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
    <nav className="flex items-center gap-1 text-sm min-w-0 animate-fade-in">
      <NavLink
        to="/dashboard"
        className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 p-0.5 rounded-md hover:bg-slate-100"
      >
        <Home className="w-3.5 h-3.5" />
      </NavLink>
      {crumbs.map(({ label, path, isLast }) => (
        <span key={path} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          {isLast ? (
            <span className="font-semibold text-slate-700 truncate max-w-[180px]">{label}</span>
          ) : (
            <NavLink
              to={path}
              className="text-slate-400 hover:text-slate-600 transition-colors truncate hover:underline underline-offset-2 max-w-[120px]"
            >
              {label}
            </NavLink>
          )}
        </span>
      ))}
    </nav>
  )
}

function UserDropdown({ user, onLogout }: { user: { name: string; role: string } | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const initials = user?.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl
                   hover:bg-slate-100 active:bg-slate-200
                   transition-all duration-150 group"
        aria-label="Menu do usuário"
      >
        <div className={`
          w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full
          flex items-center justify-center shadow shadow-blue-600/25
          transition-transform duration-150 group-hover:scale-105
          ${open ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
        `}>
          <span className="text-white text-xs font-bold leading-none">{initials}</span>
        </div>
        <span className="hidden md:block text-sm font-medium text-slate-700 max-w-[100px] truncate">
          {user?.name?.split(' ')[0]}
        </span>
      </button>

      {open && (
        <div className="dropdown-menu w-56">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'DOCTOR' ? 'Especialista' : 'Secretária'}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <button
              onClick={() => { navigate('/configuracoes/perfil'); setOpen(false) }}
              className="dropdown-item w-full"
            >
              <UserIcon className="w-4 h-4 text-slate-400" />
              Meu Perfil
            </button>
            <button
              onClick={() => { navigate('/configuracoes/perfil'); setOpen(false) }}
              className="dropdown-item w-full"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Configurações
            </button>
          </div>

          <div className="border-t border-slate-100 py-1.5">
            <button
              onClick={() => { onLogout(); setOpen(false) }}
              className="dropdown-item danger w-full"
            >
              <LogOut className="w-4 h-4" />
              Sair do sistema
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const isSettings = location.pathname.startsWith('/configuracoes')
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarWidth = sidebarCollapsed ? 68 : 256

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Fecha mobile menu ao navegar
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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

        {/* ── Desktop sidebar ── */}
        <div
          className="relative hidden lg:block flex-shrink-0"
          style={{
            width: sidebarWidth,
            transition: 'width 0.3s cubic-bezier(.22,1,.36,1)',
          }}
        >
          <div
            className={`absolute inset-0 transition-all duration-300 ${
              isSettings
                ? 'opacity-0 pointer-events-none -translate-x-2'
                : 'opacity-100 translate-x-0'
            }`}
          >
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />
          </div>
          <div
            className={`absolute inset-0 transition-all duration-300 ${
              isSettings
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 pointer-events-none translate-x-2'
            }`}
          >
            <SettingsSidebar />
          </div>
        </div>

        {/* ── Mobile sidebar drawer ── */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 lg:hidden
            transition-transform duration-300 ease-spring
            ${mobileOpen ? 'translate-x-0 animate-drawer-in' : '-translate-x-full'}
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
          <header className="h-14 header-glass flex items-center px-4 gap-3 flex-shrink-0 z-30">

            {/* Mobile hamburger */}
            <button
              className="lg:hidden btn-icon"
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              <span
                className="block transition-all duration-200"
                style={{ transform: mobileOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </span>
            </button>

            {/* Breadcrumbs */}
            <div className="flex-1 min-w-0 hidden sm:block">
              <Breadcrumbs />
            </div>

            {/* Mobile title */}
            <div className="flex-1 sm:hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {ROUTE_LABELS[location.pathname.split('/').pop() || ''] || 'ClinIQ Pro'}
              </p>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <NotificationBell />
              <UserDropdown user={user} onLogout={handleLogout} />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto w-full">
              {isSettings && <SettingsMobileNav />}
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
