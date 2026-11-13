import { useEffect, useRef, useState } from 'react'
import { Ms } from '@/components/ds'
import { cn } from '@/lib/utils'

// Filter dropdown (DESIGN.md §6 "Filters"): a 38px field-style button that
// opens a small menu popping in at .97 scale. Options can carry a colour dot
// (the status menu doubles as the legend); `notes` are extra legend rows
// that can't be picked.

export type ToolOption<T extends string> = { value: T; label: string; dot?: [string, string] }

function Dot({ c }: { c: [string, string] }) {
  return <span aria-hidden className="ds-dot" style={{ '--sd-d': c[0], '--sh-d': c[0] + '26', '--sd-l': c[1], '--sh-l': c[1] + '26', width: 7, height: 7, borderRadius: 999, flex: 'none' } as React.CSSProperties} />
}

export function ToolMenu<T extends string>({ label, value, options, onChange, notes }: {
  label: string
  value: T
  options: ToolOption<T>[]
  onChange: (v: T) => void
  notes?: { label: string; dot: [string, string] }[]
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div ref={wrap} className="relative flex-none">
      <button type="button" className={cn('ds-tool', open && 'on')} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {current.dot && <Dot c={current.dot} />}
        <span>{current.label}</span>
        <Ms name="expand_more" style={{ fontSize: 18, width: 18, color: 'var(--faint)', transition: 'transform .35s var(--spring)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="ds-menu" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className="ds-menu-item"
              onClick={() => { onChange(o.value); setOpen(false) }}>
              {o.dot ? <Dot c={o.dot} /> : <span style={{ width: 7 }} />}
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Ms name="check" style={{ fontSize: 17, width: 17, color: 'var(--strong)' }} />}
            </button>
          ))}
          {notes && notes.length > 0 && (
            <>
              <div className="ds-menu-sep" />
              {notes.map((n) => (
                <div key={n.label} className="ds-menu-note"><Dot c={n.dot} /><span>{n.label}</span></div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
