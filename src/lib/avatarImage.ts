// Turns a chosen photo into a small square profile picture (centre crop),
// as a data URL the API accepts (api/_helpers/avatar.ts: ≤ 16 000 chars).

const SIZE = 128
const MAX_CHARS = 16_000

export async function makeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image')
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the image')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bmp.close()
  // WebP when the browser can make it (Safari falls back to PNG), else JPEG.
  for (const q of [0.82, 0.7, 0.55]) {
    let url = canvas.toDataURL('image/webp', q)
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= MAX_CHARS) return url
  }
  throw new Error('That image is too detailed — try another one')
}
