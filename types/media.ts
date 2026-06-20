export type MediaContent = { id: string; url?: string }

export type MediaContentPreview = MediaContent & {
  title: string
  thumbnail: string
}
