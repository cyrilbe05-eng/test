// Upload safety test: today's SINGLE VIDEO upload, end to end, in a real
// browser (Microsoft Edge). Run it before and after any change that could
// touch uploads; any FAIL = stop.
//
//   1. In one terminal:   npm run local:dev
//   2. In another:        npm run test:uploads
//
// Checks: normal upload · big file (in pieces) · resume after a connection
// drop · retry after refused pieces · keeps going while moving around the
// app. Each one checks the stored file is complete, byte for byte.
//
// Local only. It saves a copy of the local database first and puts it back
// at the end (even if something fails), so it leaves no test projects.
// Needs: the local app running, Microsoft Edge or Google Chrome, Python 3.
const { chromium } = require('playwright-core')
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const DATA = path.join(ROOT, '.local-data')
const DB = path.join(DATA, 'local.db').replace(/\\/g, '/')
const R2 = path.join(DATA, 'r2').replace(/\\/g, '/')
const SNAP = path.join(DATA, 'before-upload-safety.db').replace(/\\/g, '/')
const FILES = path.join(DATA, 'upload-safety-files')
const B = process.env.APP_URL || 'http://localhost:5173'
const CLIENT = { email: 'orbit@client.local', password: 'LocalTest123!' } // Pro plan: no video limit

let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const py = (code) => execFileSync('python', ['-c', code]).toString()
const snapshot = (dir) => py(`
import sqlite3
src, dst = ${JSON.stringify(dir === 'save' ? [DB, SNAP] : [SNAP, DB])}
a = sqlite3.connect(src); b = sqlite3.connect(dst); a.backup(b); b.close(); a.close()`)

// A file of `mb` megabytes with a recognisable, non-repeating pattern.
function makeFile(name, mb) {
  fs.mkdirSync(FILES, { recursive: true })
  const p = path.join(FILES, name)
  if (!fs.existsSync(p) || fs.statSync(p).size !== mb * 1024 * 1024) {
    const buf = Buffer.alloc(mb * 1024 * 1024)
    for (let i = 0; i < buf.length; i += 4) buf.writeUInt32LE((i * 2654435761) >>> 0, i)
    buf.write('ftypisom', 4) // looks like an mp4 to the browser
    fs.writeFileSync(p, buf)
  }
  return p
}
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')

// What the server stored for the project with this title (rows + stored bytes' hash).
const stored = (title) => JSON.parse(py(`
import sqlite3, json, glob, hashlib
c = sqlite3.connect(${JSON.stringify(DB)})
r = c.execute("select f.storage_key, f.file_size, f.file_type, p.status from project_files f join projects p on p.id=f.project_id where p.title=? order by f.created_at", (${JSON.stringify(title)},)).fetchall()
res = []
for key, size, ftype, status in r:
    h = None
    for m in glob.glob(${JSON.stringify(R2)} + '/*.json'):
        try:
            if json.load(open(m)).get('key') == key:
                h = hashlib.sha256(open(m[:-5], 'rb').read()).hexdigest(); break
        except Exception: pass
    res.append({'key': key, 'size': size, 'type': ftype, 'status': status, 'sha': h})
print(json.dumps(res))`))

async function session(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()) // not needed, slow to load
  const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('PAGEERROR', e.message); fails++ })
  await p.goto(B + '/login'); await p.fill('input[type=email]', CLIENT.email); await p.fill('input[type=password]', CLIENT.password)
  await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.includes('login')); await p.waitForTimeout(1500)
  return { ctx, p }
}
async function newVideo(p, title, file) {
  await p.goto(B + '/workspace/new'); await p.waitForTimeout(1200)
  await p.locator('main form input').first().fill(title)
  await p.locator('input[type=file][multiple]').setInputFiles(file)
  await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Send', exact: true }).click()
}
async function waitStored(title, file, ms = 180000) {
  const want = sha(file); const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const r = stored(title).filter((x) => x.type === 'source_video')
    if (r.length && r[0].sha === want) return r
    await new Promise((s) => setTimeout(s, 2000))
  }
  return stored(title)
}
const check = (r, file, label) => {
  const v = r.filter((x) => x.type === 'source_video')
  ok(v.length === 1 && v[0].sha === sha(file) && v[0].size === fs.statSync(file).size && v[0].status === 'pending_assignment',
    `${label}: one project, footage stored complete (${(fs.statSync(file).size / 1048576).toFixed(0)} MB, byte-for-byte)`)
}

