import { downloadZip } from 'client-zip'

// "Download all" as ONE .zip. Firing one browser download per file (the old
// way) gets throttled/blocked by browsers after the first few, so only a
// random handful of clips arrived. The zip is built in the browser from the
// R2 signed URLs, so big footage never passes through our server.
//   - Chrome / Edge desktop: streamed straight to disk (any size).
//   - Elsewhere: built in memory up to MEMORY_LIMIT, else one file at a time
//     with a pause between (the browser asks once to allow it).

export type ZipItem = { name: string; size: number; url: () => Promise<string> }
export type ZipResult = 'saved' | 'cancelled' | 'one_by_one'

const MEMORY_LIMIT = 1.5 * 1024 ** 3
const PAUSE_MS = 1500

/** "a.mp4", "a.mp4" → "a.mp4", "a (2).mp4" — a zip can't hold two equal names. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((raw) => {
    const name = raw.replace(/[\\/]/g, '_') || 'file'
    const key = name.toLowerCase()
    if (!seen.has(key)) { seen.set(key, 1); return name }
    const dot = name.lastIndexOf('.')
    let n = seen.get(key)!
    let alt: string
    do {
      n++
      alt = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
    } while (seen.has(alt.toLowerCase()))
    seen.set(key, n)
    seen.set(alt.toLowerCase(), 1)
    return alt
  })
}

type SavePicker = (o: { suggestedName: string; types?: unknown[] }) => Promise<{ createWritable: () => Promise<WritableStream> }>

export async function downloadAsZip(zipName: string, items: ZipItem[], onFile?: (done: number) => void): Promise<ZipResult> {
  const names = uniqueNames(items.map((i) => i.name))
  let done = 0
  async function* entries() {
    for (const [i, item] of items.entries()) {
      const res = await fetch(await item.url())
      if (!res.ok) throw new Error(`Could not fetch ${item.name}`)
      yield { name: names[i], input: res, size: item.size || undefined }
      onFile?.(++done)
    }
  }
  const fileName = zipName.toLowerCase().endsWith('.zip') ? zipName : `${zipName}.zip`

  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  if (picker) {
    let handle
    try {
      handle = await picker({ suggestedName: fileName, types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
      throw e
    }
    await downloadZip(entries()).body!.pipeTo(await handle.createWritable())
    return 'saved'
  }

  const total = items.reduce((s, i) => s + (i.size || 0), 0)
  if (total <= MEMORY_LIMIT) {
    const blob = await downloadZip(entries()).blob()
    const href = URL.createObjectURL(blob)
    click(href, fileName)
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
    return 'saved'
  }

  for (const [i, item] of items.entries()) {
    click(await item.url(), names[i])
    onFile?.(i + 1)
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS))
  }
  return 'one_by_one'
}

function click(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}
