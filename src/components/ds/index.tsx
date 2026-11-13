import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { clientTintBoth, editorColor, hexA, initials } from '@/lib/dsColors'
import { STATUS_META } from '@/lib/dsStatus'
import type { ProjectStatus } from '@/types'

// Small building blocks of the new design (DESIGN.md).

/** Material Symbols Rounded icon (ligature name, e.g. "home"). */
export function Ms({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <span className={cn('ds-ms', className)} style={style} aria-hidden="true">{name}</span>
}

/** Theme toggle. The content fades out (0.16s), the theme switches while
 *  it's hidden, then it fades back in (0.42s); the page background glides
 *  underneath. Only opacity + one background animate, so it stays fluid.
 *  Instant with reduced motion. */
export function ThemeFadeButton() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const swap = () => {
    const root = document.documentElement
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { toggle(); return }
    if (root.classList.contains('theme-out') || root.classList.contains('theme-in')) return
    root.classList.add('theme-out')
    window.setTimeout(() => {
      toggle()
      // Two frames: let the new theme paint while the content is hidden.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.replace('theme-out', 'theme-in')
        window.setTimeout(() => root.classList.remove('theme-in'), 500)
      }))
    }, 170)
  }
  return (
    <button type="button" className="ds-ibtn ds-theme-btn" onClick={swap} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Ms name={dark ? 'light_mode' : 'dark_mode'} />
    </button>
  )
}

/** Client mark: rounded square with the client's initial in their colour.
 *  Both themes' colours are set as CSS variables; CSS picks one (no re-render
 *  on theme switch). */
export function ClientMark({ name, size = 20 }: { name: string; size?: number }) {
  const t = clientTintBoth(name || '?')
  return (
    <span aria-hidden="true" className="ds-cm" style={{ '--cm-d': t.dark, '--cm-db': t.darkBg, '--cm-l': t.light, '--cm-lb': t.lightBg, width: size, height: size, borderRadius: size >= 26 ? 8 : size <= 18 ? 5 : 6, display: 'grid', placeItems: 'center', fontSize: size >= 26 ? 12 : size <= 18 ? 10 : 10.5, fontWeight: 700, flex: 'none' } as React.CSSProperties}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

/** Editor avatar (pastel circle with initials), or a dashed circle when unassigned. */
export function EditorAvatar({ name, size = 22 }: { name?: string | null; size?: number }) {
  if (!name) return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 999, border: '1.5px dashed var(--dash)', flex: 'none' }} />
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 999, background: editorColor(name), color: '#101012', display: 'grid', placeItems: 'center', fontSize: size >= 30 ? 12 : size >= 26 ? 10.5 : 10, fontWeight: 700, flex: 'none' }}>
      {initials(name)}
    </span>
  )
}

/** Status dot with its 3px halo (both themes' colours as CSS variables). */
export function StatusDot({ status, size = 8 }: { status: ProjectStatus; size?: number }) {
  const [d, l] = (STATUS_META[status] ?? STATUS_META.pending_assignment).colors
  return <span aria-hidden="true" className="ds-dot" style={{ '--sd-d': d, '--sh-d': hexA(d, 0.15), '--sd-l': l, '--sh-l': hexA(l, 0.15), width: size, height: size, borderRadius: 999, flex: 'none' } as React.CSSProperties} />
}

/** Segmented control with one sliding indicator (DESIGN.md). Every segment
 *  has the same width so the indicator only moves (transform). */
export function Segmented<T extends string>({ options, value, onChange, width = 76, label }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  width?: number
  label?: string
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="ds-seg flex-none" role="group" aria-label={label} style={{ '--sw': `${width}px` } as React.CSSProperties}>
      <div className="ds-seg-ind" style={{ transform: `translateX(${i * width}px)` }} />
      {options.map((o) => (
        <button key={o.value} type="button" className={cn(o.value === value && 'on')} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}
