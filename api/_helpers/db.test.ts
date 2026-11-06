import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbQueryIn } from './db'

/** Stand-in for the D1 REST API: echoes one row per bound id, and refuses a
 *  statement with more than 100 parameters the way production D1 does. */
function stubD1() {
  const calls: { sql: string; params: unknown[] }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    const { sql, params } = JSON.parse(init.body) as { sql: string; params: unknown[] }
    calls.push({ sql, params })
    if (params.length > 100) {
      return { ok: false, status: 400, text: async () => 'too many SQL variables' }
    }
    return {
      ok: true,
      json: async () => ({ success: true, errors: [], result: [{ success: true, errors: [], results: params.map((id) => ({ id })) }] }),
    }
  }))
  return calls
}

afterEach(() => { vi.unstubAllGlobals() })

describe('dbQueryIn', () => {
  it('splits a long id list under the 100-parameter cap and returns every row', async () => {
    const calls = stubD1()
    const ids = Array.from({ length: 250 }, (_, i) => `e${i}`)

    const rows = await dbQueryIn<{ id: string }>((ph) => `SELECT id FROM t WHERE id IN (${ph})`, ids)

    expect(calls.map((c) => c.params.length)).toEqual([100, 100, 50])
    expect(calls[2].sql).toBe(`SELECT id FROM t WHERE id IN (${Array(50).fill('?').join(',')})`)
    expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort())
  })

  it('sends exactly 100 ids as one statement', async () => {
    const calls = stubD1()
    await dbQueryIn((ph) => `SELECT id FROM t WHERE id IN (${ph})`, Array.from({ length: 100 }, (_, i) => i))
    expect(calls).toHaveLength(1)
  })

  it('makes no request for an empty list', async () => {
    const calls = stubD1()
    expect(await dbQueryIn((ph) => `SELECT id FROM t WHERE id IN (${ph})`, [])).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
