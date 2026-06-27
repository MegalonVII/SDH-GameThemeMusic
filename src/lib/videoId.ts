export function shouldSkipAudioDownload(videoId: string): boolean {
  return !videoId.length
}

export function isCachedNoMusic(videoId: string | undefined): boolean {
  return videoId !== undefined && videoId.length === 0
}
