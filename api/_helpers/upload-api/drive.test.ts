import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Stand-in for Google: openLink returns canned pages keyed by address.
const pages = new Map<string, { status: number; body: string }>()
vi.mock('./links.js', async (orig) => {
  const real = await orig<typeof import('./links.js')>()
  return {
    ...real,
    openLink: vi.fn(async (url: string) => {
      const key = [...pages.keys()].find((k) => url.includes(k))
      const page = key ? pages.get(key)! : { status: 404, body: 'not found' }
      return { status: page.status, headers: {}, body: Readable.from([Buffer.from(page.body)]), finalUrl: url }
    }),
  }
})
const { driveFileDownloadUrl, listDriveFolder, parseDriveFolder, parseEmbeddedFolderHtml } = await import('./drive.js')

const ROOT = '1RootFolderAbcdefgh'
const SUB = '1SubFolderAbcdefghi'
// Same shape as Google's real page, including the small file-type icon.
const entry = (id: string, name: string, folder = false, type = '') =>
  `<div class="flip-entry" id="entry-${id}" tabindex="0" role="link"><div class="flip-entry-info"><a href="https://drive.google.com/${folder ? `drive/folders/${id}` : `file/d/${id}/view?usp=drive_web`}" target="_blank"><div class="flip-entry-visual"><img src="x"></div>${type ? `<div class="flip-entry-list-icon"><img src="https://drive-thirdparty.googleusercontent.com/16/type/${type}" alt=""/></div>` : ''}<div class="flip-entry-title">${name}</div></a></div></div>`
const page = (...entries: string[]) => `<html><body><div class="flip-list">${entries.join('')}</div></body></html>`

afterEach(() => { pages.clear(); delete process.env.GOOGLE_DRIVE_API_KEY })

describe('Drive folder links', () => {
  it('recognises folder links (and not file links)', () => {
    expect(parseDriveFolder(`https://drive.google.com/drive/folders/${ROOT}?usp=sharing`)).toEqual({ id: ROOT, resourceKey: null })
    expect(parseDriveFolder(`https://drive.google.com/drive/u/1/folders/${ROOT}`)?.id).toBe(ROOT)
    expect(parseDriveFolder(`https://drive.google.com/drive/folders/${ROOT}?resourcekey=0-abc`)?.resourceKey).toBe('0-abc')
    expect(parseDriveFolder(`https://drive.google.com/embeddedfolderview?id=${ROOT}`)?.id).toBe(ROOT)
    expect(parseDriveFolder(`https://drive.google.com/file/d/${ROOT}/view`)).toBeNull()
    expect(parseDriveFolder('https://example.com/drive/folders/1RootFolderAbcdefgh')).toBeNull()
  })
  it('builds direct download links for each file', () => {
    expect(driveFileDownloadUrl('1abcdefghijk', null)).toBe('https://drive.usercontent.google.com/download?id=1abcdefghijk&export=download&confirm=t')
    expect(driveFileDownloadUrl('1abcdefghijk', '0-k')).toContain('&resourcekey=0-k')
  })
})

