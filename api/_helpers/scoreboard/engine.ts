// Copied word for word from the Pingu Finance tool (src/lib/scoreboard.ts); only the import path changed.
import type { RevisionNoteCategory } from "./categories.js";

/**
 * Editor scoreboard — deterministic per-video scoring engine. Pure functions
 * only: no database access, no I/O. Implementation of
 * scoreboard-spec-technical.md, corrected and extended in two confirmed
 * places:
 *
 *  1. Step 5 halves the time penalty with `floor(time_penalty / 2)`, not the
 *     spec prose's `ceil(... ) # toward zero`. The prose was the error —
 *     confirmed: -15 halves to -8, which only holds under floor (ceil gives
 *     -7). Validation case #4 (87) is unchanged and still passes.
 *  2. The "card never moved to In Progress" bypass rule (-50, added on top
 *     of the original spec) applies before, and independently of, the
 *     first-video-pass exemption in Step 2 — confirmed: exempting first
 *     videos would make "first video for a new client" the safest place to
 *     bypass the process. It's applied, then floored, then manual_adjustment
 *     is added on top — see the first-video branch below.
 *  3. Step 1's base score follows a per-editor, per-working-day
 *     delivery-deadline ladder, not a single fixed window — and the ladder
 *     only ADVANCES if every earlier slot that day was met. The 1st
 *     delivery must beat DELIVERY_DEADLINE_HOURS[0] (local CET clock time)
 *     for full base (BASE_EARLY); missing it scores BASE_LATE. The 2nd
 *     delivery is judged against DELIVERY_DEADLINE_HOURS[1] ONLY if the 1st
 *     met its own deadline — otherwise the 2nd (and every delivery after it,
 *     for the rest of that working day) is judged against
 *     DELIVERY_DEADLINE_HOURS[0] again, same as the 1st. Once N exceeds the
 *     ladder's length AND every slot up to N was met, delivery N scores full
 *     base regardless of time. September 2026 fix: the ladder used to
 *     advance by delivery COUNT alone, regardless of whether earlier
 *     deadlines were kept — an editor could deliver once at 3am (reduced
 *     base), then face no deadline at all for the rest of the day, defeating
 *     the point of having one. The caller (scoreboard-engine-runner.ts)
 *     tracks this "has the ladder broken yet today" state and passes in
 *     which slot a delivery should actually be judged against — see
 *     VideoScoreResult.metDeliveryDeadline, which the caller reads after
 *     scoring each video to know whether to keep advancing for the next one.
 *     The working day runs DELIVERY_DAY_START_HOUR (06:00 CET by default) to
 *     the same clock time the next day, NOT midnight to midnight — a
 *     delivery at 01:00 belongs to the working day that started the
 *     previous morning, so an editor's 3rd video landing at 1am is still
 *     their 3rd of that day, not the 1st of a new one (see
 *     workingDayKeyInTimezone). Replaces an earlier flat 06:00-18:00 CET
 *     window rule (a single window applied to every delivery, not a ladder
 *     at all) once real workflows showed multiple same-day deliveries needed
 *     different deadlines.
 *  4. Step 3's slow-revision penalty (3h+ to resolve) is per response EVENT,
 *     not per revision — real data showed editors clearing a whole batch of
 *     comments in one sitting, hours after they were filed, getting charged
 *     once per comment for what was one delay. Revisions on the same video
 *     resolved within SLOW_REVISION_BATCH_WINDOW_MINUTES of each other are
 *     grouped; the group's delay is measured once, from the earliest note's
 *     requestedAt to the group's earliest resolvedAt. Capped at
 *     SLOW_REVISION_MAX_PENALTIES_PER_VIDEO regardless of how many events
 *     come out slow — this mechanism alone shouldn't be able to floor a
 *     video. Per-revision penalty/repeat/recovery amounts are unaffected;
 *     only how many times the slow penalty can fire changes.
 *
 * Nothing under the spec's "OPEN — NOT SPECIFIED" section is implemented:
 * complexity_tier has no scoring effect, and bonus payout amounts don't
 * exist here at all. Working hours (needed for the comms score) are
 * confirmed as 09:00–18:00 Europe/Brussels, Monday–Friday, configurable per
 * editor — see WorkingHours / DEFAULT_WORKING_HOURS and getCommsScore below.
 *
 * KNOWN LIMITATION — claim-to-start delay (logged, not fixed, September
 * 2026): the in-progress time penalty (Step 4) measures from the claim
 * (pending_assignment -> in_progress) to first submission, on the
 * assumption that span is editing time. Investigated whether that's true:
 * no signal in the CRM distinguishes "claimed and started immediately" from
 * "claimed and left it for hours before starting" — comments are
 * admin/client-authored only (never the editor), and the editor's first
 * file upload lands at essentially the same instant as the submission
 * transition itself (median gap ~0h across every editor checked), so it
 * carries no additional information. This is deliberately NOT being fixed
 * with a new "started editing" status — In Progress already is that action;
 * a second step marking the same transition would be redundant. The actual
 * gap is process compliance: editors are expected to move the card the
 * moment they start (the bypass penalty and the editor-facing docs already
 * say so), it just hasn't been enforced yet because this board isn't live.
 * Once it is, claim-to-in-progress promptness becomes a real, meaningful
 * signal on its own terms — until then, in-progress duration cannot be
 * cleanly separated into "delay" versus "genuine editing time," and the 3h/
 * 4h/5h tiers should be read with that ambiguity in mind.
 */

/* ---------------------------------------------------------------------------
 * Constants — grouped into one configurable object (ScoringConstants /
 * DEFAULT_SCORING_CONSTANTS) so a caller (a backtest script, in particular)
 * can pass a modified copy into calculateVideoScore without editing this
 * file or rebuilding anything — e.g. `{ ...DEFAULT_SCORING_CONSTANTS,
 * REVISION_PENALTY: -8 }`. The individual named exports below are kept
 * (equal to DEFAULT_SCORING_CONSTANTS's fields) purely so existing call
 * sites that import them directly — check-scoreboard.ts,
 * scoreboard-mock-data.ts — don't need to change; new code should prefer the
 * grouped object.
 * ------------------------------------------------------------------------- */

