// Build a LOCAL test database filled with realistic FAKE data.
//
//   npm run local:db
//
// Creates .local-data/local.db (git-ignored) from the project's own schema
// files + migrations, exactly in the order production received them, then
// generates fake clients/editors/projects/revisions/status history relative
// to "now", so the data always looks current. Never touches Cloudflare.
//
// Every fake account's password: LocalTest123!

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = path.join(ROOT, '.local-data')
const DB_FILE = path.join(DATA_DIR, 'local.db')
export const LOCAL_PASSWORD = 'LocalTest123!'

// ── 1. Fresh database with the production schema ───────────────────────────

fs.mkdirSync(DATA_DIR, { recursive: true })
for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) fs.rmSync(f, { force: true })
const db = new DatabaseSync(DB_FILE)
db.exec('PRAGMA foreign_keys = ON')

const runFile = (rel) => db.exec(fs.readFileSync(path.join(ROOT, rel), 'utf8'))

for (const f of ['db/schema.sql', 'db/gallery_schema.sql', 'db/chat_schema.sql', 'db/calendar_schema.sql', 'db/seed.sql']) runFile(f)
// Added in production by docs/auth-migration-guide.md (custom auth, v3).
db.exec('ALTER TABLE profiles ADD COLUMN password_hash TEXT')
const migrations = fs.readdirSync(path.join(ROOT, 'db/migrations'))
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.includes('preview_matches'))
  .sort()
for (const f of migrations) runFile(`db/migrations/${f}`)

// ── 2. Helpers ──────────────────────────────────────────────────────────────

let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (a, b) => a + rand() * (b - a)

const NOW = Date.now()
const DAY = 86_400_000
const iso = (ms) => new Date(ms).toISOString()
const daysAgo = (d) => NOW - d * DAY
const dateOnly = (ms) => iso(ms).slice(0, 10)
/** Editor deadline policy used by the app: end of the next calendar day (UTC). */
const deadlineFor = (assignedMs) => {
  const d = new Date(assignedMs)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(23, 59, 0, 0)
  return d.getTime()
}

const insert = (table, row) => {
  const cols = Object.keys(row)
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => row[c] ?? null))
}

const hash = bcrypt.hashSync(LOCAL_PASSWORD, 10)
const profile = (p) => {
  const id = p.id ?? `user_${randomUUID().slice(0, 12)}`
  insert('profiles', {
    id, role: p.role, full_name: p.full_name, email: p.email, phone: p.phone ?? null,
    plan_id: p.plan_id ?? null, client_id_label: p.client_id_label ?? null,
    team_role: p.team_role ?? null, admin_role: p.admin_role ?? null,
    password_hash: hash, password_changed: 1, disabled: p.disabled ? 1 : 0,
    created_at: iso(p.createdMs ?? daysAgo(200)), updated_at: iso(p.createdMs ?? daysAgo(200)),
  })
  return id
}

// ── 3. People ───────────────────────────────────────────────────────────────

const admin = profile({ id: 'user_local_admin', role: 'admin', full_name: 'Cyril (Local Admin)', email: 'admin@pingu.local' })
profile({ role: 'admin', admin_role: 'manager', full_name: 'Maya Manager', email: 'manager@pingu.local' })

const editors = [
  profile({ role: 'team', team_role: 'editor', full_name: 'Elias Editor', email: 'elias@pingu.local' }),
  profile({ role: 'team', team_role: 'editor', full_name: 'Nora Cut', email: 'nora@pingu.local' }),
  profile({ role: 'team', team_role: 'editor', full_name: 'Sami Frames', email: 'sami@pingu.local' }),
  profile({ role: 'team', team_role: 'copywriter', full_name: 'Clara Copy', email: 'clara@pingu.local' }),
]
const videoEditors = editors.slice(0, 3)
const clara = editors[3]
const cora = profile({ role: 'team', team_role: 'copywriter', full_name: 'Cora Words', email: 'cora@pingu.local' })

