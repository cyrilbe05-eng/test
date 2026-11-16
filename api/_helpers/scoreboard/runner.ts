// Copied word for word from the Pingu Finance tool (src/lib/scoreboard-engine-runner.ts); only import paths changed.
import {
  calculateFinalScore,
  calculateVideoScore,
  workingDayKeyInTimezone,
  getCommsScore,
  isEligibleForBonus,
  monthKeyInTimezone,
  DEFAULT_SCORING_CONSTANTS,
  DEFAULT_WORKING_HOURS,
  type CommsMessageInput,
  type CommsScoreResult,
  type EditorClientHistory,
  type ScoreBreakdownEntry,
  type ScoreboardRevisionInput,
  type ScoreboardVideoInput,
  type ScoringConstants,
  type VideoScoreResult,
  type WorkingHours,
} from "./engine.js";
import { DEFAULT_CLIENT_SCORING_SETTINGS, type ClientScoringSettings } from "./settings.js";
import type { RevisionNoteCategory } from "./categories.js";

function resolveClientSettings(
  clientSettings: Map<string, ClientScoringSettings>,
  clientId: string,
): ClientScoringSettings {
  return clientSettings.get(clientId) ?? DEFAULT_CLIENT_SCORING_SETTINGS;
}

/**
 * Runs the pure per-video scoring engine (scoreboard.ts) across a whole
 * period for a whole team, maintaining the sequential state a real caller
 * must keep (most-recent-delivered per editor-client pair, warnings used per
 * editor this month) — the same logic scripts/preview-scoreboard-mock.ts ran
 * inline before this existed, factored out so the dashboard page can use the
 * exact same computation instead of a second, driftable copy.
 */

export interface ScoreboardPeriodVideo {
  editorId: string;
  clientId: string;
  video: ScoreboardVideoInput;
  revisions: ScoreboardRevisionInput[];
  /**
   * The month this video's score should be grouped under for
   * leaderboard/eligibility purposes — September 2026 fix: this must match
   * whatever month the payroll report already counts the video under (the
   * CRM's own approval/completion date, via crm-scraper.ts's
   * completionDate()), NOT the delivery month. A video delivered August 30
   * but approved September 3 is an August video by delivery time but a
   * September paycheck — checked against real data: 17 of 191 videos (9%)
   * disagreed between the two before this field existed, always in the same
   * direction (delivery month <= approval month, since approval can't
   * precede delivery). Defaults to the delivery month
   * (monthKeyInTimezone(video.deliveredAt)) when omitted — correct for mock
   * data, which has no separate approval date to speak of.
   */
  reportingMonth?: string;
}

/** Net points attributed to each of four buckets a reader can act on —
 *  "where points came from vs what was lost." The floor correction (a
 *  correction to the whole pre-floor total, not really a time-specific
 *  thing) is grouped into timeLosses since it almost always fires alongside
 *  a bypass or severe time penalty; see calculateVideoScore's Step 6. */
export interface EditorPointsBreakdown {
  baseEarned: number;
  revisionLosses: number;
  timeLosses: number;
  commsPoints: number;
  manualAdjustment: number;
}

export interface EditorScoreboardSummary {
  editorId: string;
  name: string;
  monthlyTotal: number;
  videoScore: number;
  comms: CommsScoreResult;
  videoCount: number;
  flaggedCount: number;
  flooredCount: number;
  firstVideoCount: number;
  /** Sum of .score across videos that took the first-video-for-pair pass
   *  (Step 2's skip-revisions-and-time branch) — how many of this editor's
   *  points came from a free pass rather than an ordinary scored video. Not
   *  a breakdown bucket: those points are already inside each video's own
   *  base/bypass/floor entries, so this is an informational overlay, not an
   *  additional amount to sum into the total. */
  firstVideoPoints: number;
  /** Share of this editor's videos with zero counting revisions — 0..1,
   *  null if they delivered no videos this period. */
  firstTryRate: number | null;
  repeatsByCategory: Map<string, number>;
  breakdown: EditorPointsBreakdown;
  videoResults: { video: ScoreboardVideoInput; revisions: ScoreboardRevisionInput[]; result: VideoScoreResult }[];
}

