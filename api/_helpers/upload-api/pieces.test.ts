import { describe, expect, it } from 'vitest'
import { Pieces } from './pieces.js'

describe('cutting downloads into storage pieces', () => {
  it('every piece but the last is exactly the piece size, however the bytes arrive', () => {
    const size = 1000
    const total = 4321
    const src = Buffer.from(Array.from({ length: total }, (_, i) => i % 251))
    const p = new Pieces(size)
    const out: Buffer[] = []
    // Arrives in odd-sized chunks, like a real download (the old code made 1000+ pieces here).
    for (let i = 0, step = 7; i < total; i += step, step = (step * 13) % 389 + 1) {
      p.add(src.subarray(i, Math.min(total, i + step)))
      for (let c; (c = p.full());) out.push(c)
    }
    const tail = p.last()
    if (tail) out.push(tail)
    expect(out.slice(0, -1).every((c) => c.length === size)).toBe(true)
    expect(out.map((c) => c.length)).toEqual([1000, 1000, 1000, 1000, 321])
    expect(Buffer.concat(out).equals(src)).toBe(true)
  })
  it('a big chunk gives several full pieces; nothing left gives no last piece', () => {
    const p = new Pieces(10)
    p.add(Buffer.alloc(30))
    expect([p.full()?.length, p.full()?.length, p.full()?.length, p.full()]).toEqual([10, 10, 10, null])
    expect(p.last()).toBeNull()
  })
})
