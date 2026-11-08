import type { ServerResponse } from 'http'

export function ok(res: ServerResponse, data: unknown, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function err(res: ServerResponse, message: string, status = 400) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: message }))
}

export function handleError(res: ServerResponse, e: unknown) {
  const error = e as any
  const status = error?.status ?? 500
  const message = error?.message ?? 'Internal error'
  console.error(e)
  err(res, message, status)
}

export async function parseBody<T>(req: any): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}
