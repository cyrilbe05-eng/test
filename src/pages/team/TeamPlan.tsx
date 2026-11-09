import { Link, useParams } from 'react-router-dom'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { usePlan } from '@/hooks/usePlans'

// Copywriter: one client's production plan.

export default function TeamPlan() {
  const { contractId } = useParams()
  const { data, isLoading, error } = usePlan(contractId)
  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-3xl">
        <div className="flex items-center gap-2">
          <Link to="/team/plans" aria-label="Plans" className="w-11 h-11 -ml-2 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <h2 className="text-xl font-heading font-semibold tracking-tight truncate">{data?.client.name ?? ''}</h2>
          {data && <span className="text-sm text-muted-foreground whitespace-nowrap">#{data.contract.number}</span>}
          {data && (
            <Link to={`/team/clients/${data.client.id}/onboarding`} className="ml-auto min-h-[44px] px-3 inline-flex items-center rounded-lg border border-border text-sm hover:bg-muted whitespace-nowrap">
              Onboarding
            </Link>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">{(error as Error).message}</div>
        ) : data ? (
          <section className="clay-card p-3 md:p-4">
            <PlanEditor plan={data} />
          </section>
        ) : null}
      </main>
    </TeamLayout>
  )
}
