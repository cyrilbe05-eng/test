import { describe, expect, it } from 'vitest'
import { generateKey, hashKey, looksLikeKey, KEY_PREFIX } from './keys.js'
import { fileNameFrom, hasVideoExtension, isPrivateAddress, normalizeLink, sniffVideo } from './links.js'
import { MAX_FILE_BYTES, partPlan } from './routes.js'

describe('API keys', () => {
  it('are long, random, prefixed and stored only as a hash', () => {
    const a = generateKey(), b = generateKey()
    expect(a.key.startsWith(KEY_PREFIX)).toBe(true)
    expect(a.key).not.toBe(b.key)
    expect(looksLikeKey(a.key)).toBe(true)
    expect(a.hash).toBe(hashKey(a.key))
    expect(a.hash).not.toContain(a.key.slice(4))
    expect(a.prefix).toBe(a.key.slice(0, 10))
  })
  it('rejects anything that is not a key (e.g. a login token)', () => {
    expect(looksLikeKey('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc')).toBe(false)
    expect(looksLikeKey('pgk_short')).toBe(false)
    expect(looksLikeKey('')).toBe(false)
  })
})

describe('share links', () => {
  it('turns Google Drive share links into direct downloads', () => {
    const want = 'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp&export=download&confirm=t'
    expect(normalizeLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toBe(want)
    expect(normalizeLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe(want)
    expect(normalizeLink('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp')).toBe(want)
  })
  it('refuses Drive folder links', () => {
    expect(() => normalizeLink('https://drive.google.com/drive/folders/xyz')).toThrow(/no file/)
  })
  it('makes Dropbox links download directly', () => {
    expect(normalizeLink('https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=k&dl=0')).toBe('https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=k&dl=1')
    expect(normalizeLink('https://www.dropbox.com/s/abc/clip.mp4')).toBe('https://www.dropbox.com/s/abc/clip.mp4?dl=1')
  })
  it('keeps other direct links and refuses non-web ones', () => {
    expect(normalizeLink('https://cdn.example.com/a/b.mp4?x=1')).toBe('https://cdn.example.com/a/b.mp4?x=1')
    expect(() => normalizeLink('file:///etc/passwd')).toThrow()
    expect(() => normalizeLink('ftp://example.com/a.mp4')).toThrow()
    expect(() => normalizeLink('https://user:pw@example.com/a.mp4')).toThrow()
    expect(() => normalizeLink('not a link')).toThrow()
  })
})

describe('address guard', () => {
  it('blocks internal, local and cloud-metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
      '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })
  it('allows normal public addresses', () => {
    for (const ip of ['8.8.8.8', '142.250.74.110', '172.32.0.1', '2607:f8b0:4004:800::200e', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})

describe('video detection', () => {
  const box = (type: string, brand = '') => Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from(type + brand.padEnd(4)), Buffer.alloc(600)])
  it('recognises common video files', () => {
    expect(sniffVideo(box('ftyp', 'qt  '))?.ext).toBe('mov')
    expect(sniffVideo(box('ftyp', 'isom'))?.ext).toBe('mp4')
    expect(sniffVideo(box('moov'))?.ext).toBe('mov')
    expect(sniffVideo(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....webm'), Buffer.alloc(600)]))?.ext).toBe('webm')
  })
  it('refuses web pages and other files', () => {
    expect(sniffVideo(Buffer.from('<!DOCTYPE html><html><body>Sign in</body></html>'.padEnd(600)))).toBeNull()
    expect(sniffVideo(Buffer.from('%PDF-1.7'.padEnd(600)))).toBeNull()
    expect(sniffVideo(Buffer.from([0x50, 0x4b, 3, 4, ...Array(600).fill(0)]))).toBeNull()
  })
})

describe('file names', () => {
  it('uses the download name when given, else the link, and keeps a video extension', () => {
    expect(fileNameFrom({ 'content-disposition': 'attachment; filename="IMG_0001.MOV"' }, 'https://x/download', 'mov')).toBe('IMG_0001.MOV')
    expect(fileNameFrom({ 'content-disposition': "attachment; filename*=UTF-8''Caf%C3%A9%20clip.mp4" }, 'https://x/y', 'mp4')).toBe('Café clip.mp4')
    expect(fileNameFrom({}, 'https://cdn.example.com/media/clip%201.mp4?sig=1', 'mp4')).toBe('clip 1.mp4')
    expect(fileNameFrom({}, 'https://drive.usercontent.google.com/download?id=1', 'mov')).toBe('video.mov')
    expect(fileNameFrom({ 'content-disposition': 'attachment; filename="../../etc/x"' }, 'https://x', 'mp4')).toBe('.._.._etc_x.mp4')
  })
  it('knows video extensions', () => {
    expect(hasVideoExtension('a.MOV')).toBe(true)
    expect(hasVideoExtension('a.mp4')).toBe(true)
    expect(hasVideoExtension('a.pdf')).toBe(false)
    expect(hasVideoExtension('mp4')).toBe(false)
  })
})

describe('upload pieces', () => {
  it('uses 16 MB pieces, and bigger ones so huge files stay under 10,000 pieces', () => {
    expect(partPlan(1)).toEqual({ partSize: 16 * 1024 * 1024, partCount: 1 })
    expect(partPlan(4 * 1024 ** 3).partCount).toBe(256)
    const huge = partPlan(MAX_FILE_BYTES)
    expect(huge.partCount).toBeLessThanOrEqual(10_000)
    expect(huge.partSize % (1024 * 1024)).toBe(0)
  })
})

describe('link downloads refuse internal addresses (real connection attempt)', () => {
  it('refuses IP addresses and names that point inside', async () => {
    const { openLink } = await import('./links.js')
    await expect(openLink('http://127.0.0.1:9/x.mp4')).rejects.toThrow(/private or internal/)
    await expect(openLink('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/private or internal/)
    await expect(openLink('http://[::1]:9/x.mp4')).rejects.toThrow(/private or internal/)
    await expect(openLink('http://localhost:9/x.mp4')).rejects.toThrow(/private or internal/)
  })
})
