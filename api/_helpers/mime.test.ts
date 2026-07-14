import { describe, expect, it } from 'vitest'
import { inferMimeType } from './mime'

describe('inferMimeType', () => {
  it('keeps a meaningful stored type', () => {
    expect(inferMimeType('final.mp4', 'video/mp4')).toBe('video/mp4')
    expect(inferMimeType('weird.bin', 'video/webm')).toBe('video/webm')
  })

  it('repairs an empty stored type from the extension (blank File.type case)', () => {
    expect(inferMimeType('cut_v2.mov', '')).toBe('video/quicktime')
    expect(inferMimeType('cut_v2.mkv', null)).toBe('video/x-matroska')
    expect(inferMimeType('FINAL.MP4', undefined)).toBe('video/mp4')
  })

  it('repairs application/octet-stream (multipart R2 objects)', () => {
    expect(inferMimeType('deliverable.mp4', 'application/octet-stream')).toBe('video/mp4')
    expect(inferMimeType('poster.jpg', 'binary/octet-stream')).toBe('image/jpeg')
  })

  it('falls back to the stored value (or null) for unknown extensions', () => {
    expect(inferMimeType('project.prproj', 'application/octet-stream')).toBe('application/octet-stream')
    expect(inferMimeType('noextension', '')).toBe(null)
    expect(inferMimeType('archive.xyz', null)).toBe(null)
  })
})
