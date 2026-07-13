export function getAppVersion(): string {
  return process.env.APP_VERSION || process.env.RELEASE_SHA || 'development'
}

export function getBuildDate(): string {
  return process.env.BUILD_DATE || 'unknown'
}
