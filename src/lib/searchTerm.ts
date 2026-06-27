export function getInitialSearch(
  appName: string | undefined,
  musicProvider?: string,
  fallbackProvider: string = 'youtube'
): string {
  const provider = musicProvider || fallbackProvider
  if (provider === 'khinsider') return appName ?? ''
  return appName?.concat(' Theme Music') ?? ''
}
