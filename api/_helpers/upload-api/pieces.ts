/** Collects downloaded bytes and cuts them into storage pieces.
 *  Storage (R2/S3) needs every piece except the last to be exactly the same
 *  size, so `full()` only ever hands out pieces of exactly `size` bytes. */
export class Pieces {
  private chunks: Buffer[] = []
  bytes = 0
  constructor(readonly size: number) {}

  add(chunk: Buffer) { this.chunks.push(chunk); this.bytes += chunk.length }

  /** Everything collected so far, without taking it (for looking at the first bytes). */
  peek(): Buffer { return Buffer.concat(this.chunks, this.bytes) }

  /** One piece of exactly `size` bytes, or null if there isn't enough yet. */
  full(): Buffer | null {
    if (this.bytes < this.size) return null
    const all = this.peek()
    const rest = all.subarray(this.size)
    this.chunks = rest.length ? [rest] : []
    this.bytes = rest.length
    return all.subarray(0, this.size)
  }

  /** Whatever is left (the last, shorter piece), or null if nothing is. */
  last(): Buffer | null {
    if (!this.bytes) return null
    const all = this.peek()
    this.chunks = []; this.bytes = 0
    return all
  }
}