export interface ScoringConstants {
  BASE_EARLY: number; // full base — this delivery beat its slot's deadline
  BASE_LATE: number; // reduced base — this delivery missed its slot's deadline
  /** Per-working-day delivery-deadline ladder: index 0 is the local-CET
   *  clock hour the 1st delivery of an editor's working day must beat for
   *  full base, index 1 the 2nd, and so on. A delivery whose ordinal
   *  position that working day exceeds this array's length always scores
   *  full base regardless of time — so the array's length IS the number of
   *  laddered slots; append an entry to add another tier. Interpreted
   *  relative to DELIVERY_DAY_START_HOUR's rollover, not midnight — see
   *  calculateVideoScore's Step 1 and workingDayKeyInTimezone. */
  DELIVERY_DEADLINE_HOURS: number[];
  /** Local CET hour a delivery "working day" starts and rolls over at — 6
   *  for a 06:00-06:00 day, meaning a delivery at 01:00 still belongs to
   *  the working day that began the previous morning. Used both to group
   *  deliveries into days for the ladder's ordinal count
   *  (workingDayKeyInTimezone) and to interpret DELIVERY_DEADLINE_HOURS'
   *  clock-hour deadlines relative to that rollover rather than midnight. */
  DELIVERY_DAY_START_HOUR: number;
  REVISION_PENALTY: number;
  REPEAT_PENALTY: number;
  /** Minutes threshold for recovery tier 1 (default 15) — a response batch
   *  (see SLOW_REVISION_BATCH_WINDOW_MINUTES) resolved before this many
   *  minutes have elapsed recovers RECOVERY_TIER_1_PCT of the batch's total
   *  revision penalty, however many revisions or repeats it contains — a
   *  fraction of the PENALTY, not a flat per-revision amount, so the
   *  incentive scales with what's actually at stake. See calculateVideoScore's
   *  Step 3 module note. */
  RECOVERY_TIER_1_MAX_MINUTES: number;
  RECOVERY_TIER_1_PCT: number;
  /** Minutes threshold for recovery tier 2 (default 30) — resolved at or
   *  after RECOVERY_TIER_1_MAX_MINUTES but before this recovers
   *  RECOVERY_TIER_2_PCT instead. */
  RECOVERY_TIER_2_MAX_MINUTES: number;
  RECOVERY_TIER_2_PCT: number;
  /** Minutes threshold for recovery tier 3 (default 60) — resolved at or
   *  after RECOVERY_TIER_2_MAX_MINUTES but before this recovers
   *  RECOVERY_TIER_3_PCT. At or after this threshold, nothing is recovered
   *  until SLOW_REVISION_THRESHOLD_MINUTES, where SLOW_REVISION_PENALTY
   *  applies instead — see calculateVideoScore's Step 3. */
  RECOVERY_TIER_3_MAX_MINUTES: number;
  RECOVERY_TIER_3_PCT: number;
  /** Minutes threshold (default 180 / 3h) at or beyond which a response
   *  batch is slow instead of merely unrecovered — SLOW_REVISION_PENALTY
   *  applies. Between RECOVERY_TIER_3_MAX_MINUTES and this, a batch neither
   *  recovers anything nor is penalized further. */
  SLOW_REVISION_THRESHOLD_MINUTES: number;
  /** Per response event (see SLOW_REVISION_BATCH_WINDOW_MINUTES) taking
   *  SLOW_REVISION_THRESHOLD_MINUTES or more to resolve — not per revision.
   *  A batch of comments the editor clears in one sitting is one event,
   *  however many notes it contains. */
  SLOW_REVISION_PENALTY: number;
  /** Revisions on the same video resolved within this many minutes of each
   *  other are treated as one response event for slow-revision purposes —
   *  the editor sitting down once and clearing several notes together,
   *  not N independent failures to respond. Does not affect the per-
   *  revision penalty/repeat/recovery amounts, only how many times
   *  SLOW_REVISION_PENALTY can fire. */
  SLOW_REVISION_BATCH_WINDOW_MINUTES: number;
  /** However many response events come out slow, no more than this many
   *  SLOW_REVISION_PENALTY hits apply to one video — a video can still
   *  score badly without this one mechanism alone collapsing it to the floor. */
  SLOW_REVISION_MAX_PENALTIES_PER_VIDEO: number;
  /** Hours of in-progress time before the penalty ladder starts, when no
   *  per-client override applies (see calculateVideoScore's timeTargetHours
   *  param and scoreboard-client-settings.ts) — a client set to 5 shifts
   *  the whole ladder to fire at 5-6h/6-7h/7h+ instead, same -8/-12/-17
   *  amounts. The three fields below are the ladder's per-tier PENALTIES,
   *  which never change by client — only where the ladder starts does. */
  DEFAULT_TIME_TARGET_HOURS: number;
  INPROGRESS_3_TO_4H: number;
  INPROGRESS_4_TO_5H: number;
  INPROGRESS_5H_PLUS: number;
  /** Card never moved to In Progress before editing — not in the original
   *  spec; added per instruction, see the module note. */
  INPROGRESS_BYPASS: number;
  VIDEO_FLOOR: number;
  WARNING_WINDOW_MINUTES: number;
  WARNING_MONTHLY_CAP: number;
  /** How close in_progress_started_at may sit to deliveredAt before it
   *  counts as "never really moved" rather than a genuinely fast turnaround. */
  BYPASS_MINUTES_THRESHOLD: number;
  /** A prior revision must match within this many days to count as a repeat. */
  REPEAT_DETECTION_WINDOW_DAYS: number;
  /** A pair's most recent delivered video must be at least this old for the
   *  next one to still count as "first video for the pair" again. */
  FIRST_VIDEO_RESET_DAYS: number;
  /** Weight of an editor's video average in final_score — see
   *  calculateFinalScore below. Must sum to 1 with FINAL_SCORE_COMMS_WEIGHT,
   *  not enforced in code, just a convention to keep in mind when tuning. */
  FINAL_SCORE_VIDEO_WEIGHT: number;
  /** Weight of an editor's comms score (out of 100) in final_score. */
  FINAL_SCORE_COMMS_WEIGHT: number;
  /** final_score must be at least this for bonus eligibility. */
  ELIGIBILITY_MIN_FINAL_SCORE: number;
  /** Video count in the period must be at least this for bonus eligibility. */
  ELIGIBILITY_MIN_VIDEOS: number;
}

/**
 * September 2026 rescale — every video-scoring value replaced, plus two new
 * eligibility gates added to this same object per instruction ("I'll be
 * tuning both"). Comparison to the prior defaults, for anyone reading git
 * blame later: BASE_EARLY 120->100, BASE_LATE 100->83, REVISION_PENALTY
 * -5->-4, REPEAT_PENALTY -10->-8, RECOVERY_UNDER_15MIN 5->4,
 * RECOVERY_UNDER_30MIN unchanged at 3, SLOW_REVISION_PENALTY -20->-17,
 * INPROGRESS_3_TO_4H -10->-8, INPROGRESS_4_TO_5H -15->-12, INPROGRESS_5H_PLUS
 * -20->-17, INPROGRESS_BYPASS -50->-30, VIDEO_FLOOR 40->33. Everything else
 * about per-video scoring (step order, first-video pass, warning halving —
 * still floor()-based, still capped at 3/month, still the 06:00-18:00
 * window) is unchanged.
 */
