// Loads the rows build.ts needs (a handful of queries, never one per
// editor or project) and turns the engine's output into one month's board.

import { dbQuery } from '../db.js'
import { buildScoreboardInput, REAL_DATA_CUTOFF_DATE, type AdjustmentRow } from './build.js'
import { DEFAULT_SCORING_CONSTANTS, monthKeyInTimezone, type ScoreBreakdownEntry } from './engine.js'
import { runScoreboardTimeline, summarizeMonths } from './runner.js'
import { DEFAULT_CLIENT_SCORING_SETTINGS, type ClientScoringSettings } from './settings.js'

/** Under this many videos an editor still gets a rank, marked provisional
 *  (same threshold as the finance tool's board). */
export const MIN_VIDEOS_FOR_RANKING = 10

export interface BoardRow {
  editorId: string
  name: string
  rank: number
  totalPoints: number
  videoCount: number
  videoAverage: number | null
  finalScore: number | null
  eligible: boolean
  isWinner: boolean
  /** The second qualifying editor (gets the 2nd-place bonus, if set). */
  isRunnerUp: boolean
  provisional: boolean
  firstTryRate: number | null
  flaggedCount: number
  breakdown: { baseEarned: number; revisionLosses: number; timeLosses: number; manualAdjustment: number }
}

export interface VideoRow {
  projectId: string
  title: string
  clientId: string
  clientName: string
  editorId: string
  deliveredAt: string
  score: number
  coefficient: number
  points: number
  isFirstVideo: boolean
  flagged: boolean
  revisionCount: number
  breakdown: ScoreBreakdownEntry[]
  adjustment: { amount: number; reason: string | null } | null
}

export interface ClientSettingRow { clientId: string; name: string; videoCount: number; coefficient: number; timeTargetHours: number; isDefault: boolean }

export interface Scoreboard {
  month: string
  months: string[]
  rules: { minFinalScore: number; minVideos: number; minVideosForRanking: number }
  bonus: { amount: number; runnerUpAmount: number | null; currency: string } | null
  /** Link to the scoring rulebook PDF, set by an admin. */
  rulebookUrl: string | null
  winnerEditorId: string | null
  board: BoardRow[]
  /** Editors with no delivered video this month. */
  notStarted: { editorId: string; name: string }[]
  videos: VideoRow[]
  clients: ClientSettingRow[]
}

// Pre-migration-022 the settings tables don't exist: score on defaults.
async function optional<T>(q: Promise<T[]>): Promise<T[]> {
  try { return await q } catch { return [] }
}

