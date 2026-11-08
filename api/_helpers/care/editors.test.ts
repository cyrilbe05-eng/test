import { describe, it, expect } from 'vitest'
import { aggregateEditorPerformance, type EditorInfo } from './editors'
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
