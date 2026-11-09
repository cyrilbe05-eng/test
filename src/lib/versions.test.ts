import { describe, it, expect } from 'vitest'
import { currentVersions, commentsForVersion } from './versions'

const d = (id: string, created_at: string, review_round: number | null = null, file_type: 'deliverable' | 'source_video' = 'deliverable') =>
  ({ id, file_type, created_at, review_round })

describe('currentVersions', () => {
  it('returns the latest cycle, oldest first', () => {
    const files = [d('r1a', '2026-01-01', 1), d('r2b', '2026-01-05', 2), d('r1b', '2026-01-02', 1), d('r2a', '2026-01-04', 2), d('src', '2026-01-06', null, 'source_video')]
    expect(currentVersions(files, 1).map((f) => f.id)).toEqual(['r2a', 'r2b'])
  })
  it('old files without a cycle: all of them before any client revision', () => {
    expect(currentVersions([d('b', '2026-01-02'), d('a', '2026-01-01')], 0).map((f) => f.id)).toEqual(['a', 'b'])
  })
  it('old files without a cycle after a revision: only the newest, like before', () => {
    expect(currentVersions([d('b', '2026-01-02'), d('a', '2026-01-01')], 1).map((f) => f.id)).toEqual(['b'])
  })
  it('stamped files win over old unstamped ones', () => {
    expect(currentVersions([d('old', '2026-01-01'), d('new', '2026-01-03', 2)], 1).map((f) => f.id)).toEqual(['new'])
  })
  it('nothing uploaded', () => {
    expect(currentVersions([], 0)).toEqual([])
    expect(currentVersions(undefined, 0)).toEqual([])
  })
})

describe('commentsForVersion', () => {
  const cs = [{ id: 1, file_id: 'v1' }, { id: 2, file_id: 'v2' }, { id: 3, file_id: null }, { id: 4, file_id: 'old' }]
  it('keeps this version, untied and earlier-round comments; hides the other version', () => {
    expect(commentsForVersion(cs, 'v1', ['v1', 'v2']).map((c) => c.id)).toEqual([1, 3, 4])
    expect(commentsForVersion(cs, 'v2', ['v1', 'v2']).map((c) => c.id)).toEqual([2, 3, 4])
  })
})
