import { NavLink, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  CreditCard,
  HelpCircle,
  BookOpen,
  Settings,
  UserCog,
  ChevronRight,
  Users,
  Stethoscope,
  MapPin,
  FileText,
  Bell,
  Wallet,
  Zap,
  Webhook,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function SettingsSidebar() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const settingsItems = [
    { to: '/configuracoes/perfil', icon: User, label: 'Meu Perfil', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/configuracoes/plano-financeiro', icon: CreditCard, label: 'Planos de Saúde', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/configuracoes/tipos-atendimento', icon: Stethoscope, label: 'Tipos de Atendimento', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/salas', icon: MapPin, label: 'Salas', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/documentos', icon: FileText, label: 'Documentos', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/formas-pagamento', icon: Wallet, label: 'Formas de Pagamento', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/notificacoes', icon: Bell, label: 'Notificações', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/configuracoes/integracoes', icon: Webhook, label: 'Integrações', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/planos', icon: Zap, label: 'Meu Plano', roles: ['ADMIN', 'DOCTOR'] },
    { to: '/configuracoes/equipe', icon: Users, label: 'Minha Equipe', roles: ['DOCTOR'] },
    { to: '/configuracoes/ajuda', icon: HelpCircle, label: 'Ajuda & Suporte', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/configuracoes/documentacao', icon: BookOpen, label: 'Documentação', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
    { to: '/usuarios', icon: UserCog, label: 'Usuários', roles: ['ADMIN'] },
    { to: '/admin/gestao', icon: Shield, label: 'Gestão de Dados', roles: ['ADMIN'] },
  ]

  const visible = settingsItems.filter(item =>
    user?.role ? item.roles.includes(user.role) : false
  )

  const initials = user?.name
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-screen flex-shrink-0 select-none">
      {/* ── Header ── */}
      <div className="px-4 py-4 border-b border-white/8 flex-shrink-0">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-400 hover:text-white
                     transition-all duration-150 mb-4 group w-full"
        >
          <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          <span className="text-sm font-medium">Voltar ao sistema</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/20">
            <Settings className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">Configurações</h1>
            <p className="text-slate-500 text-xs mt-0.5">Preferências do sistema</p>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-none">
        <p className="section-label mb-3">Opções</p>
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

      {/* ── User info ── */}
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
