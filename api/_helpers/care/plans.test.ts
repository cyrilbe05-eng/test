import { describe, it, expect } from 'vitest'
import { planFromTemplate, applyAutoTicks, overdueClientSteps, planWithState, type PlanItem } from './plans'
import { computeAlerts } from './compute'

const NOW = Date.UTC(2026, 10, 8, 12)   // 2026-11-08 12:00
const item = (o: Partial<PlanItem> & Pick<PlanItem, 'id' | 'sort_order' | 'date'>): PlanItem => ({
  contract_id: 'k', client_id: 'c', title: o.id, owner: 'pingu', done: 0, done_at: null, done_by: null, auto_rule: 'none', ...o,
})

describe('planFromTemplate', () => {
  it('dates each step from the previous one, in template order', () => {
    const plan = planFromTemplate('2026-11-01')
    expect(plan.map((p) => [p.date, p.owner, p.auto_rule])).toEqual([
      ['2026-11-01', 'both', 'none'],
      ['2026-11-04', 'pingu', 'none'],
      ['2026-11-08', 'client', 'footage_uploaded'],
      ['2026-11-15', 'pingu', 'none'],
      ['2026-11-19', 'client', 'footage_uploaded'],
      ['2026-11-26', 'pingu', 'none'],
      ['2026-11-30', 'client', 'footage_uploaded'],
      ['2026-12-21', 'pingu', 'all_delivered'],
    ])
  })
})

describe('applyAutoTicks', () => {
  const plan = [
    item({ id: 'script1', sort_order: 0, date: '2026-11-01', done: 1, done_at: '2026-11-02T10:00:00.000Z', done_by: 'u1' }),
    item({ id: 'record1', sort_order: 1, date: '2026-11-04', owner: 'client', auto_rule: 'footage_uploaded' }),
    item({ id: 'script2', sort_order: 2, date: '2026-11-05' }),
    item({ id: 'record2', sort_order: 3, date: '2026-11-07', owner: 'client', auto_rule: 'footage_uploaded' }),
    item({ id: 'delivered', sort_order: 4, date: '2026-12-01', auto_rule: 'all_delivered' }),
  ]

  it('ticks a record step when footage arrives after the previous step; one upload = one step', () => {
    const ticks = applyAutoTicks(plan, ['2026-11-03T09:00:00.000Z'], [], 10, NOW)
    expect(ticks).toEqual([{ id: 'record1', done_at: '2026-11-03T09:00:00.000Z' }])
  })

  it('footage from BEFORE the previous step does not count', () => {
    expect(applyAutoTicks(plan, ['2026-11-01T09:00:00.000Z'], [], 10, NOW)).toEqual([])
  })

  it('two uploads tick two steps in order', () => {
    const ticks = applyAutoTicks(plan, ['2026-11-06T09:00:00.000Z', '2026-11-03T09:00:00.000Z'], [], 10, NOW)
    expect(ticks.map((t) => t.id)).toEqual(['record1', 'record2'])
  })

  it('all delivered when delivered videos reach videos included', () => {
    const deliveries = ['2026-11-02T00:00:00.000Z', '2026-11-05T00:00:00.000Z']
    expect(applyAutoTicks(plan, [], deliveries, 3, NOW)).toEqual([])
    expect(applyAutoTicks(plan, [], deliveries, 2, NOW)).toEqual([{ id: 'delivered', done_at: '2026-11-05T00:00:00.000Z' }])
  })

  it('never re-ticks a step someone unticked by hand', () => {
    const touched = plan.map((p) => (p.id === 'record1' ? { ...p, done_by: 'u1' } : p))
    expect(applyAutoTicks(touched, ['2026-11-03T09:00:00.000Z'], [], 10, NOW).map((t) => t.id)).not.toContain('record1')
  })
})

describe('overdue client steps (and the Client Care alert)', () => {
  const plan = [
    item({ id: 'call', sort_order: 0, date: '2026-11-01', owner: 'both', title: 'Onboarding call' }),
    item({ id: 'record', sort_order: 1, date: '2026-11-05', owner: 'client', title: 'Record + upload · batch 1' }),
    item({ id: 'script', sort_order: 2, date: '2026-11-03', owner: 'pingu', title: 'Scripts' }),
    item({ id: 'future', sort_order: 3, date: '2026-11-20', owner: 'client', title: 'Later' }),
  ]

  it('only client/both steps past their date and not done', () => {
    expect(overdueClientSteps(plan, NOW).map((s) => [s.id, s.days_late])).toEqual([['call', 7], ['record', 3]])
  })

  it('show up as Client Care alerts', () => {
    const alerts = computeAlerts({ id: 'c', full_name: 'X', email: '', phone: null, client_id_label: null, plan_name: null, care: null, last_contact_at: new Date(NOW).toISOString(), projects: [{ id: 'p', title: 'p', status: 'in_review', created_at: new Date(NOW).toISOString(), updated_at: '', client_revision_count: 0, history: [], first_deliverable_at: null, deadlines: [], editor_ids: [] }], plan }, [], NOW)
    expect(alerts.filter((a) => a.type === 'plan_overdue').map((a) => a.message)).toEqual([
      '"Onboarding call" overdue by 7 days',
      '"Record + upload · batch 1" overdue by 3 days',
    ])
  })

  it('a ticked step is never overdue', () => {
    const ticked = plan.map((p) => (p.id === 'record' ? { ...p, done: 1, done_at: '2026-11-06T00:00:00.000Z', done_by: 'auto' } : p))
    expect(overdueClientSteps(ticked, NOW).map((s) => s.id)).toEqual(['call'])
  })
})

describe('planWithState', () => {
  it('marks done, overdue client steps, the next step and upcoming ones', () => {
    const states = planWithState([
      item({ id: 'a', sort_order: 0, date: '2026-11-01', done: 1, done_at: 'x' }),
      item({ id: 'b', sort_order: 1, date: '2026-11-02', owner: 'client' }),
      item({ id: 'c', sort_order: 2, date: '2026-11-09', owner: 'pingu' }),
      item({ id: 'd', sort_order: 3, date: '2026-11-20', owner: 'pingu' }),
    ], NOW)
    expect(states.map((s) => [s.id, s.state])).toEqual([['a', 'done'], ['b', 'overdue'], ['c', 'upcoming'], ['d', 'upcoming']])
    const s2 = planWithState([item({ id: 'x', sort_order: 0, date: '2026-11-10' })], NOW)
    expect(s2[0].state).toBe('next')
  })
})
