import { cn } from '@/lib/utils'
import { instagramUrl, normalizeInstagramHandle, MAX_INSTAGRAM_ACCOUNTS } from '@/lib/instagram'

function IconInstagram({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" strokeWidth={2} />
      <circle cx="12" cy="12" r="4" strokeWidth={2} />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Tappable @handle links (open the Instagram profile in a new tab). */
export function InstagramLinks({ handles, size = 'md', className }: { handles: string[]; size?: 'sm' | 'md'; className?: string }) {
  if (!handles.length) return null
  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      {handles.map((h) => (
        <a
          key={h}
          href={instagramUrl(h)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-pink-500/10 text-pink-700 dark:text-pink-300 hover:bg-pink-500/20 transition-colors font-medium',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'min-h-[44px] px-3 text-sm',
          )}
        >
          <IconInstagram className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />@{h}
        </a>
      ))}
    </span>
  )
}

/** Editable list of Instagram accounts: one input per account, add/remove. */
export function InstagramInput({ value, onChange, inputClassName }: { value: string[]; onChange: (v: string[]) => void; inputClassName: string }) {
  const rows = value.length ? value : ['']
  const set = (i: number, v: string) => onChange(rows.map((r, j) => (j === i ? v : r)))
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const invalid = r.trim() !== '' && !normalizeInstagramHandle(r)
        // The "@" hint is hidden once the person types their own "@" or a link.
        const showAt = !/^\s*@|instagram\.com|^\s*https?:/i.test(r)
        return (
          <div key={i}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                {showAt && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">@</span>}
                <input
                  value={r}
                  onChange={(e) => set(i, e.target.value)}
                  aria-label={`Instagram account ${i + 1}`}
                  aria-invalid={invalid}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(inputClassName, 'min-h-[44px]', showAt && 'pl-7', invalid && 'ring-2 ring-destructive/40')}
                />
              </div>
              {rows.length > 1 || r !== '' ? (
                <button type="button" onClick={() => remove(i)} aria-label={`Remove Instagram account ${i + 1}`}
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : null}
            </div>
            {invalid && <p className="text-destructive text-xs mt-1">Invalid username</p>}
          </div>
        )
      })}
      {rows.length < MAX_INSTAGRAM_ACCOUNTS && (
        <button type="button" onClick={() => onChange([...rows, ''])} className="min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5 font-medium">
          + Add
        </button>
      )}
    </div>
  )
}