export const DEFAULT_SCORING_CONSTANTS: ScoringConstants = {
  BASE_EARLY: 100,
  BASE_LATE: 83,
  DELIVERY_DEADLINE_HOURS: [18, 21],
  DELIVERY_DAY_START_HOUR: 6,
  REVISION_PENALTY: -4,
  REPEAT_PENALTY: -8,
  RECOVERY_TIER_1_MAX_MINUTES: 15,
  RECOVERY_TIER_1_PCT: 0.6,
  RECOVERY_TIER_2_MAX_MINUTES: 30,
  RECOVERY_TIER_2_PCT: 0.4,
  RECOVERY_TIER_3_MAX_MINUTES: 60,
  RECOVERY_TIER_3_PCT: 0.2,
  SLOW_REVISION_THRESHOLD_MINUTES: 180,
  SLOW_REVISION_PENALTY: -17,
  SLOW_REVISION_BATCH_WINDOW_MINUTES: 30,
  SLOW_REVISION_MAX_PENALTIES_PER_VIDEO: 2,
  DEFAULT_TIME_TARGET_HOURS: 3,
  INPROGRESS_3_TO_4H: -8,
  INPROGRESS_4_TO_5H: -12,
  INPROGRESS_5H_PLUS: -17,
  INPROGRESS_BYPASS: -30,
  VIDEO_FLOOR: 33,
  WARNING_WINDOW_MINUTES: 60,
  WARNING_MONTHLY_CAP: 3,
  BYPASS_MINUTES_THRESHOLD: 5,
  REPEAT_DETECTION_WINDOW_DAYS: 30,
  FIRST_VIDEO_RESET_DAYS: 60,
  FINAL_SCORE_VIDEO_WEIGHT: 0.85,
  FINAL_SCORE_COMMS_WEIGHT: 0.15,
  ELIGIBILITY_MIN_FINAL_SCORE: 70,
  ELIGIBILITY_MIN_VIDEOS: 20,
};

export const BASE_EARLY = DEFAULT_SCORING_CONSTANTS.BASE_EARLY;
export const BASE_LATE = DEFAULT_SCORING_CONSTANTS.BASE_LATE;
export const REVISION_PENALTY = DEFAULT_SCORING_CONSTANTS.REVISION_PENALTY;
export const REPEAT_PENALTY = DEFAULT_SCORING_CONSTANTS.REPEAT_PENALTY;
export const RECOVERY_TIER_1_MAX_MINUTES = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_1_MAX_MINUTES;
export const RECOVERY_TIER_1_PCT = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_1_PCT;
export const RECOVERY_TIER_2_MAX_MINUTES = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_2_MAX_MINUTES;
export const RECOVERY_TIER_2_PCT = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_2_PCT;
export const RECOVERY_TIER_3_MAX_MINUTES = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_3_MAX_MINUTES;
export const RECOVERY_TIER_3_PCT = DEFAULT_SCORING_CONSTANTS.RECOVERY_TIER_3_PCT;
export const SLOW_REVISION_THRESHOLD_MINUTES = DEFAULT_SCORING_CONSTANTS.SLOW_REVISION_THRESHOLD_MINUTES;
export const SLOW_REVISION_PENALTY = DEFAULT_SCORING_CONSTANTS.SLOW_REVISION_PENALTY;
export const DEFAULT_TIME_TARGET_HOURS = DEFAULT_SCORING_CONSTANTS.DEFAULT_TIME_TARGET_HOURS;
export const INPROGRESS_3_TO_4H = DEFAULT_SCORING_CONSTANTS.INPROGRESS_3_TO_4H;
export const INPROGRESS_4_TO_5H = DEFAULT_SCORING_CONSTANTS.INPROGRESS_4_TO_5H;
export const INPROGRESS_5H_PLUS = DEFAULT_SCORING_CONSTANTS.INPROGRESS_5H_PLUS;
export const INPROGRESS_BYPASS = DEFAULT_SCORING_CONSTANTS.INPROGRESS_BYPASS;
export const VIDEO_FLOOR = DEFAULT_SCORING_CONSTANTS.VIDEO_FLOOR;
export const WARNING_WINDOW_MINUTES = DEFAULT_SCORING_CONSTANTS.WARNING_WINDOW_MINUTES;
export const WARNING_MONTHLY_CAP = DEFAULT_SCORING_CONSTANTS.WARNING_MONTHLY_CAP;
export const BYPASS_MINUTES_THRESHOLD = DEFAULT_SCORING_CONSTANTS.BYPASS_MINUTES_THRESHOLD;
export const REPEAT_DETECTION_WINDOW_DAYS = DEFAULT_SCORING_CONSTANTS.REPEAT_DETECTION_WINDOW_DAYS;
export const FIRST_VIDEO_RESET_DAYS = DEFAULT_SCORING_CONSTANTS.FIRST_VIDEO_RESET_DAYS;

/** September 2026 rescale: comms moved from a 300-point scale (150/100/50)
 *  to a 100-point scale (50/35/15) — see getCommsScore's bucket constants
 *  below, each rescaled proportionally within its new sub-max. */
export const COMMS_MAX = 100;
export const TIMEZONE = "Europe/Brussels";

export const REVIEW_FLAGS = {
  NOT_MOVED_TO_IN_PROGRESS: "NOT_MOVED_TO_IN_PROGRESS",
} as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[keyof typeof REVIEW_FLAGS];

/* ---------------------------------------------------------------------------
 * Inputs
 * ------------------------------------------------------------------------- */

export interface ScoreboardVideoInput {
  id: string;
  editorId: string;
  clientId: string;
  /** When the card was first moved to In Progress. Null = never moved —
   *  triggers the bypass rule below regardless of any other field. */
  inProgressStartedAt: Date | null;
  /** First delivery to the client. */
  deliveredAt: Date;
  /** Minutes actually spent in progress, pause intervals already excluded
   *  (client-review time is not the editor's time) — provided directly,
   *  not derived here. */
  inProgressDurationMin: number;
  warningSentAt: Date | null;
  manualAdjustment: number;
  manualAdjustmentReason?: string | null;
}

export interface ScoreboardRevisionInput {
  noteCategory: RevisionNoteCategory;
  requestedAt: Date;
  resolvedAt: Date;
  /** Derived upstream by detectRepeats() across a broader revision history
   *  than any single video has — see that function below. */
  isRepeat: boolean;
  /** false = a scope change, not a quality issue; excluded from scoring. */
  countsTowardScore: boolean;
}

