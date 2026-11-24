// Upload API test: proves an API key can ONLY upload videos for its own
// client, and that direct uploads and link downloads work end to end.
//
//   1. In one terminal:   set UPLOAD_API_ALLOW_PRIVATE_LINKS=1 (PowerShell:
//                         $env:UPLOAD_API_ALLOW_PRIVATE_LINKS='1') then npm run local:dev
//   2. In another:        npm run test:upload-api
//
// (The variable lets the local server download from this test's own little
// file server on 127.0.0.1; it only works on the local app, never online.)
//
// Local only. Saves a copy of the local database first and puts it back at
// the end, so it leaves no keys or projects behind.
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const DATA = path.join(ROOT, '.local-data')
const DB = path.join(DATA, 'local.db').replace(/\\/g, '/')
const SNAP = path.join(DATA, 'before-upload-api-test.db').replace(/\\/g, '/')
const B = process.env.APP_URL || 'http://localhost:5173'
const PW = 'LocalTest123!'
const MiB = 1024 * 1024

let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const py = (code) => execFileSync('python', ['-c', code]).toString().trim()
const sql = (q, ...a) => JSON.parse(py(`import sqlite3,json;c=sqlite3.connect(${JSON.stringify(DB)});c.row_factory=sqlite3.Row;print(json.dumps([dict(r) for r in c.execute(${JSON.stringify(q)},${JSON.stringify(a)})]))`))
const sqlRun = (q, ...a) => py(`import sqlite3;c=sqlite3.connect(${JSON.stringify(DB)});c.execute(${JSON.stringify(q)},${JSON.stringify(a)});c.commit()`)
const snapshot = (dir) => py(`
import sqlite3
src, dst = ${JSON.stringify(dir === 'save' ? [DB, SNAP] : [SNAP, DB])}
a = sqlite3.connect(src); b = sqlite3.connect(dst); a.backup(b); b.close(); a.close()`)
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')

// Video-looking test bytes (non-repeating pattern, ftyp header).
function videoBytes(mb, brand = 'isom') {
  const buf = Buffer.alloc(Math.round(mb * MiB))
  for (let i = 0; i + 4 <= buf.length; i += 4) buf.writeUInt32LE((i * 2654435761 + mb) >>> 0, i)
  buf.writeUInt32BE(20, 0); buf.write('ftyp' + brand, 4, 'latin1')
  return buf
}

async function call(method, url, { token, body, headers } = {}) {
  const r = await fetch(B + url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null; try { json = await r.json() } catch { /* not json */ }
  return { status: r.status, json, headers: r.headers }
}
const login = async (email) => (await call('POST', '/api/auth/login', { body: { email, password: PW } })).json.token
const absolute = (u) => (u.startsWith('http') ? u : B + u)

// ── tiny file server the local app downloads links from ─────────────────────
const FILES = {
  '/direct.mp4': videoBytes(40),
  '/norange.mov': videoBytes(20, 'qt  '),
  '/flaky.mp4': videoBytes(36),
  '/page.html': Buffer.from('<!doctype html><html><body>Please sign in</body></html>'.padEnd(2000)),
  '/archive.zip': Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(4000)]),
}
let flakyDrops = 1
function serve(req, res) {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/redirect') { res.writeHead(302, { location: '/direct.mp4' }); res.end(); return }
  const body = FILES[u.pathname]
  if (!body) { res.writeHead(404); res.end(); return }
  const type = u.pathname.endsWith('.html') ? 'text/html; charset=utf-8' : u.pathname.endsWith('.zip') ? 'application/zip' : 'video/mp4'
  const range = /bytes=(\d+)-/.exec(req.headers.range || '')
  if (range && u.pathname !== '/norange.mov') {
    const from = Number(range[1])
    res.writeHead(206, { 'content-type': type, 'content-length': body.length - from, 'content-range': `bytes ${from}-${body.length - 1}/${body.length}`, 'accept-ranges': 'bytes' })
    res.end(body.subarray(from)); return
  }
  res.writeHead(200, { 'content-type': type, 'content-length': body.length, ...(u.pathname === '/norange.mov' ? {} : { 'accept-ranges': 'bytes' }) })
  if (u.pathname === '/flaky.mp4' && flakyDrops-- > 0) {
    // Connection drops after ~20 MB.
    res.write(body.subarray(0, 20 * MiB), () => res.destroy()); return
  }
  res.end(body)
}

