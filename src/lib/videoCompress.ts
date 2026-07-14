/**
 * In-browser video compression for review copies — no server, no deps.
 *
 * The source (a local file, or the already-uploaded deliverable streamed
 * straight from R2 via its signed URL) plays once — silently, rerouted
 * through WebAudio — into a downscaled canvas while MediaRecorder re-encodes
 * the result at a bitrate a 2–5 Mbit/s client connection can actually
 * stream. Encoding runs in real time (a 3-minute video takes ~3 minutes);
 * when the remote source buffers, the recorder pauses so stalls don't get
 * baked into the output.
 */

const TARGET_HEIGHT = 720
const VIDEO_BITS_PER_SECOND = 3_000_000 // ~3 Mbit/s video
const AUDIO_BITS_PER_SECOND = 128_000
const FPS = 30

export type CompressSource =
  | File
  | {
      /** Signed URL of the uploaded original (must be CORS-readable). */
      url: string
      /** Original filename — used to name the compressed output. */
      name: string
    }

interface MimeChoice {
  mime: string
  ext: string
}

/** MP4/H.264 ONLY. WebM output was originally a fallback, but review copies
 *  are watched by clients on iPhones — where WebM support is unreliable — so
 *  a WebM copy can render the review page unplayable. Browsers that cannot
 *  record MP4 simply don't offer compression (manual upload still works). */
function pickMimeType(): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: MimeChoice[] = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c
    } catch {
      // isTypeSupported throwing = treat as unsupported
    }
  }
  return null
}

/** Sanity-check that the produced file actually decodes as a video with a
 *  known finite duration. MediaRecorder output can be subtly broken (no
 *  duration metadata, dead audio track from a suspended AudioContext) — a
 *  copy that fails this probe must never reach clients. */
function probeDecodable(candidate: File): Promise<boolean> {
  const url = URL.createObjectURL(candidate)
  return new Promise<boolean>((resolve) => {
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    const timer = setTimeout(() => finish(false), 15_000)
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      probe.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(ok)
    }
    probe.onloadedmetadata = () => {
      finish(isFinite(probe.duration) && probe.duration > 0 && probe.videoWidth > 0)
    }
    probe.onerror = () => finish(false)
    probe.src = url
  })
}

export function canCompressInBrowser(): boolean {
  return (
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    pickMimeType() !== null
  )
}

/** Re-encode `source` to ≤720p at ~3 Mbit/s. Progress is 0–100 (encode phase).
 *  Throws with a human-readable message on any failure — callers fall back to
 *  letting the user upload a pre-compressed file. */
export async function compressVideoInBrowser(
  source: CompressSource,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const picked = pickMimeType()
  if (!picked) throw new Error('This browser cannot compress video — upload a pre-compressed file instead')

  const isLocalFile = source instanceof File
  const sourceName = isLocalFile ? source.name : source.name
  const objectUrl = isLocalFile ? URL.createObjectURL(source) : null

  const video = document.createElement('video')
  // Remote sources need CORS-clean frames, or drawImage taints the canvas and
  // the capture goes black. With crossOrigin set, a bucket whose CORS policy
  // lacks GET fails LOUDLY at load time instead — which we turn into a
  // actionable error message below.
  if (!isLocalFile) video.crossOrigin = 'anonymous'
  video.src = objectUrl ?? (source as { url: string }).url
  video.playsInline = true
  video.preload = 'auto'

  let paint: ReturnType<typeof setInterval> | null = null
  let audioCtx: AudioContext | null = null
  let canvasStream: MediaStream | null = null

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error(
        isLocalFile
          ? 'Could not read this video file'
          : 'Could not load the original from storage — the R2 bucket CORS policy must allow GET from this site. You can still pick a local file instead.',
      ))
    })

    const duration = video.duration
    if (!isFinite(duration) || duration <= 0) throw new Error('Could not determine the video duration')

    // Downscale to ≤720p, even dimensions (H.264 requirement).
    const scale = Math.min(1, TARGET_HEIGHT / (video.videoHeight || TARGET_HEIGHT))
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2)
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable in this browser')

    // Reroute audio through WebAudio: the user hears nothing, the recorder
    // gets a live track. (element.muted would silence the captured track too.)
    audioCtx = new AudioContext()
    const dest = audioCtx.createMediaStreamDestination()
    try {
      audioCtx.createMediaElementSource(video).connect(dest)
    } catch {
      // Source-less (no audio) videos still record fine with a silent track.
    }

    // If the AudioContext never reaches 'running' (autoplay policy without a
    // fresh user gesture), its destination track produces NO samples — and a
    // recorder waiting forever for audio data can emit a broken file. Record
    // video-only in that case rather than risk a corrupt copy.
    await audioCtx.resume().catch(() => {})
    const audioTracks = audioCtx.state === 'running' ? dest.stream.getAudioTracks() : []

    canvasStream = canvas.captureStream(FPS)
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks,
    ])

    const recorder = new MediaRecorder(stream, {
      mimeType: picked.mime,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: picked.mime.split(';')[0] }))
      recorder.onerror = () => reject(new Error('Compression failed while encoding'))
    })

    // A remote source stalls when the downlink can't keep up. Pause the
    // recorder during those gaps so frozen frames don't get encoded into
    // the review copy; resume when playback resumes.
    let recordingStarted = false
    video.addEventListener('playing', () => {
      if (!recordingStarted) {
        recordingStarted = true
        recorder.start(1000)
      } else if (recorder.state === 'paused') {
        recorder.resume()
      }
    })
    video.addEventListener('waiting', () => {
      if (recorder.state === 'recording') recorder.pause()
    })

    // setInterval (not requestAnimationFrame): rAF halts completely in a
    // backgrounded tab; an interval keeps painting — throttled, but the
    // recording survives brief tab switches.
    paint = setInterval(() => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, w, h)
        onProgress?.(Math.min(99, Math.round((video.currentTime / duration) * 100)))
      }
    }, 1000 / FPS)

    try {
      await video.play()
    } catch {
      throw new Error('The browser blocked automatic playback — click again, or upload a pre-compressed file')
    }
    await new Promise<void>((resolve) => { video.onended = () => resolve() })
    ctx.drawImage(video, 0, 0, w, h) // make sure the final frame lands
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await recorded

    if (blob.size === 0) throw new Error('Compression produced an empty file')
    const base = sourceName.replace(/\.[^.]+$/, '')
    const out = new File([blob], `${base}_review.${picked.ext}`, { type: blob.type })
    // Never ship a copy this browser can't even decode itself.
    if (!(await probeDecodable(out))) {
      throw new Error('Compression produced an unplayable file — clients will stream the original instead')
    }
    onProgress?.(100)
    return out
  } finally {
    if (paint) clearInterval(paint)
    canvasStream?.getTracks().forEach((t) => t.stop())
    audioCtx?.close().catch(() => {})
    video.removeAttribute('src')
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
