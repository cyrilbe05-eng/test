import { describe, expect, it } from 'vitest'
import { isHevcVideo } from './playbook'

const ascii = (s: string) => new TextEncoder().encode(s)
const blob = (...chunks: Uint8Array[]) => new Blob(chunks as BlobPart[])

describe('isHevcVideo', () => {
  it('finds the HEVC marker at the start or the end of the file', async () => {
    expect(await isHevcVideo(blob(ascii('....ftypqt  ....stsd....hvc1....')))).toBe(true)
    const big = new Uint8Array(10 * 1024 * 1024) // marker only in the last bytes (iPhone layout)
    expect(await isHevcVideo(blob(big, ascii('moov..stsd..hev1..')), 1024 * 1024)).toBe(true)
  })

  it('says no for regular H.264 MP4s', async () => {
    expect(await isHevcVideo(blob(ascii('....ftypisom....stsd....avc1....')))).toBe(false)
  })
})
