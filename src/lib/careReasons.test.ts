import { describe, expect, it } from 'vitest'
import { shortReason, isAllClear } from './careReasons'

describe('shortReason', () => {
  it('turns every server sentence into a short tag', () => {
    const cases: [string, string][] = [
      ['No new video request for 3 days', 'No request · 3d'],
      ['No new video request for 1 day', 'No request · 1d'],
      ['"FAQ short" has been in progress for 5 days', 'In progress · 5d'],
      ['"FAQ short" is due from the editor today', 'Due today'],
      ['"Record + upload · batch 2" overdue by 4 days', 'Step late · 4d'],
      ['No contact for 12 days', 'No contact · 12d'],
      ['No contact logged yet', 'No contact yet'],
      ["Contract ends in 8 days and renewal hasn't been discussed", 'Renewal · 8d'],
      ["Contract ends today and renewal hasn't been discussed", 'Renewal · today'],
      ["Contract ended 3 days ago and renewal hasn't been discussed", 'Renewal · ended'],
      ['Contract ends in 23 days', 'Ends in 23d'],
      ['Contract ends today', 'Ends today'],
      ['Contract ended 2 days ago', 'Ended 2d ago'],
      ['Finished onboarding', 'Onboarded'],
    ]
    for (const [full, label] of cases) expect(shortReason(full)).toEqual({ label, full })
  })

  it('keeps unknown sentences as they are', () => {
    expect(shortReason('Something new')).toEqual({ label: 'Something new', full: 'Something new' })
  })

  it('recognises the all-clear line', () => {
    expect(isAllClear('No alerts — everything is on track')).toBe(true)
    expect(isAllClear('No contact yet')).toBe(false)
  })
})
