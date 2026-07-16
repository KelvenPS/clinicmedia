import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Settings, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { getVisibleSettingsNav } from '../config/settingsNav'
import { useSecretaryPermissions } from '../hooks/useSecretaryPermissions'

interface SettingsSidebarProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export default function SettingsSidebar({ collapsed = false, onToggleCollapse }: SettingsSidebarProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { permissions } = useSecretaryPermissions()
  const visible = getVisibleSettingsNav(user?.role, permissions)

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
              <div className="w-8 h-8 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/20 flex-shrink-0">
                <Settings className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-white font-semibold text-sm leading-tight truncate">Configurações</h1>
                <p className="text-slate-500 text-[11px]">Preferências</p>
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
              className="w-7 h-7 bg-blue-600/20 rounded-lg flex items-center justify-center border border-blue-500/20 cursor-pointer hover:bg-blue-600/30 transition-colors"
              title="Voltar ao Painel"
            >
              <Settings className="w-4 h-4 text-blue-400" />
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
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-none">
        {!collapsed && (
          <p className="section-label mb-3 text-slate-500">Opções</p>
        )}
        {visible.map(({ to, icon: Icon, label }) => (
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
                  {label}
                </span>
                {isActive && !collapsed && (
                  <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 animate-fade-in" />
                )}
                {collapsed && <span className="tooltip">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Footer Profile */}
      <div className="border-t border-white/8 p-3 flex-shrink-0">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors duration-150 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 shadow-md shadow-blue-700/30">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-semibold leading-none">{initials}</span>
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
