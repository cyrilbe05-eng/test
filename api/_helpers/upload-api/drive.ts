// Google Drive folder links: list every video in a public folder (folders
// inside it too). Two ways:
//   • with GOOGLE_DRIVE_API_KEY set: the official Drive API (sizes known, reliable)
//   • without it: the public "embedded folder" page Google serves for any
//     folder shared as "anyone with the link" (works today, unofficial)

import { hasVideoExtension, openLink } from './links.js'

export interface DriveFolderRef { id: string; resourceKey: string | null }
export interface DriveVideo { id: string; name: string; path: string; size: number | null; resourceKey: string | null }
export interface DriveListing { videos: DriveVideo[]; skipped: string[]; method: 'api' | 'simple'; truncated: boolean }

const ID = /^[A-Za-z0-9_-]{10,}$/

/** Local tests only: point Google addresses at a stand-in server. */
const base = (real: string) =>
  (process.env.LOCAL_DB_FILE && process.env.UPLOAD_API_GOOGLE_BASE) ? process.env.UPLOAD_API_GOOGLE_BASE.replace(/\/$/, '') : real

/** The folder in a Drive folder link, or null if it isn't one. */
export function parseDriveFolder(input: string): DriveFolderRef | null {
  let u: URL
  try { u = new URL(input.trim()) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null
  const id = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(u.pathname)?.[1]
    ?? (/\/(folderview|embeddedfolderview)$/.test(u.pathname) ? u.searchParams.get('id') : null)
  if (!id || !ID.test(id)) return null
  return { id, resourceKey: u.searchParams.get('resourcekey') }
}

/** Direct download address for one Drive file. */
export function driveFileDownloadUrl(id: string, resourceKey: string | null): string {
  const q = new URLSearchParams({ id, export: 'download', confirm: 't' })
  if (resourceKey) q.set('resourcekey', resourceKey)
  return `${base('https://drive.usercontent.google.com')}/download?${q}`
}

async function fetchText(url: string, headers?: Record<string, string>, maxBytes = 8 * 1024 * 1024): Promise<{ status: number; text: string }> {
  const r = await openLink(url, { timeoutMs: 30_000, headers })
  const chunks: Buffer[] = []; let n = 0
  for await (const c of r.body as AsyncIterable<Buffer>) {
    n += c.length
    if (n > maxBytes) { r.body.destroy(); throw new Error('The folder listing is too large.') }
    chunks.push(c)
  }
  return { status: r.status, text: Buffer.concat(chunks).toString('utf8') }
}

const decodeHtml = (s: string) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Entries of Google's embedded folder page: files and sub-folders. */
export function parseEmbeddedFolderHtml(html: string): { id: string; name: string; folder: boolean; resourceKey: string | null; mimeType: string | null }[] {
  const out: { id: string; name: string; folder: boolean; resourceKey: string | null; mimeType: string | null }[] = []
  const seen = new Set<string>()
  // Each entry: <div class="flip-entry" id="entry-ID" …><a href="…/file/d/ID/…" or "…/drive/folders/ID…"> … <div class="flip-entry-title">NAME</div>
  // The entry's small icon names the file type (…/16/type/video/mp4), so videos whose names
  // have no extension ("Raw footage") are still found.
  const entry = /<div class="flip-entry"[^>]*id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"([\s\S]*?)<div class="flip-entry-title">([\s\S]*?)<\/div>/g
  for (let m; (m = entry.exec(html));) {
    const [, id, href, between, rawName] = m
    const mimeType = /\/type\/([a-z0-9.+-]+\/[a-z0-9.+-]+)/i.exec(between)?.[1]?.toLowerCase() ?? null
    if (seen.has(id)) continue
    seen.add(id)
    const link = decodeHtml(href)
    const folder = /\/drive\/(?:u\/\d+\/)?folders\//.test(link)
    let resourceKey: string | null = null
    try { resourceKey = new URL(link, 'https://drive.google.com').searchParams.get('resourcekey') } catch { /* none */ }
    out.push({ id, name: decodeHtml(rawName.replace(/<[^>]*>/g, '')).trim(), folder, resourceKey, mimeType })
  }
  return out
}

const MAX_DEPTH = 6
const MAX_FOLDERS = 200

/** Every video in the folder and its sub-folders (stops counting at `limit + 1`). */
export async function listDriveFolder(ref: DriveFolderRef, limit: number): Promise<DriveListing> {
  const key = process.env.GOOGLE_DRIVE_API_KEY
  const videos: DriveVideo[] = []
  const skipped: string[] = []
  let folders = 0
  let truncated = false

  async function walk(folder: DriveFolderRef, prefix: string, depth: number): Promise<void> {
    if (truncated) return
    if (++folders > MAX_FOLDERS) { truncated = true; return }
    if (key) {
      let pageToken = ''
      do {
        const q = new URLSearchParams({
          q: `'${folder.id}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, size, resourceKey, shortcutDetails)',
          pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', key,
          ...(pageToken ? { pageToken } : {}),
        })
        const headers = folder.resourceKey ? { 'x-goog-drive-resource-keys': `${folder.id}/${folder.resourceKey}` } : undefined
        const r = await fetchText(`${base('https://www.googleapis.com')}/drive/v3/files?${q}`, headers)
        if (r.status === 403 || r.status === 404) throw new Error('Google Drive could not open this folder. Share it as "Anyone with the link".')
        if (r.status !== 200) throw new Error(`Google Drive answered ${r.status} when listing the folder.`)
        const j = JSON.parse(r.text) as { nextPageToken?: string; files: { id: string; name: string; mimeType: string; size?: string; resourceKey?: string }[] }
        for (const f of j.files ?? []) {
          const path = prefix + f.name
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            if (depth < MAX_DEPTH) await walk({ id: f.id, resourceKey: f.resourceKey ?? null }, path + '/', depth + 1)
            else skipped.push(path + '/ (too deep)')
          } else if (f.mimeType?.startsWith('video/') || hasVideoExtension(f.name)) {
            if (videos.length >= limit) { truncated = true; return }
            videos.push({ id: f.id, name: f.name, path, size: f.size ? Number(f.size) : null, resourceKey: f.resourceKey ?? null })
          } else skipped.push(path)
        }
        pageToken = j.nextPageToken ?? ''
      } while (pageToken && !truncated)
    } else {
      const q = new URLSearchParams({ id: folder.id, ...(folder.resourceKey ? { resourcekey: folder.resourceKey } : {}) })
      const r = await fetchText(`${base('https://drive.google.com')}/embeddedfolderview?${q}`)
      if (r.status !== 200 || !/flip-entry|flip-list/.test(r.text)) {
        throw new Error('Google Drive could not open this folder. Share it as "Anyone with the link".')
      }
      for (const e of parseEmbeddedFolderHtml(r.text)) {
        const path = prefix + e.name
        if (e.folder) {
          if (depth < MAX_DEPTH) await walk({ id: e.id, resourceKey: e.resourceKey }, path + '/', depth + 1)
          else skipped.push(path + '/ (too deep)')
        } else if (e.mimeType?.startsWith('video/') || hasVideoExtension(e.name)) {
          if (videos.length >= limit) { truncated = true; return }
          videos.push({ id: e.id, name: e.name, path, size: null, resourceKey: e.resourceKey })
        } else skipped.push(path)
      }
    }
  }

  await walk(ref, '', 0)
  return { videos, skipped, method: key ? 'api' : 'simple', truncated }
}
