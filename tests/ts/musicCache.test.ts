import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, unknown>()

vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value)
      return value
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
    clear: vi.fn(async () => {
      storage.clear()
    }),
    iterate: vi.fn(
      async (callback: (value: unknown, key: string) => void) => {
        for (const [key, value] of storage.entries()) {
          callback(value, key)
        }
      }
    )
  }
}))

vi.mock('@decky/api', () => ({
  call: vi.fn()
}))

import { updateCache } from '../../src/cache/musicCache'

describe('updateCache', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('merges new fields into an existing cache entry', async () => {
    await updateCache(570, { videoId: 'abc123' })
    const merged = await updateCache(570, { volume: 0.75 })

    expect(merged).toEqual({
      videoId: 'abc123',
      volume: 0.75
    })
  })

  it('creates a new cache entry when none exists', async () => {
    const created = await updateCache(730, { videoId: 'track-id' })
    expect(created).toEqual({ videoId: 'track-id' })
  })
})
