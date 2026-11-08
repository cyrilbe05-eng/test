// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Simulate a database where migration 011 has NOT been applied.
vi.mock('../db.js', () => ({
  dbExecute: vi.fn().mockRejectedValue(new Error('D1 error: no such table: revision_entries')),
  dbQuery: vi.fn().mockRejectedValue(new Error('D1 error: no such table: revision_entries')),
  newId: () => 'id',
  nowIso: () => new Date().toISOString(),
}))

const { recordRevisionEntries } = await import('./sop')

describe('recordRevisionEntries (hook inside "Request revision")', () => {
  it('never throws, so a client revision can never fail because of Client Care', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordRevisionEntries('project-1', 'client-1', 1)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
