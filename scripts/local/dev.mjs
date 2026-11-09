// Run the whole app locally against the LOCAL test database.
//
//   npm run local:db    (once, or whenever you want fresh fake data)
//   npm run local:dev   → open http://localhost:5173
//
// Starts the real API code (api/[...slug].ts, bundled with esbuild exactly
// like the production build, rebuilt on every save) on port 3001, and the
// normal Vite site on 5173 with /api proxied to it.
//
// Safety: email is switched off (SMTP_* removed), and Cloudflare credentials
// are replaced with dummies — the API cannot reach production D1, R2 or mail.
// Uploaded files are kept in .local-data/r2 (api/_helpers/local-r2.ts).

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { context } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = path.join(ROOT, '.local-data')
const DB_FILE = path.join(DATA_DIR, 'local.db')
const BUNDLE = path.join(DATA_DIR, 'api-bundle.mjs')
const R2_DIR = path.join(DATA_DIR, 'r2')
const API_PORT = 3001

if (!fs.existsSync(DB_FILE)) {
  console.error('No local database yet. Run:  npm run local:db')
  process.exit(1)
}

// ── Environment: local only, production unreachable ─────────────────────────
for (const k of Object.keys(process.env)) {
  if (k.startsWith('SMTP_') || k.startsWith('CLOUDFLARE_') || k === 'CRON_SECRET') delete process.env[k]
}
Object.assign(process.env, {
  LOCAL_DB_FILE: DB_FILE,
  LOCAL_R2_DIR: R2_DIR,
  JWT_SECRET: 'local-development-secret-not-for-production',
  APP_ORIGIN: 'http://localhost:5173',
  CLOUDFLARE_ACCOUNT_ID: 'local-dummy',
  CLOUDFLARE_D1_DATABASE_ID: 'local-dummy',
  CLOUDFLARE_D1_TOKEN: 'local-dummy',
  CLOUDFLARE_R2_BUCKET_NAME: 'local-dummy',
  CLOUDFLARE_R2_ACCOUNT_ID: 'local-dummy',
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'local-dummy',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'local-dummy',
})

// ── API: bundle + hot reload ────────────────────────────────────────────────
let handler = null
let version = 0
const ctx = await context({
  entryPoints: [path.join(ROOT, 'api/[...slug].ts')],
  bundle: true, platform: 'node', target: 'node20', format: 'esm', outfile: BUNDLE, logLevel: 'warning',
  banner: { js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);` },
  plugins: [{
    name: 'reload',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return
        try {
          const mod = await import(`${pathToFileURL(BUNDLE).href}?v=${++version}`)
          handler = mod.default
          console.log(`[api] ready (build ${version})`)
        } catch (e) { console.error('[api] failed to load:', e) }
      })
    },
  }],
})
await ctx.watch()

/** Minimal stand-in for Vercel's request/response helpers. */
function adapt(req, res, rawBody) {
  const url = new URL(req.url, 'http://localhost')
  const query = {}
  for (const [k, v] of url.searchParams) query[k] = k in query ? [].concat(query[k], v) : v
  req.query = query
  const type = req.headers['content-type'] ?? ''
  if (!rawBody.length) req.body = null
  else if (type.includes('application/json')) { try { req.body = JSON.parse(rawBody.toString('utf8')) } catch { req.body = rawBody.toString('utf8') } }
  else req.body = rawBody.toString('utf8')

  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res }
  res.send = (body) => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body)
    res.end(body); return res
  }
}

// ── Local file storage (stand-in for R2's signed URLs) ─────────────────────
// Same layout as api/_helpers/local-r2.ts: <sha1(key)> + <sha1(key)>.json.
function localR2(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const op = url.pathname.slice('/api/__local-r2/'.length)
  const key = url.searchParams.get('key') ?? ''
  const file = path.join(R2_DIR, createHash('sha1').update(key).digest('hex'))
  fs.mkdirSync(R2_DIR, { recursive: true })

  if (req.method === 'PUT' && (op === 'put' || op === 'part')) {
    const target = op === 'put' ? file
      : path.join(R2_DIR, 'parts', (url.searchParams.get('uploadId') ?? '').replace(/[^a-zA-Z0-9-]/g, ''), String(Number(url.searchParams.get('partNumber'))))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const out = fs.createWriteStream(target)
    req.pipe(out)
    out.on('finish', () => {
      if (op === 'put') fs.writeFileSync(`${file}.json`, JSON.stringify({ key, contentType: req.headers['content-type'] || null }))
      res.writeHead(200, { ETag: `"${createHash('md5').update(target).digest('hex')}"`, 'Access-Control-Expose-Headers': 'ETag' })
      res.end()
    })
    return
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && op === 'get') {
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return }
    let stored = null
    try { stored = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8')).contentType } catch { /* none */ }
    const size = fs.statSync(file).size
    const name = url.searchParams.get('name')
    const headers = {
      'Content-Type': url.searchParams.get('type') || stored || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      ...(name ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } : {}),
    }
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (range && size > 0) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
      if (req.method === 'HEAD') { res.end(); return }
      fs.createReadStream(file, { start, end }).pipe(res)
      return
    }
    res.writeHead(200, { ...headers, 'Content-Length': size })
    if (req.method === 'HEAD') { res.end(); return }
    fs.createReadStream(file).pipe(res)
    return
  }
  res.writeHead(405); res.end()
}

http.createServer((req, res) => {
  if (req.url?.startsWith('/api/__local-r2/')) { localR2(req, res); return }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    adapt(req, res, Buffer.concat(chunks))
    if (!handler) { res.status(503).json({ error: 'API still building' }); return }
    try { await handler(req, res) } catch (e) {
      console.error(e)
      if (!res.headersSent) res.status(500).json({ error: String(e?.message ?? e) })
    }
  })
}).listen(API_PORT, () => console.log(`[api] http://localhost:${API_PORT}`))

// ── Web: the normal Vite dev server, /api proxied to the local API ──────────
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--config', 'vite.local.config.ts'], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_DEMO_MODE: 'false' },
})
const stop = () => { vite.kill(); ctx.dispose(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
