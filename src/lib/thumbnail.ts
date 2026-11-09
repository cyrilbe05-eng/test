import type { useApiFetch } from '@/lib/api'

// Clip thumbnails, made in the browser: load the video, jump ~1 s in, draw
// one frame to a canvas, save it as a small JPEG next to the clip in R2
// (api/_helpers/care/thumbs.ts). Works from a local File (on upload) or from
// the clip's signed URL (backfill in the picker — needs CORS GET on R2,
// already part of the bucket setup).

const WIDTH = 360

export function grabFrame(src: string, opts: { crossOrigin?: boolean } = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    if (opts.crossOrigin) video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const done = (fn: () => void) => { clearTimeout(timer); video.removeAttribute('src'); video.load(); fn() }
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), 20_000)
    video.onerror = () => done(() => reject(new Error('cannot read video')))
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0
      video.currentTime = d > 0 ? Math.min(1, d * 0.1) : 0
    }
    video.onseeked = () => {
      try {
        const w = video.videoWidth, h = video.videoHeight
        if (!w || !h) throw new Error('no frame')
        const canvas = document.createElement('canvas')
        canvas.width = WIDTH
        canvas.height = Math.round((h / w) * WIDTH)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((b) => done(() => (b ? resolve(b) : reject(new Error('no blob')))), 'image/jpeg', 0.78)
      } catch (e) {
        done(() => reject(e))
      }
    }
    video.src = src
  })
}

export async function saveThumbnail(apiFetch: ReturnType<typeof useApiFetch>, fileId: string, blob: Blob) {
  const { key, uploadUrl } = await apiFetch<{ key: string; uploadUrl: string }>(`/api/gallery/${fileId}/thumbnail`, { method: 'POST' })
  const put = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
  if (!put.ok) throw new Error('thumbnail upload failed')
  await apiFetch(`/api/gallery/${fileId}/thumbnail`, { method: 'PUT', body: JSON.stringify({ key }) })
}

export const isVideoFile = (f: { mime_type?: string | null; file_name: string }) =>
  (f.mime_type ?? '').startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi|mts|3gp)$/i.test(f.file_name)
