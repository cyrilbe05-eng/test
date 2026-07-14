// Content-type repair for files whose stored mime_type is missing or useless.
//
// The browser's File.type is empty for plenty of real uploads (notably .mov
// and .mkv on Windows), and multipart R2 objects carry no content type of
// their own. Serving a video as application/octet-stream (or with an empty
// type) breaks playback on iOS Safari, which — unlike desktop browsers —
// refuses to sniff media types. This maps the filename extension to a real
// type so signed URLs can always assert one.

const EXTENSION_TYPES: Record<string, string> = {
  // video
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  // audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  // images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  // documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  srt: 'text/plain',
  zip: 'application/zip',
}

/** True when a stored mime type is unusable for serving. */
function isUnhelpful(mime: string | null | undefined): boolean {
  return !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream'
}

/** Best content type for a file: the stored one when meaningful, otherwise
 *  inferred from the filename extension, otherwise null (sign no override). */
export function inferMimeType(fileName: string, stored?: string | null): string | null {
  if (!isUnhelpful(stored)) return stored as string
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[ext] ?? (stored || null)
}

// Types that are truthful but that browsers REFUSE to play when explicitly
// declared on a <video> source. Chrome rejects video/quicktime outright —
// and unlike an octet-stream response, an asserted type disables sniffing,
// so declaring it breaks files that previously played. QuickTime (.mov) is
// the same ISO-BMFF container family as MP4: H.264/AAC .mov files play fine
// in Chrome AND Safari when labelled video/mp4. (A ProRes .mov won't decode
// in any browser regardless of label.)
const PLAYBACK_SUBSTITUTES: Record<string, string> = {
  'video/quicktime': 'video/mp4',
  'video/x-m4v': 'video/mp4',
}

/** Content type to sign for INLINE playback: the truthful type, substituted
 *  where the truthful label itself blocks browser playback. Downloads should
 *  keep the truthful type — this is only for streaming into a player. */
export function inferPlaybackMimeType(fileName: string, stored?: string | null): string | null {
  const truthful = inferMimeType(fileName, stored)
  if (!truthful) return null
  return PLAYBACK_SUBSTITUTES[truthful] ?? truthful
}
