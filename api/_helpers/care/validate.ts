// Validation for PATCH /api/admin/care/clients/:id — pure, unit-tested.
// Only fields present in the body are changed; null clears a field.

import { RENEWAL_STATUSES, type RenewalStatus } from './config.js'

export const ONBOARDING_STEPS = ['welcome_sent', 'call_done', 'brief_received', 'first_video_delivered'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export interface CarePatch {
  care: Partial<{
    contract_start: string | null
    contract_end: string | null
    videos_included: number | null
    renewal_status: RenewalStatus
    care_notes: string | null
    miro_url: string | null
  }>
  onboarding: Partial<Record<OnboardingStep, string | null>>
}

const MAX_NOTES = 10_000

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

export function parseCarePatch(body: unknown, current?: { contract_start: string | null; contract_end: string | null }): CarePatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Body must be a JSON object')
  const b = body as Record<string, unknown>
  const patch: CarePatch = { care: {}, onboarding: {} }
  const known = new Set(['contract_start', 'contract_end', 'videos_included', 'renewal_status', 'care_notes', 'miro_url', 'onboarding'])
  const unknown = Object.keys(b).filter((k) => !known.has(k))
  if (unknown.length) invalid(`Unknown field(s): ${unknown.join(', ')}`)

  for (const k of ['contract_start', 'contract_end'] as const) {
    if (b[k] === undefined) continue
    if (b[k] !== null && !isDate(b[k])) invalid(`${k} must be a date (YYYY-MM-DD) or null`)
    patch.care[k] = b[k] as string | null
  }
  const start = patch.care.contract_start !== undefined ? patch.care.contract_start : current?.contract_start ?? null
  const end = patch.care.contract_end !== undefined ? patch.care.contract_end : current?.contract_end ?? null
  if (start && end && end < start) invalid('contract_end cannot be before contract_start')

  if (b.videos_included !== undefined) {
    const v = b.videos_included
    if (v !== null && !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000)) {
      invalid('videos_included must be a whole number (0 or more) or null')
    }
    patch.care.videos_included = v as number | null
  }

  if (b.renewal_status !== undefined) {
    if (!(RENEWAL_STATUSES as readonly unknown[]).includes(b.renewal_status)) {
      invalid(`renewal_status must be one of ${RENEWAL_STATUSES.join(', ')}`)
    }
    patch.care.renewal_status = b.renewal_status as RenewalStatus
  }

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