function emptySummary(editorId: string, name: string, comms: CommsScoreResult): EditorScoreboardSummary {
  return {
    editorId,
    name,
    monthlyTotal: comms.total,
    videoScore: 0,
    comms,
    videoCount: 0,
    flaggedCount: 0,
    flooredCount: 0,
    firstVideoCount: 0,
    firstVideoPoints: 0,
    firstTryRate: null,
    repeatsByCategory: new Map(),
    breakdown: { baseEarned: 0, revisionLosses: 0, timeLosses: 0, commsPoints: comms.total, manualAdjustment: 0 },
    videoResults: [],
  };
}

function attributeBreakdown(breakdown: EditorPointsBreakdown, entries: ScoreBreakdownEntry[]) {
  for (const entry of entries) {
    switch (entry.category) {
      case "base":
        breakdown.baseEarned += entry.amount;
        break;
      case "revisionPenalty":
      case "revisionRecovery":
      case "slowRevision":
        breakdown.revisionLosses += entry.amount;
        break;
      case "inProgressTime":
      case "warningHalving":
      case "inProgressBypass":
      case "floor":
        breakdown.timeLosses += entry.amount;
        break;
      case "manualAdjustment":
        breakdown.manualAdjustment += entry.amount;
        break;
    }
  }
}

function emptyPointsBreakdown(): EditorPointsBreakdown {
  return { baseEarned: 0, revisionLosses: 0, timeLosses: 0, commsPoints: 0, manualAdjustment: 0 };
}

/** Per-editor, per-working-day state for the delivery-deadline ladder. */
interface LadderDayState {
  /** How many deliveries this editor has made so far this working day. */
  count: number;
  /** True once any delivery today has missed the deadline it was judged
   *  against — from that point on, every remaining delivery this working
   *  day is judged against slot 1 again (DELIVERY_DEADLINE_HOURS[0]),
   *  never advancing further. See the module note on the ladder
   *  (correction 3) in scoreboard.ts. */
  broken: boolean;
}

/**
 * Looks up (creating if needed) this editor's ladder state for the working
 * day `deliveredAt` falls in (see DELIVERY_DAY_START_HOUR — rolls over at
 * that CET clock hour, not midnight) and advances its delivery count by
 * one. Returns the deadline slot THIS delivery should be judged against —
 * its raw position in the day if the ladder hasn't broken yet, or 1 again
 * if it has — plus the state object itself so the caller can update
 * `.broken` after scoring, once it knows whether this delivery kept the
 * ladder alive for the next one. Relies on the same ascending-deliveredAt
 * processing order runScoreboardPeriod/Timeline already require for their
 * pair-history and warning-count state.
 */
function nextDeliverySlot(
  states: Map<string, LadderDayState>,
  editorId: string,
  deliveredAt: Date,
  dayStartHour: number,
): { slot: number; state: LadderDayState } {
  const key = `${editorId}::${workingDayKeyInTimezone(deliveredAt, dayStartHour)}`;
  const state = states.get(key) ?? { count: 0, broken: false };
  state.count += 1;
  states.set(key, state);
  return { slot: state.broken ? 1 : state.count, state };
}

/**
 * `videos` must be in ascending deliveredAt order across the whole team —
 * the pair-history and warning-count state below only comes out right if
 * every editor's videos are scored in the order they actually happened.
 */
