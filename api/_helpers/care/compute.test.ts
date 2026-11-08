import { describe, it, expect } from 'vitest'
import {
  projectFacts, computeAlerts, computeHealth, computeStats, computeOutputRate, evaluateClient,
  daysUntilDate, urgencyCompare, type ClientInput, type ProjectInput,
} from './compute'

const DAY = 86_400_000
// Fixed "now": Sunday 2026-11-08 12:00 UTC.
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0)
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const inDays = (days: number) => new Date(NOW + days * DAY).toISOString().slice(0, 10)

function project(over: Partial<ProjectInput> = {}): ProjectInput {
  return {
    id: 'p1', title: 'Promo', status: 'pending_assignment', created_at: ago(1), updated_at: ago(1),
    client_revision_count: 0, history: [], first_deliverable_at: null, deadlines: [], editor_ids: [], ...over,
  }
}

function client(over: Partial<ClientInput> = {}): ClientInput {
  return {
    id: 'c1', full_name: 'Bloom', email: 'b@x', phone: null, client_id_label: null, plan_name: null,
    care: { contract_start: inDays(-200), contract_end: inDays(165), videos_included: 24, renewal_status: 'not_discussed', care_notes: null, miro_url: null },
    last_contact_at: ago(1),
    projects: [project({ created_at: ago(1) })],
    ...over,
  }
}

const evalHealth = (c: ClientInput) => evaluateClient(c, NOW)

describe('projectFacts — delivery and turnaround', () => {
  it('delivery = first real move into a client-visible status; turnaround from request', () => {
    const f = projectFacts(project({
      created_at: ago(5), status: 'client_approved',
      history: [
        { old_status: 'pending_assignment', new_status: 'in_progress', created_at: ago(4.5) },
        { old_status: 'in_progress', new_status: 'in_review', created_at: ago(3) },
        { old_status: 'admin_approved', new_status: 'client_reviewing', created_at: ago(2) },
        { old_status: 'client_reviewing', new_status: 'client_approved', created_at: ago(1) },
      ],
    }), NOW)
    expect(f.delivered_at).toBe(ago(2))
    expect(f.delivered_estimated).toBe(false)
    expect(f.turnaround_days).toBe(3)
    expect(f.approved_at).toBe(ago(1))
  })

  it('a project not yet sent to the client is not delivered', () => {
    const f = projectFacts(project({ status: 'in_review', history: [{ old_status: 'in_progress', new_status: 'in_review', created_at: ago(1) }] }), NOW)
    expect(f.delivered_at).toBeNull()
    expect(f.turnaround_days).toBeNull()
  })

  it('legacy project (only the migration-003 backfill row) gets an ESTIMATED date from the first deliverable', () => {
    const f = projectFacts(project({
      created_at: ago(120), status: 'client_approved', updated_at: ago(100), first_deliverable_at: ago(115),
      history: [{ old_status: null, new_status: 'client_approved', created_at: ago(100) }],
    }), NOW)
    expect(f.delivered_at).toBe(ago(115))
    expect(f.delivered_estimated).toBe(true)
  })
})

