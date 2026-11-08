// Revision entries → automatic categories → per-client SOP rules.
//
// Flow:
//  1. Client requests a revision → recordRevisionEntries() copies that round's
//     client notes into revision_entries (one fast INSERT…SELECT; never throws,
//     so the client's request can't be broken or slowed by this).
//  2. Admin opens Client Care → processPendingRevisions() picks a category for
//     each new entry with the local model (or word matching) and merges it
//     into the most similar SOP rule of the same client + category, or
//     creates a new rule. One-off rules unseen for 60 days are archived.

import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { CARE_CONFIG, REVISION_CATEGORY_KEYS, type RevisionCategory } from './config.js'
import { cleanNote, getMatcher, type EngineName } from './similarity.js'

const DAY = 86_400_000

/** Step 1 — called from the revision-submit handler. Never throws. */
export async function recordRevisionEntries(projectId: string, clientId: string, round: number): Promise<void> {
  try {
    await dbExecute(
      `INSERT OR IGNORE INTO revision_entries (id, project_id, client_id, editor_id, note, comment_id, created_at)
       SELECT lower(hex(randomblob(16))), tc.project_id, ?,
              (SELECT pa.team_member_id FROM project_assignments pa
               WHERE pa.project_id = tc.project_id ORDER BY pa.assigned_at DESC LIMIT 1),
              tc.comment_text, tc.id, tc.created_at
       FROM timeline_comments tc
       WHERE tc.project_id = ? AND tc.author_id = ? AND tc.revision_round = ?`,
      [clientId, projectId, clientId, round],
    )
  } catch (e: any) {
    // e.g. migration 011 not applied yet — the revision itself already succeeded.
    console.warn('[care] revision entries not recorded:', e?.message)
  }
}

interface PendingEntry {
  id: string; client_id: string; category: RevisionCategory; category_source: 'auto' | 'manual'
  note: string; created_at: string
}
interface RuleRow {
  id: string; client_id: string; category: RevisionCategory; text: string
  count: number; first_seen: string; last_seen: string
}

/** Decide where a note goes: the most similar rule above the threshold, or a new rule. */
export function chooseRule(similarities: number[], threshold: number): number | null {
  let best = -1
  let bestScore = -Infinity
  similarities.forEach((s, i) => { if (s > bestScore) { best = i; bestScore = s } })
  return best >= 0 && bestScore >= threshold ? best : null
}

/** Archive rules seen only once and not again for N days. */
export async function archiveStaleRules(now = Date.now()): Promise<void> {
  const cutoff = new Date(now - CARE_CONFIG.sop.archiveSingleAfterDays * DAY).toISOString()
  await dbExecute('UPDATE client_sop_rules SET archived = 1 WHERE archived = 0 AND count <= 1 AND last_seen < ?', [cutoff])
}

/** Step 2 — categorise + merge pending entries. Returns the engine used. */
export async function processPendingRevisions(opts: { clientId?: string } = {}): Promise<{ processed: number; engine: EngineName | null }> {
  const now = Date.now()
  // Claim a batch first, so two simultaneous page loads never process (and
  // count) the same note twice. Stale claims (a crashed run) expire after 5 min.
  const claim = `claim:${new Date(now).toISOString()}:${newId()}`
  const staleBefore = `claim:${new Date(now - 5 * 60_000).toISOString()}`
  const scope = opts.clientId ? ' AND client_id = ?' : ''
  await dbExecute(
    `UPDATE revision_entries SET processed_at = ?
     WHERE id IN (
       SELECT id FROM revision_entries
       WHERE (processed_at IS NULL OR (processed_at LIKE 'claim:%' AND processed_at < ?))${scope}
       ORDER BY created_at ASC LIMIT ?
     )`,
    [claim, staleBefore, ...(opts.clientId ? [opts.clientId] : []), CARE_CONFIG.sop.maxPerRun],
  )
  const entries = await dbQuery<PendingEntry>(
    'SELECT id, client_id, category, category_source, note, created_at FROM revision_entries WHERE processed_at = ? ORDER BY created_at ASC',
    [claim],
  )
  if (!entries.length) { await archiveStaleRules(now); return { processed: 0, engine: null } }

  try {
    const matcher = await getMatcher()

    // Categories: automatic ones are (re)picked; the admin's manual choice is kept.
    const auto = entries.filter((e) => e.category_source !== 'manual')
    const picked = await matcher.categorize(auto.map((e) => e.note))
    auto.forEach((e, i) => { e.category = picked[i] })

    const clientIds = [...new Set(entries.map((e) => e.client_id))]
    const rules = await dbQuery<RuleRow>(
      `SELECT id, client_id, category, text, count, first_seen, last_seen FROM client_sop_rules
       WHERE archived = 0 AND client_id IN (${clientIds.map(() => '?').join(',')})`,
      clientIds,
    )

    for (const e of entries) {
      const text = cleanNote(e.note) || e.note
      const candidates = rules.filter((r) => r.client_id === e.client_id && r.category === e.category)
      const pick = chooseRule(await matcher.similarity(text, candidates.map((r) => r.text)), matcher.mergeThreshold)
      let ruleId: string
      if (pick !== null) {
        const rule = candidates[pick]
        rule.count += 1
        if (e.created_at > rule.last_seen) rule.last_seen = e.created_at
        if (e.created_at < rule.first_seen) rule.first_seen = e.created_at
        await dbExecute('UPDATE client_sop_rules SET count = ?, last_seen = ?, first_seen = ? WHERE id = ?',
          [rule.count, rule.last_seen, rule.first_seen, rule.id])
        ruleId = rule.id
      } else {
        ruleId = newId()
        await dbExecute(
          'INSERT INTO client_sop_rules (id, client_id, category, text, count, first_seen, last_seen, archived) VALUES (?, ?, ?, ?, 1, ?, ?, 0)',
          [ruleId, e.client_id, e.category, text, e.created_at, e.created_at],
        )
        rules.push({ id: ruleId, client_id: e.client_id, category: e.category, text, count: 1, first_seen: e.created_at, last_seen: e.created_at })
      }
      await dbExecute('UPDATE revision_entries SET category = ?, sop_rule_id = ?, processed_at = ? WHERE id = ?',
        [e.category, ruleId, nowIso(), e.id])
    }
    await archiveStaleRules(now)
    return { processed: entries.length, engine: matcher.engine }
  } catch (err) {
    // Release the claim so the next page load retries these notes.
    await dbExecute('UPDATE revision_entries SET processed_at = NULL WHERE processed_at = ?', [claim]).catch(() => {})
    throw err
  }
}

