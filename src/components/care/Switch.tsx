import { cn } from '@/lib/utils'

/** On/off control: a label + a sliding switch (whole row is the 44px tap target). */
export function Switch({ checked, onChange, label, className, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn('min-h-[44px] inline-flex items-center gap-2 px-1 text-sm rounded-lg', className)}
    >
      <span className={cn('relative w-9 h-5 rounded-full transition-colors flex-shrink-0', checked ? 'bg-primary' : 'bg-muted-foreground/30')} aria-hidden>
        <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform', checked ? 'translate-x-4 bg-primary-foreground' : 'bg-white')} />
      </span>
      <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </button>
  )
}

/** A tickable row (multi-select): square checkbox + label. */
export function CheckRow({ checked, onChange, label, disabled, aside }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean; aside?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="w-full min-h-[44px] flex items-center gap-3 px-2 rounded-lg hover:bg-muted/60 text-left disabled:opacity-60"
    >
      <span className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold',
        checked ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')} aria-hidden>
        {checked ? '✓' : ''}
      </span>
      <span className={cn('flex-1 text-sm', !checked && 'text-muted-foreground')}>{label}</span>
      {aside}
    </button>
  )
}