export function runScoreboardPeriod(
  editors: { id: string; name: string }[],
  videos: ScoreboardPeriodVideo[],
  messagesByEditor: Map<string, CommsMessageInput[]>,
  workingHours: WorkingHours = DEFAULT_WORKING_HOURS,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
  // Per-client timeTargetHours only — this function's EditorScoreboardSummary
  // has no weighted-totals concept (unlike EditorMonthResult), since nothing
  // in the app currently calls runScoreboardPeriod; kept correct for
  // per-video scoring rather than left silently stale if it's ever revived.
  clientSettings: Map<string, ClientScoringSettings> = new Map(),
): EditorScoreboardSummary[] {
  const mostRecentDeliveredByPair = new Map<string, Date>();
  const warningsUsedByEditor = new Map<string, number>();
  const summaries = new Map<string, EditorScoreboardSummary>();
  const zeroRevisionCounts = new Map<string, number>();
  const ladderStates = new Map<string, LadderDayState>();

  for (const editor of editors) {
    const comms = getCommsScore(messagesByEditor.get(editor.id) ?? [], workingHours);
    summaries.set(editor.id, emptySummary(editor.id, editor.name, comms));
  }

  for (const { editorId, clientId, video, revisions } of videos) {
    const summary = summaries.get(editorId);
    if (!summary) continue; // defensive: an editor id not in the roster

    const pairKey = `${editorId}::${clientId}`;
    const history: EditorClientHistory = {
      mostRecentDeliveredAt: mostRecentDeliveredByPair.get(pairKey) ?? null,
      warningsUsedThisMonth: warningsUsedByEditor.get(editorId) ?? 0,
    };
    const { slot, state: ladderState } = nextDeliverySlot(
      ladderStates,
      editorId,
      video.deliveredAt,
      constants.DELIVERY_DAY_START_HOUR,
    );
    const { timeTargetHours } = resolveClientSettings(clientSettings, clientId);
    const result = calculateVideoScore(video, revisions, history, slot, constants, timeTargetHours);
    if (!result.metDeliveryDeadline) ladderState.broken = true;

    summary.videoScore += result.score;
    summary.videoCount += 1;
    summary.videoResults.push({ video, revisions, result });
    if (result.flags.length > 0) summary.flaggedCount += 1;
    if (result.breakdown.some((e) => e.category === "floor")) summary.flooredCount += 1;
    if (result.isFirstVideoForPair) {
      summary.firstVideoCount += 1;
      summary.firstVideoPoints += result.score;
    }
    if (result.warningApplied) warningsUsedByEditor.set(editorId, history.warningsUsedThisMonth + 1);
    attributeBreakdown(summary.breakdown, result.breakdown);

    const counting = revisions.filter((r) => r.countsTowardScore);
    if (counting.length === 0) {
      zeroRevisionCounts.set(editorId, (zeroRevisionCounts.get(editorId) ?? 0) + 1);
    }
    for (const r of counting) {
      if (r.isRepeat) {
        summary.repeatsByCategory.set(r.noteCategory, (summary.repeatsByCategory.get(r.noteCategory) ?? 0) + 1);
      }
    }

    mostRecentDeliveredByPair.set(pairKey, video.deliveredAt);
  }

  for (const summary of summaries.values()) {
    summary.monthlyTotal = summary.videoScore + summary.comms.total;
    summary.firstTryRate =
      summary.videoCount > 0 ? (zeroRevisionCounts.get(summary.editorId) ?? 0) / summary.videoCount : null;
  }

  return [...summaries.values()];
}

/* ---------------------------------------------------------------------------
 * Calendar-month scoring — September 2026 addition. Periods are calendar
 * months; totals reset each month; final_score combines that month's video
 * average with that month's comms score; eligibility gates the bonus, not
 * the rank. See runScoreboardTimeline + summarizeMonths below.
 *
 * Which month a video's SCORE belongs to (reportingMonth) is a separate
 * question from which month it was DELIVERED in (periodMonth), fixed the
 * same month this comment was added: a video delivered August 30 but
 * approved September 3 is an August delivery but a September paycheck, and
 * the leaderboard must agree with payroll — checked against real data, 17 of
 * 191 videos (9%) disagreed between the two before reportingMonth existed,
 * always delivery-month <= approval-month (approval can't precede
 * delivery). periodMonth (delivery-based) still drives the warning-cap
 * reset internally, since that's about work cadence, not payment; every
 * grouping a consumer sees (MonthSummary, EditorMonthResult) is keyed by
 * reportingMonth instead.
 * ------------------------------------------------------------------------- */

