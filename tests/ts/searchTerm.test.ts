import { describe, expect, it } from 'vitest'
import { getInitialSearch } from '../../src/lib/searchTerm'

describe('getInitialSearch', () => {
  it('appends Theme Music for youtube provider', () => {
    expect(getInitialSearch('Halo', 'youtube')).toBe('Halo Theme Music')
    expect(getInitialSearch('Halo')).toBe('Halo Theme Music')
  })

  it('uses the bare game name for khinsider provider', () => {
    expect(getInitialSearch('Halo', 'khinsider')).toBe('Halo')
  })

  it('returns empty string when app name is missing', () => {
    expect(getInitialSearch(undefined, 'youtube')).toBe('')
    expect(getInitialSearch(undefined, 'khinsider')).toBe('')
  })
})
