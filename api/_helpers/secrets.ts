// Fields that must never leave the server. The password hash is only used
// server-side (login compares it, change/reset password writes it); no page
// reads it. Several handlers fetch profiles with SELECT *, which picked it up
// and sent it to the browser — these helpers keep it out.

const SECRET_KEYS = new Set(['password_hash'])

/** A profile row without its password hash. */
export function publicProfile<T extends object>(row: T): Omit<T, 'password_hash'> {
  const { password_hash: _ph, ...rest } = row as T & { password_hash?: unknown }
  return rest
}

/** Copy of a JSON value with every secret field removed, at any depth.
 *  Safety net applied to every API response. */
export function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > 32 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, depth + 1))
  // Leave non-plain objects (Date, Buffer, …) to JSON.stringify as before.
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (!SECRET_KEYS.has(k)) out[k] = stripSecrets(v, depth + 1)
  }
  return out
}
