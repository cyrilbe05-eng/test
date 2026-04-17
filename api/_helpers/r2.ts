import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'

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
