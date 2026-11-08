import { describe, it, expect } from 'vitest'
import { parseCarePatch } from './validate'

const bad = (body: unknown, msg: RegExp, current?: { contract_start: string | null; contract_end: string | null }) =>
  expect(() => parseCarePatch(body, current)).toThrow(msg)

describe('parseCarePatch', () => {
  it('accepts every field and only returns what was sent', () => {
    const p = parseCarePatch({
      contract_start: '2026-01-01', contract_end: '2026-12-31', videos_included: 24, renewal_status: 'discussed',
      care_notes: '  Likes voice notes  ', miro_url: 'https://miro.com/app/board/abc/',
      onboarding: { welcome_sent: '2026-01-02', call_done: null },
    })
    expect(p.care).toEqual({
      contract_start: '2026-01-01', contract_end: '2026-12-31', videos_included: 24, renewal_status: 'discussed',
      care_notes: 'Likes voice notes', miro_url: 'https://miro.com/app/board/abc/',
    })
    expect(p.onboarding).toEqual({ welcome_sent: '2026-01-02', call_done: null })
    expect(parseCarePatch({ care_notes: 'x' }).care).toEqual({ care_notes: 'x' })
  })

  it('null and empty text clear a field', () => {
    expect(parseCarePatch({ care_notes: '   ', miro_url: '', contract_end: null }).care)
      .toEqual({ care_notes: null, miro_url: null, contract_end: null })
  })

  it('rejects impossible dates and an end before the start (also against the saved start)', () => {
    bad({ contract_end: '2026-02-30' }, /date/)
    bad({ contract_start: '01/02/2026' }, /date/)
    bad({ contract_start: '2026-06-01', contract_end: '2026-05-01' }, /before/)
    bad({ contract_end: '2026-05-01' }, /before/, { contract_start: '2026-06-01', contract_end: null })
  })

  it('only allows real https links for Miro (no javascript: links)', () => {
    bad({ miro_url: 'javascript:alert(1)' }, /https/)
    bad({ miro_url: 'http://miro.com/x' }, /https/)
    bad({ miro_url: 'miro.com/x' }, /https/)
  })

  it('validates renewal status, video count, onboarding steps and unknown fields', () => {
    bad({ renewal_status: 'maybe' }, /renewal_status/)
    bad({ videos_included: -1 }, /whole number/)
    bad({ videos_included: 2.5 }, /whole number/)
    bad({ onboarding: { coffee_drunk: '2026-01-01' } }, /Unknown onboarding/)
    bad({ onboarding: { call_done: 'yesterday' } }, /date/)
    bad({ client_id: 'someone-else' }, /Unknown field/)
    bad({}, /Nothing to update/)
    bad(null, /JSON object/)
  })
})