// Each client is shaped to land in a specific health situation (see notes).
const CLIENTS = [
  { key: 'healthy',   name: 'Bloom Bakery',        email: 'bloom@client.local',    plan: 'plan_growth',  contactDays: 1,  contractEndIn: 140, renewal: 'not_discussed', included: 24 },
  { key: 'nocontact', name: 'Atlas Fitness',       email: 'atlas@client.local',    plan: 'plan_pro',     contactDays: 8,  contractEndIn: 90,  renewal: 'not_discussed', included: 40 },
  { key: 'stuck',     name: 'Nova Skincare',       email: 'nova@client.local',     plan: 'plan_growth',  contactDays: 1,  contractEndIn: 200, renewal: 'not_discussed', included: 24 },
  { key: 'renewal',   name: 'Harbor Real Estate',  email: 'harbor@client.local',   plan: 'plan_starter', contactDays: 2,  contractEndIn: 10,  renewal: 'not_discussed', included: 12 },
  { key: 'renewing',  name: 'Peak Coffee Co.',     email: 'peak@client.local',     plan: 'plan_growth',  contactDays: 0,  contractEndIn: 25,  renewal: 'discussed',     included: 24 },
  { key: 'nobrief',   name: 'Lumen Dental',        email: 'lumen@client.local',    plan: 'plan_starter', contactDays: 2,  contractEndIn: 160, renewal: 'not_discussed', included: 12 },
  { key: 'duetoday',  name: 'Orbit Tech',          email: 'orbit@client.local',    plan: 'plan_pro',     contactDays: 1,  contractEndIn: 300, renewal: 'renewed',       included: 40 },
  { key: 'new',       name: 'Saffron Kitchen',     email: 'saffron@client.local',  plan: 'plan_starter', contactDays: null, contractEndIn: 365, renewal: 'not_discussed', included: 12, isNew: true },
  { key: 'disabled',  name: 'Old Client (disabled)', email: 'old@client.local',    plan: 'plan_starter', contactDays: 30, contractEndIn: -40, renewal: 'declined', included: 12, disabled: true },
]

// ── 4. Projects with a consistent status history ────────────────────────────

const TITLES = ['Spring promo reel', 'Behind the scenes', 'Customer testimonial', 'Product launch teaser', 'How-to tutorial',
  'Founder story', 'Weekly tips #', 'Event recap', 'Before & after', 'FAQ short', 'Team intro', 'Seasonal offer']

// Realistic client revision notes, by category (used again in Part 3).
const NOTES = {
  pacing:   ['The middle drags a bit, can we tighten it?', 'Cuts feel too slow at the start', 'Please speed up the second half', 'Too many long shots, keep it snappy'],
  captions: ['Captions are too small on mobile', 'Typo in the subtitle at the end', 'Please make the captions bigger and bolder', 'Subtitles are out of sync with the voice'],
  hook:     ['The first 3 seconds need a stronger hook', 'Start with the product, not the logo', 'Open with the question instead'],
  music:    ['Music is too loud over the voice', 'Can we use a more upbeat track?', 'Lower the music under the talking parts'],
  colour:   ['Colours look washed out', 'Skin tones are too orange', 'Make it warmer and brighter'],
  'b-roll': ['Add more shots of the shop', 'Need more product close-ups', 'Use the drone footage we sent'],
  branding: ['Logo should be in the corner the whole time', 'Use our brand font for titles', 'Wrong brand colour on the end card'],
  other:    ['Can you remove the part with the dog?', 'Please export a square version too'],
}
const CATS = Object.keys(NOTES)

function addHistory(projectId, oldStatus, newStatus, ms, actor) {
  insert('status_history', { id: randomUUID(), project_id: projectId, old_status: oldStatus, new_status: newStatus, actor_id: actor, created_at: iso(ms) })
}

/**
 * Create one project and walk it through the real lifecycle up to `target`.
 * Durations are random but realistic. Returns nothing; writes every table the
 * app would have written: projects, assignments, deadlines, files,
 * status_history, timeline_comments.
 */
