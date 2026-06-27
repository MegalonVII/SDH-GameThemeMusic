import { describe, expect, it } from 'vitest'
import {
  isCachedNoMusic,
  shouldSkipAudioDownload
} from '../../src/lib/videoId'

describe('videoId helpers', () => {
  it('treats empty video ids as no-music selections', () => {
    expect(shouldSkipAudioDownload('')).toBe(true)
    expect(isCachedNoMusic('')).toBe(true)
  })

  it('does not skip downloads for non-empty ids', () => {
    expect(shouldSkipAudioDownload('abc123')).toBe(false)
    expect(isCachedNoMusic('abc123')).toBe(false)
  })

  it('does not treat undefined cache as explicit no-music', () => {
    expect(isCachedNoMusic(undefined)).toBe(false)
  })
})
