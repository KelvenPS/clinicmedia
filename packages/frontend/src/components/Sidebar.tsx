import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Users,
  DollarSign,
  UserCog,
  LogOut,
  ChevronRight,
  ChevronDown,
  Settings,
  ClipboardList,
  Brain,
  Bot,
  MessageSquare,
  Sparkles,
  Receipt,
  Video,
  Database,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
  CreditCard,
  Building2,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { useSecretaryPermissions } from '../hooks/useSecretaryPermissions'
import api from '../lib/api'
import ClinicLogo from './ui/ClinicLogo'

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  DOCTOR: 'Especialista',
  SECRETARY: 'Secretária',
}

const roleColor: Record<string, string> = {
  ADMIN: 'bg-violet-500/20 text-violet-300 border border-violet-500/20',
  DOCTOR: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20',
  SECRETARY: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20',
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItemProps {
  to: string
  icon: React.ElementType
  label: string
  collapsed: boolean
  badge?: React.ReactNode
}

function NavItem({ to, icon: Icon, label, collapsed, badge }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `sidebar-link group tooltip-trigger ${isActive ? 'active' : ''}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${
              isActive
                ? 'text-white'
                : 'text-slate-400 group-hover:text-white group-hover:scale-110'
            }`}
          />
          <span
            className="flex-1 overflow-hidden transition-all duration-300 whitespace-nowrap"
            style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
          >
            {label}
          </span>
          {badge && !collapsed && badge}
          {isActive && !collapsed && (
            <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0 animate-fade-in" />
          )}
          {collapsed && <span className="tooltip">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const { can } = useSecretaryPermissions()
  const navigate = useNavigate()
  const location = useLocation()
  const isChatbotRoute = location.pathname.startsWith('/chatbot')
  const [chatbotOpen, setChatbotOpen] = useState(isChatbotRoute)

  const { data: preRegistrations = [] } = useQuery<unknown[]>({
    queryKey: ['pre-registrations-count'],
    queryFn: () => api.get('/patients/pre-registrations').then(r => r.data),
    staleTime: 2 * 60 * 1000,
    retry: false,
  })
  const pendingCount = preRegistrations.length

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: undefined },
    { to: '/agenda', icon: Calendar, label: 'Agenda', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: undefined },
    { to: '/pacientes', icon: Users, label: 'Pacientes', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: undefined },
    { to: '/prontuario', icon: ClipboardList, label: 'Prontuário', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: undefined },
    { to: '/avaliacoes', icon: Brain, label: 'Avaliações', roles: ['ADMIN', 'DOCTOR'], secretaryPermission: undefined },
    { to: '/financeiro', icon: DollarSign, label: 'Financeiro', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: 'financeiro' as const },
    { to: '/usuarios', icon: UserCog, label: 'Usuários', roles: ['ADMIN'], secretaryPermission: undefined },
  ]

  const visibleItems = navItems.filter(item => {
    if (!user?.role) return false
    if (!item.roles.includes(user.role)) return false
    // For secretaries, items with a required permission need that permission granted
    if (user.role === 'SECRETARY' && item.secretaryPermission) {
      return can(item.secretaryPermission)
    }
    return true
  })

  const initials = user?.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside
      className="bg-slate-900 flex flex-col h-screen flex-shrink-0 overflow-hidden select-none"
      style={{
        width: collapsed ? 68 : 256,
        transition: 'width 0.32s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* ── Logo & Header ── */}
      <div className="px-2.5 py-3.5 border-b border-white/8 flex-shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between min-w-0">
            <ClinicLogo size="md" />
            <button
              onClick={onToggleCollapse}
              className="w-7 h-7 flex items-center justify-center
                         text-slate-400 hover:text-white hover:bg-white/10 rounded-lg
                         transition-all duration-150 flex-shrink-0 ml-1"
              title="Recolher sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between min-w-0">
            <ClinicLogo iconOnly size="sm" />
            <button
              onClick={onToggleCollapse}
              className="w-7 h-7 flex items-center justify-center
                         text-cyan-400 hover:text-white hover:bg-cyan-500/20 rounded-lg
                         transition-all duration-150 flex-shrink-0"
              title="Expandir sidebar"
            >
              <PanelLeft className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-none">
        {!collapsed && (
          <p className="section-label mb-3">Menu Principal</p>
        )}
        {visibleItems.map(({ to, icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={label}
            collapsed={collapsed}
            badge={
              to === '/pacientes' && pendingCount > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-amber-500 text-white rounded-full leading-none">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : undefined
            }
          />
        ))}

        {/* ── Automação ── */}
        {(can('chatbot_light') || can('chatbot_agente')) && (
        <div className={`${collapsed ? 'mt-3 pt-3' : 'mt-5 pt-4'} border-t border-white/8`}>
          {!collapsed && (
            <p className="section-label mb-2">WhatsApp</p>
          )}

          {/* Chatbot — expandable in expanded mode, direct nav in collapsed */}
          {collapsed ? (
            <NavLink
              to={can('chatbot_light') ? '/chatbot/light' : '/chatbot/agente'}
              className={({ isActive: _ }) =>
                `sidebar-link group tooltip-trigger ${isChatbotRoute ? 'active' : ''}`
              }
            >
              <Bot className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${isChatbotRoute ? 'text-white' : 'text-slate-400 group-hover:text-white group-hover:scale-110'}`} />
              <span className="tooltip">Chatbot</span>
            </NavLink>
          ) : (
            <div>
              {/* Parent toggle button */}
              <button
                onClick={() => setChatbotOpen(o => !o)}
                className={`sidebar-link group w-full text-left ${isChatbotRoute ? 'active' : ''}`}
              >
                <Bot className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${isChatbotRoute ? 'text-white' : 'text-slate-400 group-hover:text-white group-hover:scale-110'}`} />
                <span className="flex-1 overflow-hidden whitespace-nowrap">Chatbot</span>
                <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-md font-semibold border border-cyan-500/20 mr-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse-soft" />
                  NOVO
                </span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${chatbotOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Sub-items */}
              {chatbotOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-3 pb-1">
                  {can('chatbot_light') && (
                  <NavLink
                    to="/chatbot/light"
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/6'
                      }`
                    }
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span>Chatbot Light</span>
                  </NavLink>
                  )}
                  {can('chatbot_agente') && (
                  <NavLink
                    to="/chatbot/agente"
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/6'
                      }`
                    }
                  >
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    <span>Agente Clínico</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* ── Minhas Salas (secretária) ── */}
        {user?.role === 'SECRETARY' && (
          <div className={`${collapsed ? 'mt-3 pt-3' : 'mt-4 pt-4'} border-t border-white/8`}>
            {!collapsed && (
              <p className="section-label mb-2">Atendimento</p>
            )}
            <NavItem to="/minhas-salas" icon={Building2} label="Minhas Salas" collapsed={collapsed} />
          </div>
        )}

        {/* ── NFS-e ── */}
        {can('nota_fiscal') && (
        <div className={`${collapsed ? 'mt-3 pt-3' : 'mt-3 pt-3'} border-t border-white/8`}>
          {!collapsed && (
            <p className="section-label mb-2">Nota Fiscal</p>
          )}
          <NavItem
            to="/nota-fiscal"
            icon={Receipt}
            label="NFS-e"
            collapsed={collapsed}
            badge={
              <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-medium border border-amber-500/20">
                EM BREVE
              </span>
            }
          />
        </div>
        )}

        {/* ── Teleconsulta ── */}
        {can('teleconsulta') && (
        <div className={`mt-0.5`}>
          {!collapsed && (
            <p className="section-label mb-2 mt-3">Consulta Online</p>
          )}
          <NavItem
            to="/consulta-online"
            icon={Video}
            label="Teleconsulta"
            collapsed={collapsed}
            badge={
              <span className="text-xs bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-md font-medium border border-violet-500/20">
                EM BREVE
              </span>
            }
          />
        </div>
        )}

        {/* ── Admin ── */}
        {user?.role === 'ADMIN' && (
          <div className={`${collapsed ? 'mt-3 pt-3' : 'mt-4 pt-4'} border-t border-white/8`}>
            {!collapsed && (
              <p className="section-label mb-2">Admin</p>
            )}
            <NavItem to="/admin/gestao" icon={ShieldCheck} label="Gestão" collapsed={collapsed} />
            <NavItem to="/admin/planos" icon={CreditCard} label="Planos" collapsed={collapsed} />
            <NavItem to="/admin/sql" icon={Database} label="SQL Admin" collapsed={collapsed} />
          </div>
        )}
      </nav>

      {/* ── Settings ── */}
      <div className="px-2 pb-2 border-t border-white/8 pt-2">
        <NavItem to="/configuracoes/perfil" icon={Settings} label="Configurações" collapsed={collapsed} />
      </div>

      {/* ── User info ── */}
      <div className="p-3 flex-shrink-0 border-t border-white/8">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'mb-2.5'}`}>
          <div
            className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0
                        shadow-lg shadow-blue-700/30 ring-2 ring-blue-800"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            )}
          </div>
          <div
            className="flex-1 min-w-0 overflow-hidden transition-all duration-300"
            style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '200px' }}
          >
            <p className="text-white text-xs font-semibold truncate leading-tight">{user?.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user?.role ? roleColor[user.role] : ''}`}>
              {user?.role ? roleLabel[user.role] : ''}
            </span>
          </div>
        </div>

        {!collapsed ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2
                       text-slate-400 hover:text-red-400 hover:bg-red-500/10
                       rounded-xl transition-all duration-200 text-sm group"
          >
            <LogOut className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            <span>Sair do sistema</span>
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center p-2 mt-1
                       text-slate-400 hover:text-red-400 hover:bg-red-500/10
                       rounded-xl transition-all duration-200 tooltip-trigger relative"
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
