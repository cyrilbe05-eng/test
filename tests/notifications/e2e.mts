// End-to-end test for the notification jobs:
//   1. admin assigns an editor → deadline + in-app notification + email (once)
//   2. scripts: copywriter → admins, admin → copywriter (in-app + email)
//   3. deadline reminders: due soon, overdue (daily), admins at 2+ days, stop on delivery, never twice
//
// Runs the real API code against a COPY of the local database (your local
// data is not changed) with a stand-in mail server that records every email.
//   Run:  npm run test:notifications      (needs the local database: npm run local:db)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { EventEmitter } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_DB = path.join(ROOT, '.local-data', 'local.db')
if (!fs.existsSync(SRC_DB)) { console.error('No local database. Run: npm run local:db'); process.exit(1) }

// ── a copy of the local database, with migration 030 ──────────────────────
const DB = path.join(os.tmpdir(), `pingu-notify-test-${process.pid}.db`)
{
  const src = new DatabaseSync(SRC_DB)
  src.exec(`VACUUM INTO '${DB.replace(/'/g, "''")}'`)
  src.close()
}
const db = new DatabaseSync(DB)
db.exec(fs.readFileSync(path.join(ROOT, 'db/migrations/030_deadline_reminders.sql'), 'utf8'))
const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[]
const one = (sql: string, ...a: any[]) => all(sql, ...a)[0]

// ── stand-in mail server ─────────────────────────────────────────────────
type Mail = { to: string; subject: string; body: string }
const mails: Mail[] = []
// Encoded subject words: join the raw bytes of a run of them, then read as UTF-8
// (a character can be split across two words).
const wordBytes = (enc: string, t: string) => enc.toLowerCase() === 'b' ? Buffer.from(t, 'base64')
  : Buffer.from(t.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
const decodeWords = (s: string) => s.replace(/(?:=\?utf-8\?[qb]\?[^?]*\?=)+/gi, (run) =>
  Buffer.concat([...run.matchAll(/=\?utf-8\?([qb])\?([^?]*)\?=/gi)].map((m) => wordBytes(m[1], m[2]))).toString('utf8'))
const smtp = net.createServer((sock) => {
  let rcpt = ''; let inData = false; let data = ''
  sock.write('220 test\r\n')
  let buf = ''
  sock.on('data', (chunk) => {
    buf += chunk.toString('latin1')
    for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2)
      if (inData) {
        if (line === '.') {
          inData = false
          // Unfold long headers; adjacent encoded words join with no space between them.
          const head = data.split('\r\n\r\n')[0].replace(/\r\n[ \t]+/g, ' ').replace(/\?=\s+=\?/g, '?==?')
          const subject = decodeWords(/^Subject: (.*)$/mi.exec(head)?.[1] ?? '')
          mails.push({ to: rcpt, subject, body: data })
          data = ''; sock.write('250 ok\r\n')
        } else data += line + '\r\n'
        continue
      }
      const cmd = line.slice(0, 4).toUpperCase()
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test\r\n250 AUTH PLAIN\r\n')
      else if (cmd === 'AUTH') sock.write('235 ok\r\n')
      else if (cmd === 'MAIL') { rcpt = ''; sock.write('250 ok\r\n') }
      else if (cmd === 'RCPT') { rcpt = /<([^>]+)>/.exec(line)?.[1] ?? ''; sock.write('250 ok\r\n') }
      else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n') }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end() }
      else sock.write('250 ok\r\n')
    }
  })
})
await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r))

Object.assign(process.env, {
  LOCAL_DB_FILE: DB, JWT_SECRET: 'local-development-secret-not-for-production', APP_ORIGIN: 'http://localhost:5173',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: String((smtp.address() as net.AddressInfo).port), SMTP_USER: 'test', SMTP_PASS: 'test', SMTP_FROM: 'Pingu <noreply@pingu.local>',
})
delete process.env.CRON_SECRET
const api = (await import(pathToFileURL(path.join(ROOT, 'api/[...slug].ts')).href)).default
const { signJwt } = await import(pathToFileURL(path.join(ROOT, 'api/_helpers/auth.ts')).href)
const { sendDeadlineReminders } = await import(pathToFileURL(path.join(ROOT, 'api/_helpers/reminders/deadlines.ts')).href)

