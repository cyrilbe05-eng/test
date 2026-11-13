import { useEffect } from 'react'

// The Projects board's card feel, for every card in the app (DESIGN.md):
// small cards (.clay-card up to ~460×360) tilt toward the cursor, max ±3.5°,
// with a pre-rendered hover shadow and, in dark mode, a soft shine. One
// document listener, throttled with requestAnimationFrame, CSS variables only.
// Bigger panels (tables, calendars, forms) never tilt. Mouse only; off with
// reduced motion.

const MAX_W = 460
const MAX_H = 360

function eligible(c: HTMLElement) {
  return c.offsetWidth <= MAX_W && c.offsetHeight <= MAX_H && !c.querySelector('input, textarea, select, video, iframe')
}

export function useCardTilt() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let el: HTMLElement | null = null
    let raf = 0
    let x = 0
    let y = 0

    const apply = () => {
      raf = 0
      if (!el) return
      const r = el.getBoundingClientRect()
      const px = Math.min(1, Math.max(0, (x - r.left) / r.width))
      const py = Math.min(1, Math.max(0, (y - r.top) / r.height))
      el.style.setProperty('--ry', `${((px - 0.5) * 7).toFixed(2)}deg`)
      el.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
    }
    const release = (c: HTMLElement) => {
      c.style.setProperty('--rx', '0deg')
      c.style.setProperty('--ry', '0deg')
      // Drop the 3D transform once it has sprung back, so the card is a plain
      // box again (fixed-position children behave as before).
      window.setTimeout(() => { if (el !== c) delete c.dataset.tilt }, 750)
    }
    const move = (e: PointerEvent) => {
      const t = e.target as Element | null
      const c = (t && 'closest' in t ? t.closest('.clay-card') : null) as HTMLElement | null
      if (c !== el) {
        if (el) release(el)
        el = c && eligible(c) ? c : null
        if (el) el.dataset.tilt = ''
      }
      if (!el) return
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const leave = () => { if (el) release(el); el = null }

    document.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      document.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      if (raf) cancelAnimationFrame(raf)
      if (el) release(el)
    }
  }, [])
}
