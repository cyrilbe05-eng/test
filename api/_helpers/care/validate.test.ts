import { describe, it, expect } from 'vitest'
import { parseCarePatch } from './validate'

const bad = (body: unknown, msg: RegExp) => expect(() => parseCarePatch(body)).toThrow(msg)

describe('parseCarePatch', () => {
  it('accepts notes, Miro link and onboarding, and only returns what was sent', () => {
    const p = parseCarePatch({
      care_notes: '  Likes voice notes  ', miro_url: 'https://miro.com/app/board/abc/',
      onboarding: { welcome_sent: '2026-01-02', call_done: null },
    })
    expect(p.care).toEqual({ care_notes: 'Likes voice notes', miro_url: 'https://miro.com/app/board/abc/' })
    expect(p.onboarding).toEqual({ welcome_sent: '2026-01-02', call_done: null })
    expect(parseCarePatch({ care_notes: 'x' }).care).toEqual({ care_notes: 'x' })
  })

  it('null and empty text clear a field', () => {
    expect(parseCarePatch({ care_notes: '   ', miro_url: '' }).care).toEqual({ care_notes: null, miro_url: null })
  })

  it('contract fields are edited on the contract now, not here', () => {
    bad({ contract_end: '2026-12-31' }, /edit these on the contract/)
    bad({ renewal_status: 'renewed' }, /edit these on the contract/)
  })

  it('only allows real https links for Miro (no javascript: links)', () => {
    bad({ miro_url: 'javascript:alert(1)' }, /https/)
    bad({ miro_url: 'http://miro.com/x' }, /https/)
    bad({ miro_url: 'miro.com/x' }, /https/)
  })

  it('validates onboarding steps and unknown fields', () => {
    bad({ onboarding: { coffee_drunk: '2026-01-01' } }, /Unknown onboarding/)
    bad({ onboarding: { call_done: 'yesterday' } }, /date/)
    bad({ client_id: 'someone-else' }, /Unknown field/)
    bad({}, /Nothing to update/)
    bad(null, /JSON object/)
  })
})
