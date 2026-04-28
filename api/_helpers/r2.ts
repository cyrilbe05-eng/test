import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!
const ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID!

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})

/** Generate a pre-signed URL for a browser to PUT a file directly to R2 (upload) */
export async function getPresignedUploadUrl(key: string, _mimeType: string, expiresIn = 3600): Promise<string> {
  // ContentType is intentionally omitted from the command so it is NOT included
  // in X-Amz-SignedHeaders. Including it requires R2's CORS policy to explicitly
  // allow the Content-Type header in AllowedHeaders, and causes browser preflight
  // failures on buckets without that CORS rule. The browser still sends
  // Content-Type freely; R2 stores whatever the client sends.
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

/** Generate a pre-signed URL for a browser to GET a file from R2 (download/stream) */
export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

/** Hard delete a file from R2 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// ── Multipart upload ────────────────────────────────────────────────────────
// Used for files larger than what a single PUT can reliably handle on flaky
// connections. R2's single-PUT ceiling is 5 GB; we route any file above
// MULTIPART_THRESHOLD through this path so that retries cost one part, not
// the whole file.

/** Start a multipart upload. Returns the uploadId R2 uses to tie parts together. */
export async function createMultipartUpload(key: string): Promise<string> {
  // ContentType is intentionally omitted (same reasoning as getPresignedUploadUrl).
  const out = await s3.send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key }))
  if (!out.UploadId) throw new Error('R2 did not return UploadId')
  return out.UploadId
}

/** Presign a single UploadPart URL. Each part gets its own signed PUT URL. */
export async function getPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })
  return getSignedUrl(s3, command, { expiresIn })
}

/** Finalize a multipart upload. R2 stitches the parts in partNumber order. */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  )
}

/** Abandon a multipart upload — frees the parts so they don't accrue storage. */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }))
}
