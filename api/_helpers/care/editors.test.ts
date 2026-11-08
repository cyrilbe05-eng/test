import { describe, it, expect } from 'vitest'
import { aggregateEditorPerformance, aggregateClientSplit, percentages, type EditorInfo } from './editors'
import type { ClientInput, ProjectInput } from './compute'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0)
const ago = (d: number) => new Date(NOW - d * DAY).toISOString()

const delivered = (id: string, createdAgo: number, deliveredAgo: number, revisions: number, editors: string[], deadlines: ProjectInput['deadlines'] = []): ProjectInput => ({
  id, title: id, status: 'client_reviewing', created_at: ago(createdAgo), updated_at: ago(deliveredAgo),
  client_revision_count: revisions, first_deliverable_at: null, editor_ids: editors, deadlines,
  history: [{ old_status: 'admin_approved', new_status: 'client_reviewing', created_at: ago(deliveredAgo) }],
})

const client: ClientInput = {
  id: 'cA', full_name: 'Bloom', email: '', phone: null, client_id_label: null, plan_name: null, care: null, last_contact_at: null,
  projects: [
    // Recent: e1 only, 2-day turnaround, 1 revision, e1's deadline met.
    delivered('p1', 7, 5, 1, ['e1'], [{ team_member_id: 'e1', due_at: ago(6), status: 'met', created_at: ago(7) }]),
    // Older (50 days): shared by e1 + e2, 4-day turnaround; only e2 had a deadline, missed.
    delivered('p2', 54, 50, 0, ['e1', 'e2'], [{ team_member_id: 'e2', due_at: ago(52), status: 'missed', created_at: ago(54) }]),
  ],
}
const editors: EditorInfo[] = [
  { id: 'e1', full_name: 'Elias', team_role: 'editor', disabled: 0 },
  { id: 'e2', full_name: 'Nora', team_role: null, disabled: 0 },
  { id: 'cw', full_name: 'Clara (copywriter)', team_role: 'copywriter', disabled: 0 },
  { id: 'old', full_name: 'Gone (disabled)', team_role: 'editor', disabled: 1 },
]
const cats = [
  { editor_id: 'e1', client_id: 'cA', category: 'music' as const, n: 3 },
  { editor_id: 'e1', client_id: 'cA', category: 'captions' as const, n: 1 },
]

describe('aggregateEditorPerformance', () => {
  it('last 30 days: only work delivered / due in the period counts', () => {
    const rows = aggregateEditorPerformance([client], editors, cats, NOW, 30)
    const e1 = rows.find((r) => r.editor_id === 'e1')!
    expect(e1.totals).toMatchObject({ videos: 1, revisions_per_video: 1, avg_turnaround_days: 2, on_time_pct: 100, revision_notes: 4 })
    const e2 = rows.find((r) => r.editor_id === 'e2')!
    expect(e2.totals.videos).toBe(0)
    expect(e2.clients).toEqual([])   // nothing in the period
  })

  it('all time: shared videos count for both editors; each editor is judged on their own deadline', () => {
    const rows = aggregateEditorPerformance([client], editors, cats, NOW, null)
    const e1 = rows.find((r) => r.editor_id === 'e1')!
    const e2 = rows.find((r) => r.editor_id === 'e2')!
    expect(e1.totals).toMatchObject({ videos: 2, revisions_per_video: 0.5, avg_turnaround_days: 3, on_time_pct: 100 })
    expect(e2.totals).toMatchObject({ videos: 1, avg_turnaround_days: 4, on_time_pct: 0, deadlines_missed: 1 })
    expect(e1.clients).toHaveLength(1)
    expect(e1.clients[0]).toMatchObject({ client_id: 'cA', name: 'Bloom', videos: 2 })
  })

  it('top revision categories with their share', () => {
    const e1 = aggregateEditorPerformance([client], editors, cats, NOW, null).find((r) => r.editor_id === 'e1')!
    expect(e1.totals.top_categories).toEqual([
      { category: 'music', count: 3, share: 75 },
      { category: 'captions', count: 1, share: 25 },
    ])
  })

  it('lists active editors, hides copywriters and disabled editors unless they have work', () => {
    const ids = aggregateEditorPerformance([client], editors, cats, NOW, null).map((r) => r.editor_id)
    expect(ids).toEqual(['e1', 'e2'])
    const withOld = aggregateEditorPerformance([{ ...client, projects: [delivered('p3', 4, 2, 0, ['old'])] }], editors, [], NOW, null)
    expect(withOld.find((r) => r.editor_id === 'old')).toMatchObject({ disabled: true, totals: { videos: 1 } })
  })

  it('sorted by most videos first', () => {
    const rows = aggregateEditorPerformance([client], editors, cats, NOW, null)
    expect(rows.map((r) => r.totals.videos)).toEqual([2, 1])
  })
})

describe('percentages', () => {
  it('always adds up to exactly 100', () => {
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33])
    expect(percentages([2, 1])).toEqual([67, 33])
    expect(percentages([0, 0])).toEqual([0, 0])
  })
})

describe('aggregateClientSplit', () => {
  it('per client: video count and who edited them; a shared video counts half for each editor', () => {
    const { legend, clients } = aggregateClientSplit([client], editors, NOW, null)
    expect(clients).toEqual([{
      client_id: 'cA', name: 'Bloom', videos: 2,
      split: [{ key: 'e1', videos: 1.5, share: 75 }, { key: 'e2', videos: 0.5, share: 25 }],
    }])
    // Stable colour order by editor name (Elias, Nora), not by volume.
    expect(legend.map((l) => [l.key, l.color_index])).toEqual([['e1', 0], ['e2', 1]])
  })

  it('respects the period and leaves out clients with no videos in it', () => {
    const { clients } = aggregateClientSplit([client, { ...client, id: 'cB', full_name: 'Empty', projects: [] }], editors, NOW, 30)
    expect(clients).toEqual([{ client_id: 'cA', name: 'Bloom', videos: 1, split: [{ key: 'e1', videos: 1, share: 100 }] }])
  })

  it('shows videos without an assigned editor as "No editor"', () => {
    const { legend, clients } = aggregateClientSplit([{ ...client, projects: [delivered('p9', 4, 2, 0, [])] }], editors, NOW, null)
    expect(clients[0].split).toEqual([{ key: 'unassigned', videos: 1, share: 100 }])
    expect(legend).toEqual([{ key: 'unassigned', name: 'No editor', color_index: -1 }])
  })

  it('folds editors beyond the 8 colours into "Other editors"', () => {
    const many: EditorInfo[] = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, full_name: `Ed ${String(i).padStart(2, '0')}`, team_role: 'editor', disabled: 0 }))
    const projects = many.map((e, i) => delivered(`q${i}`, 4, 2, 0, [e.id]))
    const { legend, clients } = aggregateClientSplit([{ ...client, projects }], many, NOW, null)
    expect(legend.filter((l) => l.color_index >= 0)).toHaveLength(7)
    expect(legend.at(-1)).toMatchObject({ key: 'other', name: 'Other editors' })
    expect(clients[0].split.find((s) => s.key === 'other')).toMatchObject({ videos: 3, share: 30 })
    expect(clients[0].split.reduce((s, x) => s + x.share, 0)).toBe(100)
  })
})
