import type { LucideIcon } from 'lucide-react'
import {
  User,
  CreditCard,
  HelpCircle,
  BookOpen,
  UserCog,
  Users,
  Stethoscope,
  MapPin,
  FileText,
  Bell,
  Wallet,
  Webhook,
  Shield,
  Sparkles,
} from 'lucide-react'

export interface SettingsNavItem {
  to: string
  icon: LucideIcon
  label: string
  shortLabel?: string
  roles: string[]
  /** Para SECRETARY, exige além do role que o médico tenha liberado esta permissão em "Gestão de Acessos". */
  secretaryPermission?: string
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { to: '/configuracoes/perfil', icon: User, label: 'Meu Perfil', shortLabel: 'Perfil', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/plano-financeiro', icon: CreditCard, label: 'Convênio', shortLabel: 'Convênio', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/tipos-atendimento', icon: Stethoscope, label: 'Procedimento', shortLabel: 'Procedimento', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/salas', icon: MapPin, label: 'Clínica', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: 'salas' },
  { to: '/configuracoes/documentos', icon: FileText, label: 'Documentos', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: 'documentos' },
  { to: '/configuracoes/formas-pagamento', icon: Wallet, label: 'Formas de Pagamento', shortLabel: 'Pagamento', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/notificacoes', icon: Bell, label: 'Notificações', shortLabel: 'Alertas', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/integracoes', icon: Webhook, label: 'Integrações', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'], secretaryPermission: 'integracoes' },
  { to: '/configuracoes/planos', icon: Sparkles, label: 'Meu Plano', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/equipe', icon: Users, label: 'Minha Equipe', shortLabel: 'Equipe', roles: ['DOCTOR'] },
  { to: '/configuracoes/ajuda', icon: HelpCircle, label: 'Ajuda & Suporte', shortLabel: 'Ajuda', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/documentacao', icon: BookOpen, label: 'Documentação', shortLabel: 'Docs', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/usuarios', icon: UserCog, label: 'Usuários', roles: ['ADMIN'] },
  { to: '/admin/gestao', icon: Shield, label: 'Gestão de Dados', shortLabel: 'Gestão', roles: ['ADMIN'] },
  { to: '/admin/planos', icon: CreditCard, label: 'Gestão de Planos', shortLabel: 'Planos', roles: ['ADMIN'] },
]

export function getVisibleSettingsNav(role?: string, secretaryPermissions?: Record<string, boolean>) {
  if (!role) return []
  return SETTINGS_NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role)) return false
    if (role === 'SECRETARY' && item.secretaryPermission) {
      return !!secretaryPermissions?.[item.secretaryPermission]
    }
    return true
  })
}
