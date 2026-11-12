import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { clientTint, editorColor, hexA, initials } from '@/lib/dsColors'

// Small building blocks of the new design (DESIGN.md).

/** Material Symbols Rounded icon (ligature name, e.g. "home"). */
export function Ms({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <span className={cn('ds-ms', className)} style={style} aria-hidden="true">{name}</span>
}

/** Theme toggle with the soft fade: a layer in the new background colour
 *  fades in, the theme swaps underneath, then the layer fades out. Instant
 *  when the system asks for reduced motion. */
export function ThemeFadeButton() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const swap = () => {
    if (document.querySelector('.ds-curtain')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { toggle(); return }
    const layer = document.createElement('div')
    layer.className = 'ds-curtain in'
    layer.style.background = dark ? '#F5F5F7' : '#0E0E10'
    layer.addEventListener('animationend', function done() {
      if (layer.classList.contains('in')) {
        toggle()
        layer.classList.replace('in', 'out')
      } else {
        layer.removeEventListener('animationend', done)
        layer.remove()
      }
    })
    document.body.appendChild(layer)
    // Safety net: never leave the layer on screen if an animation is skipped.
    setTimeout(() => { if (layer.isConnected) { if (layer.classList.contains('in')) toggle(); layer.remove() } }, 1600)
  }
  return (
    <button type="button" className="ds-ibtn ds-theme-btn" onClick={swap} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Ms name={dark ? 'light_mode' : 'dark_mode'} />
    </button>
  )
}

/** Client mark: rounded square with the client's initial in their colour. */
export function ClientMark({ name, size = 20 }: { name: string; size?: number }) {
  const { theme } = useTheme()
  const t = clientTint(name || '?', theme === 'dark')
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size >= 26 ? 8 : size <= 18 ? 5 : 6, background: t.background, color: t.color, display: 'grid', placeItems: 'center', fontSize: size >= 26 ? 12 : size <= 18 ? 10 : 10.5, fontWeight: 700, flex: 'none' }}>
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

/** Status dot with its 3px halo. */
export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${hexA(color, 0.15)}`, flex: 'none' }} />
}
