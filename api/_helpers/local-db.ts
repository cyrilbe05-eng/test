// LOCAL DEVELOPMENT ONLY — never loaded in production.
//
// db.ts imports this lazily, and only when LOCAL_DB_FILE is set. It runs the
// exact same SQL against a local SQLite file (Node's built-in node:sqlite, so
// nothing extra to install) and returns rows in the same shape the Cloudflare
// D1 REST API does, so every existing handler behaves as it would against D1.

let cached: { file: string; db: any } | null = null

async function open(file: string): Promise<any> {
  if (cached?.file === file) return cached.db
  // Non-literal specifier keeps esbuild from trying to bundle the builtin.
  const sqliteModule = 'node:sqlite'
  const { DatabaseSync } = await import(sqliteModule)
  const db = new DatabaseSync(file)
  // D1 enforces foreign keys; mirror that so local behaviour matches.
  db.exec('PRAGMA foreign_keys = ON')
  cached = { file, db }
  return db
}

/** Same value conversions D1 applies to JSON-bound parameters. */
function toSqlValue(v: unknown): unknown {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

export async function localQuery<T>(file: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await open(file)
  try {
    const stmt = db.prepare(sql)
    // Like D1's `results`, writes without RETURNING yield an empty array.
    return stmt.all(...params.map(toSqlValue)) as T[]
  } catch (e: any) {
    // Same message prefix as the D1 path so error handling matches.
    throw new Error(`D1 error: ${JSON.stringify([{ code: 7500, message: e?.message ?? String(e) }])}`)
  }
}
