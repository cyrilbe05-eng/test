// Link imports: turn share links into direct downloads, refuse addresses our
// server must never reach (internal networks, cloud metadata), and check
// that what comes back is really a video.

import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import type { Readable } from 'node:stream'

// ── Share links → direct downloads ───────────────────────────────────────────

/** Google Drive / Dropbox share links become direct-download links; other
 *  http(s) links are used as they are. Throws on anything that isn't http(s). */
export function normalizeLink(input: string): string {
  let u: URL
  try { u = new URL(input.trim()) } catch { throw new Error('This is not a valid link.') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https links are supported.')
  if (u.username || u.password) throw new Error('Links with a username or password are not supported.')
  const host = u.hostname.toLowerCase()

  if (host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com') {
    const id = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(u.pathname)?.[1] ?? u.searchParams.get('id')
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('This Google Drive link has no file or folder in it. Use "Share → Copy link" on a video file or a folder.')
    // confirm=t skips Drive's "can't scan this file for viruses" page on big files.
    const rk = u.searchParams.get('resourcekey')
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t${rk ? `&resourcekey=${encodeURIComponent(rk)}` : ''}`
  }
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    u.searchParams.delete('dl'); u.searchParams.delete('raw')
    u.searchParams.set('dl', '1')
    return u.toString()
  }
  return u.toString()
}

// ── Address guard ────────────────────────────────────────────────────────────

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
}

/** True for any address that is not a normal public internet address. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip)
  if (!net.isIPv6(ip)) return true
  const v6 = ip.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6)
  if (mapped) return ipv4Private(mapped[1])
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') ||
    v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff') || v6.startsWith('64:ff9b') || v6.startsWith('2001:db8')
}

/** Local testing only (never set in production): allow 127.0.0.1 test servers. */
const allowPrivate = () => !!process.env.LOCAL_DB_FILE && process.env.UPLOAD_API_ALLOW_PRIVATE_LINKS === '1'

/** DNS lookup that refuses private addresses at connection time, so a name
 *  can't pass a check and then resolve somewhere internal. */
function guardedLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '')
    const list = addresses as dns.LookupAddress[]
    const bad = list.find((a) => isPrivateAddress(a.address))
    if (bad && !allowPrivate()) return cb(Object.assign(new Error('This link points to a private or internal address.'), { code: 'EPRIVATE' }), '')
    if (options.all) return cb(null, list)
    cb(null, list[0].address, list[0].family)
  })
}

// ── Download with redirects ──────────────────────────────────────────────────

export interface LinkResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: Readable
  finalUrl: string
}

const MAX_REDIRECTS = 6

/** GET a link (optionally from a byte offset), following redirects; every hop
 *  goes through the address guard. Caller must consume or destroy `body`. */
export async function openLink(url: string, opts: { from?: number; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<LinkResponse> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The link redirected to an unsupported address.')
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, '')) && !allowPrivate()) {
      throw new Error('This link points to a private or internal address.')
    }
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http
      const req = lib.get(u, {
        lookup: guardedLookup as unknown as typeof dns.lookup,
        headers: {
          'user-agent': 'PinguStudio-UploadAPI/1.0',
          accept: '*/*',
          ...(opts.from ? { range: `bytes=${opts.from}-` } : {}),
          ...(hop === 0 ? opts.headers : {}),
        },
        timeout: opts.timeoutMs ?? 30_000,
      }, resolve)
      req.on('timeout', () => req.destroy(new Error('The link took too long to answer.')))
      req.on('error', reject)
    })
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      current = new URL(res.headers.location, current).toString()
      continue
    }
    return { status, headers: res.headers, body: res, finalUrl: current }
  }
  throw new Error('The link redirected too many times.')
}

// ── What arrived ────────────────────────────────────────────────────────────

/** Recognises the start of common video files. */
export function sniffVideo(head: Buffer): { ext: string } | null {
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12)
    return { ext: brand.startsWith('qt') ? 'mov' : brand.startsWith('M4V') ? 'm4v' : brand.startsWith('3g') ? '3gp' : 'mp4' }
  }
  // Some .mov files start with other atoms before ftyp/moov.
  if (head.length >= 8 && ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(head.toString('latin1', 4, 8))) return { ext: 'mov' }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return { ext: head.includes(Buffer.from('webm')) ? 'webm' : 'mkv' }
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 11) === 'AVI') return { ext: 'avi' }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x060e2b34) return { ext: 'mxf' }
  if (head.length >= 189 && head[0] === 0x47 && head[188] === 0x47) return { ext: 'mts' }
  return null
}

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mts', 'm2ts', '3gp', 'mxf'] as const
export const hasVideoExtension = (name: string) =>
  name.includes('.') && (VIDEO_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')

/** File name from Content-Disposition, else the link's last path part. */
export function fileNameFrom(headers: http.IncomingHttpHeaders, url: string, sniffedExt: string): string {
  const cd = String(headers['content-disposition'] ?? '')
  let name = ''
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd)
  if (star) { try { name = decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')) } catch { /* keep looking */ } }
  if (!name) name = /filename\s*=\s*"?([^";]+)"?/.exec(cd)?.[1]?.trim() ?? ''
  if (!name) {
    try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '') } catch { name = '' }
    if (name === 'download') name = ''
  }
  name = safeFileName(name)
  if (!name) name = 'video'
  return hasVideoExtension(name) ? name : `${name}.${sniffedExt}`
}

/** Keeps names readable but safe as part of a storage key. */
export function safeFileName(name: string): string {
  const visible = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('')
  return visible.replace(/[\\/:*?"<>|]+/g, '_').replace(/_+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180)
}
