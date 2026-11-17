// YouTube / Loom links for Playbook videos: which service, the clean link
// to store, and the address the in-page player embeds. Anything else is
// refused. Pure; tested in links.test.ts.

export type LinkSource = 'youtube' | 'loom'

export function parseVideoLink(raw: unknown): { source: LinkSource; url: string; embedUrl: string } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  let u: URL
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const ID = /^[A-Za-z0-9_-]{6,64}$/

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null
    else if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)
      id = m?.[1] ?? null
    }
    if (!id || !ID.test(id)) return null
    return { source: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` }
  }

  if (host === 'loom.com') {
    const m = /^\/(?:share|embed)\/([^/?#]+)/.exec(u.pathname)
    const id = m?.[1]
    if (!id || !ID.test(id)) return null
    return { source: 'loom', url: `https://www.loom.com/share/${id}`, embedUrl: `https://www.loom.com/embed/${id}` }
  }

  return null
}

/** Attachment links: plain web links only. */
export function cleanLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim().slice(0, 2000)
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.toString() : null
  } catch { return null }
}