describe("Google's folder page (no API key)", () => {
  it('reads files and sub-folders, decoding names', () => {
    const items = parseEmbeddedFolderHtml(page(entry('1aaaaaaaaaaa', 'Day &amp; night.MOV'), entry(SUB, 'B-roll', true), entry('1bbbbbbbbbbb', 'notes.pdf')))
    expect(items).toEqual([
      { id: '1aaaaaaaaaaa', name: 'Day & night.MOV', folder: false, resourceKey: null, mimeType: null },
      { id: SUB, name: 'B-roll', folder: true, resourceKey: null, mimeType: null },
      { id: '1bbbbbbbbbbb', name: 'notes.pdf', folder: false, resourceKey: null, mimeType: null },
    ])
  })
  it('lists videos in the folder and the folders inside it, skipping other files', async () => {
    pages.set(`embeddedfolderview?id=${ROOT}`, { status: 200, body: page(entry('1aaaaaaaaaaa', 'A.mov'), entry(SUB, 'Day 2', true), entry('1ccccccccccc', 'cover.jpg')) })
    pages.set(`embeddedfolderview?id=${SUB}`, { status: 200, body: page(entry('1bbbbbbbbbbb', 'B.mp4'), entry('1ddddddddddd', 'C.MP4')) })
    const r = await listDriveFolder({ id: ROOT, resourceKey: null }, 100)
    expect(r.method).toBe('simple')
    expect(r.videos.map((v) => v.path)).toEqual(['A.mov', 'Day 2/B.mp4', 'Day 2/C.MP4'])
    expect(r.skipped).toEqual(['cover.jpg'])
    expect(r.truncated).toBe(false)
  })
  it("finds videos whose names have no extension, from Google's file-type icon", async () => {
    pages.set(`embeddedfolderview?id=${ROOT}`, { status: 200, body: page(
      entry('1aaaaaaaaaaa', 'Raw footage', false, 'video/mp4'), entry('1bbbbbbbbbbb', 'EDITED VIDEO', false, 'video/quicktime'),
      entry('1ccccccccccc', 'Extra Details', false, 'application/vnd.google-apps.document'), entry('1ddddddddddd', 'IMG_5104.PNG', false, 'image/jpeg')) })
    const r = await listDriveFolder({ id: ROOT, resourceKey: null }, 100)
    expect(r.videos.map((v) => v.path)).toEqual(['Raw footage', 'EDITED VIDEO'])
    expect(r.skipped).toEqual(['Extra Details', 'IMG_5104.PNG'])
  })
  it('says clearly when the folder is not shared', async () => {
    pages.set(`embeddedfolderview?id=${ROOT}`, { status: 200, body: '<html>Sign in to continue to Google Drive</html>' })
    await expect(listDriveFolder({ id: ROOT, resourceKey: null }, 100)).rejects.toThrow(/Anyone with the link/)
  })
  it('stops past the limit', async () => {
    pages.set(`embeddedfolderview?id=${ROOT}`, { status: 200, body: page(...Array.from({ length: 5 }, (_, i) => entry(`1vvvvvvvvvv${i}`, `v${i}.mp4`))) })
    const r = await listDriveFolder({ id: ROOT, resourceKey: null }, 3)
    expect(r.truncated).toBe(true)
  })
})

describe('Drive API listing (API key set)', () => {
  it('lists videos recursively with their sizes', async () => {
    process.env.GOOGLE_DRIVE_API_KEY = 'test-key'
    const files = (list: unknown[]) => JSON.stringify({ files: list })
    pages.set(`%27${ROOT}%27+in+parents`, { status: 200, body: files([
      { id: '1aaaaaaaaaaa', name: 'A.mov', mimeType: 'video/quicktime', size: '1000' },
      { id: SUB, name: 'Day 2', mimeType: 'application/vnd.google-apps.folder' },
      { id: '1ccccccccccc', name: 'cover.jpg', mimeType: 'image/jpeg', size: '5' },
    ]) })
    pages.set(`%27${SUB}%27+in+parents`, { status: 200, body: files([
      { id: '1bbbbbbbbbbb', name: 'clip', mimeType: 'video/mp4', size: '2000' },
    ]) })
    const r = await listDriveFolder({ id: ROOT, resourceKey: null }, 100)
    expect(r.method).toBe('api')
    expect(r.videos).toEqual([
      { id: '1aaaaaaaaaaa', name: 'A.mov', path: 'A.mov', size: 1000, resourceKey: null },
      { id: '1bbbbbbbbbbb', name: 'clip', path: 'Day 2/clip', size: 2000, resourceKey: null },
    ])
    expect(r.skipped).toEqual(['cover.jpg'])
  })
  it('says clearly when Google refuses the folder', async () => {
    process.env.GOOGLE_DRIVE_API_KEY = 'test-key'
    await expect(listDriveFolder({ id: ROOT, resourceKey: null }, 100)).rejects.toThrow(/Anyone with the link/)
  })
})
