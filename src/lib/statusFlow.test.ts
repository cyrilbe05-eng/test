import { describe, expect, it } from 'vitest'
import { isBackward } from './statusFlow'

describe('isBackward', () => {
  it('earlier stages are backwards', () => {
    expect(isBackward('client_approved', 'in_progress')).toBe(true)
    expect(isBackward('client_reviewing', 'pending_assignment')).toBe(true)
    expect(isBackward('admin_approved', 'in_progress')).toBe(true)
    expect(isBackward('client_approved', 'client_reviewing')).toBe(true)
  })
  it('the normal flow is not, even when it goes back to the editor', () => {
    expect(isBackward('in_review', 'revision_requested')).toBe(false)
    expect(isBackward('client_reviewing', 'revision_requested')).toBe(false)
    expect(isBackward('revision_requested', 'in_progress')).toBe(false)
    expect(isBackward('pending_assignment', 'in_progress')).toBe(false)
  })
  it('skipping ahead is forward', () => {
    expect(isBackward('pending_assignment', 'client_approved')).toBe(false)
    expect(isBackward('in_progress', 'client_reviewing')).toBe(false)
  })
  it('same stage or unknown', () => {
    expect(isBackward('in_progress', 'in_progress')).toBe(false)
    expect(isBackward('nope', 'in_progress')).toBe(false)
  })
})
