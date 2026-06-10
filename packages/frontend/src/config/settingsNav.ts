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
  Zap,
  Webhook,
  Shield,
} from 'lucide-react'

export interface SettingsNavItem {
  to: string
  icon: LucideIcon
  label: string
  shortLabel?: string
  roles: string[]
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { to: '/configuracoes/perfil', icon: User, label: 'Meu Perfil', shortLabel: 'Perfil', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/plano-financeiro', icon: CreditCard, label: 'Planos de Saúde', shortLabel: 'Planos', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/tipos-atendimento', icon: Stethoscope, label: 'Tipos de Atendimento', shortLabel: 'Tipos', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/salas', icon: MapPin, label: 'Salas', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/documentos', icon: FileText, label: 'Documentos', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/formas-pagamento', icon: Wallet, label: 'Formas de Pagamento', shortLabel: 'Pagamento', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/notificacoes', icon: Bell, label: 'Notificações', shortLabel: 'Alertas', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/integracoes', icon: Webhook, label: 'Integrações', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/planos', icon: Zap, label: 'Meu Plano', roles: ['ADMIN', 'DOCTOR'] },
  { to: '/configuracoes/equipe', icon: Users, label: 'Minha Equipe', shortLabel: 'Equipe', roles: ['DOCTOR'] },
  { to: '/configuracoes/ajuda', icon: HelpCircle, label: 'Ajuda & Suporte', shortLabel: 'Ajuda', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/configuracoes/documentacao', icon: BookOpen, label: 'Documentação', shortLabel: 'Docs', roles: ['ADMIN', 'DOCTOR', 'SECRETARY'] },
  { to: '/usuarios', icon: UserCog, label: 'Usuários', roles: ['ADMIN'] },
  { to: '/admin/gestao', icon: Shield, label: 'Gestão de Dados', shortLabel: 'Gestão', roles: ['ADMIN'] },
  { to: '/admin/planos', icon: CreditCard, label: 'Gestão de Planos', shortLabel: 'Planos', roles: ['ADMIN'] },
]

export function getVisibleSettingsNav(role?: string) {
  if (!role) return []
  return SETTINGS_NAV_ITEMS.filter(item => item.roles.includes(role))
}
