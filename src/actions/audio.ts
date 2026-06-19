import { call } from '@decky/api'
import {
  YouTubeVideo,
  YouTubeVideoPreview
} from '../../types/YouTube'

abstract class AudioResolver {
  abstract getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview>
  abstract getAudioUrlFromVideo(
    video: YouTubeVideo
  ): Promise<string | undefined>
  abstract downloadAudio(video: YouTubeVideo): Promise<boolean>

  async getAudio(
    appName: string
  ): Promise<{ videoId: string; audioUrl: string } | undefined> {
    const videos = this.getYouTubeSearchResults(appName + ' Theme Music')
    for await (const video of videos) {
      const audioUrl = await this.getAudioUrlFromVideo(video)
      if (audioUrl?.length) {
        return { audioUrl, videoId: video.id }
      }
    }
    return undefined
  }
}

class YtDlpAudioResolver extends AudioResolver {
  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview> {
    try {
      await call<[string]>('search_yt', searchTerm)
      let result = await call<[], YouTubeVideoPreview | null>('next_yt_result')
      while (result) {
        yield result
        result = await call<[], YouTubeVideoPreview | null>('next_yt_result')
      }
      return
    } catch (err) {
      console.error(err)
    }
    return
  }

  async getAudioUrlFromVideo(video: YouTubeVideo): Promise<string | undefined> {
    if (video.url && !video.url.includes('youtube.com') && !video.url.includes('youtu.be')) {
      return video.url
    } else {
      const result = await call<[string], string | null>(
        'single_yt_url',
        video.id
      )
      return result || undefined
    }
  }

  async downloadAudio(video: YouTubeVideo): Promise<boolean> {
    try {
      await call<[string]>('download_yt_audio', video.id)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }
}

class KhinsiderAudioResolver extends AudioResolver {
  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview> {
    const fetchDoc = async (url: string) => {
      try {
        const html = await call<[string], string>('fetch_url', url)
        if (!html) return null
        const parser = new DOMParser()
        return parser.parseFromString(html, 'text/html')
      } catch (e) {
        return null
      }
    }

    const searchUrl = (query: string) => `https://downloads.khinsider.com/search?search=${encodeURIComponent(query)}`

    try {
      let doc = await fetchDoc(searchUrl(searchTerm))

      if (!doc || (doc.querySelectorAll('a[href*="/album/"]').length === 0 && doc.querySelectorAll('.playlistItem, #songlist, .clickable-row').length === 0)) {
        const baseName = searchTerm.replace(/\s+(Theme Music|Soundtrack|OST)$/i, '')
        if (baseName !== searchTerm) {
          doc = await fetchDoc(searchUrl(baseName))
        }
      }

      if (!doc) return

      const rawAlbumLinks = Array.from(doc.querySelectorAll('a[href*="/game-soundtracks/album/"]'))
      const seenAlbumHrefs = new Set<string>()
      const topAlbums: { url: string; title: string; thumbnail: string }[] = []

      for (const link of rawAlbumLinks) {
        const href = link.getAttribute('href')
        if (href && !seenAlbumHrefs.has(href)) {
          seenAlbumHrefs.add(href)
          const albumUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`

          let title = link.textContent?.trim()
          const row = (link as HTMLElement).closest('tr')
          if (!title && row) {
            title = Array.from(row.querySelectorAll('td'))
              .map(td => td.textContent?.trim())
              .filter(t => t && t.length > 2)[0]
          }
          if (!title) title = 'Unknown Album'

          let thumbnail = 'https://downloads.khinsider.com/images/no-cover.png'
          if (row) {
            const img = row.querySelector('img')
            if (img && img.src) thumbnail = img.src
          }
          topAlbums.push({ url: albumUrl, title, thumbnail })
          if (topAlbums.length >= 8) break
        }
      }

      const seenTrackHrefs = new Set<string>()
      const albumResponses = await Promise.all(
        topAlbums.map(async (album) => {
          try {
            const albumDoc = await fetchDoc(album.url)
            if (!albumDoc) return []

            const results: YouTubeVideoPreview[] = []
            const trackLinks = Array.from(albumDoc.querySelectorAll('.playlistItem td.clickable-row a, #songlist td.clickable-row a'))

            for (const trackLink of trackLinks) {
              const href = trackLink.getAttribute('href')
              if (!href || seenTrackHrefs.has(href)) continue
              seenTrackHrefs.add(href)

              const trackUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`
              const trackTitle = trackLink.textContent?.trim() || 'Track'

              results.push({
                id: trackUrl,
                title: `${trackTitle} (${album.title})`,
                thumbnail: album.thumbnail
              })
            }
            return results
          } catch (e) {
            console.error(`Failed to fetch album ${album.url}`, e)
            return []
          }
        })
      )

      for (const batch of albumResponses) {
        for (const track of batch) {
          yield track
        }
      }

      if (topAlbums.length === 0) {
        const tracks = Array.from(doc.querySelectorAll('.playlistItem a, .clickable-row a, #songlist a'))
        for (const track of tracks) {
          const href = track.getAttribute('href')
          if (!href || href.includes('/search') || !href.includes('/album/') || seenTrackHrefs.has(href)) continue
          seenTrackHrefs.add(href)

          const trackUrl = href.startsWith('http') ? href : `https://downloads.khinsider.com${href}`
          const title = track.textContent?.trim()
          if (!title || title.length < 2) continue

          yield {
            id: trackUrl,
            title: title,
            thumbnail: 'https://downloads.khinsider.com/images/no-cover.png'
          }
          if (seenTrackHrefs.size >= 30) break
        }
      }
    } catch (err) {
      console.error("KHInsider search failed:", err)
    }
  }

  async getAudioUrlFromVideo(video: YouTubeVideo): Promise<string | undefined> {
    const result = await call<[string], string | null>('single_yt_url', video.id)
    return result || undefined
  }

  async downloadAudio(video: YouTubeVideo): Promise<boolean> {
    try {
      await call<[string]>('download_yt_audio', video.id)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
  }
}

export function getResolver(provider?: string): AudioResolver {
  if (provider === 'khinsider') {
    return new KhinsiderAudioResolver()
  }
  return new YtDlpAudioResolver()
}
