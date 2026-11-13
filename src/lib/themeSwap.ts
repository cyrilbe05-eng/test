// The theme switch of the design system: content fades out (0.16s), the
// theme changes while it's hidden, then fades back in. Instant with reduced
// motion. Shared by the header toggle and the profile menu.

export function themeSwap(toggle: () => void) {
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
