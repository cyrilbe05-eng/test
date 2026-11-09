import { cn } from '@/lib/utils'

/** "V1 | V2" switch above the player when a cycle has several versions.
 *  The dot = comments on that version this round. */
export function VersionTabs({ versions, value, onChange, commented }: {
  versions: { id: string; file_name: string }[]
  value: string
  onChange: (id: string) => void
  commented?: Set<string>
}) {
  if (versions.length < 2) return null
  return (
    <div role="tablist" aria-label="Versions" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-muted max-w-full">
      {versions.map((v, i) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={v.id === value}
          title={v.file_name}
          onClick={() => onChange(v.id)}
          className={cn('relative min-h-11 min-w-14 px-4 rounded-lg text-sm font-semibold tabular-nums',
            v.id === value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          V{i + 1}
          {commented?.has(v.id) && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />}
        </button>
      ))}
    </div>
  )
}
