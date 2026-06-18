import { call } from '@decky/api'
import {
  YouTubeVideo,
  YouTubeInitialData,
  Audio,
  YouTubeVideoPreview
} from '../../types/YouTube'
import { Settings, defaultSettings } from '../hooks/useSettings'

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

class InvidiousAudioResolver extends AudioResolver {
  async getEndpoint() {
    const savedSettings = await call<[string, Settings], Settings>(
      'get_setting',
      'settings',
      defaultSettings
    )
    return savedSettings.invidiousInstance
  }

  async *getYouTubeSearchResults(
    searchTerm: string
  ): AsyncIterable<YouTubeVideoPreview> {
    try {
      const encodedSearchTerm = `${encodeURIComponent(searchTerm)}`
      const endpoint = await this.getEndpoint()
      if (!endpoint) return

      for (let page = 1; page <= 3; page++) {
        const res = await fetch(
          `${endpoint}/api/v1/search?type=video&page=${page}&q=${encodedSearchTerm}`
        )
        if (res.status === 200) {
          const results: YouTubeInitialData = await res.json()
          if (results.length) {
            yield* results
              .map((res) => ({
                title: res.title,
                id: res.videoId,
                thumbnail:
                  res.videoThumbnails?.[0].url || 'https://i.ytimg.com/vi/0.jpg'
              }))
              .filter((res) => res.id.length)
          } else {
            break
          }
        } else {
          break
        }
      }
    } catch (err) {
      console.debug(err)
    }
    return
  }

  async getAudioUrlFromVideo(video: YouTubeVideo): Promise<string | undefined> {
    try {
      const endpoint = await this.getEndpoint()
      if (!endpoint) return undefined

      const res = await fetch(
        `${endpoint}/api/v1/videos/${encodeURIComponent(video.id)}?fields=adaptiveFormats`
      )
      if (res.status === 200) {
        const result = await res.json()
        const audioFormats: { adaptiveFormats: Audio[] } = result

        const audios = audioFormats.adaptiveFormats.filter((aud) =>
          aud.type?.includes('audio/webm')
        )
        const audio = audios.reduce((prev, current) => {
          return (prev?.audioSampleRate ?? 0) > (current?.audioSampleRate ?? 0) ? prev : current
        }, audios[0])

        return audio?.url
      }
    } catch (err) {
      console.log(err)
    }
    return undefined
  }

  async downloadAudio(video: YouTubeVideo): Promise<boolean> {
    if (!video.url) {
      video.url = await this.getAudioUrlFromVideo(video)
      if (!video.url) {
        return false
      }
    }
    try {
      await call<[string, string]>('download_url', video.url, video.id)
      return true
    } catch (e) {
      console.error(e)
      return false
    }
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

export function getResolver(useYtDlp: boolean, provider?: string): AudioResolver {
  if (provider === 'khinsider') {
    return new KhinsiderAudioResolver()
  } else if (useYtDlp) {
    return new YtDlpAudioResolver()
  } else {
    return new InvidiousAudioResolver()
  }
}

type InvidiousInstance = {
  flag: string
  region: string
  stats: {
    version: string
    software: {
      name: string
      version: string
      branch: string
    }
    openRegistrations: boolean
    usage: {
      users: {
        total: number
        activeHalfyear: number
        activeMonth: number
      }
    }
    metadata: {
      updatedAt: number
      lastChannelRefreshedAt: number
    }
    playback?: {
      totalRequests?: number
      successfulRequests?: number
      ratio?: number
    }
  } | null
  cors: boolean | null
  api: boolean | null
  type: string
  uri: string
  monitor: {
    token: string
    url: string
    alias: string
    last_status: number
    uptime: number
    down: boolean
    down_since: string | null
    up_since: string | null
    error: string | null
    period: number
    apdex_t: number
    string_match: string
    enabled: boolean
    published: boolean
    disabled_locations: string[]
    recipients: string[]
    last_check_at: string
    next_check_at: string
    created_at: string
    mute_until: string | null
    favicon_url: string
    custom_headers: Record<string, string>
    http_verb: string
    http_body: string
    ssl: {
      tested_at: string
      expires_at: string
      valid: boolean
      error: string | null
    }
  }
}

type InvidiousInstances = InvidiousInstance[]

export async function getInvidiousInstances(): Promise<
  { name: string; url: string }[]
> {
  try {
    const res = await fetch(
      'https://api.invidious.io/instances.json?&sort_by=users,health'
    )
    if (res.status === 200) {
      const instances: InvidiousInstances = (await res.json()).map(
        ([, instance]: [string, InvidiousInstance]) => instance
      )
      if (instances?.length) {
        return instances
          .filter((ins) => ins.type === 'https')
          .map((ins) => ({
            name: `${ins.flag} ${ins.monitor?.alias ?? ins.uri} | ${ins.stats?.usage.users.total} Users${ins.monitor?.uptime
              ? ` | Uptime: ${(ins.monitor.uptime / 100).toLocaleString('en', {
                style: 'percent'
              })}`
              : ''
              }`,
            url: ins.uri
          }))
      }
    }
  } catch (err) {
    console.debug(err)
  }
  return []
}
