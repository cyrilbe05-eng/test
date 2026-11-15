import { toast } from 'sonner'
import { cleanDashes } from '@/lib/notificationText'

// Pop-up messages (sonner toasts) read without dashes: every toast's title
// and description go through cleanDashes ("Project approved — client
// notified" → "Project approved: client notified"). Installed once at start-
// up, so current and future messages — including server errors — follow it.

type Fn = (message: unknown, data?: { description?: unknown } & Record<string, unknown>) => unknown

const clean = (v: unknown) => (typeof v === 'string' ? cleanDashes(v) : v)

function wrap(fn: Fn): Fn {
  return (message, data) => fn(clean(message), data && typeof data.description === 'string' ? { ...data, description: clean(data.description) } : data)
}

let done = false
export function installToastText() {
  if (done) return
  done = true
  const t = toast as unknown as Record<string, Fn>
  for (const k of ['success', 'error', 'info', 'warning', 'message', 'loading'] as const) {
    if (typeof t[k] === 'function') t[k] = wrap(t[k].bind(toast) as Fn)
  }
}
