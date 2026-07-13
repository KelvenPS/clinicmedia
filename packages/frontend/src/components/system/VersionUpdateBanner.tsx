import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import Modal from '../ui/Modal'
import { useAppVersion } from '../../hooks/useAppVersion'
import { useUnsavedChangesStore } from '../../store/unsavedChangesStore'

export function VersionUpdateBanner() {
  const { updateAvailable } = useAppVersion()
  const hasUnsavedChanges = useUnsavedChangesStore(state => state.hasUnsavedChanges)
  const [dismissed, setDismissed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!updateAvailable || dismissed) return null

  const handleUpdateClick = () => {
    if (hasUnsavedChanges) {
      setConfirmOpen(true)
      return
    }
    window.location.reload()
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium flex-shrink-0 bg-blue-600 text-white">
        <Sparkles className="w-4 h-4 flex-shrink-0" />

        <span className="flex-1 text-center">
          Uma nova versão da Clinic Pro está disponível. Salve suas alterações e atualize para acessar as melhorias mais recentes.
        </span>

        <button
          onClick={handleUpdateClick}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors text-xs font-bold whitespace-nowrap"
        >
          Atualizar agora
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
          aria-label="Lembrar depois"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Existem informações que ainda não foram salvas"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Atualizar mesmo assim
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          Atualizar agora poderá descartar essas alterações. Deseja continuar?
        </p>
      </Modal>
    </>
  )
}
