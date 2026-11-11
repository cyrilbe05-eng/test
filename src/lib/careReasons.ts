// Client Care reasons arrive as full sentences ("No new video request for 3
// days"). On the overview they're shown as short tags; the full sentence
// stays on hover and in the client panel's "Why".

export interface ShortReason { label: string; full: string }

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^No new video request for (\d+) days?$/, (m) => `No request · ${m[1]}d`],
  [/^"(.+)" has been in progress for (\d+) days?$/, (m) => `In progress · ${m[2]}d`],
  [/^"(.+)" is due from the editor today$/, () => 'Due today'],
  [/^"(.+)" overdue by (\d+) days?$/, (m) => `Step late · ${m[2]}d`],
  [/^No contact for (\d+) days?$/, (m) => `No contact · ${m[1]}d`],
  [/^No contact logged yet$/, () => 'No contact yet'],
  [/^Contract ends in (\d+) days? and renewal hasn't been discussed$/, (m) => `Renewal · ${m[1]}d`],
  [/^Contract ends today and renewal hasn't been discussed$/, () => 'Renewal · today'],
  [/^Contract ended (\d+) days? ago and renewal hasn't been discussed$/, () => 'Renewal · ended'],
  [/^Contract ends in (\d+) days?$/, (m) => `Ends in ${m[1]}d`],
  [/^Contract ends today$/, () => 'Ends today'],
  [/^Contract ended (\d+) days? ago$/, (m) => `Ended ${m[1]}d ago`],
  [/^Finished onboarding$/, () => 'Onboarded'],
]

/** Short tag for a reason; unknown sentences are kept as they are. */
export function shortReason(full: string): ShortReason {
  for (const [re, label] of RULES) {
    const m = full.match(re)
    if (m) return { label: label(m), full }
  }
  return { label: full, full }
}

/** The "everything is fine" line isn't a reason worth a tag. */
export const isAllClear = (r: string) => r.startsWith('No alerts')
