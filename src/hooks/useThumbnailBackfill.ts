import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { grabFrame, isVideoFile, saveThumbnail } from '@/lib/thumbnail'
import type { GalleryFile } from '@/types'

// Clips already tried this session (so a clip that can't be read isn't
// retried on every open).
const tried = new Set<string>()
// Many iPhone clips are HEVC, which some browsers (Chrome/Firefox on many
// Windows PCs and Android phones) can't decode. After this many failures in a
// row this browser stops trying for the session; a browser that can read them
// (Safari, most Macs and iPhones) fills them in for everyone.
const GIVE_UP_AFTER = 5
let failStreak = 0
// Refresh the tiles after this many new thumbnails, so they appear while the
// rest are still being made.
const REFRESH_EVERY = 6

/** Makes thumbnails for clips in this gallery that don't have one yet, one at
 *  a time in the background, while the gallery (or picker) is open. */
export function useThumbnailBackfill(ownerId: string, files: GalleryFile[], thumbs: Record<string, string> | undefined) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  useEffect(() => {
    if (!thumbs || failStreak >= GIVE_UP_AFTER) return
    const todo = files.filter((f) => isVideoFile(f) && !thumbs[f.id] && !tried.has(f.id))
    if (!todo.length) return
    let stop = false
    ;(async () => {
      let pending = 0
      for (const f of todo) {
        if (stop || failStreak >= GIVE_UP_AFTER) break
        tried.add(f.id)
        try {
          const { url } = await apiFetch<{ url: string }>(`/api/gallery/${f.id}/signed-url?quick=1`)
          await saveThumbnail(apiFetch, f.id, await grabFrame(url, { crossOrigin: true }))
          failStreak = 0
          if (++pending >= REFRESH_EVERY) { pending = 0; qc.invalidateQueries({ queryKey: ['gallery_thumbs', ownerId] }) }
        } catch {
          failStreak++ // best effort
        }
      }
      if (pending) qc.invalidateQueries({ queryKey: ['gallery_thumbs', ownerId] })
    })()
    return () => { stop = true }
  }, [ownerId, files, thumbs, apiFetch, qc])
}
