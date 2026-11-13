// Calendar entries store their colour as a Tailwind class ("bg-violet-500").
// The design system draws them as soft chips, so it needs the hex behind it.

const HUES: Record<string, string> = {
  slate: '#64748B', gray: '#6B7280', zinc: '#71717A', neutral: '#737373', stone: '#78716C',
  red: '#EF4444', orange: '#F97316', amber: '#F59E0B', yellow: '#EAB308', lime: '#84CC16',
  green: '#22C55E', emerald: '#10B981', teal: '#14B8A6', cyan: '#06B6D4', sky: '#0EA5E9',
  blue: '#3B82F6', indigo: '#6366F1', violet: '#8B5CF6', purple: '#A855F7', fuchsia: '#D946EF',
  pink: '#EC4899', rose: '#F43F5E',
}

/** Hex colour of an entry's "bg-<hue>-<n>" class (slate when unknown). */
export function calColor(cls?: string | null): string {
  const hue = cls?.match(/bg-([a-z]+)-\d+/)?.[1]
  return (hue && HUES[hue]) || HUES.slate
}
