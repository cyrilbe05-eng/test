import { downloadZip } from 'client-zip'

// "Download all". Built for slow, unreliable connections and low-end phones:
//   - Chrome / Edge desktop (save dialog available): ONE zip, written straight
//     to disk as it downloads (no memory build-up). Each file RESUMES where it
//     stopped after a dropped connection (HTTP Range), instead of failing the
//     whole zip.
//   - Everywhere else (phones, Safari, Firefox): no zip. Every file is a
//     normal browser download — resumable by the browser, nearly no memory,
//     carries on if the page is left — started one after another with a
//     pause, because a fast burst of downloads gets blocked by the browser
//     (the original bug: only a random handful arrived).

export type ZipItem = { name: string; size: number; url: () => Promise<string> }
export type DownloadResult = 'saved' | 'cancelled' | 'one_by_one'

const PAUSE_MS = 1500
const MAX_TRIES = 8

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

type Fetch = (url: string, init?: RequestInit) => Promise<Response>
type Wait = (ms: number) => Promise<void>
const sleep: Wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One file's bytes as a stream that survives dropped connections: on an
 * error it waits (longer each time, and until the device is back online),
 * gets a fresh link and asks for the rest only (Range: bytes=N-). A server
 * that ignores Range and sends everything again is handled by skipping the
 * bytes already passed on.
 */
export function resumableStream(getUrl: () => Promise<string>, fetchImpl: Fetch = fetch, wait: Wait = sleep): ReadableStream<Uint8Array> {
  let received = 0
  let tries = 0
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let skip = 0

  const open = async () => {
    const res = await fetchImpl(await getUrl(), received ? { headers: { Range: `bytes=${received}-` } } : undefined)
    if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status}`), { http: res.status })
    skip = received && res.status !== 206 ? received : 0
    reader = res.body.getReader()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        try {
          if (!reader) await open()
          const { done, value } = await reader!.read()
          if (done) { controller.close(); return }
          let chunk = value
          if (skip) {
            const drop = Math.min(skip, chunk.byteLength)
            skip -= drop
            chunk = chunk.subarray(drop)
            if (!chunk.byteLength) continue
          }
          received += chunk.byteLength
          tries = 0
          controller.enqueue(chunk)
          return
        } catch (e) {
          reader = null
          // A real refusal (403, 404…) won't fix itself; a dropped connection or 5xx might.
          const http = (e as { http?: number }).http
          if ((http && http < 500) || ++tries > MAX_TRIES) { controller.error(e); return }
          await wait(Math.min(30_000, 1000 * 2 ** (tries - 1)))
          while (typeof navigator !== 'undefined' && navigator.onLine === false) await wait(2000)
        }
      }
    },
  })
}

type SavePicker = (o: { suggestedName: string; types?: unknown[] }) => Promise<{ createWritable: () => Promise<WritableStream> }>

export async function downloadAll(zipName: string, items: ZipItem[], onFile?: (done: number) => void): Promise<DownloadResult> {
  const names = uniqueNames(items.map((i) => i.name))
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

  if (picker) {
    const fileName = zipName.toLowerCase().endsWith('.zip') ? zipName : `${zipName}.zip`
    let handle
    try {
      handle = await picker({ suggestedName: fileName, types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
      throw e
    }
    let done = 0
    async function* entries() {
      for (const [i, item] of items.entries()) {
        if (i > 0) onFile?.(++done)
        yield { name: names[i], input: resumableStream(item.url) }
      }
    }
    await downloadZip(entries()).body!.pipeTo(await handle.createWritable())
    onFile?.(items.length)
    return 'saved'
  }

  for (const [i, item] of items.entries()) {
    const a = document.createElement('a')
    a.href = await item.url()
    a.download = names[i]
    a.rel = 'noopener'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    onFile?.(i + 1)
    if (i < items.length - 1) await sleep(PAUSE_MS)
  }
  return 'one_by_one'
}