function makeProject(clientId, createdMs, target, opts = {}) {
  const id = randomUUID()
  const editor = opts.editor ?? pick(videoEditors)
  const title = pick(TITLES).replace('#', String(Math.ceil(rand() * 20)))
  let t = createdMs
  let status = 'pending_assignment'
  let revisions = 0
  const events = []                 // [status, ms]
  const go = (s, hours) => { t += hours * 3_600_000; events.push([s, t]); status = s }

  let assignedMs = null
  if (target !== 'pending_assignment') {
    go('in_progress', opts.startAfterHours ?? between(2, 20))
    assignedMs = t
    if (target !== 'in_progress') {
      go('in_review', opts.editHours ?? between(10, 50))
      if (target !== 'in_review') {
        go('admin_approved', between(1, 6))
        go('client_reviewing', between(0.2, 2))
        const rounds = opts.revisions ?? (rand() < 0.45 ? (rand() < 0.3 ? 2 : 1) : 0)
        for (let r = 0; r < rounds && target !== 'client_reviewing'; r++) {
          go('revision_requested', between(5, 30)); revisions++
          go('in_review', between(6, 30))
          go('client_reviewing', between(1, 6))
        }
        if (target === 'revision_requested') { go('revision_requested', between(5, 30)); revisions++ }
        if (target === 'client_approved') go('client_approved', between(4, 40))
      }
    }
  }

  insert('projects', {
    id, client_id: clientId, title, description: `Brief for ${title.toLowerCase()}.`,
    video_script: 'Hook → three key points → call to action.', instructions: 'Vertical 9:16, 30–45 seconds.',
    status, max_deliverables: 2, max_client_revisions: 3, client_revision_count: revisions,
    created_at: iso(createdMs), updated_at: iso(events.length ? t : createdMs),
  })

  if (assignedMs != null) {
    // Assignment + deadline exactly as handleAssignProject creates them.
    const assignmentId = randomUUID()
    insert('project_assignments', { id: assignmentId, project_id: id, team_member_id: editor, assigned_by: admin, assigned_at: iso(assignedMs) })
    const due = deadlineFor(assignedMs)
    const firstReview = events.find(([s]) => s === 'in_review')?.[1]
    const resolved = firstReview != null && !opts.deadlineUnresolved
    insert('deadlines', {
      id: randomUUID(), project_id: id, team_member_id: editor, assignment_id: assignmentId, due_at: iso(due),
      status: resolved ? (firstReview <= due ? 'met' : 'missed') : 'pending',
      resolved_at: resolved ? iso(firstReview) : null, created_at: iso(assignedMs),
    })
  }

  // Status history: legacy projects only get the migration-003 backfill row.
  if (opts.legacy) {
    addHistory(id, null, status, events.length ? t : createdMs, null)
  } else {
    let prev = 'pending_assignment'
    for (const [s, ms] of events) { addHistory(id, prev, s, ms, s === 'in_progress' || s === 'in_review' ? editor : admin); prev = s }
  }

  // Source video from the client (unless this request is still waiting for
  // footage), one deliverable per review round.
  if (!opts.noFootage) insert('project_files', { id: randomUUID(), project_id: id, uploader_id: clientId, file_type: 'source_video',
    storage_key: `projects/${id}/source_video/${createdMs}-raw.mp4`, file_name: 'raw-footage.mp4', file_size: 850_000_000,
    mime_type: 'video/mp4', approved: 0, created_at: iso(createdMs + 600_000) })
  let version = 0
  for (const [s, ms] of events) {
    if (s !== 'in_review') continue
    version++
    insert('project_files', { id: randomUUID(), project_id: id, uploader_id: editor, file_type: 'deliverable',
      storage_key: `projects/${id}/deliverable/${ms}-v${version}.mp4`, file_name: `final-v${version}.mp4`, file_size: 120_000_000,
      mime_type: 'video/mp4', approved: status === 'client_approved' || ms < t ? 1 : 0, created_at: iso(ms - 300_000) })
  }

  // Client notes for each revision round (what the revision request carries).
  let round = 1
  for (const [s, ms] of events) {
    if (s !== 'revision_requested') continue
    const n = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const cat = opts.favouriteCategory && rand() < 0.6 ? opts.favouriteCategory : pick(CATS)
      const sec = Math.round(between(1, 40))
      insert('timeline_comments', { id: randomUUID(), project_id: id, author_id: clientId, author_role: 'client',
        timestamp_sec: sec, comment_text: `[00:${String(sec).padStart(2, '0')}] — ${pick(NOTES[cat])}`,
        revision_round: round, created_at: iso(ms - 1_800_000 + i * 60_000) })
    }
    round++
  }
  return id
}

