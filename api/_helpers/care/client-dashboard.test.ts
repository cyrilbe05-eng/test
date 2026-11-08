import { describe, it, expect } from 'vitest'
import { buildDashboard } from './client-dashboard'
import type { ClientInput, ProjectInput } from './compute'
import type { PlanItem } from './plans'

const NOW = Date.UTC(2026, 10, 8, 12)   // 2026-11-08
const project = (o: Partial<ProjectInput>): ProjectInput => ({
  id: 'p', title: 'Video', status: 'pending_assignment', created_at: '2026-11-01T00:00:00Z', updated_at: '', client_revision_count: 0,
  history: [], first_deliverable_at: null, deadlines: [], editor_ids: [], has_footage: true, ...o,
})
const step = (o: Partial<PlanItem> & Pick<PlanItem, 'id' | 'date' | 'owner'>): PlanItem => ({
  contract_id: 'k', client_id: 'c', title: o.id, done: 0, done_at: null, done_by: null, auto_rule: 'none', sort_order: 0, ...o,
})
const base: ClientInput = {
  id: 'c', full_name: 'Bloom', email: '', phone: null, client_id_label: null, plan_name: null, care: null, last_contact_at: null,
  contract: { id: 'k', number: 2, package: 'full_package', start_date: '2026-11-01', end_date: '2026-11-30' },
  projects: [], plan: [],
}

describe('buildDashboard', () => {
  it('contract timeline: day X of Y, days left, contract number', () => {
    expect(buildDashboard(base, [], NOW).contract).toEqual({
      number: 2, package: 'full_package', start_date: '2026-11-01', end_date: '2026-11-30',
      day: 8, total_days: 30, days_left: 22, progress: 27,
    })
    expect(buildDashboard({ ...base, contract: null }, [], NOW).contract).toBeNull()
  })

  it('what we need: overdue client steps, videos to review, requests without footage', () => {
    const d = buildDashboard({
      ...base,
      plan: [
        step({ id: 'call', date: '2026-11-03', owner: 'both', title: 'Onboarding call' }),
        step({ id: 'script', date: '2026-11-04', owner: 'pingu', title: 'Scripts' }),      // Pingu's — never asked of the client
        step({ id: 'later', date: '2026-11-20', owner: 'client', title: 'Record' }),
      ],
      projects: [
        project({ id: 'r', title: 'Promo', status: 'client_reviewing' }),
        project({ id: 'f', title: 'Teaser', status: 'pending_assignment', has_footage: false }),
        project({ id: 'ok', title: 'Has footage', status: 'pending_assignment', has_footage: true }),
        project({ id: 'done', title: 'Approved', status: 'client_approved', has_footage: false }),
      ],
    }, [], NOW)
    expect(d.needs).toEqual([
      { type: 'plan_step', id: 'call', title: 'Onboarding call', date: '2026-11-03', days_late: 5 },
      { type: 'review', project_id: 'r', title: 'Promo' },
      { type: 'footage', project_id: 'f', title: 'Teaser' },
    ])
  })

  it('plan: client/both steps are tickable, Pingu steps are not', () => {
    const d = buildDashboard({ ...base, plan: [step({ id: 'a', date: '2026-11-20', owner: 'pingu' }), step({ id: 'b', date: '2026-11-21', owner: 'client', sort_order: 1 })] }, [], NOW)
    expect(d.plan.map((p) => [p.id, p.can_tick])).toEqual([['a', false], ['b', true]])
  })

  it('your style: rule text only, most frequent first', () => {
    expect(buildDashboard(base, [{ text: 'Bigger captions', count: 2 }, { text: 'Warmer colours', count: 6 }], NOW).style)
      .toEqual(['Warmer colours', 'Bigger captions'])
  })
})