export interface TimelineVideoResult {
  editorId: string;
  /** "YYYY-MM" in CET — the calendar month this video's deliveredAt falls
   *  in. Internal: only used here for the warning-cap reset, which is about
   *  editor work cadence, not payroll. Consumers wanting "which month does
   *  this video's score belong to" should use reportingMonth instead. */
  periodMonth: string;
  /** The month this video's score is grouped under for leaderboard/
   *  eligibility purposes — see ScoreboardPeriodVideo.reportingMonth. */
  reportingMonth: string;
  video: ScoreboardVideoInput;
  revisions: ScoreboardRevisionInput[];
  result: VideoScoreResult;
  /** This video's client's scoreboard coefficient (default 1.0) — resolved
   *  once here, from the same per-client settings used for
   *  calculateVideoScore's timeTargetHours, so summarizeMonths can compute
   *  a weighted totalPoints without its own separate settings lookup.
   *  Deliberately NOT applied to result.score, to videoCount, or to
   *  anything eligibility checks — the coefficient multiplies a video's
   *  points CONTRIBUTION to an editor's ranking total only. It still
   *  counts as exactly one video toward both the 20-video eligibility
   *  floor and the 10-video provisional-ranking threshold, same as any
   *  other video, and the 70-point gate means the same thing for every
   *  editor regardless of which clients they're on. */
  clientCoefficient: number;
}

/**
 * Scores `videos` as one continuous chronological sequence — regardless of
 * how many calendar months they span — so cross-month state stays correct:
 * isFirstVideoForPair's 60-day lookback must see a delivery from a prior
 * month, not start blank at every month boundary, or an editor's second
 * video for a long-running client would wrongly score as a first-video free
 * pass just because it happened to be their first *this month*. The one
 * thing that DOES reset at a calendar-month boundary is the warning cap
 * (WARNING_MONTHLY_CAP is a month concept by name) — tracked here per editor
 * against the month of the video actually being scored, not the caller's
 * batch boundaries.
 *
 * `videos` must be pre-sorted ascending by deliveredAt, same requirement as
 * runScoreboardPeriod.
 */
export function runScoreboardTimeline(
  videos: ScoreboardPeriodVideo[],
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
  /** Per-client overrides, keyed by clientId (see
   *  scoreboard-client-settings.ts) — a missing key means the defaults
   *  (coefficient 1.0, timeTargetHours 3). Empty by default: mock data and
   *  the backtest script's own comparisons don't have real client ids to
   *  key against, so they run entirely on defaults unless a caller
   *  explicitly supplies real settings (see the snapshot generator, the
   *  only real-data caller that does). */
  clientSettings: Map<string, ClientScoringSettings> = new Map(),
): TimelineVideoResult[] {
  const mostRecentDeliveredByPair = new Map<string, Date>();
  const warningsUsedByEditor = new Map<string, number>();
  const warningMonthByEditor = new Map<string, string>();
  const ladderStates = new Map<string, LadderDayState>();
  const results: TimelineVideoResult[] = [];

  for (const { editorId, clientId, video, revisions, reportingMonth } of videos) {
    const periodMonth = monthKeyInTimezone(video.deliveredAt);
    if (warningMonthByEditor.get(editorId) !== periodMonth) {
      warningsUsedByEditor.set(editorId, 0);
      warningMonthByEditor.set(editorId, periodMonth);
    }

    const pairKey = `${editorId}::${clientId}`;
    const history: EditorClientHistory = {
      mostRecentDeliveredAt: mostRecentDeliveredByPair.get(pairKey) ?? null,
      warningsUsedThisMonth: warningsUsedByEditor.get(editorId) ?? 0,
    };
    const { slot, state: ladderState } = nextDeliverySlot(
      ladderStates,
      editorId,
      video.deliveredAt,
      constants.DELIVERY_DAY_START_HOUR,
    );
    const clientVideoSettings = resolveClientSettings(clientSettings, clientId);
    const result = calculateVideoScore(video, revisions, history, slot, constants, clientVideoSettings.timeTargetHours);
    if (!result.metDeliveryDeadline) ladderState.broken = true;
    if (result.warningApplied) {
      warningsUsedByEditor.set(editorId, (warningsUsedByEditor.get(editorId) ?? 0) + 1);
    }
    mostRecentDeliveredByPair.set(pairKey, video.deliveredAt);

    results.push({
      editorId,
      periodMonth,
      reportingMonth: reportingMonth ?? periodMonth,
      video,
      revisions,
      result,
      clientCoefficient: clientVideoSettings.coefficient,
    });
  }

  return results;
}

