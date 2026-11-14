import { useCallback, useEffect, useRef, useState } from 'react'

// Closing a sheet (DESIGN.md §7 "Open a card" → closing): fade + scale to
// .96 in .26s, then unmount. Escape closes too (§9). Instant with reduced
// motion. Use `closing` to add the `closing` class to the veil and sheet.

export function useSheetClose(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const done = useRef(false)
  const close = useCallback(() => {
    if (done.current) return
    done.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    window.setTimeout(onClose, 260)
  }, [onClose])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [close])
  return { closing, close }
}
