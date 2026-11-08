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

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { context } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = path.join(ROOT, '.local-data')
const DB_FILE = path.join(DATA_DIR, 'local.db')
const BUNDLE = path.join(DATA_DIR, 'api-bundle.mjs')
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

http.createServer((req, res) => {
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