export interface EditorMonthResult {
  editorId: string;
  name: string;
  periodMonth: string;
  /** Sum of this month's (score * clientCoefficient) across videos — the
   *  ranking metric. A client at 2.0 contributes double here; a client at
   *  1.0 (the default) contributes its plain score, so this equals the old
   *  unweighted sum for anyone with no client overrides in play.
   *  Deliberately excludes comms (comms only enters through final_score's
   *  15% weight). */
  totalPoints: number;
  /** Raw, unweighted count of videos delivered — never touched by any
   *  client's coefficient. What the 20-video eligibility floor and the
   *  10-video provisional-ranking threshold both check against (see
   *  isEligibleForBonus's call below) — a client's coefficient scales
   *  totalPoints only, never how many videos count toward either
   *  threshold. Payroll and every other raw-count consumer outside the
   *  scoreboard is unaffected either way. */
  videoCount: number;
  /** Mean of this month's RAW (unweighted) video scores; null if
   *  videoCount is 0 — no videos means no average, not a fabricated 0.
   *  Deliberately never touched by any client's coefficient: every video
   *  stays scored out of 100 regardless of client, so the 70-point gate
   *  means the same thing for every editor. */
  videoAverage: number | null;
  comms: CommsScoreResult;
  /** Mirrors comms.hasData — surfaced at this level so a consumer doesn't
   *  have to reach into comms to tell "no comms pipeline this period" apart
   *  from "measured and it was bad." See calculateFinalScore's module note. */
  commsMeasured: boolean;
  /** (videoAverage * FINAL_SCORE_VIDEO_WEIGHT) + (comms.total *
   *  FINAL_SCORE_COMMS_WEIGHT) when comms was measured this period;
   *  videoAverage alone (unblended) when it wasn't — never blended against
   *  a fabricated zero. Null when videoAverage is null. Built from the
   *  unweighted videoAverage, per the same "coefficient never touches the
   *  average" rule. */
  finalScore: number | null;
  /** finalScore >= ELIGIBILITY_MIN_FINAL_SCORE AND videoCount (raw, not
   *  coefficient-weighted) >= ELIGIBILITY_MIN_VIDEOS. Does not affect
   *  rank — an ineligible editor still gets a rank number by totalPoints,
   *  just not the bonus. */
  eligible: boolean;
  flaggedCount: number;
  flooredCount: number;
  firstVideoCount: number;
  /** Sum of .score across this month's videos that took the
   *  first-video-for-pair free pass — see EditorScoreboardSummary's field
   *  of the same name for the full rationale. */
  firstVideoPoints: number;
  firstTryRate: number | null;
  repeatsByCategory: Map<RevisionNoteCategory, number>;
  /** "Where points came from" — base/revisions/time from this month's
   *  videos, plus comms.total (0 when not measured, which is already the
   *  correct "nothing to show" value for a bar chart, distinct from
   *  finalScore's null-vs-blended distinction). */
  breakdown: EditorPointsBreakdown;
}

export interface MonthSummary {
  periodMonth: string;
  /** Every editor passed in, including zero-video months — sorted by
   *  totalPoints descending; index+1 is the rank shown on the board. */
  results: EditorMonthResult[];
  /** The eligible editor with the highest totalPoints, or null if nobody
   *  qualified this month — distinct from results[0], which can be an
   *  ineligible editor leading purely on volume. */
  winnerEditorId: string | null;
}

