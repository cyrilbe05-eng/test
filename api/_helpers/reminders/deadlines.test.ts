import { describe, expect, it, vi } from 'vitest'

vi.mock('../db.js', () => ({ dbQuery: vi.fn(), dbExecute: vi.fn(), newId: () => 'x', nowIso: () => '' }))
vi.mock('../email.js', () => ({ projectUrl: () => '', sendEmailNotifications: vi.fn() }))
const { remindersFor } = await import('./deadlines.js')

const H = 3_600_000
const DUE = Date.parse('2026-11-26T23:59:00Z')
const base = {
  deadline_id: 'd1', project_id: 'p1', project_title: 'Gym tour', editor_id: 'e1', editor_name: 'Sam',
  due_at: new Date(DUE).toISOString(), created_at: new Date(DUE - 34 * H).toISOString(),
  status: 'pending', project_status: 'in_progress', delivered: false,
}
const at = (hoursFromDue: number, over: Partial<typeof base> = {}) =>
  remindersFor({ ...base, ...over }, DUE + hoursFromDue * H).map((r) => `${r.to}:${r.kind.split('|')[0]}:${r.message}`)

describe('deadline reminders', () => {
  it('nothing more than 24 h before the deadline', () => {
    expect(at(-25)).toEqual([])
  })
  it('"Due tomorrow" in the last 24 h', () => {
    expect(at(-23.5)).toEqual(['editor:due_soon:Due tomorrow: Gym tour'])
    expect(at(-14)).toEqual(['editor:due_soon:Due in 14 hours: Gym tour'])   // e.g. right after launch: worded honestly
    expect(at(-1)).toEqual(['editor:due_soon:Due in 1 hour: Gym tour'])
  })
  it('no "due tomorrow" for a deadline set with less than a day to go (the assignment message covers it)', () => {
    expect(at(-10, { created_at: new Date(DUE - 20 * H).toISOString() })).toEqual([])
  })
  it('overdue: one reminder per day late, each with its own key', () => {
    expect(at(0.5)).toEqual(['editor:overdue_0:Overdue: Gym tour'])
    expect(at(23)).toEqual(['editor:overdue_0:Overdue: Gym tour'])            // same key → not sent again
    expect(at(25)).toEqual(['editor:overdue_1:Still overdue (1 day late): Gym tour'])
  })
  it('admins are told once it is 2+ days late', () => {
    expect(at(47).some((r) => r.startsWith('admins:'))).toBe(false)
    expect(at(49)).toEqual(['editor:overdue_2:Still overdue (2 days late): Gym tour', 'admins:admin_overdue:Overdue 2+ days: Gym tour (Sam)'])
    expect(at(97).filter((r) => r.startsWith('admins:'))).toEqual(['admins:admin_overdue:Overdue 2+ days: Gym tour (Sam)']) // same key every day → once
  })
  it('stops as soon as the editor delivers, or the deadline is closed, or the project moved on', () => {
    expect(at(-23, { delivered: true })).toEqual([])
    expect(at(30, { delivered: true })).toEqual([])
    expect(at(30, { status: 'met' })).toEqual([])
    expect(at(30, { project_status: 'in_review' })).toEqual([])
    expect(at(30, { project_status: 'client_approved' })).toEqual([])
    expect(at(30, { project_status: 'revision_requested' })).toHaveLength(1)
  })
  it('leaves forgotten deadlines (2+ weeks late) alone', () => {
    expect(at(15 * 24)).toEqual([])
  })
  it('moving the deadline arms its reminders again (the due time is part of the key)', () => {
    const later = new Date(DUE + 48 * H).toISOString()
    const a = remindersFor({ ...base }, DUE - 23 * H)[0].kind
    const b = remindersFor({ ...base, due_at: later }, DUE + 25 * H)[0].kind
    expect(a).not.toEqual(b)
  })
})
