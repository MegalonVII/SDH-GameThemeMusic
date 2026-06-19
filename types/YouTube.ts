export type YouTubeVideo = { id: string; url?: string }

export type YouTubeVideoPreview = YouTubeVideo & {
  title: string
  thumbnail: string
}
