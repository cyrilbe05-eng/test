import { describe, expect, it } from 'vitest'
import { cleanDashes, notificationParts } from './notificationText'

describe('cleanDashes', () => {
  it('turns spaced dashes into a colon', () => {
    expect(cleanDashes('Cyril shared "X" with you — “look at this”')).toBe('Cyril shared "X" with you: “look at this”')
    expect(cleanDashes('A – B')).toBe('A: B')
    expect(cleanDashes('A - B')).toBe('A: B')
  })
  it('keeps hyphens inside words', () => {
    expect(cleanDashes('Project "How-to tutorial" has been approved')).toBe('Project "How-to tutorial" has been approved')
  })
})

describe('notificationParts', () => {
  it('bolds quoted names without the quotes', () => {
    expect(notificationParts('Revision requested for "FAQ short"')).toEqual([
      { text: 'Revision requested for ' }, { text: 'FAQ short', strong: true },
    ])
  })
  it('handles curly quotes and text after the name', () => {
    expect(notificationParts('Your video for "Team intro" is ready')).toEqual([
      { text: 'Your video for ' }, { text: 'Team intro', strong: true }, { text: ' is ready' },
    ])
    expect(notificationParts('Note: “hello”')[1]).toEqual({ text: 'hello', strong: true })
  })
  it('leaves plain text alone', () => {
    expect(notificationParts('Nova Skincare finished onboarding')).toEqual([{ text: 'Nova Skincare finished onboarding' }])
  })
})
