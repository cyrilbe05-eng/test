/**
 * In-browser video compression for review copies — no server, no deps.
 *
 * The deliverable plays once (silently, rerouted through WebAudio) into a
 * downscaled canvas while MediaRecorder re-encodes the result at a bitrate
 * a 2–5 Mbit/s client connection can actually stream. Encoding runs in real
 * time, so a 3-minute video takes ~3 minutes — still far cheaper than a
 * second export round-trip through the editing suite, and the upload that
 * follows is ~10× smaller than the original.
 */

const TARGET_HEIGHT = 720
const VIDEO_BITS_PER_SECOND = 3_000_000 // ~3 Mbit/s video
const AUDIO_BITS_PER_SECOND = 128_000
const FPS = 30

interface MimeChoice {
  mime: string
  ext: string
}

/** Prefer MP4/H.264 (plays everywhere incl. iOS); fall back to WebM. */
function pickMimeType(): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: MimeChoice[] = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
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
  source: File,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const picked = pickMimeType()
  if (!picked) throw new Error('This browser cannot compress video — upload a pre-compressed file instead')

  const url = URL.createObjectURL(source)
  const video = document.createElement('video')
  video.src = url
  video.playsInline = true
  video.preload = 'auto'

  let paint: ReturnType<typeof setInterval> | null = null
  let audioCtx: AudioContext | null = null
  let canvasStream: MediaStream | null = null

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not read this video file'))
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

    canvasStream = canvas.captureStream(FPS)
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
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

    // setInterval (not requestAnimationFrame): rAF halts completely in a
    // backgrounded tab; an interval keeps painting — throttled, but the
    // recording survives brief tab switches.
    paint = setInterval(() => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, w, h)
        onProgress?.(Math.min(99, Math.round((video.currentTime / duration) * 100)))
      }
    }, 1000 / FPS)

    recorder.start(1000)
    await audioCtx.resume().catch(() => {})
    try {
      await video.play()
    } catch {
      throw new Error('The browser blocked automatic playback — click again, or upload a pre-compressed file')
    }
    await new Promise<void>((resolve) => { video.onended = () => resolve() })
    ctx.drawImage(video, 0, 0, w, h) // make sure the final frame lands
    recorder.stop()
    const blob = await recorded

    if (blob.size === 0) throw new Error('Compression produced an empty file')
    onProgress?.(100)
    const base = source.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}_review.${picked.ext}`, { type: blob.type })
  } finally {
    if (paint) clearInterval(paint)
    canvasStream?.getTracks().forEach((t) => t.stop())
    audioCtx?.close().catch(() => {})
    URL.revokeObjectURL(url)
  }
}