/** Admin corrects a category: detach from its rule and re-merge under the new one. */
export async function recategorizeEntry(entryId: string, category: RevisionCategory): Promise<string | null> {
  if (!REVISION_CATEGORY_KEYS.includes(category)) {
    throw Object.assign(new Error(`category must be one of ${REVISION_CATEGORY_KEYS.join(', ')}`), { status: 400 })
  }
  const [entry] = await dbQuery<{ client_id: string; sop_rule_id: string | null }>(
    'SELECT client_id, sop_rule_id FROM revision_entries WHERE id = ?', [entryId],
  )
  if (!entry) return null
  if (entry.sop_rule_id) {
    // The old rule loses this occurrence; a rule left with none is archived.
    await dbExecute('UPDATE client_sop_rules SET count = count - 1 WHERE id = ? AND count > 0', [entry.sop_rule_id])
    await dbExecute('UPDATE client_sop_rules SET archived = 1 WHERE id = ? AND count <= 0', [entry.sop_rule_id])
  }
  await dbExecute(
    "UPDATE revision_entries SET category = ?, category_source = 'manual', sop_rule_id = NULL, processed_at = NULL WHERE id = ?",
    [category, entryId],
  )
  await processPendingRevisions({ clientId: entry.client_id })
  return entry.client_id
}

/** Archive a rule ("delete" in the UI). Its history stays on the entries. */
export async function archiveRule(ruleId: string): Promise<string | null> {
  const [rule] = await dbQuery<{ client_id: string }>('SELECT client_id FROM client_sop_rules WHERE id = ?', [ruleId])
  if (!rule) return null
  await dbExecute('UPDATE client_sop_rules SET archived = 1 WHERE id = ?', [ruleId])
  return rule.client_id
}

/** For the client panel: active SOP rules + the revision backlog. */
export async function loadClientRevisions(clientId: string) {
  const [rules, backlog] = await Promise.all([
    dbQuery<RuleRow>(
      `SELECT id, client_id, category, text, count, first_seen, last_seen FROM client_sop_rules
       WHERE client_id = ? AND archived = 0 ORDER BY count DESC, last_seen DESC`, [clientId]),
    dbQuery<{
      id: string; project_id: string; project_title: string; editor_id: string | null; editor_name: string | null
      category: RevisionCategory; category_source: 'auto' | 'manual'; note: string; created_at: string
      sop_rule_id: string | null; processed: number; resolved: number | null
    }>(
      `SELECT re.id, re.project_id, pr.title AS project_title, re.editor_id, ed.full_name AS editor_name,
              re.category, re.category_source, re.note, re.created_at, re.sop_rule_id,
              CASE WHEN re.processed_at IS NULL OR re.processed_at LIKE 'claim:%' THEN 0 ELSE 1 END AS processed,
              tc.resolved
       FROM revision_entries re
       JOIN projects pr ON pr.id = re.project_id
       LEFT JOIN profiles ed ON ed.id = re.editor_id
       LEFT JOIN timeline_comments tc ON tc.id = re.comment_id
       WHERE re.client_id = ?
       ORDER BY re.created_at DESC LIMIT 200`, [clientId]),
  ])
  return {
    sop_rules: rules.map(({ client_id: _c, ...r }) => r),
    revision_backlog: backlog.map((b) => ({ ...b, note: cleanNote(b.note) || b.note, processed: !!b.processed, resolved: b.resolved == null ? null : !!b.resolved })),
  }
}