async function call(method: string, url: string, userId: string | null, body?: unknown) {
  const res: any = new EventEmitter()
  res.statusCode = 200; res.headers = {}
  res.status = (c: number) => { res.statusCode = c; return res }
  res.setHeader = (k: string, v: unknown) => { res.headers[k] = v; return res }
  res.json = (b: unknown) => { res.body = b; res.emit('finish'); return res }
  res.send = res.json; res.end = (b?: unknown) => { res.body = b; res.emit('finish'); return res }
  let token = ''
  if (userId) { const p = one('SELECT role FROM profiles WHERE id = ?', userId); token = await signJwt({ sub: userId, role: p.role }) }
  const req: any = { method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, query: {}, body: body ?? {} }
  await api(req, res)
  return res
}

let fails = 0
const ok = (c: unknown, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const quiet = console.log
console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && a[0].startsWith('[req]')) return; quiet(...a) }
const emailOf = (id: string) => one('SELECT email FROM profiles WHERE id = ?', id).email as string
const mailsTo = (id: string, from = 0) => mails.slice(from).filter((m) => m.to === emailOf(id))
const notes = (id: string, type: string) => all('SELECT message FROM notifications WHERE recipient_id = ? AND type = ? ORDER BY created_at', id, type).map((r) => r.message)