/**
 * Groups runScoreboardTimeline's flat per-video results into one summary per
 * calendar month, for every editor in `editors` (even a month where they
 * delivered nothing — shown with videoCount 0, not omitted, so "did they
 * work at all this month" stays visible). Every past month stays queryable
 * this way: call once over the whole history, get back one MonthSummary per
 * month actually present in the data, each independently comparable.
 */
export function summarizeMonths(
  editors: { id: string; name: string }[],
  timelineResults: TimelineVideoResult[],
  messagesByEditor: Map<string, CommsMessageInput[]>,
  workingHours: WorkingHours = DEFAULT_WORKING_HOURS,
  constants: ScoringConstants = DEFAULT_SCORING_CONSTANTS,
): MonthSummary[] {
  const months = [...new Set(timelineResults.map((r) => r.reportingMonth))].sort();

  return months.map((periodMonth) => {
    const results: EditorMonthResult[] = editors.map((editor) => {
      const own = timelineResults.filter((r) => r.editorId === editor.id && r.reportingMonth === periodMonth);
      const videoCount = own.length;
      // rawTotalPoints/videoAverage are the unweighted quality signal (used
      // for finalScore below); totalPoints is the only place a client's
      // coefficient actually multiplies anything — it scales a video's
      // contribution to the ranking total, never how many videos count
      // toward eligibility (that's plain videoCount, below).
      const rawTotalPoints = own.reduce((sum, r) => sum + r.result.score, 0);
      const videoAverage = videoCount > 0 ? rawTotalPoints / videoCount : null;
      const totalPoints = own.reduce((sum, r) => sum + r.result.score * r.clientCoefficient, 0);

      const monthMessages = (messagesByEditor.get(editor.id) ?? []).filter(
        (m) => monthKeyInTimezone(m.sentAt) === periodMonth,
      );
      const comms = getCommsScore(monthMessages, workingHours);
      const finalScore = calculateFinalScore(videoAverage, comms.hasData ? comms.total : null, constants);
      const eligible = isEligibleForBonus(finalScore, videoCount, constants);

      const flaggedCount = own.filter((r) => r.result.flags.length > 0).length;
      const flooredCount = own.filter((r) => r.result.breakdown.some((e) => e.category === "floor")).length;
      const firstVideoResults = own.filter((r) => r.result.isFirstVideoForPair);
      const firstVideoCount = firstVideoResults.length;
      const firstVideoPoints = firstVideoResults.reduce((sum, r) => sum + r.result.score, 0);
      const zeroRevisionCount = own.filter((r) => r.revisions.filter((rv) => rv.countsTowardScore).length === 0).length;
      const firstTryRate = videoCount > 0 ? zeroRevisionCount / videoCount : null;

      const repeatsByCategory = new Map<RevisionNoteCategory, number>();
      for (const r of own) {
        for (const rv of r.revisions) {
          if (rv.countsTowardScore && rv.isRepeat) {
            repeatsByCategory.set(rv.noteCategory, (repeatsByCategory.get(rv.noteCategory) ?? 0) + 1);
          }
        }
      }

      const breakdown = emptyPointsBreakdown();
      for (const r of own) attributeBreakdown(breakdown, r.result.breakdown);
      breakdown.commsPoints = comms.hasData ? comms.total : 0;

      return {
        editorId: editor.id,
        name: editor.name,
        periodMonth,
        totalPoints,
        videoCount,
        videoAverage,
        comms,
        commsMeasured: comms.hasData,
        finalScore,
        eligible,
        flaggedCount,
        flooredCount,
        firstVideoCount,
        firstVideoPoints,
        firstTryRate,
        repeatsByCategory,
        breakdown,
      };
    });

    results.sort((a, b) => b.totalPoints - a.totalPoints);
    const winnerEditorId = results.find((r) => r.eligible)?.editorId ?? null;

    return { periodMonth, results, winnerEditorId };
  });
}
