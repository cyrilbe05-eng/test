// LOCAL DEVELOPMENT ONLY — never loaded in production.
//
// r2.ts imports this lazily, and only when LOCAL_R2_DIR is set (set by
// scripts/local/dev.mjs, never on Vercel). Files live on disk instead of in
// Cloudflare R2. "Signed" URLs point at /api/__local-r2/..., which the local
// dev server (scripts/local/dev.mjs) answers with the same layout:
//   <dir>/<sha1(key)>        the bytes
//   <dir>/<sha1(key)>.json   { key, contentType }
//   <dir>/parts/<uploadId>/  multipart parts, joined on complete

import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const dir = () => process.env.LOCAL_R2_DIR!
const id = (key: string) => createHash('sha1').update(key).digest('hex')
const file = (key: string) => path.join(dir(), id(key))
const meta = (key: string) => `${file(key)}.json`
const partsDir = (uploadId: string) => path.join(dir(), 'parts', uploadId.replace(/[^a-zA-Z0-9-]/g, ''))

function writeMeta(key: string, contentType: string | null) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(meta(key), JSON.stringify({ key, contentType }))
}

const url = (op: string, params: Record<string, string | number | null | undefined>) =>
  `/api/__local-r2/${op}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]): [string, string] => [k, String(v)]))}`

export const getPresignedUploadUrl = async (key: string) => url('put', { key })

export const getPresignedDownloadUrl = async (key: string, _expiresIn?: number, downloadFileName?: string | null, contentType?: string | null) =>
  url('get', { key, name: downloadFileName, type: contentType })

export async function deleteObject(key: string) {
  fs.rmSync(file(key), { force: true })
  fs.rmSync(meta(key), { force: true })
}

export async function createMultipartUpload(key: string, contentType?: string | null) {
  const uploadId = randomUUID()
  fs.mkdirSync(partsDir(uploadId), { recursive: true })
  writeMeta(key, contentType || null)
  return uploadId
}

export async function headObject(key: string) {
  if (!fs.existsSync(file(key))) return null
  let contentType: string | null = null
  try { contentType = JSON.parse(fs.readFileSync(meta(key), 'utf8')).contentType ?? null } catch { /* no meta */ }
  return { contentType, size: fs.statSync(file(key)).size }
}

export async function replaceObjectContentType(key: string, contentType: string) {
  writeMeta(key, contentType)
}

export const getPresignedPartUrl = async (key: string, uploadId: string, partNumber: number) =>
  url('part', { key, uploadId, partNumber })

export async function completeMultipartUpload(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
  const out = fs.openSync(file(key), 'w')
  try {
    for (const p of parts.slice().sort((a, b) => a.partNumber - b.partNumber)) {
      fs.writeSync(out, fs.readFileSync(path.join(partsDir(uploadId), String(p.partNumber))))
    }
  } finally { fs.closeSync(out) }
  fs.rmSync(partsDir(uploadId), { recursive: true, force: true })
}

export async function abortMultipartUpload(_key: string, uploadId: string) {
  fs.rmSync(partsDir(uploadId), { recursive: true, force: true })
}
