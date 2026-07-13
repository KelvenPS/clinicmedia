import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { APP_VERSION, VERSION_CHECK_INTERVAL_MS, VERSION_UPDATE_ENABLED } from '../lib/version'

interface VersionResponse {
  version: string
  buildDate: string
  environment: string
}

export function useAppVersion() {
  const { data } = useQuery<VersionResponse | null>({
    queryKey: ['app-version'],
    queryFn: () => api.get('/version').then(r => r.data).catch(() => null),
    enabled: VERSION_UPDATE_ENABLED,
    refetchInterval: VERSION_CHECK_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  })

  const updateAvailable = Boolean(
    VERSION_UPDATE_ENABLED &&
    data?.version &&
    APP_VERSION &&
    data.version !== APP_VERSION
  )

  return {
    currentVersion: APP_VERSION,
    latestVersion: data?.version ?? null,
    updateAvailable,
  }
}