try {
  const admin = one("SELECT id FROM profiles WHERE email = 'admin@pingu.local'").id
  const admins = all("SELECT id FROM profiles WHERE role = 'admin' AND disabled = 0").map((r) => r.id)
  const editor = one("SELECT id FROM profiles WHERE role = 'team' AND team_role = 'editor' AND disabled = 0 ORDER BY full_name").id
  const project = one(`SELECT id, title FROM projects WHERE status = 'in_progress'
                       AND id NOT IN (SELECT project_id FROM project_assignments WHERE team_member_id = ?) LIMIT 1`, editor)

  // ── 1. admin assigns an editor ─────────────────────────────────────────
  console.log('— 1. admin assigns an editor')
  let m0 = mails.length
  const r1 = await call('POST', `/api/projects/${project.id}/assign`, admin, { team_member_id: editor })
  ok(r1.statusCode === 200, 'assign → 200')
  const dl = one('SELECT * FROM deadlines WHERE project_id = ? AND team_member_id = ?', project.id, editor)
  ok(dl && dl.status === 'pending', `deadline created (due ${dl?.due_at})`)
  ok(notes(editor, 'team_assigned').some((m) => m.includes(project.title)), 'editor gets the in-app notification')
  ok(mailsTo(editor, m0).length === 1 && mailsTo(editor, m0)[0].subject === `New project assigned: ${project.title}`, 'editor gets 1 email: ' + mailsTo(editor, m0)[0]?.subject)
  m0 = mails.length
  const n0 = notes(editor, 'team_assigned').length
  await call('POST', `/api/projects/${project.id}/assign`, admin, { team_member_id: editor })
  ok(mails.length === m0 && notes(editor, 'team_assigned').length === n0 && all('SELECT id FROM deadlines WHERE project_id = ? AND team_member_id = ?', project.id, editor).length === 1,
    'assigning again → no second deadline, notification or email')

  // ── 2. scripts ─────────────────────────────────────────────────────────
  console.log('— 2. copywriter scripts')
  const script = one(`SELECT s.id, s.title, s.client_id, s.created_by FROM scripts s JOIN profiles p ON p.id = s.created_by
                      WHERE p.team_role = 'copywriter' AND s.status IN ('draft', 'needs_changes') LIMIT 1`)
  if (!script) { console.log('     ! no draft script by a copywriter in the local data'); fails++ } else {
    const writer = script.created_by
    m0 = mails.length
    const s1 = await call('POST', `/api/scripts/script/${script.id}/status`, writer, { status: 'in_review' })
    ok(s1.statusCode === 200, 'copywriter sends the script for review → 200')
    const toAdmins = admins.every((a) => mailsTo(a, m0).some((m) => m.subject.startsWith('Script ready for review: ')))
    ok(toAdmins && mails.length - m0 === admins.length, `every admin gets 1 email (${mails.length - m0} sent to ${admins.length} admins): ${mailsTo(admin, m0)[0]?.subject}`)
    ok(mailsTo(admin, m0)[0]?.body.includes(`/admin/scripts/${script.client_id}`), 'admin email links to the Script Review page')
    ok(admins.every((a) => notes(a, 'status_changed').some((m) => m.startsWith('Script ready for review'))), 'every admin gets the in-app notification')

    m0 = mails.length
    await call('POST', `/api/scripts/script/${script.id}/status`, admin, { status: 'needs_changes' })
    ok(mailsTo(writer, m0).length === 1 && mailsTo(writer, m0)[0].subject.startsWith('Script needs changes: '), 'admin asks for changes → copywriter gets 1 email: ' + mailsTo(writer, m0)[0]?.subject)
    ok(mailsTo(writer, m0)[0]?.body.includes(`/team/scripts/${script.client_id}`), "copywriter email links to their Scripts page")
    ok(notes(writer, 'status_changed').some((m) => m.startsWith('Script needs changes')), 'copywriter gets the in-app notification')

    m0 = mails.length
    await call('POST', `/api/scripts/script/${script.id}/status`, admin, { status: 'approved' })
    ok(mailsTo(writer, m0).length === 1 && mailsTo(writer, m0)[0].subject.startsWith('Script approved: '), 'admin approves → copywriter gets 1 email: ' + mailsTo(writer, m0)[0]?.subject)
    m0 = mails.length
    await call('POST', `/api/scripts/script/${script.id}/status`, admin, { status: 'approved' })
    ok(mails.length === m0, 'approving again (no change) → no email')
    ok(mails.slice(-10).every((m) => m.to !== emailOf(admin) || !m.subject.startsWith('Script approved')), "the admin who acted isn't emailed about their own action")
  }

  // ── 3. deadline reminders ──────────────────────────────────────────────
  console.log('— 3. deadline reminders (simulated clock)')
  const due = Date.parse(dl.due_at)
  const H = 3_600_000
  const run = async (hoursFromDue: number) => {
    const before = mails.length
    const r = await sendDeadlineReminders(due + hoursFromDue * H)
    // Other local deadlines get their own (correct) reminders too; look at this project's only.
    return { kinds: r.sent.filter((s: any) => s.deadline_id === dl.id).map((s: any) => s.kind), mails: mails.slice(before).filter((m) => m.subject.includes(project.title)) }
  }
  let r = await run(-25)
  ok(r.kinds.length === 0, '25 h before: nothing')
  r = await run(-23)
  ok(JSON.stringify(r.kinds) === '["due_soon"]' && r.mails.length === 1 && r.mails[0].to === emailOf(editor) && r.mails[0].subject === `Due tomorrow: ${project.title}`,
    `23 h before: editor gets "${r.mails[0]?.subject}"`)
  ok(notes(editor, 'deadline_due').includes(`Due tomorrow: ${project.title}`), 'editor gets the in-app reminder')
  r = await run(-22)
  ok(r.kinds.length === 0 && r.mails.length === 0, 'an hour later: not sent again')
  r = await run(1)
  ok(JSON.stringify(r.kinds) === '["overdue_0"]' && r.mails.length === 1 && r.mails[0].subject === `Overdue: ${project.title}`, `goes overdue: "${r.mails[0]?.subject}"`)
  r = await run(5)
  ok(r.kinds.length === 0, 'later the same day: not sent again')
  r = await run(25)
  ok(JSON.stringify(r.kinds) === '["overdue_1"]' && r.mails.length === 1, `next day: "${r.mails[0]?.subject}"`)
  r = await run(30)
  ok(r.kinds.length === 0, 'same day again: nothing')
  r = await run(49)
  const adminMails = r.mails.filter((m) => m.to !== emailOf(editor))
  ok(JSON.stringify(r.kinds) === '["overdue_2","admin_overdue"]' && adminMails.length === admins.length,
    `2+ days late: editor reminded, every admin told once ("${adminMails[0]?.subject}")`)
  ok(admins.every((a) => notes(a, 'deadline_due').some((m) => m.startsWith('Overdue 2+ days'))), 'admins get the in-app notification')
  r = await run(73)
  ok(JSON.stringify(r.kinds) === '["overdue_3"]', 'day after: editor only, admins not told again')

  // Delivery stops everything.
  db.prepare("INSERT INTO status_history (id, project_id, old_status, new_status, actor_id, created_at) VALUES (?, ?, 'in_progress', 'in_review', ?, ?)")
    .run('test-handoff', project.id, editor, new Date(due + 80 * H).toISOString())
  r = await run(97)
  ok(r.kinds.length === 0 && r.mails.length === 0, 'after the editor sends it for review: no more reminders')

  const total = all('SELECT COUNT(*) n FROM deadline_reminders')[0].n
  r = await run(97)
  ok(all('SELECT COUNT(*) n FROM deadline_reminders')[0].n === total, 'running again changes nothing (never twice)')
} catch (e) {
  console.error(e); fails++
} finally {
  smtp.close(); db.close()
  try { fs.unlinkSync(DB) } catch { /* temp file */ }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
  process.exit(fails ? 1 : 0)
}
