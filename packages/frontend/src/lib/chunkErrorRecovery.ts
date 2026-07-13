import { APP_VERSION } from './version'

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk .* failed/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
]

function isChunkError(message: string | undefined | null): boolean {
  if (!message) return false
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message))
}

function reloadKey(): string {
  return `cliniq:chunk-reload:${APP_VERSION}`
}

/**
 * Recarrega a página uma única vez por versão para recuperar de assets antigos
 * após um deploy. Retorna true se decidiu recarregar (o chamador deve parar ali).
 */
function recoverOnce(): boolean {
  const key = reloadKey()
  if (sessionStorage.getItem(key)) {
    return false
  }
  sessionStorage.setItem(key, '1')
  window.location.reload()
  return true
}

export function handlePossibleChunkError(message: string | undefined | null): boolean {
  if (!isChunkError(message)) return false
  return recoverOnce()
}

export function hasAlreadyRetriedReload(): boolean {
  return Boolean(sessionStorage.getItem(reloadKey()))
}

function isStaticAssetElement(target: EventTarget | null): target is HTMLScriptElement | HTMLLinkElement {
  if (!target) return false
  if (target instanceof HTMLScriptElement) return Boolean(target.src && target.src.includes('/assets/'))
  if (target instanceof HTMLLinkElement) return Boolean(target.href && target.href.includes('/assets/'))
  return false
}

export function installChunkErrorListeners(): void {
  window.addEventListener(
    'error',
    event => {
      if (isStaticAssetElement(event.target)) {
        recoverOnce()
      }
    },
    true
  )

  window.addEventListener('unhandledrejection', event => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
    handlePossibleChunkError(message)
  })
}