const clientIds = {}
for (const c of CLIENTS) {
  const createdMs = c.isNew ? daysAgo(6) : daysAgo(between(120, 300))
  const id = profile({ role: 'client', full_name: c.name, email: c.email, plan_id: c.plan, disabled: c.disabled,
    client_id_label: `CLT-${String(Object.keys(clientIds).length + 1).padStart(3, '0')}`, createdMs })
  clientIds[c.key] = id

  const fav = pick(CATS)
  if (!c.isNew) {
    // Back catalogue: finished videos over the last ~90 days.
    const count = 5 + Math.floor(rand() * 6)
    for (let i = 0; i < count; i++) makeProject(id, daysAgo(between(8, 90)), 'client_approved', { favouriteCategory: fav })
    // Two very old videos from before status history existed (estimated delivery dates).
    makeProject(id, daysAgo(between(100, 140)), 'client_approved', { legacy: true })
  }

  // Current work, shaped per scenario.
  switch (c.key) {
    case 'healthy':
      makeProject(id, daysAgo(1), 'pending_assignment', { noFootage: true })
      makeProject(id, daysAgo(4), 'client_reviewing', { favouriteCategory: fav })
      break
    case 'nocontact':
      makeProject(id, daysAgo(1), 'in_review')
      break
    case 'stuck':
      // In progress for ~3 days: assigned 3 days ago, editor deadline long passed.
      makeProject(id, daysAgo(3.4), 'in_progress', { startAfterHours: 8, deadlineUnresolved: true })
      makeProject(id, daysAgo(0.5), 'pending_assignment')
      break
    case 'renewal':
      makeProject(id, daysAgo(1.2), 'client_reviewing')
      break
    case 'renewing':
      makeProject(id, daysAgo(0.3), 'pending_assignment')
      makeProject(id, daysAgo(5), 'revision_requested', { favouriteCategory: fav })
      break
    case 'nobrief':
      makeProject(id, daysAgo(4), 'client_reviewing')
      break
    case 'duetoday': {
      // Assigned "yesterday" → the editor deadline is end of today (UTC).
      const yesterday = new Date(NOW); yesterday.setUTCDate(yesterday.getUTCDate() - 1); yesterday.setUTCHours(10, 0, 0, 0)
      makeProject(id, yesterday.getTime() - 4 * 3_600_000, 'in_progress', { startAfterHours: 4 })
      makeProject(id, daysAgo(0.8), 'pending_assignment')
      break
    }
    case 'new':
      break
  }

  // Care data: contract, renewal, notes (Saffron = brand new, mostly empty).
  insert('client_care', {
    client_id: id,
    contract_start: dateOnly(NOW + (c.contractEndIn - 365) * DAY),
    contract_end: dateOnly(NOW + c.contractEndIn * DAY),
    videos_included: c.included,
    renewal_status: c.renewal,
    care_notes: c.isNew ? null : pick(['Prefers WhatsApp voice notes.', 'Owner is very detail-oriented about branding.', 'Posts every Tuesday and Friday.', 'Happy client, open to upsell.']),
    miro_url: c.isNew ? null : `https://miro.com/app/board/example-${c.key}/`,
    updated_at: iso(daysAgo(3)),
  })
  insert('client_onboarding', {
    client_id: id,
    welcome_sent: iso(createdMs + DAY),
    call_done: iso(createdMs + 2 * DAY),
    brief_received: c.isNew ? null : iso(createdMs + 3 * DAY),
    first_video_delivered: c.isNew ? null : iso(createdMs + 8 * DAY),
  })
  // Instagram accounts (migration 012): most clients one, Bloom two, the
  // brand-new client none (to show the empty state).
  const igHandles = c.key === 'new' ? [] : c.key === 'healthy' ? ['bloom.bakery', 'bloom.cafe.paris'] : [c.email.split('@')[0] + '.official']
  igHandles.forEach((h, i) => insert('client_instagram_accounts', { id: randomUUID(), client_id: id, handle: h, position: i, created_at: iso(createdMs) }))

  // Contacts log: a few older ticks, the latest one sets "days since contact".
  if (c.contactDays != null) {
    for (const d of [c.contactDays + 9, c.contactDays + 4, c.contactDays]) {
      insert('client_contacts', { id: randomUUID(), client_id: id, contacted_at: iso(daysAgo(d) - 3_600_000), contacted_by: admin })
    }
  }
}

