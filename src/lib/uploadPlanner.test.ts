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
  isNetworkError,
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

  it('a 200 MB file gets multipart with small, cheap-to-retry parts', () => {
    const size = 200 * MB
    expect(size >= MULTIPART_THRESHOLD).toBe(true)
    expect(computePartCount(size, computePartSize(size))).toBe(13) // 16 MB parts
  })

  it('a 40 MB file is above the threshold (resume-not-restart for typical videos)', () => {
    expect(40 * MB >= MULTIPART_THRESHOLD).toBe(true)
  })
})

describe('isNetworkError', () => {
  it('classifies transport-level failures as network errors', () => {
    expect(isNetworkError(new Error('network'))).toBe(true) // XHR onerror marker
    expect(isNetworkError(new Error('part upload stalled — no progress'))).toBe(true)
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true) // Chrome
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true) // Firefox
  })

  it('never classifies an error carrying an HTTP status as a network error', () => {
    expect(isNetworkError(Object.assign(new Error('Failed to fetch'), { status: 500 }))).toBe(false)
    expect(isNetworkError(Object.assign(new Error('Forbidden'), { status: 403 }))).toBe(false)
    expect(isNetworkError(Object.assign(new Error('upload failed (500)'), { status: 500 }))).toBe(false)
  })

  it('does not classify ordinary errors as network errors', () => {
    expect(isNetworkError(new Error('revision_limit_reached'))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
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
