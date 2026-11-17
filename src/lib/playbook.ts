// The Playbook's name, in one place: change these two lines to rename it
// everywhere (menus, page titles, addresses).
export const PLAYBOOK_NAME = 'Playbook'
export const PLAYBOOK_PATH = 'playbook'

/** Does this video use HEVC (H.265, the iPhone "High Efficiency" format)?
 *  Some browsers (Windows, Android) can't play it. The codec is named in the
 *  file's metadata ("hvc1"/"hev1"), which sits at the start or — on iPhone
 *  recordings — the end of the file, so both ends are checked. */
export async function isHevcVideo(file: Blob, window = 4 * 1024 * 1024): Promise<boolean> {
  const parts = file.size <= window * 2 ? [file] : [file.slice(0, window), file.slice(file.size - window)]
  for (const part of parts) {
    const bytes = new Uint8Array(await part.arrayBuffer())
    for (let i = 0; i + 4 <= bytes.length; i++) {
      // 'h' 'v' 'c' '1'  or  'h' 'e' 'v' '1'
      if (bytes[i] === 0x68 && bytes[i + 3] === 0x31 && ((bytes[i + 1] === 0x76 && bytes[i + 2] === 0x63) || (bytes[i + 1] === 0x65 && bytes[i + 2] === 0x76))) return true
    }
  }
  return false
}

/** A still frame (JPEG) from a video file, about a second in — the default
 *  thumbnail. Null when this browser can't decode the video. */
export function grabFrame(file: Blob, atSeconds = 1): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let done = false
    const finish = (b: Blob | null) => { if (done) return; done = true; URL.revokeObjectURL(url); video.removeAttribute('src'); resolve(b) }
    const timer = window.setTimeout(() => finish(null), 15000)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadedmetadata = () => { video.currentTime = Math.min(atSeconds, Math.max(0, (video.duration || 0) / 2)) }
    video.onseeked = () => {
      const w = Math.min(960, video.videoWidth || 0)
      if (!w) { window.clearTimeout(timer); finish(null); return }
      const h = Math.round((video.videoHeight / video.videoWidth) * w)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
      canvas.toBlob((b) => { window.clearTimeout(timer); finish(b) }, 'image/jpeg', 0.82)
    }
    video.onerror = () => { window.clearTimeout(timer); finish(null) }
    video.src = url
  })
}