// Migration 011's one-time backfill ran before any data existed; run it again
// now so past revision notes become revision entries, as on a real database.
const m011 = fs.readFileSync(path.join(ROOT, 'db/migrations/011_client_care.sql'), 'utf8')
db.exec(m011.slice(m011.indexOf('-- BACKFILL')))
// Same for migration 013: copy each client's contract into client_contracts.
const m013 = fs.readFileSync(path.join(ROOT, 'db/migrations/013_client_contracts.sql'), 'utf8')
db.exec(m013.slice(m013.indexOf('-- COPY')))

// Contract history + packages for the fake clients:
//  - Bloom: an earlier, finished contract #1 (renewed) → today's becomes #2
//  - Bloom, Nova, Saffron: full package (production plans in Part 2)
{
  const bloom = clientIds.healthy
  const [cur] = db.prepare('SELECT start_date FROM client_contracts WHERE client_id = ?').all(bloom)
  db.prepare('UPDATE client_contracts SET number = 2 WHERE client_id = ?').run(bloom)
  const prevEnd = new Date(Date.parse(`${cur.start_date}T00:00:00Z`) - DAY)
  const prevStart = new Date(prevEnd); prevStart.setUTCFullYear(prevStart.getUTCFullYear() - 1); prevStart.setUTCDate(prevStart.getUTCDate() + 1)
  insert('client_contracts', { id: randomUUID(), client_id: bloom, number: 1, start_date: dateOnly(prevStart.getTime()), end_date: dateOnly(prevEnd.getTime()),
    package: 'full_package', videos_included: 24, renewal_status: 'renewed', created_at: iso(prevStart.getTime()) })
  for (const key of ['healthy', 'stuck', 'new']) db.prepare("UPDATE client_contracts SET package = 'full_package' WHERE client_id = ?").run(clientIds[key])
}

// Copywriters ↔ clients + production plans (migration 014).
//  - Clara: Bloom + Nova. Cora: Saffron (no plan yet → create from template).
//  - Bloom: plan under way; its "record + upload" steps tick themselves from
//    the footage Bloom uploaded.
//  - Nova: the onboarding call (client step) is overdue.
{
  insert('client_team_assignments', { client_id: clientIds.healthy, team_member_id: clara })
  insert('client_team_assignments', { client_id: clientIds.stuck, team_member_id: clara })
  insert('client_team_assignments', { client_id: clientIds.new, team_member_id: cora })
  // Same steps and gaps as PLAN_TEMPLATE in api/_helpers/care/config.ts.
  const TEMPLATE = [
    ['Onboarding call', 'both', 0, 'none'], ['Scripts · batch 1', 'pingu', 3, 'none'],
    ['Record + upload · batch 1', 'client', 4, 'footage_uploaded'], ['Scripts · batch 2', 'pingu', 7, 'none'],
    ['Record + upload · batch 2', 'client', 4, 'footage_uploaded'], ['Scripts · batch 3', 'pingu', 7, 'none'],
    ['Record + upload · batch 3', 'client', 4, 'footage_uploaded'], ['All videos delivered', 'pingu', 21, 'all_delivered'],
  ]
  const makePlan = (clientKey, startDaysAgo, doneTitles) => {
    const clientId = clientIds[clientKey]
    const contract = db.prepare('SELECT id, start_date, end_date FROM client_contracts WHERE client_id = ? ORDER BY number DESC').all(clientId)
      .find((k) => k.start_date <= dateOnly(NOW) && dateOnly(NOW) <= k.end_date)
    let ms = daysAgo(startDaysAgo)
    TEMPLATE.forEach(([title, owner, gap, rule], i) => {
      ms += gap * DAY
      const done = doneTitles.includes(title)
      insert('production_plan_items', { id: randomUUID(), contract_id: contract.id, client_id: clientId, date: dateOnly(ms), title, owner,
        done: done ? 1 : 0, done_at: done ? iso(ms + 3_600_000) : null, done_by: done ? clara : null, auto_rule: rule, sort_order: i })
    })
  }
  makePlan('healthy', 20, ['Onboarding call', 'Scripts · batch 1'])
  makePlan('stuck', 5, ['Scripts · batch 1'])
}

