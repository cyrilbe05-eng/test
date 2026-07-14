import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import { canCompressInBrowser, compressVideoInBrowser } from '@/lib/videoCompress'
import type { ProjectFile } from '@/types'

interface Props {
  file: ProjectFile
  projectId: string
  canEdit: boolean
  onChanged: () => void
}

// Files at or under this size are streamable on a 2–5 Mbit/s link for typical
// video lengths — no point re-encoding them.
const SKIP_COMPRESS_UNDER_BYTES = 25 * 1024 * 1024

type Phase =
  | { kind: 'compressing'; pct: number }
  | { kind: 'uploading'; pct: number }
  | null

/** Manage the optional low-bitrate review copy of a deliverable.
 *
 *  Clients on slow connections (2–5 Mbit/s in practice) can't stream a
 *  full-quality export in real time — the player starves after a few
 *  seconds. The editor picks their normal export here; the BROWSER
 *  re-encodes it to ≤720p @ ~3 Mbit/s (no second export needed) and uploads
 *  the small result. The client player streams it automatically, while the
 *  original stays the admin-QC and download file. */
export function ReviewCopyControl({ file, projectId, canEdit, onChanged }: Props) {
  const apiFetch = useApiFetch()
  const storageAdapter = useStorageAdapter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>(null)

  const hasPreview = !!file.preview_storage_key

  const attach = async (picked: File) => {
    try {
      let toUpload = picked
      if (picked.size > SKIP_COMPRESS_UNDER_BYTES && canCompressInBrowser()) {
        setPhase({ kind: 'compressing', pct: 0 })
        toUpload = await compressVideoInBrowser(picked, (pct) => setPhase({ kind: 'compressing', pct }))
      } else if (picked.size > SKIP_COMPRESS_UNDER_BYTES) {
        // Browser can't compress and the file is heavy — uploading it as a
        // "review copy" would defeat the purpose.
        toast.error('This browser cannot compress video. Export a smaller file (~720p) and upload that instead.')
        return
      }
      setPhase({ kind: 'uploading', pct: 0 })
      const { key } = await storageAdapter.upload({
        file: toUpload,
        projectId,
        fileType: 'deliverable',
        onProgress: (pct) => setPhase({ kind: 'uploading', pct }),
      })
      await apiFetch(`/api/project-files/${file.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ storage_key: key, file_size: toUpload.size }),
      })
      toast.success('Review copy attached — clients will stream it automatically')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to attach review copy')
    } finally {
      setPhase(null)
    }
  }

  const remove = async () => {
    if (!confirm('Remove the review copy? Clients will stream the full-quality file again.')) return
    try {
      await apiFetch(`/api/project-files/${file.id}/preview`, { method: 'DELETE' })
      toast.success('Review copy removed')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to remove review copy')
    }
  }

  if (!canEdit && !hasPreview) return null

  return (
    <div className="flex items-center gap-2 flex-wrap pl-6">
      {hasPreview && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium" title="Clients stream this smaller file; the original stays available for download">
          Review copy ✓
        </span>
      )}
      {canEdit && phase === null && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title="Pick your full-quality export — it is compressed to ~720p in the browser and clients stream that instead of the heavy original. Fixes buffering on slow connections."
            className="text-[10px] text-primary hover:underline"
          >
            {hasPreview ? 'Replace review copy' : '+ Add review copy for slow connections'}
          </button>
          {hasPreview && (
            <button type="button" onClick={remove} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
              Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = '' }}
          />
        </>
      )}
      {phase?.kind === 'compressing' && (
        <span className="text-[10px] text-muted-foreground">
          Compressing to 720p… {phase.pct}% — keep this tab open (takes about the video's length)
        </span>
      )}
      {phase?.kind === 'uploading' && (
        <span className="text-[10px] text-muted-foreground">Uploading review copy… {phase.pct}%</span>
      )}
    </div>
  )
}