export async function loadScoreboard(requestedMonth?: string | null): Promise<Scoreboard> {
  const cutoff = REAL_DATA_CUTOFF_DATE.toISOString()
  const [projects, history, assignments, comments, editors, settingsRows, adjustments] = await Promise.all([
    dbQuery<any>(
      `SELECT p.id, p.title, p.client_id, c.full_name AS client_name, p.status, p.created_at, p.updated_at
       FROM projects p LEFT JOIN profiles c ON c.id = p.client_id
       WHERE p.status = 'client_approved' AND p.created_at >= ?`, [cutoff]),
    dbQuery<any>(
      `SELECT sh.project_id, sh.old_status, sh.new_status, sh.created_at FROM status_history sh
       JOIN projects p ON p.id = sh.project_id WHERE p.status = 'client_approved' AND p.created_at >= ?`, [cutoff]),
    dbQuery<any>(
      `SELECT a.project_id, a.team_member_id, a.assigned_at FROM project_assignments a
       JOIN projects p ON p.id = a.project_id WHERE p.status = 'client_approved' AND p.created_at >= ?`, [cutoff]),
    dbQuery<any>(
      `SELECT tc.id, tc.project_id, tc.comment_text, tc.created_at, tc.resolved, tc.resolved_at FROM timeline_comments tc
       JOIN projects p ON p.id = tc.project_id WHERE p.status = 'client_approved' AND p.created_at >= ?`, [cutoff]),
    // Active editors, the same roster the finance tool scores.
    dbQuery<{ id: string; name: string }>(
      "SELECT id, full_name AS name FROM profiles WHERE role = 'team' AND team_role = 'editor' AND disabled = 0 ORDER BY full_name"),
    optional(dbQuery<{ client_id: string; coefficient: number; time_target_hours: number }>('SELECT client_id, coefficient, time_target_hours FROM scoreboard_client_settings')),
    optional(dbQuery<AdjustmentRow>('SELECT project_id, amount, reason FROM scoreboard_adjustments')),
  ])

  const settings = new Map<string, ClientScoringSettings>(settingsRows.map((s) => [s.client_id, { coefficient: s.coefficient, timeTargetHours: s.time_target_hours }]))
  const { timelineVideos, qualifying } = buildScoreboardInput({ projects, history, assignments, comments, editors, adjustments })
  const results = runScoreboardTimeline(timelineVideos, DEFAULT_SCORING_CONSTANTS, settings)
  // No comms source here: the final score is the video average alone.
  const monthSummaries = summarizeMonths(editors, results, new Map())

  const current = monthKeyInTimezone(new Date())
  const months = [...new Set([...monthSummaries.map((m) => m.periodMonth), current])].sort()
  const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : current
  const summary = monthSummaries.find((m) => m.periodMonth === month)

  const withVideos = (summary?.results ?? []).filter((r) => r.videoCount > 0)
  // 1st place = the top qualifying editor (summarizeMonths' winner); 2nd =
  // the next qualifying one by points.
  const runnerUpEditorId = withVideos.filter((r) => r.eligible)[1]?.editorId ?? null
  const board: BoardRow[] = withVideos.map((r, i) => ({
    editorId: r.editorId,
    name: r.name,
    rank: i + 1,
    totalPoints: r.totalPoints,
    videoCount: r.videoCount,
    videoAverage: r.videoAverage,
    finalScore: r.finalScore,
    eligible: r.eligible,
    isWinner: r.editorId === summary?.winnerEditorId,
    isRunnerUp: r.editorId === runnerUpEditorId,
    provisional: r.videoCount < MIN_VIDEOS_FOR_RANKING,
    firstTryRate: r.firstTryRate,
    flaggedCount: r.flaggedCount,
    breakdown: { baseEarned: r.breakdown.baseEarned, revisionLosses: r.breakdown.revisionLosses, timeLosses: r.breakdown.timeLosses, manualAdjustment: r.breakdown.manualAdjustment },
  }))
  const onBoard = new Set(board.map((b) => b.editorId))
  const notStarted = editors.filter((e) => !onBoard.has(e.id)).map((e) => ({ editorId: e.id, name: e.name }))

  const info = new Map(qualifying.map((q) => [q.id, q]))
  const adjustmentById = new Map(adjustments.map((a) => [a.project_id, a]))
  const videos: VideoRow[] = results
    .filter((r) => r.reportingMonth === month)
    .map((r) => {
      const q = info.get(r.video.id)!
      const adj = adjustmentById.get(r.video.id)
      return {
        projectId: r.video.id,
        title: q.title,
        clientId: q.clientId,
        clientName: q.clientName,
        editorId: r.editorId,
        deliveredAt: r.video.deliveredAt.toISOString(),
        score: r.result.score,
        coefficient: r.clientCoefficient,
        points: r.result.score * r.clientCoefficient,
        isFirstVideo: r.result.isFirstVideoForPair,
        flagged: r.result.flags.length > 0,
        revisionCount: q.revisionCount,
        breakdown: r.result.breakdown,
        adjustment: adj ? { amount: adj.amount, reason: adj.reason } : null,
      }
    })

  // Every client with a scored video (any month), for the settings table.
  const clientNames = new Map<string, { name: string; videoCount: number }>()
  for (const q of qualifying) {
    const c = clientNames.get(q.clientId) ?? { name: q.clientName, videoCount: 0 }
    c.videoCount += 1
    clientNames.set(q.clientId, c)
  }
  const clients: ClientSettingRow[] = [...clientNames.entries()]
    .map(([clientId, c]) => {
      const s = settings.get(clientId)
      return { clientId, name: c.name, videoCount: c.videoCount, coefficient: s?.coefficient ?? DEFAULT_CLIENT_SCORING_SETTINGS.coefficient, timeTargetHours: s?.timeTargetHours ?? DEFAULT_CLIENT_SCORING_SETTINGS.timeTargetHours, isDefault: !s }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  type BonusRow = { amount: number; currency: string; runner_up_amount?: number | null }
  const [[bonusRow], [rulebook]] = await Promise.all([
    // runner_up_amount needs migration 023; before it, read 1st place only.
    dbQuery<BonusRow>('SELECT amount, currency, runner_up_amount FROM scoreboard_bonus WHERE month = ?', [month])
      .catch(() => optional(dbQuery<BonusRow>('SELECT amount, currency FROM scoreboard_bonus WHERE month = ?', [month]))),
    optional(dbQuery<{ value: string }>("SELECT value FROM scoreboard_config WHERE key = 'rulebook_url'")),
  ])

  return {
    month,
    months,
    rules: { minFinalScore: DEFAULT_SCORING_CONSTANTS.ELIGIBILITY_MIN_FINAL_SCORE, minVideos: DEFAULT_SCORING_CONSTANTS.ELIGIBILITY_MIN_VIDEOS, minVideosForRanking: MIN_VIDEOS_FOR_RANKING },
    bonus: bonusRow ? { amount: bonusRow.amount, runnerUpAmount: bonusRow.runner_up_amount ?? null, currency: bonusRow.currency } : null,
    rulebookUrl: rulebook?.value ?? null,
    winnerEditorId: summary?.winnerEditorId ?? null,
    board,
    notStarted,
    videos,
    clients,
  }
}
