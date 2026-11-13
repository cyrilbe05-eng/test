import { Answer } from '@/components/onboarding/OnboardingAnswers'
import { cn } from '@/lib/utils'
import type { Brief } from '@/types/onboarding'

// Miro board · SOPs · Style — the client's Home and the copywriter's page.
// (The client's Home leaves Style out.) Always shown, "—" when there is nothing yet.

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="clay-card p-4 md:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="font-heading font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const empty = <p className="text-sm text-muted-foreground">—</p>

export function ClientBrief({ brief, wide, noStyle, noMiro, className }: { brief: Brief; wide?: boolean; noStyle?: boolean; /** The page shows the Miro board as a button elsewhere. */ noMiro?: boolean; className?: string }) {
  return (
    <div className={cn(wide ? cn('grid gap-4 items-start min-w-0', noStyle ? 'md:grid-cols-2' : 'md:grid-cols-3') : 'space-y-4 min-w-0', className)}>
      {!noMiro && <Card
        title="Miro board"
        action={brief.miro_url && (
          <a href={brief.miro_url} target="_blank" rel="noreferrer"
            className="min-h-[44px] px-3 inline-flex items-center rounded-lg border border-border text-sm hover:bg-muted whitespace-nowrap">
            Open
          </a>
        )}
      >
        {!brief.miro_url && empty}
      </Card>}
      <Card title="SOPs">
        {brief.sops.length ? (
          <ul className="space-y-1.5 text-sm">
            {brief.sops.map((s) => <li key={s} className="flex gap-2"><span className="text-muted-foreground" aria-hidden>–</span><span className="break-words min-w-0">{s}</span></li>)}
          </ul>
        ) : empty}
      </Card>
      {!noStyle && <Card title="Style">
        {brief.style.length ? (
          <dl className="divide-y divide-border/60 -my-1.5">
            {brief.style.map((s) => (
              <div key={s.question} className="py-1.5">
                <dt className="text-xs text-muted-foreground break-words">{s.question}</dt>
                <dd><Answer q={s} /></dd>
              </div>
            ))}
          </dl>
        ) : empty}
      </Card>}
    </div>
  )
}
