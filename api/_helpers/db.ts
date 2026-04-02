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

  const json: D1Response<T> = await res.json()

  if (!json.success || json.errors?.length) {
    throw new Error(`D1 error: ${JSON.stringify(json.errors)}`)
  }

  return json.result[0]?.results ?? []
}

export async function dbExecute(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const results = await dbQuery<{ changes: number }>(sql, params)
  return { changes: (results[0] as any)?.changes ?? 0 }
}

// Convenience: run multiple statements in one request
export async function dbBatch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`

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