export interface EditorClientHistory {
  /** Most recent delivered video for this (editor, client) pair, before this
   *  one. Null = no prior video — this is their first for the pair. */
  mostRecentDeliveredAt: Date | null;
  /** Warnings already applied for this editor this month, before this video
   *  — the caller's running tally. See VideoScoreResult.warningApplied for
   *  how to advance it to the next video. */
  warningsUsedThisMonth: number;
}

/* ---------------------------------------------------------------------------
 * Output
 * ------------------------------------------------------------------------- */

export type ScoreCategory =
  | "base"
  | "revisionPenalty"
  | "revisionRecovery"
  | "slowRevision"
  | "inProgressTime"
  | "warningHalving"
  | "inProgressBypass"
  | "floor"
  | "manualAdjustment";

export interface ScoreBreakdownEntry {
  category: ScoreCategory;
  /** Signed contribution to the total — breakdown.reduce((s, e) => s + e.amount, 0) === score, always. */
  amount: number;
  detail: string;
}

export interface VideoScoreResult {
  score: number;
  breakdown: ScoreBreakdownEntry[];
  flags: ReviewFlag[];
  isFirstVideoForPair: boolean;
  /** True if a warning validly reduced this video's time penalty — the
   *  caller must add 1 to warningsUsedThisMonth before scoring this
   *  editor's next video this month. */
  warningApplied: boolean;
  /** Whether THIS delivery beat the deadline it was actually judged
   *  against (the `deliverySlot` the caller passed in) — the caller
   *  (scoreboard-engine-runner.ts) reads this after scoring to decide
   *  whether the delivery-deadline ladder keeps advancing for this
   *  editor's next delivery today, or has broken and resets to slot 1 for
   *  the rest of the working day. See calculateVideoScore's Step 1 and the
   *  module note (correction 3). */
  metDeliveryDeadline: boolean;
}

/* ---------------------------------------------------------------------------
 * Timezone — Europe/Brussels via Intl, no date library, so DST (CET/CEST)
 * is handled by the platform's own IANA tz database rather than a manual
 * offset table that would need updating for future DST rule changes.
 * ------------------------------------------------------------------------- */

