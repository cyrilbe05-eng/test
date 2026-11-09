import { Link, useParams } from 'react-router-dom'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { OnboardingAnswers } from '@/components/onboarding/OnboardingAnswers'
import { useTeamOnboarding } from '@/hooks/useOnboarding'

// Copywriter: one client's onboarding answers.

export default function TeamClientOnboarding() {
  const { clientId } = useParams()
  const { data } = useTeamOnboarding(clientId)
  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-3xl">
        <div className="flex items-center gap-2">
          <Link to="/team/plans" aria-label="Plans" className="w-11 h-11 -ml-2 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <h2 className="text-xl font-heading font-semibold tracking-tight truncate">{data?.client.name ?? ''}</h2>
          <span className="text-sm text-muted-foreground whitespace-nowrap">Onboarding</span>
        </div>
        {clientId && <OnboardingAnswers clientId={clientId} />}
      </main>
    </TeamLayout>
  )
}
