// Builds the scoreboard engine's input from this app's own rows — the same
// rules the Pingu Finance tool applies to the data it pulls from this app
// (its src/lib/scoreboard-real-data.ts), so both tools score a video the
// same way:
//
//  - Only completed (client_approved) projects created on or after
//    REAL_DATA_CUTOFF_DATE, with a real tracked pipeline (not a single
//    imported "(none) -> client_approved" history row).
//  - The editor is the latest assignee, and must be an active editor.
//  - "Delivered" = the editor's first submission (in_progress -> next status),
//    not the admin forwarding it to the client.
//  - Every timeline comment is a revision note (near-identical double
//    submits removed). Unresolved ones count as resolved at the project's
//    next status change, if that came within FALLBACK_MAX_HOURS; otherwise
//    they are left out rather than scored on a made-up delay.
//  - The month a video counts for is its completion month (the project's
//    last update, as the finance tool's payroll uses), in Brussels time.
//
// Pure: no database access, so it can be tested on fixtures.

import { classifyNoteCategory } from './classifier.js'
import { detectRepeats, monthKeyInTimezone, type ScoreboardRevisionInput, type ScoreboardVideoInput } from './engine.js'
import type { ScoreboardPeriodVideo } from './runner.js'
import type { RevisionNoteCategory } from './categories.js'

export const REAL_DATA_CUTOFF_DATE = new Date('2026-07-08T00:00:00Z')
const FALLBACK_MAX_HOURS = 48

export interface ProjectRow { id: string; title: string | null; client_id: string; client_name: string | null; status: string; created_at: string; updated_at: string | null }
export interface HistoryRow { project_id: string; old_status: string | null; new_status: string; created_at: string }
export interface AssignmentRow { project_id: string; team_member_id: string; assigned_at: string }
export interface CommentRow { id: string; project_id: string; comment_text: string; created_at: string; resolved: number | null; resolved_at: string | null }
export interface EditorRow { id: string; name: string }
export interface AdjustmentRow { project_id: string; amount: number; reason: string | null }

export interface QualifyingVideo {
  id: string
  title: string
  clientId: string
  clientName: string
  editorId: string
  deliveredAt: Date
  reportingMonth: string
  /** Revision notes that counted (resolved), for the detail view. */
  revisionCount: number
}

export interface BuiltInput {
  timelineVideos: ScoreboardPeriodVideo[]
  qualifying: QualifyingVideo[]
}

function dedupeComments(comments: CommentRow[]): CommentRow[] {
  const kept: CommentRow[] = []
  for (const c of comments) {
    const dup = kept.find((k) => k.comment_text === c.comment_text && Math.abs(Date.parse(k.created_at) - Date.parse(c.created_at)) < 5000)
    if (!dup) kept.push(c)
  }
  return kept
}

