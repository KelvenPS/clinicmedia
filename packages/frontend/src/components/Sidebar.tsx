import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Users,
  DollarSign,
  UserCog,
  LogOut,
  ChevronRight,
  Settings,
  ClipboardList,
  Brain,
  Zap,
  Bot,
  Receipt,
  Video,
  Database,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  DOCTOR: 'Especialista',
  SECRETARY: 'Secretária',
}

const roleColor: Record<string, string> = {
  ADMIN: 'bg-violet-500/20 text-violet-300',
  DOCTOR: 'bg-cyan-500/20 text-cyan-300',
  SECRETARY: 'bg-emerald-500/20 text-emerald-300',
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/agenda', icon: Calendar, label: 'Agenda', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/pacientes', icon: Users, label: 'Pacientes', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/prontuario', icon: ClipboardList, label: 'Prontuário', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/avaliacoes', icon: Brain, label: 'Avaliações', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/financeiro', icon: DollarSign, label: 'Financeiro', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/usuarios', icon: UserCog, label: 'Usuários', roles: ['ADMIN'] },
  ]

  const visibleItems = navItems.filter(item =>
    user?.role ? item.roles.includes(user.role) : false
  )

  const initials = user?.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside
      className="bg-slate-900 flex flex-col h-screen flex-shrink-0 overflow-hidden"
      style={{
        width: collapsed ? '68px' : '256px',
        transition: 'width 0.3s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Logo */}
      <div className="px-3 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-600/30 flex-shrink-0">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <div
            className="overflow-hidden transition-all duration-300"
            style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', whiteSpace: 'nowrap' }}
          >
            <h1 className="text-white font-bold text-base leading-tight tracking-tight">ClinIQ</h1>
            <p className="text-cyan-400 text-xs font-medium">Pro</p>
          </div>
          {/* Collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="ml-auto p-1 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg
                       transition-all duration-150 flex-shrink-0"
            title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            {collapsed
              ? <PanelLeft className="w-4 h-4" />
              : <PanelLeftClose className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-none">
        {!collapsed && (
          <p className="section-label mb-3">Menu Principal</p>
        )}
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span
                  className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                  style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                >
                  {label}
                </span>
                {isActive && !collapsed && <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0" />}
                {/* Tooltip on collapsed */}
                {collapsed && (
                  <span className="tooltip">{label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Automação */}
        <div className={`${collapsed ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-white/10`}>
          {!collapsed && (
            <p className="section-label mb-2">Automação</p>
          )}
          <NavLink
            to="/chatbot"
            className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Bot className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span
                  className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                  style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                >
                  Chatbot IA
                </span>
                {!collapsed && (
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-md font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse-soft" />
                    NOVO
                  </span>
                )}
                {collapsed && <span className="tooltip">Chatbot IA</span>}
              </>
            )}
          </NavLink>
        </div>

        {/* NFS-e */}
        <div className={`${collapsed ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-white/10`}>
          {!collapsed && (
            <p className="section-label mb-2">Nota Fiscal</p>
          )}
          <NavLink
            to="/nota-fiscal"
            className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Receipt className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span
                  className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                  style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                >
                  NFS-e
                </span>
                {!collapsed && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-medium">
                    EM BREVE
                  </span>
                )}
                {collapsed && <span className="tooltip">NFS-e</span>}
              </>
            )}
          </NavLink>
        </div>

        {/* Teleconsulta */}
        <div className={`${collapsed ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-white/10`}>
          {!collapsed && (
            <p className="section-label mb-2">Consulta Online</p>
          )}
          <NavLink
            to="/consulta-online"
            className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Video className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span
                  className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                  style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                >
                  Teleconsulta
                </span>
                {!collapsed && (
                  <span className="text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-md font-medium">
                    EM BREVE
                  </span>
                )}
                {collapsed && <span className="tooltip">Teleconsulta</span>}
              </>
            )}
          </NavLink>
        </div>

        {/* Admin */}
        {user?.role === 'ADMIN' && (
          <div className={`${collapsed ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-white/10`}>
            {!collapsed && (
              <p className="section-label mb-2">Admin</p>
            )}
            <NavLink
              to="/admin/sql"
              className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <Database className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                  <span
                    className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                    style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
                  >
                    SQL Admin
                  </span>
                  {collapsed && <span className="tooltip">SQL Admin</span>}
                </>
              )}
            </NavLink>
          </div>
        )}
      </nav>

      {/* Settings */}
      <div className="px-2 pb-2">
        <NavLink
          to="/configuracoes/perfil"
          className={({ isActive }) => `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
              <span
                className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
                style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
              >
                Configurações
              </span>
              {isActive && !collapsed && <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0" />}
              {collapsed && <span className="tooltip">Configurações</span>}
            </>
          )}
        </NavLink>
      </div>

      {/* User info */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'mb-2'}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-700/30">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          <div
            className="flex-1 min-w-0 overflow-hidden transition-all duration-300"
            style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
          >
            <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user?.role ? roleColor[user.role] : ''}`}>
              {user?.role ? roleLabel[user.role] : ''}
            </span>
          </div>
        </div>
        {!collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-400
                       hover:bg-red-500/10 rounded-xl transition-all duration-200 text-sm"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sair do sistema</span>
          </button>
        )}
        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2 mt-1 text-slate-400
                       hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200
                       tooltip-trigger relative"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            <span className="tooltip">Sair</span>
          </button>
        )}
      </div>
    </aside>
  )
}
