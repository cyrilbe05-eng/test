import { describe, it, expect } from 'vitest'
import { questionsForPackage, isAnswered, missingRequired, toStored, fromStored, parseQuestionInput, placeInSection, type Question } from './onboarding'
import { computeInfo, evaluateClient, type ClientInput } from './compute'
import type { PlanItem } from './plans'

const q = (over: Partial<Question>): Question => ({
  id: 'q', section: 'S', text: 'T', type: 'text', options: [], required: true, admin_only: false,
  sort_order: 0, packages: 'both', active: true, ...over,
})

describe('questionsForPackage', () => {
  const qs = [q({ id: 'a' }), q({ id: 'f', packages: 'full_package' }), q({ id: 'e', packages: 'editing_only' }), q({ id: 'x', active: false })]
  it('full package: both + full, never inactive', () => expect(questionsForPackage(qs, 'full_package').map((x) => x.id)).toEqual(['a', 'f']))
  it('editing only: the short version', () => expect(questionsForPackage(qs, 'editing_only').map((x) => x.id)).toEqual(['a', 'e']))
  it('no contract: only "both"', () => expect(questionsForPackage(qs, null).map((x) => x.id)).toEqual(['a']))
})

describe('answers', () => {
  const choice = q({ type: 'choice', options: ['Instagram', 'Other'] })
  it('"Other" picked with nothing typed is not an answer yet', () => {
    expect(isAnswered(choice, 'Other')).toBe(false)
    expect(isAnswered(choice, 'My cousin')).toBe(true)
    expect(isAnswered(q({}), '   ')).toBe(false)
    expect(isAnswered(q({ type: 'link' }), [])).toBe(false)
  })
  it('missing required ignores optional questions', () => {
    const qs = [q({ id: 'r' }), q({ id: 'o', required: false })]
    expect(missingRequired(qs, new Map())).toEqual(['r'])
    expect(missingRequired(qs, new Map([['r', 'yes']]))).toEqual([])
  })
  it('links are cleaned, https added, stored as a list', () => {
    const link = q({ type: 'link' })
    const s = toStored(link, [' instagram.com/reel/1 ', '', 'https://tiktok.com/x'], 'c1')
    expect(fromStored(link, s)).toEqual(['https://instagram.com/reel/1', 'https://tiktok.com/x'])
    expect(() => toStored(link, ['javascript:alert(1)'], 'c1')).toThrow()
  })
  it('files must belong to this client', () => {
    const file = q({ type: 'file' })
    expect(() => toStored(file, [{ key: 'onboarding/c2/a.pdf', name: 'a.pdf', size: 1 }], 'c1')).toThrow()
    const s = toStored(file, [{ key: 'onboarding/c1/a.pdf', name: 'a.pdf', size: 1 }], 'c1')
    expect(fromStored(file, s)).toEqual([{ key: 'onboarding/c1/a.pdf', name: 'a.pdf', size: 1 }])
  })
  it('empty clears the answer', () => expect(toStored(q({}), '', 'c1')).toEqual({ answer: null, file_url: null }))
})

describe('parseQuestionInput', () => {
  it('needs section and text to create', () => expect(() => parseQuestionInput({ text: 'Hi' }, 'create')).toThrow())
  it('rejects unknown fields and types', () => {
    expect(() => parseQuestionInput({ foo: 1 }, 'update')).toThrow()
    expect(() => parseQuestionInput({ type: 'date' }, 'update')).toThrow()
  })
})

describe('"Finished onboarding" info', () => {
  const NOW = Date.UTC(2026, 10, 8, 12)
  const DAY = 86_400_000
  const base = (over: Partial<ClientInput>): ClientInput => ({
    id: 'c1', full_name: 'X', email: 'x', phone: null, client_id_label: null, plan_name: null, care: null,
    last_contact_at: new Date(NOW).toISOString(), projects: [], ...over,
  })
  const done = (daysAgo: number) => ({ status: 'done' as const, done_at: new Date(NOW - daysAgo * DAY).toISOString() })
  const full = { id: 'k', number: 1, package: 'full_package' as const, start_date: '2026-11-01', end_date: '2027-10-31' }
  const editing = { ...full, package: 'editing_only' as const }

  it('full package: stays until the production plan exists', () => {
    expect(computeInfo(base({ contract: full, onboarding: done(10), plan: [] }), NOW)).toEqual(['Finished onboarding'])
    expect(computeInfo(base({ contract: full, onboarding: done(10), plan: [{} as PlanItem] }), NOW)).toEqual([])
  })
  it('editing only: 3 days', () => {
    expect(computeInfo(base({ contract: editing, onboarding: done(2) }), NOW)).toEqual(['Finished onboarding'])
    expect(computeInfo(base({ contract: editing, onboarding: done(4) }), NOW)).toEqual([])
  })
  it('marked done by an admin (no finish date): nothing', () => {
    expect(computeInfo(base({ contract: editing, onboarding: { status: 'done', done_at: null } }), NOW)).toEqual([])
  })
  it('never changes health', () => {
    const a = evaluateClient(base({ contract: editing, onboarding: done(1) }), NOW)
    const b = evaluateClient(base({ contract: editing }), NOW)
    expect(a.health).toBe(b.health)
    expect(a.alerts).toEqual(b.alerts)
    expect(a.info).toEqual(['Finished onboarding'])
  })
})

describe('placeInSection', () => {
  const q = (id: string, section: string) => ({ id, section })
  const list = [q('a', 'Getting started'), q('b', 'Getting started'), q('c', 'Style'), q('d', 'Style')]
  it('moves a new question to the end of its section', () => {
    expect(placeInSection([...list, q('n', 'Getting started')], 'n', 'Getting started')).toEqual(['a', 'b', 'n', 'c', 'd'])
  })
  it('keeps a new section at the end', () => {
    expect(placeInSection([...list, q('n', 'Last step')], 'n', 'Last step')).toEqual(['a', 'b', 'c', 'd', 'n'])
  })
  it('leaves a question already inside its section alone', () => {
    expect(placeInSection(list, 'b', 'Getting started')).toEqual(['a', 'b', 'c', 'd'])
    expect(placeInSection(list, 'c', 'Style')).toEqual(['a', 'b', 'c', 'd'])
  })
  it('joins the first group when the section is already split', () => {
    const split = [...list, q('e', 'Getting started'), q('n', 'Getting started')]
    expect(placeInSection(split, 'n', 'Getting started')).toEqual(['a', 'b', 'n', 'c', 'd', 'e'])
    expect(placeInSection(split, 'e', 'Getting started')).toEqual(['a', 'b', 'e', 'c', 'd', 'n'])
  })
  it('moves a question whose section changed', () => {
    expect(placeInSection([q('a', 'Getting started'), q('b', 'Getting started'), q('c', 'Style'), q('d', 'Getting started')], 'd', 'Getting started')).toEqual(['a', 'b', 'd', 'c'])
  })
})