async function directUpload(key, name, bytes, extra = {}) {
  const start = await call('POST', '/api/v1/uploads', { token: key, body: { file_name: name, file_size: bytes.length, ...extra } })
  if (start.status !== 201) return { start }
  const { upload, parts } = start.json
  const etags = []
  for (const p of parts) {
    const from = (p.part_number - 1) * upload.part_size
    const r = await fetch(absolute(p.url), { method: 'PUT', body: bytes.subarray(from, Math.min(from + upload.part_size, bytes.length)) })
    etags.push({ part_number: p.part_number, etag: r.headers.get('etag') })
  }
  const done = await call('POST', `/api/v1/uploads/${upload.id}/complete`, { token: key, body: { parts: etags } })
  return { start, etags, done, upload }
}

async function storedBytesOf(projectId, adminToken) {
  const [f] = sql("select id from project_files where project_id = ? and file_type = 'source_video'", projectId)
  if (!f) return null
  const r = await call('GET', `/api/project-files/${f.id}/signed-url?download=1`, { token: adminToken })
  const url = r.json?.signedUrl ?? r.json?.url
  return Buffer.from(await (await fetch(absolute(url))).arrayBuffer())
}

async function waitDone(key, id, maxChecks = 12) {
  let last
  for (let i = 0; i < maxChecks; i++) {
    last = await call('GET', `/api/v1/imports/${id}`, { token: key })
    if (['done', 'failed'].includes(last.json?.upload?.status)) return last
  }
  return last
}

