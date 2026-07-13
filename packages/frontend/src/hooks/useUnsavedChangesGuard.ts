import { useEffect } from 'react'
import { useUnsavedChangesStore } from '../store/unsavedChangesStore'

/**
 * Bloqueia o fechamento/recarregamento acidental da aba enquanto houver
 * alterações não salvas (formulário de paciente, prontuário, agendamento etc).
 */
export function useUnsavedChangesGuard() {
  const hasUnsavedChanges = useUnsavedChangesStore(state => state.hasUnsavedChanges)

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])
}
