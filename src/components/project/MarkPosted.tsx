import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

/** One tap: the client says this approved video is out. Also greys out the
 *  script entry it came from on the calendar (server keeps both in sync). */
export function MarkPosted({ project, className }: { project: Pick<Project, 'id' | 'posted_at'>; className?: string }) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const posted = !!project.posted_at

  const toggle = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/projects/${project.id}/posted`, { method: 'POST', body: JSON.stringify({ posted: !posted }) })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: ['project', project.id] }),
        qc.invalidateQueries({ queryKey: ['calendar_events'] }),
      ])
      toast.success(posted ? 'Posted mark removed' : 'Marked as posted')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      aria-pressed={posted}
      className={cn(
        'min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50',
        posted ? 'bg-muted text-muted-foreground hover:bg-muted/70' : 'bg-green-600 text-white hover:bg-green-700',
        className,
      )}
    >
      {posted ? '✓ Posted' : 'Posted'}
    </button>
  )
}
