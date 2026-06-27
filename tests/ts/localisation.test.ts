import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const requiredEnglishKeys = [
  'changeThemeMusic',
  'noMusicLabel',
  'musicProvider',
  'downloadFailed',
  'downloadFailedDetail',
  'restoreDownloads',
  'settings',
  'volume'
] as const

describe('english localisation', () => {
  it('defines core user-facing keys', () => {
    const english = JSON.parse(
      readFileSync(join(process.cwd(), 'src/localisation/en.json'), 'utf8')
    ) as Record<string, string>

    for (const key of requiredEnglishKeys) {
      expect(english[key]?.length, `missing en key: ${key}`).toBeGreaterThan(0)
    }
  })
})
