import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSecretaryPermissions, type SecretaryPermissionKey } from '../../hooks/useSecretaryPermissions'

interface SecretaryGateProps {
  permission: SecretaryPermissionKey
  children: ReactNode
}

/**
 * Para DOCTOR/ADMIN é transparente. Para SECRETARY, só renderiza os filhos
 * se o médico tiver liberado essa permissão em "Gestão de Acessos".
 */
export function SecretaryGate({ permission, children }: SecretaryGateProps) {
  const { isSecretary, can, isLoading } = useSecretaryPermissions()

  if (isSecretary && isLoading) return null
  if (isSecretary && !can(permission)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