/** Minutes since local midnight in Europe/Brussels, DST-aware. */
export function minutesSinceLocalMidnight(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** "YYYY-MM-DD" for the calendar day `date` falls in, in `timezone`. */
function calendarDayKeyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

/**
 * "YYYY-MM-DD" for the working day `date` falls in, in `timezone` (default
 * CET/CEST) — the per-editor grouping key for the delivery-deadline ladder
 * (DELIVERY_DEADLINE_HOURS). A working day runs from `dayStartHour` local
 * clock time to the same clock time the next day, not midnight to midnight
 * — a 01:00 delivery with dayStartHour=6 belongs to the working day that
 * started the previous morning, so an editor's 3rd video landing at 1am
 * stays their 3rd of that day rather than resetting to a 1st. Computed by
 * shifting the instant back by dayStartHour hours before reading off its
 * calendar day — a fixed-hour shift, not a DST-aware one, the same
 * no-date-library tradeoff this module makes elsewhere; it can only misread
 * the boundary by an hour on the two days a year DST itself changes, and
 * only for a delivery inside that hour.
 */
export function workingDayKeyInTimezone(date: Date, dayStartHour: number, timezone: string = TIMEZONE): string {
  const shifted = new Date(date.getTime() - dayStartHour * 60 * 60 * 1000);
  return calendarDayKeyInTimezone(shifted, timezone);
}

/**
 * Wraps `minutesSinceMidnight` into "minutes since the working day started"
 * — e.g. with a 06:00 day start, 01:00 (60 minutes since midnight) becomes
 * 1140 (19 hours into the working day that began the previous morning).
 * Lets calculateVideoScore compare a delivery and its deadline on the same
 * timeline regardless of whether either falls before or after midnight.
 */
export function minutesIntoWorkingDay(minutesSinceMidnight: number, dayStartHour: number): number {
  const MINUTES_PER_DAY = 24 * 60;
  const dayStartMinutes = dayStartHour * 60;
  return ((minutesSinceMidnight - dayStartMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** "1st"/"2nd"/"3rd"/"4th"... — for the base-score breakdown detail text. */
function ordinalLabel(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * "YYYY-MM" for the calendar month `date` falls in, in `timezone` (default
 * CET/CEST) — the period boundary everything else in this module keys off
 * of. Deliberately Intl-based, not `date.getMonth()`: a plain getMonth()
 * reads the server's own local timezone, which silently gives the wrong
 * month for any video delivered near a CET midnight if the server runs in
 * UTC or anywhere else.
 */
export function monthKeyInTimezone(date: Date, timezone: string = TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60);
}

/* ---------------------------------------------------------------------------
 * First-video-pass
 * ------------------------------------------------------------------------- */

export function isFirstVideoForPair(
  history: Pick<EditorClientHistory, "mostRecentDeliveredAt">,
  deliveredAt: Date,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
): boolean {
  if (history.mostRecentDeliveredAt === null) return true;
  const daysSincePrior = minutesBetween(history.mostRecentDeliveredAt, deliveredAt) / (60 * 24);
  return daysSincePrior > constants.FIRST_VIDEO_RESET_DAYS;
}

/* ---------------------------------------------------------------------------
 * Repeat detection — cross-video, per (editor, client, noteCategory). Takes
 * every revision across a window of videos for one editor-client pair and
 * marks is_repeat on each; the per-video scorer below takes isRepeat as
 * already-computed input rather than recomputing it in isolation, since a
 * single video has no visibility into the other videos needed to detect one.
 * ------------------------------------------------------------------------- */

export interface RepeatDetectionRevision {
  requestedAt: Date;
  noteCategory: RevisionNoteCategory;
}

/**
 * Marks is_repeat on every revision in `revisions` (already scoped to one
 * editor-client pair, from any of that pair's videos) — true when an earlier
 * revision with the same noteCategory (never "other") exists within the
 * trailing REPEAT_DETECTION_WINDOW_DAYS. Order-independent: sorts by
 * requestedAt internally so caller order doesn't matter.
 */
export function detectRepeats<T extends RepeatDetectionRevision>(
  revisions: T[],
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
): (T & { isRepeat: boolean })[] {
  const sorted = [...revisions].sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  const windowMs = constants.REPEAT_DETECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return sorted.map((revision, i) => {
    if (revision.noteCategory === "other") return { ...revision, isRepeat: false };
    const isRepeat = sorted
      .slice(0, i)
      .some(
        (prior) =>
          prior.noteCategory === revision.noteCategory &&
          revision.requestedAt.getTime() - prior.requestedAt.getTime() <= windowMs,
      );
    return { ...revision, isRepeat };
  });
}

/* ---------------------------------------------------------------------------
 * Response-event batching for the slow-revision penalty — see correction 4
 * in the module note.
 * ------------------------------------------------------------------------- */

interface BatchableRevision {
  requestedAt: Date;
  resolvedAt: Date;
}

/**
 * Groups revisions into response events by resolution-time proximity: sort
 * by resolvedAt, start a new batch whenever the gap to the previous
 * resolution exceeds `windowMinutes`. A revision resolved in isolation is
 * its own batch of one — this is a generalization of "check each revision's
 * own duration," not a special case bolted on top of it. Order-independent
 * (sorts internally); does not mutate its input.
 */
function groupIntoResponseBatches<T extends BatchableRevision>(revisions: T[], windowMinutes: number): T[][] {
  if (revisions.length === 0) return [];
  const sorted = [...revisions].sort((a, b) => a.resolvedAt.getTime() - b.resolvedAt.getTime());
  const batches: T[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const gapMin = (sorted[i].resolvedAt.getTime() - sorted[i - 1].resolvedAt.getTime()) / (1000 * 60);
    if (gapMin <= windowMinutes) {
      batches[batches.length - 1].push(sorted[i]);
    } else {
      batches.push([sorted[i]]);
    }
  }
  return batches;
}

/* ---------------------------------------------------------------------------
 * The scorer
 * ------------------------------------------------------------------------- */

export function calculateVideoScore(
  video: ScoreboardVideoInput,
  revisions: ScoreboardRevisionInput[],
  history: EditorClientHistory,
  /** 1-indexed: which deadline slot (DELIVERY_DEADLINE_HOURS[deliverySlot -
   *  1]) this delivery should be judged against — NOT necessarily this
   *  video's raw position among the editor's deliveries that working day.
   *  The ladder only advances past slot 1 if every earlier delivery today
   *  met its own deadline; once one is missed, the caller passes 1 again
   *  for every remaining delivery that working day, resetting the
   *  ladder rather than advancing it. The caller (the engine runner) tracks
   *  this since a single video has no visibility into its same-day
   *  siblings or their outcomes — see VideoScoreResult.metDeliveryDeadline,
   *  which the caller reads after each call to decide the next one's slot. */
  deliverySlot: number,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
  /** Hours of in-progress time before Step 4's penalty ladder starts firing
   *  for THIS video — defaults to constants.DEFAULT_TIME_TARGET_HOURS, but
   *  a caller resolving a per-client override (see
   *  scoreboard-client-settings.ts) passes that client's own value instead.
   *  Shifts where the ladder starts; the -8/-12/-17 tier amounts and their
   *  1-hour width never change by client. */
  timeTargetHours: number = constants.DEFAULT_TIME_TARGET_HOURS,
): VideoScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  const flags: ReviewFlag[] = [];

  // Bypass check — deliberately evaluated before everything else, including
  // the first-video pass. See the module note: this is a process-integrity
  // flag ("the card was never really moved"), not a performance penalty, so
  // it isn't waived by the first-video grace period the way Step 3/4/5
  // penalties are.
  const bypassed =
    video.inProgressStartedAt === null ||
    minutesBetween(video.inProgressStartedAt, video.deliveredAt) < constants.BYPASS_MINUTES_THRESHOLD;
  if (bypassed) flags.push(REVIEW_FLAGS.NOT_MOVED_TO_IN_PROGRESS);

  // STEP 1 — base, against the deadline slot the caller says applies
  // (deliverySlot — see its own doc comment for why that isn't always this
  // delivery's raw position in the day: the ladder resets to slot 1 for
  // the rest of the working day once any slot is missed). Both the
  // delivery and the deadline are measured in minutes-into-the-working-day
  // (not minutes-since-midnight), since the working day rolls over at
  // DELIVERY_DAY_START_HOUR, not midnight — a 19:00 clock-time deadline can
  // be "earlier in the working day" than a 01:00 delivery even though
  // 01:00 is numerically smaller. This comparison alone also naturally
  // keeps the 06:00 lower bound: a delivery before the working day's own
  // start belongs to the PREVIOUS working day (see workingDayKeyInTimezone),
  // so within any given working day the earliest possible deliveryIntoDay
  // is 0 (exactly at the rollover) — there's no separate "before 06:00"
  // case to special-case here.
  const deadlineHour = constants.DELIVERY_DEADLINE_HOURS[deliverySlot - 1];
  const deliveryIntoDay = minutesIntoWorkingDay(
    minutesSinceLocalMidnight(video.deliveredAt),
    constants.DELIVERY_DAY_START_HOUR,
  );
  const deadlineIntoDay =
    deadlineHour === undefined ? null : minutesIntoWorkingDay(deadlineHour * 60, constants.DELIVERY_DAY_START_HOUR);
  const metDeadline = deadlineIntoDay === null || deliveryIntoDay < deadlineIntoDay;
  const base = metDeadline ? constants.BASE_EARLY : constants.BASE_LATE;
  breakdown.push({
    category: "base",
    amount: base,
    detail:
      deadlineHour === undefined
        ? `${ordinalLabel(deliverySlot)} delivery of the day — beyond the deadline ladder, full base`
        : `${ordinalLabel(deliverySlot)} delivery of the day, ${metDeadline ? "before" : "after"} the ${deadlineHour}:00 CET deadline`,
  });

  // STEP 2 — first-video pass: skips revisions/time/warning (Steps 3-5),
  // bypass included. The bypass penalty (if any) still goes through the
  // floor before manual_adjustment, same ordering as the general path below
  // — a first video isn't exempt from the process check, so it shouldn't be
  // exempt from the floor that check can trigger either.
  const isFirstVideo = isFirstVideoForPair(history, video.deliveredAt, constants);
  if (isFirstVideo) {
    if (bypassed) {
      breakdown.push({
        category: "inProgressBypass",
        amount: constants.INPROGRESS_BYPASS,
        detail: "Card never moved to In Progress (flagged for review)",
      });
    }
    const preFloor = breakdown.reduce((sum, e) => sum + e.amount, 0);
    if (preFloor < constants.VIDEO_FLOOR) {
      breakdown.push({
        category: "floor",
        amount: constants.VIDEO_FLOOR - preFloor,
        detail: `Raised from ${preFloor} to the ${constants.VIDEO_FLOOR}-point floor`,
      });
    }
    if (video.manualAdjustment !== 0) {
      breakdown.push({
        category: "manualAdjustment",
        amount: video.manualAdjustment,
        detail: video.manualAdjustmentReason ?? "Manual adjustment",
      });
    }
    return {
      score: breakdown.reduce((sum, e) => sum + e.amount, 0),
      breakdown,
      flags,
      isFirstVideoForPair: true,
      warningApplied: false,
      metDeliveryDeadline: metDeadline,
    };
  }

  // STEP 3 — revisions: penalty per revision, charged individually.
  const countingRevisions = revisions.filter((r) => r.countsTowardScore);
  for (const revision of countingRevisions) {
    const penalty = revision.isRepeat ? constants.REPEAT_PENALTY : constants.REVISION_PENALTY;
    breakdown.push({
      category: "revisionPenalty",
      amount: penalty,
      detail: `${revision.noteCategory}${revision.isRepeat ? " (repeat)" : ""}`,
    });
  }

  // Recovery and the slow-revision penalty are two sides of the same
  // batching: revisions resolved close together (see
  // groupIntoResponseBatches/SLOW_REVISION_BATCH_WINDOW_MINUTES) are judged
  // as one response, not N independent ones — an editor clearing four notes
  // in one 10-minute sitting is one fast response, not four, for reward and
  // penalty alike. See the module note (correction 4) for why the slow
  // penalty itself is batched.
  //
  // September 2026 fix: recovery used to be a flat +4/+3 points per
  // INDIVIDUAL revision, regardless of that revision's own penalty size —
  // on a video with 4 revisions (-16 total), a fast fix recovered only 3
  // points, not enough to be worth rushing for; the incentive didn't scale
  // with what was actually at stake. Recovery is now a PERCENTAGE of the
  // whole batch's penalty instead — three tiers (RECOVERY_TIER_1/2/3_PCT,
  // 60%/40%/20% by default, with configurable minute thresholds
  // RECOVERY_TIER_1/2/3_MAX_MINUTES), recovering nothing from
  // RECOVERY_TIER_3_MAX_MINUTES up to SLOW_REVISION_THRESHOLD_MINUTES, which
  // is the existing SLOW_REVISION_PENALTY unchanged. The same fast fix on a
  // 4-revision video now recovers 60% of 16 ≈ 10 points, rounded to the
  // nearest whole number. Capped at the highest tier's percentage by
  // construction (never 100%), so a clean video with zero revisions always
  // outscores the same video with revisions however fast they were fixed:
  // recovering part of a penalty is never recovering all of it.
  const responseBatches = groupIntoResponseBatches(countingRevisions, constants.SLOW_REVISION_BATCH_WINDOW_MINUTES);
  let slowPenaltiesApplied = 0;
  for (const batch of responseBatches) {
    const earliestRequestedAt = Math.min(...batch.map((r) => r.requestedAt.getTime()));
    const earliestResolvedAt = Math.min(...batch.map((r) => r.resolvedAt.getTime()));
    const batchDelayMin = (earliestResolvedAt - earliestRequestedAt) / (1000 * 60);

    if (batchDelayMin < constants.RECOVERY_TIER_3_MAX_MINUTES) {
      const recoveryPct =
        batchDelayMin < constants.RECOVERY_TIER_1_MAX_MINUTES
          ? constants.RECOVERY_TIER_1_PCT
          : batchDelayMin < constants.RECOVERY_TIER_2_MAX_MINUTES
            ? constants.RECOVERY_TIER_2_PCT
            : constants.RECOVERY_TIER_3_PCT;
      const batchPenalty = batch.reduce(
        (sum, r) => sum + (r.isRepeat ? constants.REPEAT_PENALTY : constants.REVISION_PENALTY),
        0,
      );
      const recovery = Math.round(Math.abs(batchPenalty) * recoveryPct);
      if (recovery > 0) {
        breakdown.push({
          category: "revisionRecovery",
          amount: recovery,
          detail:
            batch.length > 1
              ? `Batch of ${batch.length} resolved in ${Math.round(batchDelayMin)} min (${Math.round(recoveryPct * 100)}% recovered)`
              : `Resolved in ${Math.round(batchDelayMin)} min (${Math.round(recoveryPct * 100)}% recovered)`,
        });
      }
    } else if (
      batchDelayMin >= constants.SLOW_REVISION_THRESHOLD_MINUTES &&
      slowPenaltiesApplied < constants.SLOW_REVISION_MAX_PENALTIES_PER_VIDEO
    ) {
      breakdown.push({
        category: "slowRevision",
        amount: constants.SLOW_REVISION_PENALTY,
        detail:
          batch.length > 1
            ? `Batch of ${batch.length} resolved together, ${(batchDelayMin / 60).toFixed(1)}h after the earliest was filed`
            : `Took ${(batchDelayMin / 60).toFixed(1)}h to resolve`,
      });
      slowPenaltiesApplied += 1;
    }
  }

  // STEP 4 — in-progress time (replaced entirely by the bypass penalty when
  // bypassed: a duration measured from a start time that doesn't exist, or
  // that sits seconds before delivery, isn't a real duration).
  let warningApplied = false;
  if (bypassed) {
    breakdown.push({
      category: "inProgressBypass",
      amount: constants.INPROGRESS_BYPASS,
      detail: "Card never moved to In Progress (flagged for review)",
    });
  } else {
    // Per-client shift (September 2026): the ladder used to start at a
    // hardcoded 3h for every client, penalizing editors on genuinely
    // longer-form accounts (motion graphics vs. a talking-head cut) for
    // work that legitimately takes longer, not for being slow. The three
    // tiers keep their own 1-hour width and -8/-12/-17 amounts regardless
    // of client — only where the ladder starts moves.
    const hours = video.inProgressDurationMin / 60;
    const rawTimePenalty =
      hours < timeTargetHours
        ? 0
        : hours < timeTargetHours + 1
          ? constants.INPROGRESS_3_TO_4H
          : hours < timeTargetHours + 2
            ? constants.INPROGRESS_4_TO_5H
            : constants.INPROGRESS_5H_PLUS;

    if (rawTimePenalty !== 0) {
      breakdown.push({
        category: "inProgressTime",
        amount: rawTimePenalty,
        detail: `${hours.toFixed(1)}h in progress (target ${timeTargetHours}h)`,
      });
    }

    // STEP 5 — early warning: halves the time penalty if it was sent within
    // WARNING_WINDOW_MINUTES of the start and this editor hasn't used up
    // their monthly cap yet.
    if (video.warningSentAt && video.inProgressStartedAt && rawTimePenalty !== 0) {
      const minutesToWarning = minutesBetween(video.inProgressStartedAt, video.warningSentAt);
      const valid =
        minutesToWarning <= constants.WARNING_WINDOW_MINUTES &&
        history.warningsUsedThisMonth < constants.WARNING_MONTHLY_CAP;
      if (valid) {
        warningApplied = true;
        // floor(), not the spec's literal ceil() — see the module note.
        const halved = Math.floor(rawTimePenalty / 2);
        breakdown.push({
          category: "warningHalving",
          amount: halved - rawTimePenalty,
          detail: `Warning sent ${Math.round(minutesToWarning)} min after start`,
        });
      }
    }
  }

  // STEP 6 — floor
  const preFloor = breakdown.reduce((sum, e) => sum + e.amount, 0);
  if (preFloor < constants.VIDEO_FLOOR) {
    breakdown.push({
      category: "floor",
      amount: constants.VIDEO_FLOOR - preFloor,
      detail: `Raised from ${preFloor} to the ${constants.VIDEO_FLOOR}-point floor`,
    });
  }

  // STEP 7 — manual adjustment (applied after the floor, so it can push a
  // floored video back down, or a normal one out of the automatic [40,120]
  // range — only manual_adjustment may do that).
  if (video.manualAdjustment !== 0) {
    breakdown.push({
      category: "manualAdjustment",
      amount: video.manualAdjustment,
      detail: video.manualAdjustmentReason ?? "Manual adjustment",
    });
  }

  return {
    score: breakdown.reduce((sum, e) => sum + e.amount, 0),
    breakdown,
    flags,
    isFirstVideoForPair: false,
    warningApplied,
    metDeliveryDeadline: metDeadline,
  };
}

/* ---------------------------------------------------------------------------
 * Working hours — confirmed 09:00-18:00 Europe/Brussels, Monday-Friday,
 * configurable per editor. Messages outside these hours don't count toward
 * reply speed, chase detection, or availability gaps.
 * ------------------------------------------------------------------------- */

export interface WorkingHours {
  /** Local hour-of-day the working day starts, e.g. 9 for 09:00. */
  startHour: number;
  /** Local hour-of-day the working day ends (exclusive), e.g. 18 for 18:00. */
  endHour: number;
  /** 0 = Sunday .. 6 = Saturday. Default is Monday-Friday. */
  workDays: number[];
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  startHour: 9,
  endHour: 18,
  workDays: [1, 2, 3, 4, 5],
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localTimeParts(date: Date): { minutesSinceMidnight: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  return { minutesSinceMidnight: hour * 60 + minute, weekday: WEEKDAY_INDEX[weekdayStr] ?? 1 };
}

export function isWithinWorkingHours(
  date: Date,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): boolean {
  const { minutesSinceMidnight, weekday } = localTimeParts(date);
  if (!hours.workDays.includes(weekday)) return false;
  return minutesSinceMidnight >= hours.startHour * 60 && minutesSinceMidnight < hours.endHour * 60;
}

/**
 * Minutes of working time between two instants — a plain wall-clock diff
 * would count nights and weekends as "silence," which isn't what a 2-hour
 * chase threshold or an availability gap is supposed to measure.
 *
 * Jumps straight to the next state change (the next start-of-work-window,
 * end-of-work-window, or local midnight) instead of stepping minute by
 * minute — same result, since the working/not-working classification is
 * constant between two such boundaries, but O(boundaries crossed) instead of
 * O(minutes elapsed). September 2026 fix: a real WhatsApp export spanning
 * ~120 days (one upload that turned out to cover months, not the one
 * calendar month the scoreboard's comms score is meant to be scoped to) took
 * 22+ seconds to score under the old minute-by-minute walk — ~174,000
 * Intl.DateTimeFormat calls, one per minute — which is what made the Editors
 * tab itself take 22+ seconds to load, since scoring runs synchronously on
 * every page render. The new version scores the same 120-day gap in a
 * handful of milliseconds (~2 boundary crossings per day instead of 1,440
 * per-minute checks), with identical output for every existing case (all
 * well under a day, where the two approaches can't diverge). Still not
 * DST-transition-aware at the boundary itself — same tradeoff this module
 * already makes elsewhere (see workingDayKeyInTimezone's note) — and
 * irrelevant at this function's actual precision (minutes, over spans of
 * hours to months).
 */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): number {
  const toMs = to.getTime();
  if (toMs <= from.getTime()) return 0;

  const MINUTES_PER_DAY = 24 * 60;
  const startMinutes = hours.startHour * 60;
  const endMinutes = hours.endHour * 60;

  let total = 0;
  let cursor = from.getTime();
  while (cursor < toMs) {
    const { minutesSinceMidnight, weekday } = localTimeParts(new Date(cursor));
    const withinHoursWindow = minutesSinceMidnight >= startMinutes && minutesSinceMidnight < endMinutes;
    const currentlyWorking = withinHoursWindow && hours.workDays.includes(weekday);

    // Minutes until the next possible change in that classification: the
    // window's own end (if currently inside it), its start (if before it
    // today), or local midnight otherwise (covers both "after today's
    // window" and "not a work day at all" — either way, weekday is the next
    // thing that can change, and that only happens at midnight).
    const minutesToBoundary = withinHoursWindow
      ? endMinutes - minutesSinceMidnight
      : minutesSinceMidnight < startMinutes
        ? startMinutes - minutesSinceMidnight
        : MINUTES_PER_DAY - minutesSinceMidnight;

    const segmentMs = Math.min(minutesToBoundary * 60 * 1000, toMs - cursor);
    if (currentlyWorking) total += segmentMs / (60 * 1000);
    cursor += segmentMs;
  }
  return total;
}

/* ---------------------------------------------------------------------------
 * Communication score (monthly, per editor) — timestamps only. Per the
 * spec's explicit "Not scored" list, message content and volume are never
 * read or judged here, only when messages happened relative to each other.
 * ------------------------------------------------------------------------- */

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface CommsMessageInput {
  sentAt: Date;
  /** True for a message from the editor being scored; false for anyone else
   *  in the conversation (client, ops, teammates). */
  fromEditor: boolean;
}

export interface CommsScoreResult {
  total: number;
  replySpeed: number;
  responsiveness: number;
  availability: number;
  /** False when there were no messages at all to measure anything from —
   *  "not measured this period," never "measured as zero." Callers
   *  (calculateFinalScore, via summarizeMonths) must check this before using
   *  `total`: a missing comms score is not the same fact as a bad one, and
   *  treating it as zero silently caps final_score at 85% of video average
   *  for every editor with no comms pipeline wired up yet — see the
   *  September 2026 fix in calculateFinalScore's module note. */
  hasData: boolean;
  /** Non-scoring detail for the dashboard's comms breakdown bars. */
  detail: {
    replySpeedSampleSize: number;
    medianReplyMinutes: number | null;
    chases: number;
    longestSilentGapMinutes: number | null;
    /** True when there were fewer than 2 editor messages in the period —
     *  "longest gap" isn't measurable, not confirmed-perfect availability.
     *  See the module note on this in getCommsScore. */
    availabilityInsufficientData: boolean;
  };
}

/**
 * `messages` is one editor's whole conversation history for the scoring
 * period (any order — sorted internally), tagged only with who sent each
 * one and when.
 *
 * Three sub-scores, each independently thresholded per the spec:
 *
 *  - replySpeed: median minutes (working-hours-elapsed, not wall-clock) from
 *    an inbound message to the editor's next message, counted only when
 *    both messages fall inside working hours — a message sent at 11pm isn't
 *    "unanswered" just because nobody replies before morning.
 *  - responsiveness: counts "chases" — a further inbound message arriving
 *    more than 120 working-minutes after an unanswered one, with no editor
 *    message in between. Any editor message clears the unanswered state,
 *    on the same "timestamps only" reasoning as reply speed — this can't
 *    know if a reply actually addressed the pending topic.
 *  - availability: the longest working-minutes gap between two consecutive
 *    editor messages. Fewer than 2 editor messages in the period means this
 *    can't be measured at all; see availabilityInsufficientData rather than
 *    reading a fabricated 50 as a confirmed perfect score.
 */
export function getCommsScore(
  messages: CommsMessageInput[],
  workingHours: WorkingHours = DEFAULT_WORKING_HOURS,
): CommsScoreResult {
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // --- reply speed ---------------------------------------------------------
  const replySamples: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!curr.fromEditor || prev.fromEditor) continue;
    if (!isWithinWorkingHours(prev.sentAt, workingHours) || !isWithinWorkingHours(curr.sentAt, workingHours)) {
      continue;
    }
    replySamples.push(workingMinutesBetween(prev.sentAt, curr.sentAt, workingHours));
  }
  // September 2026 rescale: reply speed moved from a 150-point sub-max to
  // 50 — each bucket rescaled by 50/150, rounded to the nearest point
  // (Math.round; old->new: 150->50, 120->40, 80->26.67->27, 40->13.33->13).
  const medianReplyMinutes = median(replySamples);
  const replySpeed =
    medianReplyMinutes === null
      ? 0
      : medianReplyMinutes < 15
        ? 50
        : medianReplyMinutes < 30
          ? 40
          : medianReplyMinutes < 60
            ? 27
            : medianReplyMinutes < 120
              ? 13
              : 0;

  // --- responsiveness (chases) ---------------------------------------------
  let chases = 0;
  let pendingSince: Date | null = null;
  for (const msg of sorted) {
    if (msg.fromEditor) {
      pendingSince = null;
      continue;
    }
    if (pendingSince !== null) {
      const elapsed = workingMinutesBetween(pendingSince, msg.sentAt, workingHours);
      if (elapsed > 120) {
        chases += 1;
        pendingSince = msg.sentAt;
        continue;
      }
    }
    if (pendingSince === null) pendingSince = msg.sentAt;
  }
  // Rescaled from a 100-point sub-max to 35 (x0.35, rounded: 100->35,
  // 70->24.5->25, 30->10.5->11).
  const responsiveness = chases === 0 ? 35 : chases <= 2 ? 25 : chases <= 5 ? 11 : 0;

  // --- availability ----------------------------------------------------------
  const editorMessages = sorted.filter((m) => m.fromEditor);
  let longestSilentGapMinutes: number | null = null;
  for (let i = 1; i < editorMessages.length; i++) {
    const gap = workingMinutesBetween(editorMessages[i - 1].sentAt, editorMessages[i].sentAt, workingHours);
    if (longestSilentGapMinutes === null || gap > longestSilentGapMinutes) longestSilentGapMinutes = gap;
  }
  const availabilityInsufficientData = editorMessages.length < 2;
  const gapHours = longestSilentGapMinutes === null ? null : longestSilentGapMinutes / 60;
  // Rescaled from a 50-point sub-max to 15 (x0.3, rounded: 50->15, 25->7.5->8).
  const availability = availabilityInsufficientData
    ? 0
    : gapHours! < 2
      ? 15
      : gapHours! < 4
        ? 8
        : 0;

  return {
    total: replySpeed + responsiveness + availability,
    replySpeed,
    responsiveness,
    availability,
    hasData: sorted.length > 0,
    detail: {
      replySpeedSampleSize: replySamples.length,
      medianReplyMinutes,
      chases,
      longestSilentGapMinutes,
      availabilityInsufficientData,
    },
  };
}

/* ---------------------------------------------------------------------------
 * Final score (per editor, per calendar month) — combines that month's video
 * average with their comms score. New: not part of the original spec.
 * ------------------------------------------------------------------------- */

/**
 * final_score = (video_average * FINAL_SCORE_VIDEO_WEIGHT) + (comms_score *
 * FINAL_SCORE_COMMS_WEIGHT) — but ONLY when a real comms score exists.
 *
 * September 2026 fix: this used to take a plain `number` for commsScore, so
 * a caller with no comms data source (which, until a real message pipeline
 * exists, is every caller) had nothing to pass but 0 — and 0 is not "no
 * data," it's the worst possible score. That silently capped every editor's
 * final_score at videoAverage * 0.85 regardless of how good their actual
 * work was, which is why the first backtest showed zero eligible
 * editor-months: nobody could clear 70 on 85% of a ~60-72 video average, no
 * matter how well they communicated. That was a spec bug, not a real
 * finding about the team.
 *
 * `commsScore` is now `number | null` — pass `null` (not 0) whenever comms
 * hasn't been measured for this editor this period (see
 * CommsScoreResult.hasData). With `commsScore` null, final_score is
 * `videoAverage` alone, unblended — an editor isn't penalized for a
 * measurement gap that isn't theirs. `videoAverage` itself is the mean of an
 * editor's video scores for the month (not the total — fewer videos isn't
 * penalized here just for volume); a null `videoAverage` (no videos that
 * month) still means "no average," not a fabricated 0, and always yields
 * null regardless of comms.
 */
export function calculateFinalScore(
  videoAverage: number | null,
  commsScore: number | null,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
): number | null {
  if (videoAverage === null) return null;
  if (commsScore === null) return videoAverage;
  return videoAverage * constants.FINAL_SCORE_VIDEO_WEIGHT + commsScore * constants.FINAL_SCORE_COMMS_WEIGHT;
}

/**
 * Bonus eligibility for one editor in one calendar month — both gates must
 * pass. A editor under the video-count floor is excluded even with a
 * high final_score: too few videos makes the average unstable (one
 * exceptional video can carry an average that a real month's work wouldn't).
 */
export function isEligibleForBonus(
  finalScore: number | null,
  videoCount: number,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
): boolean {
  return (
    finalScore !== null &&
    finalScore >= constants.ELIGIBILITY_MIN_FINAL_SCORE &&
    videoCount >= constants.ELIGIBILITY_MIN_VIDEOS
  );
}
