import { cn } from '@/lib/utils'

interface Props {
  used: number
  max: number
}

export function DeliverableCounter({ used, max }: Props) {
  const remaining = max - used
  const isFull = remaining === 0
  const isAlmostFull = remaining === 1

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              max <= 4 ? 'w-5' : 'w-3',
              i < used
                ? isFull
                  ? 'bg-amber-400'
                  : 'bg-primary'
                : 'bg-muted border border-border',
            )}
          />
        ))}
      </div>
      <span className={cn(
        'text-xs font-medium',
        isFull ? 'text-amber-600' : isAlmostFull ? 'text-amber-600' : 'text-muted-foreground',
      )}>
        {used}/{max}
      </span>
    </div>
  )
}
