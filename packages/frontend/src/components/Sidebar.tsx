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

export default function Sidebar() {
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
    <aside className="w-64 bg-slate-900 flex flex-col h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-600/30">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight tracking-tight">ClinIQ</h1>
            <p className="text-cyan-400 text-xs font-medium">Pro</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
          Menu Principal
        </p>
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
              </>
            )}
          </NavLink>
        ))}

        {/* Automação */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Automação
          </p>
          <NavLink
            to="/chatbot"
            className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Bot className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="flex-1">Chatbot IA</span>
                <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-medium">
                  NOVO
                </span>
              </>
            )}
          </NavLink>
        </div>

        {/* Nota Fiscal */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Nota Fiscal
          </p>
          <NavLink
            to="/nota-fiscal"
            className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Receipt className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="flex-1">NFS-e</span>
                <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                  EM BREVE
                </span>
              </>
            )}
          </NavLink>
        </div>

        {/* Consulta Online */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
            Consulta Online
          </p>
          <NavLink
            to="/consulta-online"
            className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Video className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                <span className="flex-1">Teleconsulta</span>
                <span className="text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-medium">
                  EM BREVE
                </span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

      {/* Settings button */}
      <div className="px-3 pb-2">
        <NavLink
          to="/configuracoes/perfil"
          className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <Settings className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
              <span className="flex-1">Configurações</span>
              {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
            </>
          )}
        </NavLink>
      </div>

      {/* User info */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user?.role ? roleColor[user.role] : ''}`}>
              {user?.role ? roleLabel[user.role] : ''}
            </span>
          </div>
        </div>
        {user?.specialty && (
          <p className="text-slate-500 text-xs mb-3 truncate">{user.specialty}</p>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair do sistema</span>
        </button>
      </div>
    </aside>
  )
}
