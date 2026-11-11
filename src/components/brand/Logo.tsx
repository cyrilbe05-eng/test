import logoLine from '@/assets/logo-line.png'
import logoGlow from '@/assets/logo-glow.png'
import { cn } from '@/lib/utils'

/** Pingu Studio logo: black line mark in light mode, glowing white mark in
 *  dark mode. Size it with className (e.g. "w-8 h-8"). */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src={logoLine} alt="Pingu Studio" className={cn('object-contain flex-shrink-0 dark:hidden', className)} />
      <img src={logoGlow} alt="Pingu Studio" className={cn('object-contain flex-shrink-0 hidden dark:block', className)} />
    </>
  )
}
