// ─────────────────────────────────────────────────────────────────────────────
// Client Care settings — every threshold in ONE place.
// Change a number here and the alerts, health board and stats follow; the
// pages only display what the API computes from these.
//
// Days are measured as real elapsed time (e.g. "2+ days" = 48 hours or more).
// "Today" and calendar months use UTC, the same clock the app already uses for
// editor deadlines (end of next day, 23:59 UTC).
// ─────────────────────────────────────────────────────────────────────────────

export const CARE_CONFIG = {
  /** Alerts shown on a client (and in the "Text today" list). */
  alerts: {
    /** Client hasn't submitted a new video request for this many days. */
    noBriefDays: 2,
    /** A video has been "in progress" for this many days. */
    inProgressStuckDays: 2,
    /** No "Contacted" tick for this many days. */
    noContactDays: 3,
  },

  /** Health status rules. */
  health: {
    /** AT RISK: no contact for this many days. */
    atRiskNoContactDays: 6,
    /** AT RISK: a video stuck in progress for this many days. */
    atRiskStuckDays: 2,
    /** AT RISK: contract ends within this many days and renewal not discussed. */
    atRiskContractDays: 14,
    /** NEEDS ATTENTION: contract ends within this many days. */
    attentionContractDays: 30,
  },

  /** Output rate is measured over this many most recent days. */
  output: {
    windowDays: 30,
  },
} as const

export type CareConfig = typeof CARE_CONFIG

/** Project statuses that mean the client has received a version. Entering any
 *  of them for the first time = the video was "delivered". */
export const CLIENT_VISIBLE_STATUSES = ['client_reviewing', 'revision_requested', 'client_approved'] as const

export const RENEWAL_STATUSES = ['not_discussed', 'discussed', 'renewed', 'declined'] as const
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number]
