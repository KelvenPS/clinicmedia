export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'development'

export const VERSION_UPDATE_ENABLED = import.meta.env.VITE_VERSION_UPDATE_ENABLED !== 'false'

export const VERSION_CHECK_INTERVAL_MS = Number(import.meta.env.VITE_VERSION_CHECK_INTERVAL_MS) || 90_000
