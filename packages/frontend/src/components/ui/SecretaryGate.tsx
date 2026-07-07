import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSecretaryPermissions, type SecretaryPermissionKey } from '../../hooks/useSecretaryPermissions'

interface SecretaryGateProps {
  /** Uma chave, ou uma lista de chaves onde qualquer uma libera o acesso. */
  permission: SecretaryPermissionKey | SecretaryPermissionKey[]
  children: ReactNode
}

/**
 * Para DOCTOR/ADMIN é transparente. Para SECRETARY, só renderiza os filhos
 * se o médico tiver liberado ao menos uma das permissões em "Gestão de Acessos".
 */
export function SecretaryGate({ permission, children }: SecretaryGateProps) {
  const { isSecretary, can, isLoading } = useSecretaryPermissions()

  if (isSecretary && isLoading) return null
  const permissions = Array.isArray(permission) ? permission : [permission]
  if (isSecretary && !permissions.some(can)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
