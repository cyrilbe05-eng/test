// Cloudflare D1 REST API client
// D1 native bindings only work inside Cloudflare Workers.
// From Vercel serverless functions, we use the REST API.

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!
const CF_D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID!
const CF_D1_TOKEN = process.env.CLOUDFLARE_D1_TOKEN!

interface D1QueryResult<T> {
  results: T[]
  success: boolean
  errors: { code: number; message: string }[]
}

interface D1Response<T> {
  result: D1QueryResult<T>[]
  success: boolean
  errors: { code: number; message: string }[]
}

export async function dbQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  // Local development only: when LOCAL_DB_FILE is set (never on Vercel), run
  // against a local SQLite copy instead of Cloudflare. See scripts/local/.
  if (process.env.LOCAL_DB_FILE) {
    const { localQuery } = await import('./local-db.js')
    return localQuery<T>(process.env.LOCAL_DB_FILE, sql, params)
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`D1 HTTP error ${res.status}: ${text}`)
  }

  const json = (await res.json()) as D1Response<T>

  if (!json.success || json.errors?.length) {
    throw new Error(`D1 error: ${JSON.stringify(json.errors)}`)
  }

  return json.result[0]?.results ?? []
}

export async function dbExecute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const results = await dbQuery<{ changes: number }>(sql, params)
  return { changes: (results[0] as any)?.changes ?? 0 }
}

// D1 rejects any statement with more than 100 bound parameters. An
// `IN (?, ?, …)` list built from earlier query results grows with the data, so
// it works for months and then fails outright once a user passes 100 rows
// (e.g. a copywriter's 101st calendar entry blanked her whole calendar).
const D1_MAX_BOUND_PARAMS = 100

/** Run `SELECT … WHERE col IN (${placeholders})` over any number of ids by
 *  slicing them under D1's parameter cap. The ids must be the statement's only
 *  bound parameters. Results are concatenated; order across slices is not kept. */
export async function dbQueryIn<T>(
  buildSql: (placeholders: string) => string,
  ids: readonly unknown[],
): Promise<T[]> {
  const slices: unknown[][] = []
  for (let i = 0; i < ids.length; i += D1_MAX_BOUND_PARAMS) {
    slices.push(ids.slice(i, i + D1_MAX_BOUND_PARAMS))
  }
  const results = await Promise.all(
    slices.map((slice) => dbQuery<T>(buildSql(slice.map(() => '?').join(',')), slice)),
  )
  return results.flat()
}

// Convenience: run multiple statements in one request
export async function dbBatch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
  // D1 REST API processes one statement per request; batch by calling sequentially
  for (const stmt of statements) {
    await dbQuery(stmt.sql, stmt.params ?? [])
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
