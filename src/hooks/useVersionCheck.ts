import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const VERSION_URL = '/version.txt'
const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const RUNNING_VERSION = __APP_VERSION__

/**
 * Polls /version.txt and prompts the user to refresh when the deployed
 * version differs from the one their bundle was built with. Without this,
 * users who keep the tab open across a deploy stay on the old JS for hours,
 * leading to confusing "it doesn't work for me but works for them" reports.
 *
 * Polls every 5 min, and also re-checks whenever the tab becomes visible
 * (so someone returning from lunch gets prompted before they start clicking).
 *
 * Skipped in dev — local rebuilds would otherwise trigger the toast on
 * every save.
 */
export function useVersionCheck() {
  const promptedRef = useRef(false)

  useEffect(() => {
    if (RUNNING_VERSION.startsWith('dev-')) return

    const check = async () => {
      if (promptedRef.current) return
      try {
        const res = await fetch(VERSION_URL, { cache: 'no-store' })
        if (!res.ok) return
        const latest = (await res.text()).trim()
        if (latest && latest !== RUNNING_VERSION) {
          promptedRef.current = true
          toast.info('A new version is available', {
            description: 'Refresh to get the latest features and fixes.',
            duration: Infinity,
            action: {
              label: 'Refresh',
              onClick: () => window.location.reload(),
            },
          })
        }
      } catch {
        // Network blip — try again next interval. No need to surface this.
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS)
    const onFocus = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onFocus)

    // Initial check after a short delay so we don't race the app's other
    // startup requests on a cold load.
    const initial = setTimeout(check, 10_000)

    return () => {
      clearInterval(interval)
      clearTimeout(initial)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])
}
