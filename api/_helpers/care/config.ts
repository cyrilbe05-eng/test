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

  /** SOP rules built automatically from client revision notes. */
  sop: {
    /** How alike a note must be to an existing rule (same client, same
     *  category) to merge into it, 0–1. With the local model: measured on
     *  real notes, same-meaning pairs scored 0.40–0.67 and unrelated pairs at
     *  most 0.31, so 0.45 merges clear repeats and never merges unrelated
     *  requests (looser rewordings may stay as separate rules). */
    modelMergeThreshold: 0.45,
    /** Same idea for the word-matching fallback (share of shared words). */
    wordsMergeThreshold: 0.5,
    /** Rules seen only once and not seen again for this many days are
     *  archived automatically. */
    archiveSingleAfterDays: 60,
    /** Max pending revision notes processed per request (keeps pages fast;
     *  the rest are picked up on the next page load). */
    maxPerRun: 300,
  },
} as const

/** Revision note categories. The description is what the local model compares
 *  a note against to pick its category; `words` drive the fallback. Reword a
 *  description here to steer the automatic choice. */
export const REVISION_CATEGORIES = {
  pacing:   { label: 'Pacing',   description: 'pacing, speed, timing, rhythm, cuts too slow or too fast, video drags, tighten, shorter, longer',
              words: ['pace', 'pacing', 'speed', 'slow', 'fast', 'faster', 'slower', 'drag', 'drags', 'tighten', 'tight', 'timing', 'rhythm', 'shorter', 'longer', 'quick', 'quicker', 'snappy', 'cut', 'cuts', 'trim', 'long'] },
  captions: { label: 'Captions', description: 'captions, subtitles, on-screen text, font size of the text, typos in text, text sync',
              words: ['caption', 'captions', 'subtitle', 'subtitles', 'subs', 'text', 'typo', 'typos', 'spelling', 'font', 'word', 'words', 'sync'] },
  hook:     { label: 'Hook',     description: 'hook, the opening, first seconds, intro, how the video starts, grab attention at the beginning',
              words: ['hook', 'opening', 'open', 'intro', 'start', 'starts', 'beginning', 'first', 'grab', 'attention', 'seconds'] },
  music:    { label: 'Music',    description: 'music, soundtrack, song, audio levels, volume, sound effects, voice too quiet',
              words: ['music', 'song', 'track', 'soundtrack', 'audio', 'sound', 'volume', 'loud', 'quiet', 'louder', 'quieter', 'voice', 'beat', 'sfx', 'upbeat'] },
  colour:   { label: 'Colour',   description: 'colour, color grading, brightness, contrast, saturation, skin tones, too dark, washed out, warm, cold',
              words: ['colour', 'color', 'colours', 'colors', 'grading', 'grade', 'bright', 'brighter', 'brightness', 'dark', 'darker', 'contrast', 'saturation', 'saturated', 'washed', 'warm', 'warmer', 'cold', 'skin', 'tone', 'tones', 'orange', 'exposure'] },
  'b-roll': { label: 'B-roll',   description: 'b-roll, extra footage, cutaway shots, more shots of the product, the shop, close-ups, drone footage',
              words: ['broll', 'footage', 'shot', 'shots', 'cutaway', 'cutaways', 'clip', 'clips', 'drone', 'closeup', 'close', 'product', 'scene', 'scenes'] },
  branding: { label: 'Branding', description: 'branding, logo, brand colours, brand font, end card, watermark, company name',
              words: ['brand', 'branding', 'logo', 'watermark', 'endcard', 'end', 'card', 'company', 'name', 'guidelines'] },
  other:    { label: 'Other',    description: 'other request, remove a part, export a different format or size, general change',
              words: [] as string[] },
} as const

export type RevisionCategory = keyof typeof REVISION_CATEGORIES
export const REVISION_CATEGORY_KEYS = Object.keys(REVISION_CATEGORIES) as RevisionCategory[]

export type CareConfig = typeof CARE_CONFIG

/** Project statuses that mean the client has received a version. Entering any
 *  of them for the first time = the video was "delivered". */
export const CLIENT_VISIBLE_STATUSES = ['client_reviewing', 'revision_requested', 'client_approved'] as const

export const RENEWAL_STATUSES = ['not_discussed', 'discussed', 'renewed', 'declined'] as const
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number]