// Onboarding questionnaire (migration 015). Its "mark existing" step ran
// before any client existed; run it now (everyone done), then:
//  - Saffron (full package, new): not started → sees onboarding on login
//  - Peak (editing only): not started → the short version
//  - Harbor (editing only): half way through
//  - Bloom: done, answers pasted in by Clara from the old Notion doc
{
  const m015 = fs.readFileSync(path.join(ROOT, 'db/migrations/015_client_onboarding.sql'), 'utf8')
  db.exec(m015.slice(m015.indexOf('-- MARK EXISTING')))
  const reset = db.prepare('UPDATE client_care SET onboarding_status = ?, onboarding_done_at = NULL WHERE client_id = ?')
  reset.run(null, clientIds.new)
  reset.run(null, clientIds.renewing)
  reset.run('in_progress', clientIds.renewal)
  const answer = (clientKey, qid, value, by) => insert('onboarding_answers', {
    id: randomUUID(), client_id: clientIds[clientKey], question_id: qid, answer: value, file_url: null,
    updated_at: iso(daysAgo(30)), updated_by: by ?? clientIds[clientKey] })
  answer('renewal', 'obq_01', '@harbor.homes')
  answer('renewal', 'obq_02', 'Referral')
  answer('renewal', 'obq_03', 'Sam from Peak Coffee')
  answer('renewal', 'obq_04', 'Saw the before/after edits for Peak and wanted the same pace.')
  const BLOOM = {
    obq_01: '@bloom.bakery', obq_02: 'Instagram', obq_04: 'Their reels felt like us, not like an agency.',
    obq_05: 'Price, and whether they would get our humour.', obq_06: "Lyon, in the back of my parents' bakery.",
    obq_10: 'The 5am quiet before the shop opens.', obq_12: 'Sourdough, viennoiserie, wedding cakes. Ideal client: locals who care where bread comes from.',
    obq_19: 'Warm, nerdy, fast', obq_20: '"Proper bread"', obq_21: '"Artisanal"', obq_26: 'Hungry and a bit nostalgic.',
    obq_28: 'The friendly neighbour who always has flour on her apron.', obq_29: 'Raw, close-up, natural light, no stock music.',
    obq_30: '@thebreadcode, @fullproofbaking', obq_31: 'Close-ups and calm voice-over.',
    obq_32: JSON.stringify(['https://www.instagram.com/reel/abc123/', 'https://www.tiktok.com/@baker/video/1']),
    obq_33: JSON.stringify(['https://www.instagram.com/reel/xyz789/']), obq_34: 'Fast zooms, meme sound effects.',
  }
  for (const [qid, v] of Object.entries(BLOOM)) answer('healthy', qid, v, clara)
}

// ── 5. Summary ──────────────────────────────────────────────────────────────

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
console.log(`Local database ready: ${path.relative(ROOT, DB_FILE)}`)
for (const t of ['profiles', 'projects', 'project_assignments', 'deadlines', 'project_files', 'status_history', 'timeline_comments', 'client_care', 'client_contacts', 'client_onboarding', 'revision_entries', 'client_contracts', 'client_team_assignments', 'production_plan_items', 'onboarding_questions', 'onboarding_answers']) {
  console.log(`  ${t.padEnd(20)} ${count(t)}`)
}
console.log(`\nLog in at http://localhost:5173 with admin@pingu.local / ${LOCAL_PASSWORD}`)
console.log('(also: manager@pingu.local, elias@pingu.local, clara@ / cora@pingu.local (copywriters), bloom@client.local — same password)')
db.close()