async function run() {
  const small = makeFile('small.mp4', 3), big = makeFile('big.mp4', 40), big2 = makeFile('big2.mp4', 36), big3 = makeFile('big3.mp4', 34), big4 = makeFile('big4.mp4', 38)
  const stamp = Date.now().toString(36)
  // Microsoft Edge, or Google Chrome when Edge can't start (e.g. mid-update).
  let b
  for (const channel of ['msedge', 'chrome']) {
    try { b = await chromium.launch({ channel }); break } catch (e) { if (channel === 'chrome') throw e }
  }
  try {
    // 1. Normal upload
    { const { ctx, p } = await session(b); const t = `Guard small ${stamp}`
      await newVideo(p, t, small); await p.waitForURL(/\/workspace\/projects\//, { timeout: 30000 }).catch(() => {})
      ok(/\/workspace\/projects\//.test(p.url()), 'normal: Send opens the new project')
      check(await waitStored(t, small), small, 'normal upload'); await ctx.close() }

    // 2. Big file (resumable, in pieces)
    { const { ctx, p } = await session(b); const t = `Guard big ${stamp}`; const calls = []
      p.on('request', (r) => { if (r.url().includes('multipart/')) calls.push(new URL(r.url()).pathname.split('/').pop()) })
      await newVideo(p, t, big)
      check(await waitStored(t, big), big, 'big file')
      ok(calls.includes('create') && calls.includes('complete'), `big file went through the in-pieces upload (${[...new Set(calls)].join(', ')})`)
      await ctx.close() }

    // 3. Resume after interruption: the connection drops for 6 s mid-upload
    { const { ctx, p } = await session(b); const t = `Guard resume ${stamp}`
      let puts = 0; await p.route(/__local-r2/, async (r) => { if (r.request().method() === 'PUT') { puts++; await new Promise((s) => setTimeout(s, 250)) } await r.continue() })
      await newVideo(p, t, big2)
      const t0 = Date.now(); while (puts < 2 && Date.now() - t0 < 30000) await new Promise((s) => setTimeout(s, 100))
      await ctx.setOffline(true); await new Promise((s) => setTimeout(s, 6000)); await ctx.setOffline(false)
      check(await waitStored(t, big2), big2, 'resume after a 6 s connection drop'); await ctx.close() }

    // 4. Retry: storage answers 500 to the first 3 pieces
    { const { ctx, p } = await session(b); const t = `Guard retry ${stamp}`
      let refused = 0; await p.route(/__local-r2/, async (r) => { if (r.request().method() === 'PUT' && refused < 3) { refused++; await r.fulfill({ status: 500, body: 'boom' }); return } await r.continue() })
      await newVideo(p, t, big3)
      check(await waitStored(t, big3), big3, 'retry after 3 refused pieces')
      ok(refused === 3, 'the refusals really happened'); await ctx.close() }

    // 5. Keeps going while moving around the app
    { const { ctx, p } = await session(b); const t = `Guard moving ${stamp}`
      await p.route(/__local-r2/, async (r) => { if (r.request().method() === 'PUT') await new Promise((s) => setTimeout(s, 400)); await r.continue() })
      await newVideo(p, t, big4); await p.waitForTimeout(1500)
      for (const label of ['Messages', 'Calendar', 'Videos']) { await p.locator('nav').getByRole('link', { name: label }).first().click(); await p.waitForTimeout(1500) }
      ok(!p.url().includes('/workspace/new'), 'moved to other pages during the upload')
      check(await waitStored(t, big4), big4, 'upload kept going while moving around'); await ctx.close() }
  } finally {
    await b.close()
  }
}

;(async () => {
  try { await fetch(B + '/login') } catch {
    console.log(`The local app isn't running at ${B}. Start it first with:  npm run local:dev`); process.exit(2)
  }
  snapshot('save')
  try { await run() } catch (e) { console.log('FAIL the test itself crashed:', e.message); fails++ } finally { snapshot('restore') }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})()