;(async () => {
  py(`import sqlite3;c=sqlite3.connect(${JSON.stringify(DB)});c.executescript(open(${JSON.stringify(path.join(ROOT, 'db/migrations/029_upload_api.sql').replace(/\\/g, '/'))}).read());c.commit()`)
  snapshot('save')
  const files = http.createServer(serve)
  await new Promise((r) => files.listen(0, '127.0.0.1', r))
  const LINK = `http://127.0.0.1:${files.address().port}`
  try {
    const admin = await login('admin@pingu.local')
    const manager = await login('manager@pingu.local')
    const editor = await login('elias@pingu.local')
    const orbitLogin = await login('orbit@client.local')
    const [orbit] = sql("select id, full_name from profiles where email = 'orbit@client.local'")
    const [nova] = sql("select id from profiles where email = 'nova@client.local'")

    // ── who can manage keys ──────────────────────────────────────────────
    console.log('— managing keys')
    ok((await call('POST', '/api/api-keys', { body: { clientId: orbit.id, name: 'x' } })).status === 401, 'not signed in: cannot create a key')
    for (const [who, t] of [['client', orbitLogin], ['editor', editor], ['manager', manager]]) {
      ok((await call('POST', '/api/api-keys', { token: t, body: { clientId: orbit.id, name: 'x' } })).status === 403, `${who}: cannot create a key`)
      ok((await call('GET', `/api/api-keys?clientId=${orbit.id}`, { token: t })).status === 403, `${who}: cannot list keys`)
    }
    ok((await call('POST', '/api/api-keys', { token: admin, body: { clientId: sql("select id from profiles where email='elias@pingu.local'")[0].id, name: 'x' } })).status === 400, 'admin: cannot make a key for a non-client')
    const made = await call('POST', '/api/api-keys', { token: admin, body: { clientId: orbit.id, name: 'Test agent' } })
    const KEY = made.json?.key
    ok(made.status === 201 && /^pgk_/.test(KEY), 'full admin: creates a key, shown once')
    const [stored] = sql('select key_hash, key_prefix from api_keys where id = ?', made.json.id)
    ok(stored.key_hash !== KEY && !stored.key_hash.includes(KEY.slice(4)) && stored.key_hash === sha(KEY), 'only a scrambled version is stored')
    const listed = await call('GET', `/api/api-keys?clientId=${orbit.id}`, { token: admin })
    ok(listed.status === 200 && !JSON.stringify(listed.json).includes(KEY) && !JSON.stringify(listed.json).includes(stored.key_hash), 'key list never shows the key or its hash')
    const novaKey = (await call('POST', '/api/api-keys', { token: admin, body: { clientId: nova.id, name: 'Nova agent' } })).json.key

    // ── the key works ONLY on /api/v1 ───────────────────────────────────
    console.log('— a key is refused everywhere else')
    const anyFile = sql("select id from project_files limit 1")[0].id
    const anyGallery = sql("select id from gallery_files limit 1")[0].id
    const anyProject = sql("select id from projects limit 1")[0].id
    const areas = ['admin', 'api-keys', 'auth/me', 'batch/projects', 'calendar', 'client', 'deadlines', 'downloads', 'editor-home', 'editor-limit',
      'gallery', `gallery/${anyGallery}/signed-url`, `gallery/${anyGallery}/signed-url?download=1`, 'gallery/folders', 'instagram', 'messages', 'notifications',
      'plans', 'playbook', 'profiles', 'project-assignments', 'project-files', `project-files/${anyFile}/signed-url?download=1`, 'project-files/multipart/create',
      'projects', 'projects/create', `projects/${anyProject}`, 'revisions', 'scoreboard', 'scripts', 'settings', 'team', 'team-notes', 'time-saved',
      'timeline-comments', 'users', `admin/care/clients/${orbit.id}`]
    let leaks = []
    for (const a of areas) for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const r = await call(m, '/api/' + a, { token: KEY, body: m === 'GET' || m === 'DELETE' ? undefined : { client_id: orbit.id, title: 'x' } })
      if (r.status < 400) leaks.push(`${m} ${a} → ${r.status}`)
    }
    ok(leaks.length === 0, `key refused on all ${areas.length * 4} other routes${leaks.length ? ': ' + leaks.join('; ') : ''}`)
    ok(sql("select count(*) n from projects where title = 'x'")[0].n === 0, 'nothing was created through other routes')

    console.log('— bad keys')
    ok((await call('GET', '/api/v1/me')).status === 401, 'no key → 401')
    ok((await call('GET', '/api/v1/me', { token: 'pgk_' + 'A'.repeat(43) })).status === 401, 'made-up key → 401')
    ok((await call('GET', '/api/v1/me', { token: orbitLogin })).status === 401, "the client's website login does not work as a key")
    const me = await call('GET', '/api/v1/me', { token: KEY })
    ok(me.status === 200 && me.json.client.name === orbit.full_name && !('id' in me.json.client) && !JSON.stringify(me.json).includes('@'), '/me: only the client name, no id or email')

    // ── direct upload, own client only ──────────────────────────────────
    console.log('— direct upload')
    ok((await call('POST', '/api/v1/uploads', { token: KEY, body: { file_name: 'notes.pdf', file_size: 10 } })).json?.code === 'not_a_video', 'non-video name refused')
    ok((await call('POST', '/api/v1/uploads', { token: KEY, body: { file_name: 'a.mp4' } })).status === 400, 'missing size refused')
    ok((await call('POST', '/api/v1/uploads', { token: KEY, body: { file_name: 'a.mp4', file_size: 101 * 1024 ** 3 } })).json?.code === 'file_too_large', 'over 100 GB refused')
    const bytes = videoBytes(40)
    // Start, send pieces with a dropped connection on piece 2, then retry it.
    const st = await call('POST', '/api/v1/uploads', { token: KEY, body: { file_name: 'Drop test.mp4', file_size: bytes.length, title: 'API direct', instructions: 'Cut it tight', client_id: nova.id } })
    ok(st.status === 201 && st.json.upload.part_count === 3 && st.json.parts.length === 3, 'start: 40 MB in 3 pieces of 16 MB')
    const up = st.json.upload; const etags = []
    for (const p of st.json.parts) {
      const from = (p.part_number - 1) * up.part_size; const slice = bytes.subarray(from, Math.min(from + up.part_size, bytes.length))
      if (p.part_number === 2) {
        const ac = new AbortController(); setTimeout(() => ac.abort(), 5)
        const half = fetch(absolute(p.url), { method: 'PUT', body: slice, signal: ac.signal }).then(() => 'sent').catch(() => 'dropped')
        console.log('     piece 2 first try:', await half)
      }
      const r = await fetch(absolute(p.url), { method: 'PUT', body: slice })
      etags.push({ part_number: p.part_number, etag: r.headers.get('etag') })
    }
    const fresh = await call('POST', `/api/v1/uploads/${up.id}/parts`, { token: KEY, body: { part_numbers: [2] } })
    ok(fresh.status === 200 && fresh.json.parts[0].part_number === 2, 'fresh upload address for a piece')
    ok((await call('POST', `/api/v1/uploads/${up.id}/complete`, { token: KEY, body: { parts: etags.slice(0, 2) } })).json?.code === 'missing_parts', 'finishing with a piece missing is refused')
    ok((await call('POST', `/api/v1/uploads/${up.id}/complete`, { token: novaKey, body: { parts: etags } })).status === 404, "another client's key can't finish it")
    ok((await call('GET', `/api/v1/uploads/${up.id}`, { token: novaKey })).status === 404, "another client's key can't see it")
    const fin = await call('POST', `/api/v1/uploads/${up.id}/complete`, { token: KEY, body: { parts: etags } })
    const pid = fin.json?.upload?.project?.id
    ok(fin.status === 201 && fin.json.upload.status === 'done' && !!pid, 'finish → project created')
    const [proj] = sql('select client_id, title, instructions, status from projects where id = ?', pid)
    ok(proj.client_id === orbit.id, 'project belongs to the key\'s client (client_id in the request was ignored)')
    ok(proj.title === 'API direct' && proj.instructions === 'Cut it tight' && proj.status === 'pending_assignment', 'project has the title and instructions, like a website upload')
    ok(sha(await storedBytesOf(pid, admin)) === sha(bytes), 'footage downloads byte for byte through the normal download link')
    const again = await call('POST', `/api/v1/uploads/${up.id}/complete`, { token: KEY, body: { parts: etags } })
    ok(again.status === 200 && again.json.upload.project.id === pid && sql('select count(*) n from projects where title = ?', 'API direct')[0].n === 1, 'finishing twice gives the same project, no duplicate')
    ok(sql("select count(*) n from notifications where project_id = ? and type = 'project_created'", pid)[0].n > 0, 'admins notified like a normal new video')
    // Storage refuses to join the pieces (here: a piece never sent; real R2
    // also refuses wrong piece codes): clear error, the upload stays open.
    const small = videoBytes(1)
    const s2 = await call('POST', '/api/v1/uploads', { token: KEY, body: { file_name: 'tiny.mov', file_size: small.length } })
    const bad = await call('POST', `/api/v1/uploads/${s2.json.upload.id}/complete`, { token: KEY, body: { parts: [{ part_number: 1, etag: '"nope"' }] } })
    ok(bad.status === 400 && bad.json?.code === 'parts_rejected' && (await call('GET', `/api/v1/uploads/${s2.json.upload.id}`, { token: KEY })).json.upload.status === 'uploading', 'storage refuses the pieces: clear error, upload stays open to retry')
    ok((await call('DELETE', `/api/v1/uploads/${s2.json.upload.id}`, { token: KEY })).json?.upload?.status === 'cancelled', 'cancel an unfinished upload')

    // ── link downloads ──────────────────────────────────────────────────
    console.log('— link downloads')
    const imp = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/direct.mp4`, title: 'From a link' } })
    if (imp.json?.upload?.error && /private/.test(imp.json.upload.error)) {
      console.log('     ! start the local app with UPLOAD_API_ALLOW_PRIVATE_LINKS=1 to run the link tests'); fails++
    } else {
      ok(imp.status === 201 && imp.json.upload.status === 'done', 'direct link (40 MB) → done')
      ok(sha(await storedBytesOf(imp.json.upload.project.id, admin)) === sha(FILES['/direct.mp4']), 'link file stored byte for byte')
      const red = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/redirect` } })
      ok(red.json?.upload?.status === 'done' && red.json.upload.file_name === 'direct.mp4', 'link that redirects → done, file name from the final link')
      const nr = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/norange.mov` } })
      ok(nr.json?.upload?.status === 'done' && sha(await storedBytesOf(nr.json.upload.project.id, admin)) === sha(FILES['/norange.mov']), 'server without resume support → done, byte for byte')
      const fl = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/flaky.mp4` } })
      console.log(`     dropped connection: first answer ${fl.json?.upload?.status}, ${Math.round((fl.json?.upload?.bytes_received ?? 0) / MiB)} MB saved`)
      const flDone = fl.json?.upload?.status === 'done' ? fl : await waitDone(KEY, fl.json.upload.id)
      ok(flDone.json?.upload?.status === 'done' && sha(await storedBytesOf(flDone.json.upload.project.id, admin)) === sha(FILES['/flaky.mp4']), 'connection dropped mid-download → resumed → done, byte for byte')
      const page = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/page.html` } })
      ok(page.json?.upload?.status === 'failed' && /web page/.test(page.json.upload.error), 'link to a web page (e.g. not shared publicly) → clear error')
      const zip = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/archive.zip` } })
      ok(zip.json?.upload?.status === 'failed' && /not point to a video/.test(zip.json.upload.error), 'link to a non-video file → refused')
      const nf = await call('POST', '/api/v1/imports', { token: KEY, body: { url: `${LINK}/missing.mp4` } })
      ok(nf.json?.upload?.status === 'failed' && /404/.test(nf.json.upload.error), 'link that does not exist → clear error')
      ok((await call('POST', '/api/v1/imports', { token: KEY, body: { url: 'file:///etc/passwd' } })).json?.code === 'invalid_link', 'non-web link refused')
      ok((await call('GET', `/api/v1/imports/${imp.json.upload.id}`, { token: novaKey })).status === 404, "another client's key can't see a link download")
    }
    const cron = await call('GET', '/api/v1/cron/imports')
    ok(cron.status === 200 && cron.json.ok, 'once-a-minute job runs')

    // ── turned off / disabled ───────────────────────────────────────────
    console.log('— turning keys off')
    sqlRun('update profiles set disabled = 1 where id = ?', nova.id)
    ok((await call('GET', '/api/v1/me', { token: novaKey })).status === 401, "a switched-off client's key stops working")
    sqlRun('update profiles set disabled = 0 where id = ?', nova.id)
    const novaKeyId = sql("select id from api_keys where client_id = ?", nova.id)[0].id
    ok((await call('POST', `/api/api-keys/${novaKeyId}/revoke`, { token: manager })).status === 403, 'manager cannot turn a key off')
    ok((await call('POST', `/api/api-keys/${novaKeyId}/revoke`, { token: admin })).status === 200, 'admin turns a key off')
    ok((await call('GET', '/api/v1/me', { token: novaKey })).status === 401, 'turned-off key → 401 immediately')

    // ── logging + rate limit ────────────────────────────────────────────
    console.log('— activity log and rate limit')
    const ev = sql('select action, status, ip from api_key_events where key_id = ? order by created_at', made.json.id)
    const acts = new Set(ev.map((e) => e.action))
    const missing = ['key_created', 'me', 'upload_start', 'upload_parts', 'upload_complete', 'upload_cancel', 'import_start', 'import_done', 'import_failed', 'status'].filter((a) => !acts.has(a))
    ok(missing.length === 0, `every action is logged (${ev.length} entries${missing.length ? '; missing: ' + missing.join(', ') : ''})`)
    const refusals = sql('select action, status from api_key_events where status >= 400')
    const noIp = ev.filter((e) => !['import_done', 'import_failed'].includes(e.action) && !e.ip).map((e) => e.action)
    ok(refusals.some((e) => e.status === 404) && refusals.some((e) => e.status === 400) && noIp.length === 0, `refusals are logged too (${refusals.length}), every call with the caller's address${noIp.length ? '; no address on: ' + noIp.join(', ') : ''}`)
    const shown = await call('GET', `/api/api-keys?clientId=${orbit.id}`, { token: admin })
    ok(shown.json.events.length > 0 && shown.json.keys[0].last_used_at, 'admin sees activity and "last used"')
    const rk = (await call('POST', '/api/api-keys', { token: admin, body: { clientId: orbit.id, name: 'Rate test' } })).json.key
    let codes = []
    for (let i = 0; i < 65; i++) codes.push(await call('GET', '/api/v1/me', { token: rk }))
    const first429 = codes.findIndex((r) => r.status === 429)
    ok(first429 === 60 && Number(codes[60].headers.get('retry-after')) > 0, `61st request in a minute → 429 with Retry-After (first 429 at #${first429 + 1})`)
    ok((await call('GET', '/api/v1/me', { token: KEY })).status === 200, 'the limit is per key (another key still works)')
  } catch (e) {
    console.log('FAIL crashed:', e); fails++
  } finally {
    files.close()
    snapshot('restore')
    // Remove this test's files from local storage (keys apiuploads/…).
    const R2 = path.join(DATA, 'r2'); let removed = 0
    for (const f of fs.readdirSync(R2).filter((n) => n.endsWith('.json'))) {
      try { if (JSON.parse(fs.readFileSync(path.join(R2, f))).key?.startsWith('apiuploads/')) { fs.rmSync(path.join(R2, f)); fs.rmSync(path.join(R2, f.slice(0, -5)), { force: true }); removed++ } } catch { /* not a meta file */ }
    }
    console.log(`(cleaned up ${removed} test files)`)
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
    process.exit(fails ? 1 : 0)
  }
})()
