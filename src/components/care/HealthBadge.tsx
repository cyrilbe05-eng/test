import { cn } from '@/lib/utils'
import { HEALTH_META } from '@/components/care/healthMeta'
import type { Health } from '@/types/care'

export function HealthBadge({ health }: { health: Health }) {
  const m = HEALTH_META[health]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full ds-tag text-xs font-semibold ring-1 whitespace-nowrap', m.badge)}>
      <span aria-hidden className="font-bold">{m.icon}</span>{m.label}
    </span>
  )
}
