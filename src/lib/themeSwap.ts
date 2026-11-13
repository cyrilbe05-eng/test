// The theme switch (DESIGN.md §7 "Theme switch"): a full-screen layer in the
// NEW background colour fades in (.4s), the theme class swaps underneath it
// (with every other transition paused for that instant, so hundreds of
// elements don't animate their colours), then the layer fades out (.65s).
// Only that one layer's opacity animates — nothing heavy, no View Transitions
// API. Instant with reduced motion. Shared by the header toggle and the
// profile menu.

const BG = { dark: '#0E0E10', light: '#F5F5F7' }
const ID = 'theme-veil'

export function themeSwap(toggle: () => void) {
  const root = document.documentElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { toggle(); return }
  if (document.getElementById(ID)) return
  const toDark = !root.classList.contains('dark')

  const veil = document.createElement('div')
  veil.id = ID
  veil.setAttribute('aria-hidden', 'true')
  Object.assign(veil.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none',
    background: toDark ? BG.dark : BG.light, opacity: '0', willChange: 'opacity',
    transition: 'opacity .4s cubic-bezier(.4,0,.6,1)',
  })
  document.body.appendChild(veil)
  requestAnimationFrame(() => requestAnimationFrame(() => { veil.style.opacity = '1' }))

  const reveal = () => {
    // Let the new theme paint while hidden, then turn transitions back on.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove('theme-swap')
      veil.style.transition = 'opacity .65s cubic-bezier(.16,1,.3,1)'
      veil.style.opacity = '0'
      window.setTimeout(() => veil.remove(), 700)
    }))
  }

  window.setTimeout(() => {
    root.classList.add('theme-swap')
    toggle()
    // The class is applied by the theme provider after React renders; wait for it.
    let frames = 0
    const wait = () => {
      if (root.classList.contains('dark') === toDark || ++frames > 30) reveal()
      else requestAnimationFrame(wait)
    }
    requestAnimationFrame(wait)
  }, 420)
}
