import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types'

const STATUS_CONFIG: Record<ProjectStatus, {
  label: string
  className: string
  dotClass: string
  live?: boolean
  check?: boolean
}> = {
  pending_assignment: { label: 'Pending',     className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',     dotClass: 'bg-amber-400' },
  in_progress:        { label: 'In Progress', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/25',       dotClass: 'bg-blue-500',   live: true },
  in_review:          { label: 'In Review',   className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/25', dotClass: 'bg-violet-500', live: true },
  admin_approved:     { label: 'Admin OK',    className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/25', dotClass: 'bg-indigo-400' },
  client_reviewing:   { label: 'Reviewing',   className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/25',       dotClass: 'bg-cyan-500',   live: true },
  client_approved:    { label: 'Approved',    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/25',    dotClass: 'bg-green-500',  check: true },
  revision_requested: { label: 'Revision',    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25',          dotClass: 'bg-red-400' },
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ds-tag nodot text-xs font-medium border flex-shrink-0',
      cfg.className,
    )}>
      {cfg.check ? (
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dotClass, cfg.live && 'animate-status-live')} />
      )}
      {cfg.label}
    </span>
  )
}
