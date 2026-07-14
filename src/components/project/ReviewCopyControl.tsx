import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import type { ProjectFile } from '@/types'

interface Props {
  file: ProjectFile
  projectId: string
  canEdit: boolean
  onChanged: () => void
}

/** Manage the optional low-bitrate review copy of a deliverable.
 *
 *  Clients on slow connections (2–5 Mbit/s in practice) can't stream a
 *  full-quality export in real time — the player starves after a few
 *  seconds. Editors attach a smaller encode here (e.g. 720p ~3–4 Mbit/s);
 *  the client player streams it automatically, while the original stays
 *  the admin-QC and download file. */
export function ReviewCopyControl({ file, projectId, canEdit, onChanged }: Props) {
  const apiFetch = useApiFetch()
  const storageAdapter = useStorageAdapter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const hasPreview = !!file.preview_storage_key

  const attach = async (picked: File) => {
    setProgress(0)
    try {
      const { key } = await storageAdapter.upload({
        file: picked,
        projectId,
        fileType: 'deliverable',
        onProgress: setProgress,
      })
      await apiFetch(`/api/project-files/${file.id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ storage_key: key, file_size: picked.size }),
      })
      toast.success('Review copy attached — clients will stream it automatically')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to attach review copy')
    } finally {
      setProgress(null)
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
      {canEdit && progress === null && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            title="Upload a smaller encode (e.g. 720p at 3–4 Mbit/s). Clients stream it instead of the heavy original — fixes buffering on slow connections."
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
      {progress !== null && (
        <span className="text-[10px] text-muted-foreground">Uploading review copy… {progress}%</span>
      )}
    </div>
  )
}