export function buildScoreboardInput(rows: {
  projects: ProjectRow[]
  history: HistoryRow[]
  assignments: AssignmentRow[]
  comments: CommentRow[]
  editors: EditorRow[]
  adjustments: AdjustmentRow[]
}, cutoffDate: Date = REAL_DATA_CUTOFF_DATE): BuiltInput {
  const editorIds = new Set(rows.editors.map((e) => e.id))

  const historyByProject = new Map<string, HistoryRow[]>()
  for (const r of rows.history) {
    const list = historyByProject.get(r.project_id) ?? []
    list.push(r)
    historyByProject.set(r.project_id, list)
  }
  for (const list of historyByProject.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))

  const latestAssignment = new Map<string, AssignmentRow>()
  for (const a of rows.assignments) {
    const cur = latestAssignment.get(a.project_id)
    if (!cur || Date.parse(a.assigned_at) > Date.parse(cur.assigned_at)) latestAssignment.set(a.project_id, a)
  }

  const commentsByProject = new Map<string, CommentRow[]>()
  for (const c of [...rows.comments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const list = commentsByProject.get(c.project_id) ?? []
    list.push(c)
    commentsByProject.set(c.project_id, list)
  }
  const adjustmentByProject = new Map(rows.adjustments.map((a) => [a.project_id, a]))

  const qualifying: QualifyingVideo[] = []
  const built: ScoreboardPeriodVideo[] = []

  for (const p of rows.projects) {
    if (p.status !== 'client_approved') continue
    const hist = historyByProject.get(p.id) ?? []
    const isImportSignature = hist.length <= 1 && (hist[0]?.old_status ?? '') === ''
    if (isImportSignature) continue
    if (Date.parse(p.created_at) < cutoffDate.getTime()) continue
    const editorId = latestAssignment.get(p.id)?.team_member_id
    if (!editorId || !editorIds.has(editorId)) continue

    const firstIntoProgress = hist.find((r) => r.new_status === 'in_progress')
    const firstOutOfProgress = firstIntoProgress
      ? hist.find((r) => r.old_status === 'in_progress' && r.created_at > firstIntoProgress.created_at)
      : undefined
    if (!firstOutOfProgress) continue

    const inProgressStartedAt = firstIntoProgress ? new Date(firstIntoProgress.created_at) : null
    const deliveredAt = new Date(firstOutOfProgress.created_at)
    const inProgressDurationMin = inProgressStartedAt ? (deliveredAt.getTime() - inProgressStartedAt.getTime()) / 60000 : 0

    const completedAt = new Date(p.updated_at ?? p.created_at)
    const reportingMonth = monthKeyInTimezone(completedAt)

    const revisions: ScoreboardRevisionInput[] = []
    for (const c of dedupeComments(commentsByProject.get(p.id) ?? [])) {
      const resolvedAt = resolveComment(c, hist)
      if (resolvedAt) {
        revisions.push({ noteCategory: classifyNoteCategory(c.comment_text), requestedAt: new Date(c.created_at), resolvedAt, isRepeat: false, countsTowardScore: true })
      }
    }

    const adj = adjustmentByProject.get(p.id)
    const video: ScoreboardVideoInput = {
      id: p.id,
      editorId,
      clientId: p.client_id,
      inProgressStartedAt,
      deliveredAt,
      inProgressDurationMin,
      warningSentAt: null, // nothing in the app records an early warning
      manualAdjustment: adj?.amount ?? 0,
      manualAdjustmentReason: adj?.reason?.trim() || null,
    }
    built.push({ editorId, clientId: p.client_id, video, revisions, reportingMonth })
    qualifying.push({
      id: p.id, title: p.title ?? '(untitled)', clientId: p.client_id, clientName: p.client_name ?? '(unknown client)',
      editorId, deliveredAt, reportingMonth, revisionCount: revisions.length,
    })
  }

  // Repeats: per editor-client pair, across all of that pair's videos.
  const byPair = new Map<string, { videoId: string; noteCategory: RevisionNoteCategory; requestedAt: Date }[]>()
  for (const b of built) {
    const key = `${b.editorId}::${b.clientId}`
    const list = byPair.get(key) ?? []
    for (const r of b.revisions) list.push({ videoId: b.video.id, noteCategory: r.noteCategory, requestedAt: r.requestedAt })
    byPair.set(key, list)
  }
  const isRepeat = new Map<string, boolean>()
  for (const list of byPair.values()) {
    // detectRepeats returns its input sorted by time: key by its own output.
    for (const r of detectRepeats(list)) isRepeat.set(`${r.videoId}::${r.requestedAt.getTime()}`, r.isRepeat)
  }
  for (const b of built) {
    b.revisions = b.revisions.map((r) => ({ ...r, isRepeat: isRepeat.get(`${b.video.id}::${r.requestedAt.getTime()}`) ?? false }))
  }

  built.sort((a, b) => a.video.deliveredAt.getTime() - b.video.deliveredAt.getTime())
  return { timelineVideos: built, qualifying }
}

function resolveComment(c: CommentRow, projectHist: HistoryRow[]): Date | null {
  if (c.resolved === 1 && c.resolved_at && Date.parse(c.resolved_at) >= Date.parse(c.created_at)) return new Date(c.resolved_at)
  const createdMs = Date.parse(c.created_at)
  const next = projectHist.find((r) => Date.parse(r.created_at) > createdMs)
  if (next && (Date.parse(next.created_at) - createdMs) / 3_600_000 <= FALLBACK_MAX_HOURS) return new Date(next.created_at)
  return null
}
