import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useUploadManager } from '@/lib/uploadManager'

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`
}

/** Floating upload panel, pinned bottom-right across every page.
 *  Uploads run in the app-level manager, so the user can navigate freely
 *  while files transfer — this is the only place progress is shown. */
export function UploadDock() {
  const { tasks, retry, clearFinished, activeCount } = useUploadManager()
  const [collapsed, setCollapsed] = useState(false)

  // Re-open the panel whenever a fresh batch starts, so new uploads are never
  // silently hidden behind a collapsed dock.
  useEffect(() => {
    if (activeCount > 0) setCollapsed(false)
  }, [activeCount > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0) return null

  const doneCount = tasks.filter((t) => t.status === 'done').length
  const failedCount = tasks.filter((t) => t.status === 'error').length
  const allFinished = activeCount === 0

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-[min(22rem,calc(100vw-2rem))] clay-card shadow-2xl overflow-hidden border border-border">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {activeCount > 0 ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
        ) : failedCount > 0 ? (
          <svg className="w-3.5 h-3.5 text-destructive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="text-xs font-semibold flex-1 truncate">
          {activeCount > 0
            ? `Uploading ${doneCount + 1} of ${tasks.length}…`
            : failedCount > 0
              ? `${doneCount} uploaded · ${failedCount} failed`
              : `${doneCount} upload${doneCount > 1 ? 's' : ''} complete`}
        </span>
        <svg
          className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0', collapsed && 'rotate-180')}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <>
          <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
            {tasks.map((t) => (
              <div key={t.id} className="px-3.5 py-2">
                <div className="flex items-center gap-2">
                  {t.status === 'done' ? (
                    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : t.status === 'error' ? (
                    <svg className="w-3.5 h-3.5 text-destructive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <div className={cn(
                      'w-3.5 h-3.5 rounded-full border-2 border-t-transparent flex-shrink-0',
                      t.status === 'queued' && 'border-muted-foreground',
                      t.status === 'uploading' && (t.conn === 'retrying' || t.conn === 'offline' ? 'border-amber-500 animate-spin' : 'border-primary animate-spin'),
                    )} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    {t.label && <p className="text-[10px] text-muted-foreground truncate">{t.label}</p>}
                  </div>
                  <span className={cn(
                    'text-[10px] flex-shrink-0',
                    t.conn === 'retrying' || t.conn === 'offline' ? 'text-amber-500' : 'text-muted-foreground',
                  )}>
                    {t.status === 'queued' && 'Waiting…'}
                    {t.status === 'uploading' && (
                      t.conn === 'offline' ? 'Offline — will resume'
                      : t.conn === 'retrying' ? `Retrying… ${t.progress}%`
                      : `${t.progress}%`
                    )}
                    {t.status === 'done' && formatBytes(t.size)}
                    {t.status === 'error' && (
                      <button onClick={() => retry(t.id)} className="text-primary font-semibold hover:underline">Retry</button>
                    )}
                  </span>
                </div>
                {t.status === 'uploading' && (
                  <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
                    <div
                      className={cn(
                        'h-full transition-all duration-200',
                        t.conn === 'retrying' || t.conn === 'offline' ? 'bg-amber-500' : 'bg-gradient-to-r from-primary to-secondary',
                      )}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                )}
                {t.status === 'error' && t.error && (
                  <p className="text-[10px] text-destructive mt-0.5 line-clamp-2">{t.error}</p>
                )}
              </div>
            ))}
          </div>
          <div className="px-3.5 py-2 border-t border-border/60 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              {allFinished ? 'All done.' : 'You can keep working — uploads continue in the background.'}
            </p>
            {allFinished && (
              <button onClick={clearFinished} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0">
                Dismiss
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