describe('alerts', () => {
  it('no brief: fires at exactly 2 days, not before', () => {
    expect(computeAlerts(client({ projects: [project({ created_at: ago(1.99) })] }), [], NOW).map((a) => a.type)).not.toContain('no_brief')
    const a = computeAlerts(client({ projects: [project({ created_at: ago(2) })] }), [], NOW)
    expect(a.find((x) => x.type === 'no_brief')?.message).toBe('No new video request for 2 days')
  })

  it('no brief when the client never sent a request', () => {
    expect(computeAlerts(client({ projects: [] }), [], NOW)[0].message).toBe('No video request yet')
  })

  it('in progress for 2+ days, using the moment it ENTERED in progress', () => {
    const p = project({ status: 'in_progress', created_at: ago(0.5), history: [{ old_status: 'pending_assignment', new_status: 'in_progress', created_at: ago(3) }] })
    const c = client({ projects: [p] })
    const a = computeAlerts(c, [projectFacts(p, NOW)], NOW)
    expect(a.find((x) => x.type === 'stuck_in_progress')?.message).toBe('"Promo" has been in progress for 3 days')
  })

  it('video due today = pending editor deadline due today (UTC)', () => {
    const p = project({ status: 'in_progress', history: [{ old_status: 'pending_assignment', new_status: 'in_progress', created_at: ago(1) }],
      deadlines: [{ team_member_id: 'e1', due_at: '2026-11-08T23:59:00.000Z', status: 'pending', created_at: ago(1) }] })
    const a = computeAlerts(client({ projects: [p] }), [projectFacts(p, NOW)], NOW)
    expect(a.map((x) => x.type)).toContain('due_today')
  })

  it('no contact: 3+ days, and never contacted', () => {
    expect(computeAlerts(client({ last_contact_at: ago(2.9) }), [], NOW).map((a) => a.type)).not.toContain('no_contact')
    expect(computeAlerts(client({ last_contact_at: ago(3) }), [], NOW).find((a) => a.type === 'no_contact')?.message).toBe('No contact for 3 days')
    expect(computeAlerts(client({ last_contact_at: null }), [], NOW).find((a) => a.type === 'no_contact')?.message).toBe('No contact logged yet')
  })
})

describe('health status', () => {
  it('HEALTHY with a plain-English reason when nothing is wrong', () => {
    const r = evalHealth(client())
    expect(r.health).toBe('healthy')
    expect(r.reasons).toEqual(['No alerts — everything is on track'])
  })

  it('AT RISK: no contact for 6+ days', () => {
    const r = evalHealth(client({ last_contact_at: ago(6) }))
    expect(r.health).toBe('at_risk')
    expect(r.reasons).toContain('No contact for 6 days')
  })

  it('NEEDS ATTENTION (not at risk) at 3–5 days without contact', () => {
    expect(evalHealth(client({ last_contact_at: ago(4) })).health).toBe('needs_attention')
  })

  it('AT RISK: a video stuck in progress for 2+ days', () => {
    const p = project({ status: 'in_progress', created_at: ago(0.2), history: [{ old_status: 'pending_assignment', new_status: 'in_progress', created_at: ago(2.5) }] })
    const r = evalHealth(client({ projects: [p] }))
    expect(r.health).toBe('at_risk')
    expect(r.reasons).toEqual(['"Promo" has been in progress for 2 days'])
  })

  it('AT RISK lists the risk reasons first, then the other alerts, without repeats', () => {
    const r = evalHealth(client({ last_contact_at: null, projects: [] }))
    expect(r.health).toBe('at_risk')
    expect(r.reasons).toEqual(['No contact logged yet', 'No video request yet'])
  })

  it('AT RISK by contract does not repeat the plain "Contract ends…" line', () => {
    const r = evalHealth(client({ care: { ...client().care!, contract_end: inDays(10) } }))
    expect(r.reasons).toEqual(["Contract ends in 10 days and renewal hasn't been discussed"])
  })

  it('AT RISK: contract ends within 14 days and renewal not discussed', () => {
    const r = evalHealth(client({ care: { ...client().care!, contract_end: inDays(14) } }))
    expect(r.health).toBe('at_risk')
    expect(r.reasons).toContain("Contract ends in 14 days and renewal hasn't been discussed")
  })

  it('…but only NEEDS ATTENTION when the renewal has been discussed', () => {
    const r = evalHealth(client({ care: { ...client().care!, contract_end: inDays(10), renewal_status: 'discussed' } }))
    expect(r.health).toBe('needs_attention')
    expect(r.reasons).toEqual(['Contract ends in 10 days'])
  })

  it('NEEDS ATTENTION: contract ends within 30 days', () => {
    expect(evalHealth(client({ care: { ...client().care!, contract_end: inDays(30) } })).health).toBe('needs_attention')
    expect(evalHealth(client({ care: { ...client().care!, contract_end: inDays(31) } })).health).toBe('healthy')
  })

  it('an already-ended contract with no renewal talk is at risk', () => {
    const r = evalHealth(client({ care: { ...client().care!, contract_end: inDays(-3) } }))
    expect(r.reasons).toContain("Contract ended 3 days ago and renewal hasn't been discussed")
  })

  it('no care record at all is not an error', () => {
    const r = computeHealth(client({ care: null }), [], [], NOW)
    expect(r.health).toBe('healthy')
  })
})

