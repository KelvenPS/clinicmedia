import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getVisibleSettingsNav } from '../config/settingsNav'

export default function SettingsMobileNav() {
  const { user } = useAuthStore()
  const location = useLocation()
  const items = getVisibleSettingsNav(user?.role)

  if (items.length === 0) return null

  return (
    <nav
      className="lg:hidden -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm sticky top-0 z-20"
      aria-label="Navegação de configurações"
    >
      <div className="flex gap-1.5 overflow-x-auto py-2.5 scrollbar-none">
        {items.map(({ to, icon: Icon, label, shortLabel }) => {
          const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
          return (
            <NavLink
              key={to}
              to={to}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                whitespace-nowrap flex-shrink-0 transition-all duration-200
                ${isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{shortLabel || label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
