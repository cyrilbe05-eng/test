import { describe, expect, it } from 'vitest'
import {
  MULTIPART_THRESHOLD,
  MIN_PART_SIZE,
  TARGET_MAX_PARTS,
  MAX_PARTS,
  backoffDelayMs,
  computePartCount,
  computePartSize,
  createConnectionReporter,
} from './uploadPlanner'

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

describe('computePartSize / computePartCount', () => {
  it('uses the minimum part size for files near the threshold', () => {
    expect(computePartSize(MULTIPART_THRESHOLD)).toBe(MIN_PART_SIZE)
    expect(computePartSize(5 * GB)).toBe(MIN_PART_SIZE)
  })

  it('scales the part size up so huge files stay near the target part count', () => {
    const size = 100 * GB
    const partSize = computePartSize(size)
    expect(partSize).toBeGreaterThan(MIN_PART_SIZE)
    expect(computePartCount(size, partSize)).toBeLessThanOrEqual(TARGET_MAX_PARTS)
  })

  it('never exceeds the S3/R2 part-count protocol limit for plausible sizes', () => {
    for (const size of [MULTIPART_THRESHOLD, GB, 10 * GB, 500 * GB, 1000 * GB]) {
      const partSize = computePartSize(size)
      expect(computePartCount(size, partSize)).toBeLessThanOrEqual(MAX_PARTS)
    }
  })

  it('a 200 MB file gets multipart with a handful of parts', () => {
    const size = 200 * MB
    expect(size >= MULTIPART_THRESHOLD).toBe(true)
    expect(computePartCount(size, computePartSize(size))).toBe(4)
  })
})

describe('backoffDelayMs', () => {
  const noJitter = () => 0
  it('grows exponentially', () => {
    expect(backoffDelayMs(1, {}, noJitter)).toBe(1000)
    expect(backoffDelayMs(2, {}, noJitter)).toBe(2000)
    expect(backoffDelayMs(3, {}, noJitter)).toBe(4000)
  })
  it('caps at capMs', () => {
    expect(backoffDelayMs(10, {}, noJitter)).toBe(15_000)
  })
  it('adds bounded jitter', () => {
    const d = backoffDelayMs(1, {}, () => 1)
    expect(d).toBe(1500)
  })
})

describe('createConnectionReporter', () => {
  it('reports only state changes', () => {
    const seen: string[] = []
    const rep = createConnectionReporter((s) => seen.push(s))
    rep.set('uploading') // initial state — no change
    rep.set('retrying')
    rep.set('retrying')
    rep.set('offline')
    rep.set('uploading')
    expect(seen).toEqual(['retrying', 'offline', 'uploading'])
    expect(rep.get()).toBe('uploading')
  })
})
