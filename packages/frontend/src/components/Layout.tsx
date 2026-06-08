import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'
import NotificationBell from './NotificationBell'
import { useAuthStore } from '../store/authStore'

export default function Layout() {
  const location = useLocation()
  const isSettings = location.pathname.startsWith('/configuracoes')
  const { user } = useAuthStore()

  const initials = user?.name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div
        className="relative flex-shrink-0 transition-all duration-300"
        style={{ width: '256px' }}
      >
        <div
          className={`absolute inset-0 transition-all duration-300 ${isSettings ? 'opacity-0 pointer-events-none translate-x-[-10px]' : 'opacity-100 translate-x-0'}`}
        >
          <Sidebar />
        </div>
        <div
          className={`absolute inset-0 transition-all duration-300 ${isSettings ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none translate-x-[10px]'}`}
        >
          <SettingsSidebar />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-end px-6 gap-3 flex-shrink-0">
          <NotificationBell />
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-screen-2xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
