import type { Health } from '@/types/care'

// Status is never colour alone: every badge carries an icon AND a word.
export const HEALTH_META: Record<Health, { label: string; icon: string; badge: string; dot: string }> = {
  at_risk:         { label: 'At risk',         icon: '!', badge: 'bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30',       dot: 'bg-red-500' },
  needs_attention: { label: 'Needs attention', icon: '•', badge: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-amber-500/30', dot: 'bg-amber-500' },
  healthy:         { label: 'Healthy',         icon: '✓', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30', dot: 'bg-emerald-500' },
}
