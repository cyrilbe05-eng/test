import { describe, expect, it } from 'vitest'
import { resumableStream, uniqueNames } from './zipDownload'

describe('uniqueNames', () => {
  it('keeps distinct names', () => {
    expect(uniqueNames(['a.mp4', 'b.mp4'])).toEqual(['a.mp4', 'b.mp4'])
  })
  it('numbers repeats, ignoring case', () => {
    expect(uniqueNames(['a.mp4', 'A.mp4', 'a.mp4'])).toEqual(['a.mp4', 'A (2).mp4', 'a (3).mp4'])
  })
  it('no extension and slashes', () => {
    expect(uniqueNames(['clip', 'clip', 'x/y.mov'])).toEqual(['clip', 'clip (2)', 'x_y.mov'])
  })
  it('never collides with an existing "(2)" name', () => {
    const out = uniqueNames(['a (2).mp4', 'a.mp4', 'a.mp4'])
    expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(3)
  })
})

// ── Resume after a dropped connection ───────────────────────────────────────

const DATA = Uint8Array.from({ length: 1000 }, (_, i) => i % 251)
const noWait = async () => {}

/** A body that sends `from..to` in 100-byte chunks, then breaks (drop) or ends. */
function body(from: number, to: number, drop: boolean) {
  let at = from
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (at >= to) { if (drop) c.error(new TypeError('network error')); else c.close(); return }
      const end = Math.min(to, at + 100)
      c.enqueue(DATA.slice(at, end)); at = end
    },
  })
}
async function readAll(s: ReadableStream<Uint8Array>) {
  const parts: number[] = []
  const r = s.getReader()
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(...value) }
  return Uint8Array.from(parts)
}

describe('resumableStream', () => {
  it('picks up where it stopped (Range)', async () => {
    const calls: (string | null)[] = []
    const fetchImpl = async (_u: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string> | undefined)?.Range ?? null
      calls.push(range)
      if (!range) return new Response(body(0, 450, true), { status: 200 }) // drops at 450
      const from = Number(range.match(/bytes=(\d+)-/)![1])
      return new Response(body(from, 1000, false), { status: 206 })
    }
    const out = await readAll(resumableStream(async () => 'u', fetchImpl, noWait))
    expect(out).toEqual(DATA)
    expect(calls).toEqual([null, 'bytes=450-'])
  })

  it('server ignoring Range: skips the bytes already sent', async () => {
    let n = 0
    const fetchImpl = async () => new Response(n++ === 0 ? body(0, 300, true) : body(0, 1000, false), { status: 200 })
    expect(await readAll(resumableStream(async () => 'u', fetchImpl, noWait))).toEqual(DATA)
  })

  it('gets a fresh link on every retry', async () => {
    let links = 0
    let n = 0
    const fetchImpl = async () => { if (n++ < 2) throw new TypeError('offline'); return new Response(body(0, 1000, false)) }
    await readAll(resumableStream(async () => `u${++links}`, fetchImpl, noWait))
    expect(links).toBe(3)
  })

  it('gives up on a refusal (403) at once', async () => {
    let n = 0
    const fetchImpl = async () => { n++; return new Response('no', { status: 403 }) }
    await expect(readAll(resumableStream(async () => 'u', fetchImpl, noWait))).rejects.toThrow('HTTP 403')
    expect(n).toBe(1)
  })

  it('gives up after repeated drops', async () => {
    let n = 0
    const fetchImpl = async () => { n++; throw new TypeError('offline') }
    await expect(readAll(resumableStream(async () => 'u', fetchImpl, noWait))).rejects.toThrow()
    expect(n).toBe(9)
  })
})
