// Calendar sheets grow out of what was clicked (DESIGN.md §7 "Open a card").
// The click marks its rect here as CSS variables on <html>; the sheet's
// opening keyframe starts from that offset and scale. Nothing re-renders.

const SHEET_W = 560

export function markSheetOrigin(el: Element | null) {
  const root = document.documentElement.style
  if (!el) { root.setProperty('--sheet-dx', '0px'); root.setProperty('--sheet-dy', '0px'); root.setProperty('--sheet-s', '.96'); return }
  const r = el.getBoundingClientRect()
  root.setProperty('--sheet-dx', `${Math.round(r.left + r.width / 2 - window.innerWidth / 2)}px`)
  root.setProperty('--sheet-dy', `${Math.round(r.top + r.height / 2 - window.innerHeight / 2)}px`)
  root.setProperty('--sheet-s', String(Math.min(0.9, Math.max(0.25, r.width / SHEET_W)).toFixed(2)))
}
