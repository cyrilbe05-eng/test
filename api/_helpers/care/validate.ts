// Validation for PATCH /api/admin/care/clients/:id — pure, unit-tested.
// Only fields present in the body are changed; null clears a field.
// Contract fields (dates, videos, renewal) are edited per contract — see
// contracts.ts (migration 013).

export const ONBOARDING_STEPS = ['welcome_sent', 'call_done', 'brief_received', 'first_video_delivered'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export interface CarePatch {
  care: Partial<{
    care_notes: string | null
    miro_url: string | null
  }>
  onboarding: Partial<Record<OnboardingStep, string | null>>
}

const MAX_NOTES = 10_000
const CONTRACT_FIELDS = ['contract_start', 'contract_end', 'videos_included', 'renewal_status']

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

/** YYYY-MM-DD that is a real calendar date. */
function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** A timestamp: YYYY-MM-DD or a full ISO date-time. Stored as given. */
function isDateOrDateTime(v: unknown): v is string {
  return isDate(v) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v)))
}

export function parseCarePatch(body: unknown): CarePatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Body must be a JSON object')
  const b = body as Record<string, unknown>
  const patch: CarePatch = { care: {}, onboarding: {} }
  const movedToContracts = Object.keys(b).filter((k) => CONTRACT_FIELDS.includes(k))
  if (movedToContracts.length) invalid(`${movedToContracts.join(', ')}: edit these on the contract (PATCH /api/admin/care/contracts/:id)`)
  const known = new Set(['care_notes', 'miro_url', 'onboarding'])
  const unknown = Object.keys(b).filter((k) => !known.has(k))
  if (unknown.length) invalid(`Unknown field(s): ${unknown.join(', ')}`)

  if (b.care_notes !== undefined) {
    if (b.care_notes !== null && typeof b.care_notes !== 'string') invalid('care_notes must be text or null')
    const notes = typeof b.care_notes === 'string' ? b.care_notes.trim() : null
    if (notes && notes.length > MAX_NOTES) invalid(`care_notes is too long (max ${MAX_NOTES} characters)`)
    patch.care.care_notes = notes || null
  }

  if (b.miro_url !== undefined) {
    if (b.miro_url !== null && typeof b.miro_url !== 'string') invalid('miro_url must be a link or null')
    const url = typeof b.miro_url === 'string' ? b.miro_url.trim() : ''
    if (url) {
      // Only real web links — blocks javascript:/data: links that would run
      // code when clicked in the admin panel.
      let parsed: URL
      try { parsed = new URL(url) } catch { invalid('miro_url must be a full link starting with https://') }
      if (parsed.protocol !== 'https:') invalid('miro_url must start with https://')
      if (url.length > 2_000) invalid('miro_url is too long')
    }
    patch.care.miro_url = url || null
  }

  if (b.onboarding !== undefined) {
    if (!b.onboarding || typeof b.onboarding !== 'object' || Array.isArray(b.onboarding)) invalid('onboarding must be an object')
    for (const [k, v] of Object.entries(b.onboarding as Record<string, unknown>)) {
      if (!(ONBOARDING_STEPS as readonly string[]).includes(k)) invalid(`Unknown onboarding step: ${k}`)
      if (v !== null && !isDateOrDateTime(v)) invalid(`onboarding.${k} must be a date or null`)
      patch.onboarding[k as OnboardingStep] = v as string | null
    }
  }

  if (!Object.keys(patch.care).length && !Object.keys(patch.onboarding).length) invalid('Nothing to update')
  return patch
}
