import { describe, expect, it, vi } from 'vitest'

vi.mock('@decky/api', () => ({
  call: vi.fn()
}))

import {
  getResolver,
  getResolverForMediaId,
  KhinsiderAudioResolver,
  resolveDownloadHref,
  YtDlpAudioResolver
} from '../../src/actions/audio'

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
