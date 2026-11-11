import { describe, expect, it } from 'vitest'
import { searchProjects } from './projectSearch'

const p = (id: string, title: string, client: string, editors: string | null, updated = '2026-11-01') =>
  ({ id, title, status: 'in_progress', updated_at: updated, profiles: { full_name: client }, assigned_team_names: editors }) as any

const list = [
  p('1', 'FAQ short', 'Nova Skincare', 'Nora Cut'),
  p('2', 'Founder story', 'Atlas Fitness', 'Elias Editor'),
  p('3', 'Weekly tips 7', 'Bloom Bakery', null),
  p('4', 'Before & after', 'Atlas Fitness', 'Nora Cut', '2026-11-05'),
]

describe('searchProjects', () => {
  it('finds by project name, client or editor', () => {
    expect(searchProjects(list, 'faq').map((x) => x.id)).toEqual(['1'])
    expect(searchProjects(list, 'atlas').map((x) => x.id)).toEqual(['4', '2']) // most recent first
    expect(searchProjects(list, 'nora').map((x) => x.id)).toEqual(['4', '1'])
  })
  it('needs every word to match, in any field', () => {
    expect(searchProjects(list, 'atlas founder').map((x) => x.id)).toEqual(['2'])
    expect(searchProjects(list, 'nova nora').map((x) => x.id)).toEqual(['1'])
  })
  it('puts a name match above a client match', () => {
    const l = [p('a', 'Bakery tour', 'Someone', null), p('b', 'Weekly tips', 'Bloom Bakery', null, '2026-11-09')]
    expect(searchProjects(l, 'bakery').map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('ignores case and accents; empty query finds nothing', () => {
    expect(searchProjects([p('x', 'Café promo', 'Peak', null)], 'CAFE').length).toBe(1)
    expect(searchProjects(list, '   ')).toEqual([])
  })
})
