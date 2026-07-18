import { cn } from '@/lib/utils'
import type { UploadConnectionState } from '@/lib/storage'

export interface UploadProgressItem {
  name: string
  status: 'pending' | 'uploading' | 'done'
  progress: number
  /** Connection substate while uploading (retrying / offline). */
  conn?: UploadConnectionState
}

/** Live per-file progress panel for flows that upload AFTER a form submit
 *  (project creation) — without it the form just freezes while hundreds of
 *  MB move. Mirrors the FileUploader row language: %, connection states,
 *  progress bar, done check. */
export function UploadProgressList({ title, items }: { title?: string; items: UploadProgressItem[] }) {
  if (items.length === 0) return null
  const doneCount = items.filter((i) => i.status === 'done').length
  return (
    <div className="clay-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title ?? 'Uploading files'}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">{doneCount}/{items.length}</span>
      </div>
      {items.map((it, i) => (
        <div key={`${i}-${it.name}`}>
          <div className="flex items-center gap-2 mb-1">
            {it.status === 'done' ? (
              <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className={cn(
                'w-3.5 h-3.5 rounded-full border-2 border-t-transparent flex-shrink-0',
                it.status === 'pending' && 'border-muted-foreground',
                it.status === 'uploading' && (it.conn === 'retrying' || it.conn === 'offline' ? 'border-amber-500 animate-spin' : 'border-primary animate-spin'),
              )} />
            )}
            <p className="text-xs font-medium truncate flex-1">{it.name}</p>
            <span className={cn('text-[10px] flex-shrink-0', it.conn === 'retrying' || it.conn === 'offline' ? 'text-amber-500' : 'text-muted-foreground')}>
              {it.status === 'pending' && 'Waiting…'}
              {it.status === 'uploading' && (
                it.conn === 'offline' ? 'Connection lost — will resume automatically'
                : it.conn === 'retrying' ? `Connection unstable — retrying… ${it.progress}%`
                : `${it.progress}%`
              )}
              {it.status === 'done' && 'Done'}
            </span>
          </div>
          {it.status === 'uploading' && (
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-200',
                  it.conn === 'retrying' || it.conn === 'offline' ? 'bg-amber-500' : 'bg-gradient-to-r from-primary to-secondary',
                )}
                style={{ width: `${it.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground pt-1">
        Keep this page open until all files finish uploading.
      </p>
    </div>
  )
}
