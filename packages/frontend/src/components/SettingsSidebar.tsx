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

  return (
    <aside className="w-64 bg-slate-900 flex flex-col h-screen flex-shrink-0">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/10">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm">Voltar ao sistema</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base">Configurações</h1>
            <p className="text-slate-500 text-xs">Preferências do sistema</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-3">
          Opções
        </p>
        {visible.map(({ to, icon: Icon, label }) => (
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
      </nav>

      {/* User info */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">
              {user?.name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-slate-500 text-xs truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
