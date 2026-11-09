import { describe, it, expect } from 'vitest'
import { slidesOf } from './slides'

const f = (id: string, file_type: 'deliverable' | 'source_video', sort_order: number | null, created_at: string) =>
  ({ id, file_type, sort_order, created_at })

describe('slidesOf', () => {
  it('orders by sort_order, then upload time, and keeps only the asked type', () => {
    const files = [
      f('c', 'deliverable', 2, '2026-01-01T00:00:01Z'),
      f('x', 'source_video', 0, '2026-01-01T00:00:00Z'),
      f('a', 'deliverable', 0, '2026-01-01T00:00:03Z'),
      f('n2', 'deliverable', null, '2026-01-01T00:00:05Z'),
      f('b', 'deliverable', 1, '2026-01-01T00:00:02Z'),
      f('n1', 'deliverable', null, '2026-01-01T00:00:04Z'),
    ]
    expect(slidesOf(files, 'deliverable').map((x) => x.id)).toEqual(['a', 'b', 'c', 'n1', 'n2'])
    expect(slidesOf(files, 'source_video').map((x) => x.id)).toEqual(['x'])
    expect(slidesOf(undefined, 'deliverable')).toEqual([])
  })
})