describe('stats', () => {
  it('counts deliveries this month / in contract and days since brief/contact', () => {
    const delivered = (id: string, at: string) => project({
      id, status: 'client_reviewing', created_at: ago(20),
      history: [{ old_status: 'admin_approved', new_status: 'client_reviewing', created_at: at }],
    })
    const c = client({
      last_contact_at: ago(2.5),
      projects: [delivered('a', '2026-11-02T10:00:00.000Z'), delivered('b', '2026-10-20T10:00:00.000Z'), project({ id: 'c', created_at: ago(1) })],
    })
    const facts = c.projects.map((p) => projectFacts(p, NOW))
    const s = computeStats(c, facts, NOW)
    expect(s.videos_delivered_this_month).toBe(1)
    expect(s.videos_delivered_total).toBe(2)
    expect(s.videos_delivered_in_contract).toBe(2)
    expect(s.days_since_last_brief).toBe(1)
    expect(s.days_since_last_contact).toBe(2)
    expect(s.days_left_on_contract).toBe(165)
  })
})

describe('output rate', () => {
  it('per day / per week over the window and % on time', () => {
    const facts = Array.from({ length: 6 }, (_, i) => projectFacts(project({
      id: `p${i}`, status: 'client_reviewing', created_at: ago(10 + i),
      history: [{ old_status: 'admin_approved', new_status: 'client_reviewing', created_at: ago(8 + i) }],
    }), NOW))
    const r = computeOutputRate(facts, [
      { due_at: ago(5), on_time: true }, { due_at: ago(6), on_time: true }, { due_at: ago(7), on_time: false },
      { due_at: ago(1), on_time: null },   // not decided yet → ignored
      { due_at: ago(60), on_time: false }, // outside the window → ignored
    ], NOW)
    expect(r.delivered).toBe(6)
    expect(r.per_day).toBe(0.2)
    expect(r.per_week).toBe(1.4)
    expect(r.avg_turnaround_days).toBe(2)
    expect(r.on_time_pct).toBe(67)
  })

  it('derives "on time" from the editor handoff when the deadline was never resolved', () => {
    const f = projectFacts(project({
      status: 'in_review',
      deadlines: [{ team_member_id: 'e1', due_at: ago(1), status: 'pending', created_at: ago(2) }],
      history: [{ old_status: 'in_progress', new_status: 'in_review', created_at: ago(1.5) }],
    }), NOW)
    expect(f.on_time).toBe(true)
  })
})

describe('helpers', () => {
  it('daysUntilDate counts calendar days in UTC', () => {
    expect(daysUntilDate('2026-11-08', NOW)).toBe(0)
    expect(daysUntilDate('2026-11-22', NOW)).toBe(14)
    expect(daysUntilDate('2026-11-01', NOW)).toBe(-7)
  })

  it('urgency: at risk first, then more alerts', () => {
    const risky = evalHealth(client({ id: 'r', full_name: 'R', last_contact_at: ago(9) }))
    const ok = evalHealth(client({ id: 'o', full_name: 'O' }))
    const meh = evalHealth(client({ id: 'm', full_name: 'M', last_contact_at: ago(4) }))
    expect([ok, meh, risky].sort(urgencyCompare).map((c) => c.client_id)).toEqual(['r', 'm', 'o'])
  })
})
