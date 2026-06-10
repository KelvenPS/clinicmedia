import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Settings, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { getVisibleSettingsNav } from '../config/settingsNav'

export default function SettingsSidebar() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const visible = getVisibleSettingsNav(user?.role)

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
            <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Settings className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm leading-tight">Configurações</h1>
              <p className="text-slate-500 text-xs mt-0.5">Preferências</p>
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

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-none">
        <p className="section-label mb-3 text-slate-500">Opções</p>
        {visible.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link group ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4.5 h-4.5 flex-shrink-0 transition-all duration-200 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-white group-hover:scale-110'
                }`} />
                <span className="flex-1 text-sm">{label}</span>
                {isActive && (
                  <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0 animate-fade-in" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/8 p-3 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors duration-150">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full
                          flex items-center justify-center flex-shrink-0
                          shadow-md shadow-blue-700/30">
            <span className="text-white text-sm font-bold leading-none">{initials}</span>
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
