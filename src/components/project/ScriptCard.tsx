import { useState } from 'react'

export interface ScriptEntry {
  script?: string | null
  caption?: string | null
  comments?: string | null
  inspiration_url?: string | null
}

function Block({ label, text, copy }: { label: string; text: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {copy && (
          <button
            onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})}
            className="min-h-[44px] -my-2 px-3 text-xs font-medium text-primary hover:underline"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>
    </div>
  )
}

/** What the copywriter wrote for this video (from the calendar entry it was
 *  created from), so the client can record without going back to the calendar. */
export function ScriptCard({ entry }: { entry: ScriptEntry }) {
  const script = entry.script?.trim()
  const caption = entry.caption?.trim()
  const notes = entry.comments?.trim()
  const link = entry.inspiration_url?.trim()
  if (!script && !caption && !notes && !link) return null
  return (
    <section className="clay-card p-4 md:p-5 space-y-4 min-w-0">
      {script && <Block label="Script" text={script} copy />}
      {notes && <Block label="Notes" text={notes} />}
      {caption && <Block label="Caption" text={caption} copy />}
      {link && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Inspiration</p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">{link}</a>
        </div>
      )}
    </section>
  )
}
