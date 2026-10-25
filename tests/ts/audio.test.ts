import { afterEach, describe, expect, it, vi } from 'vitest'
import { call } from '@decky/api'

vi.mock('@decky/api', () => ({
  call: vi.fn()
}))

import {
  getResolver,
  getResolverForMediaId,
  KhinsiderAudioResolver,
  MusicSearchError,
  resolveDownloadHref,
  YtDlpAudioResolver
} from '../../src/actions/audio'

describe('KhinsiderAudioResolver search', () => {
  afterEach(() => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws when khinsider returns an error page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reasons = ['blocked', 'rate_limited', 'timeout', 'http_error', 'network_error']

    for (const reason of reasons) {
      vi.mocked(call).mockReset()
      vi.mocked(call).mockResolvedValue({ html: '', status: 403, error: reason })
      const search = new KhinsiderAudioResolver().getYouTubeSearchResults('Doom')
      await expect(search.next()).rejects.toMatchObject({
        name: 'MusicSearchError',
        reason
      })
      expect(call).toHaveBeenCalledTimes(1)
    }
  })

  it('finishes when the search page has no albums', async () => {
    vi.mocked(call).mockResolvedValue({ html: 'empty', status: 200, error: null })
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString() {
          return { querySelectorAll: () => [] }
        }
      }
    )
    const search = new KhinsiderAudioResolver().getYouTubeSearchResults('Missing game')
    await expect(search.next()).resolves.toMatchObject({ done: true })
  })

  it('stops on the next album if khinsider blocks it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const link = (href: string, text: string) => ({
      getAttribute: () => href,
      textContent: text,
      closest: () => null
    })
    const albums = [1, 2, 3].map((n) => link(`/game-soundtracks/album/${n}`, `Album ${n}`))
    const track = link('/game-soundtracks/album/1/song.mp3', 'Song')
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString(html: string) {
          return { querySelectorAll: () => (html === 'search' ? albums : [track]) }
        }
      }
    )
    vi.mocked(call)
      .mockResolvedValueOnce({ html: 'search', status: 200, error: null })
      .mockResolvedValueOnce({ html: 'album', status: 200, error: null })
      .mockResolvedValueOnce({ html: '', status: 403, error: 'blocked' })

    const search = new KhinsiderAudioResolver().getYouTubeSearchResults('Doom')
    await expect(search.next()).resolves.toMatchObject({
      done: false,
      value: { title: 'Song (Album 1)' }
    })
    expect(call).toHaveBeenCalledTimes(2)

    await expect(search.next()).rejects.toBeInstanceOf(MusicSearchError)
    expect(call).toHaveBeenCalledTimes(3)
    expect(vi.mocked(call).mock.calls[2][1]).toBe(
      'https://downloads.khinsider.com/game-soundtracks/album/2'
    )
  })
})

describe('getResolver', () => {
  it('returns KhinsiderAudioResolver for khinsider provider', () => {
    expect(getResolver('khinsider')).toBeInstanceOf(KhinsiderAudioResolver)
  })

  it('returns YtDlpAudioResolver for youtube and default provider', () => {
    expect(getResolver('youtube')).toBeInstanceOf(YtDlpAudioResolver)
    expect(getResolver()).toBeInstanceOf(YtDlpAudioResolver)
  })
})

describe('getResolverForMediaId', () => {
  it('routes khinsider album URLs to KhinsiderAudioResolver', () => {
    const resolver = getResolverForMediaId(
      'https://downloads.khinsider.com/game-soundtracks/album/example',
      'youtube'
    )
    expect(resolver).toBeInstanceOf(KhinsiderAudioResolver)
  })

  it('routes youtube URLs to YtDlpAudioResolver', () => {
    expect(
      getResolverForMediaId('https://www.youtube.com/watch?v=abc', 'khinsider')
    ).toBeInstanceOf(YtDlpAudioResolver)
    expect(getResolverForMediaId('https://youtu.be/abc', 'khinsider')).toBeInstanceOf(
      YtDlpAudioResolver
    )
  })

  it('routes other http(s) URLs to KhinsiderAudioResolver', () => {
    expect(
      getResolverForMediaId('https://example.com/track.mp3', 'youtube')
    ).toBeInstanceOf(KhinsiderAudioResolver)
  })

  it('falls back to provider for bare media ids', () => {
    expect(getResolverForMediaId('dQw4w9WgXcQ', 'youtube')).toBeInstanceOf(
      YtDlpAudioResolver
    )
    expect(getResolverForMediaId('dQw4w9WgXcQ', 'khinsider')).toBeInstanceOf(
      KhinsiderAudioResolver
    )
  })
})

describe('resolveDownloadHref', () => {
  it('accepts supported audio extensions', () => {
    expect(resolveDownloadHref('/download/track.mp3')).toBe(
      'https://downloads.khinsider.com/download/track.mp3'
    )
    expect(resolveDownloadHref('https://cdn.example.com/track.ogg')).toBe(
      'https://cdn.example.com/track.ogg'
    )
  })

  it('rejects non-audio extensions and empty values', () => {
    expect(resolveDownloadHref('/download/track.zip')).toBeUndefined()
    expect(resolveDownloadHref(null)).toBeUndefined()
    expect(resolveDownloadHref('')).toBeUndefined()
  })
})
