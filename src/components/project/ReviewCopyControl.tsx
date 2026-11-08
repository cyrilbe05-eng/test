import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import type { ProjectFile } from '@/types'

interface Props {
  file: ProjectFile
  projectId: string
  canEdit: boolean
  onChanged: () => void
}

/** Review-copy status for a deliverable.
 *
 *  GENERATION IS DISABLED (operator decision 2026-07-15): the in-browser
 *  compression pinned CPUs, so the generate/attach flows are switched off
 *  for now. What remains: deliverables that already have a review copy show
 *  the badge (clients still stream the copy, with automatic fallback to the
 *  original), and admins/uploaders can remove a copy. The dormant compressor
 *  lives in src/lib/videoCompress.ts if this gets revisited (e.g. behind a
 *  server-side transcoder instead of browser CPU).
 */
export function ReviewCopyControl({ file, canEdit, onChanged }: Props) {
  const apiFetch = useApiFetch()

  const hasPreview = !!file.preview_storage_key
  if (!hasPreview) return null

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

  return (
    <div className="flex items-center gap-2 flex-wrap pl-6">
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-medium" title="Clients stream this smaller file; the original stays available for download">
        Review copy ✓
      </span>
      {canEdit && (
        <button type="button" onClick={remove} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
          Remove
        </button>
      )}
    </div>
  )
}
