import { describe, expect, it } from 'vitest'
import { buildScoreboardInput, type CommentRow, type HistoryRow, type ProjectRow } from './build'
import { runScoreboardTimeline, summarizeMonths } from './runner'

const ed = { id: 'e1', name: 'Nora' }
const project = (id: string, over: Partial<ProjectRow> = {}): ProjectRow => ({
  id, title: id, client_id: 'c1', client_name: 'Atlas', status: 'client_approved',
  created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-02T10:00:00Z', ...over,
})
const flow = (pid: string, start: string, submit: string): HistoryRow[] => [
  { project_id: pid, old_status: 'pending_assignment', new_status: 'in_progress', created_at: start },
  { project_id: pid, old_status: 'in_progress', new_status: 'in_review', created_at: submit },
  { project_id: pid, old_status: 'in_review', new_status: 'client_approved', created_at: '2026-09-02T10:00:00Z' },
]
const assign = (pid: string) => ({ project_id: pid, team_member_id: 'e1', assigned_at: '2026-09-01T08:30:00Z' })
const base = { editors: [ed], adjustments: [] as { project_id: string; amount: number; reason: string | null }[], comments: [] as CommentRow[] }

describe('buildScoreboardInput', () => {
  it('scores the first submission and skips imports, old projects and other roles', () => {
    const out = buildScoreboardInput({
      ...base,
      projects: [project('ok'), project('import'), project('old', { created_at: '2026-06-01T00:00:00Z' }), project('copy')],
      history: [
        ...flow('ok', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
        { project_id: 'import', old_status: null, new_status: 'client_approved', created_at: '2026-09-02T00:00:00Z' },
        ...flow('old', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
        ...flow('copy', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
      ],
      assignments: [assign('ok'), assign('import'), assign('old'), { project_id: 'copy', team_member_id: 'someone-else', assigned_at: '2026-09-01T08:30:00Z' }],
    })
    expect(out.qualifying.map((q) => q.id)).toEqual(['ok'])
    const v = out.timelineVideos[0].video
    expect(v.deliveredAt.toISOString()).toBe('2026-09-01T11:00:00.000Z')
    expect(v.inProgressDurationMin).toBe(120)
  })

  it('resolves an open comment at the next status change, but not after 48h', () => {
    const out = buildScoreboardInput({
      ...base,
      projects: [project('p')],
      history: flow('p', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
      assignments: [assign('p')],
      comments: [
        { id: 'a', project_id: 'p', comment_text: 'cut the silence at 0:04', created_at: '2026-09-01T10:30:00Z', resolved: 0, resolved_at: null },
        { id: 'b', project_id: 'p', comment_text: 'logo too small', created_at: '2026-08-25T10:00:00Z', resolved: 0, resolved_at: null },
        { id: 'c', project_id: 'p', comment_text: 'louder music', created_at: '2026-09-01T10:31:00Z', resolved: 1, resolved_at: '2026-09-01T10:40:00Z' },
      ],
    })
    const r = out.timelineVideos[0].revisions
    expect(r).toHaveLength(2) // 'b' had no status change within 48h
    expect(r.map((x) => x.resolvedAt.toISOString()).sort()).toEqual(['2026-09-01T10:40:00.000Z', '2026-09-01T11:00:00.000Z'])
  })

  it('marks a repeat on the later comment of the same kind, whatever the input order', () => {
    const out = buildScoreboardInput({
      ...base,
      // Newest first, like the projects list.
      projects: [project('p2', { created_at: '2026-09-10T08:00:00Z' }), project('p1')],
      history: [...flow('p1', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'), ...flow('p2', '2026-09-10T09:00:00Z', '2026-09-10T11:00:00Z')],
      assignments: [assign('p1'), assign('p2')],
      comments: [
        { id: 'x', project_id: 'p1', comment_text: 'remove the silence', created_at: '2026-09-01T10:00:00Z', resolved: 1, resolved_at: '2026-09-01T10:05:00Z' },
        { id: 'y', project_id: 'p2', comment_text: 'there is dead air here', created_at: '2026-09-10T10:00:00Z', resolved: 1, resolved_at: '2026-09-10T10:05:00Z' },
      ],
    })
    const byId = new Map(out.timelineVideos.map((t) => [t.video.id, t.revisions[0].isRepeat]))
    expect(byId.get('p1')).toBe(false)
    expect(byId.get('p2')).toBe(true)
  })

  it('files the month in Brussels time and applies an admin adjustment', () => {
    const out = buildScoreboardInput({
      ...base,
      projects: [project('p', { updated_at: '2026-09-30T22:30:00Z' })], // 00:30 on 1 Oct in Brussels
      history: flow('p', '2026-09-01T09:00:00Z', '2026-09-01T11:00:00Z'),
      assignments: [assign('p')],
      adjustments: [{ project_id: 'p', amount: 10, reason: 'Client delay' }],
    })
    expect(out.timelineVideos[0].reportingMonth).toBe('2026-10')
    const [month] = summarizeMonths([ed], runScoreboardTimeline(out.timelineVideos), new Map())
    expect(month.results[0].videoCount).toBe(1)
    // First video for the pair: full base, plus the +10 adjustment.
    expect(month.results[0].totalPoints).toBe(110)
  })
})
