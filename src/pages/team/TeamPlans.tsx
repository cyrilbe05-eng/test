import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { useTeamPlans } from '@/hooks/usePlans'
import { cn } from '@/lib/utils'

// Copywriter: production plans of my assigned clients (admins: all clients).

export default function TeamPlans() {
  const { data, isLoading, error } = useTeamPlans()
  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-4xl">
        <h2 className="text-xl font-heading font-semibold tracking-tight">Plans</h2>
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">{(error as Error).message}</div>
        ) : !data?.length ? (
          <div className="clay-card p-5 text-sm text-muted-foreground">—</div>
        ) : (
          <ul className="clay-card divide-y divide-border/60 px-4 md:px-5 py-1">
            {data.map((c) => {
              const full = c.contract?.package === 'full_package'
              const inner = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{c.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {c.contract ? `#${c.contract.number} · ${full ? 'Full package' : 'Editing only'}` : '—'}
                      {c.next && ` · ${format(new Date(`${c.next.date}T12:00:00Z`), 'd MMM')} ${c.next.title}`}
                    </span>
                  </span>
                  {c.overdue > 0 && <span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">{c.overdue} late</span>}
                  {c.contract && <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{c.steps ? `${c.done}/${c.steps}` : 'No plan'}</span>}
                </>
              )
              // Every client with a contract can be planned (any package);
              // without a contract there is nothing to attach a plan to.
              return (
                <li key={c.client_id}>
                  {c.contract ? (
                    <Link to={`/team/plans/${c.contract.id}`} className="flex items-center gap-3 min-h-[52px] py-2 -mx-2 px-2 rounded-lg hover:bg-muted/60">{inner}</Link>
                  ) : (
                    <div className={cn('flex items-center gap-3 min-h-[52px] py-2 opacity-60')}>{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </TeamLayout>
  )
}
