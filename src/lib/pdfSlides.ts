// PDF → one JPEG per page, in the browser (Mozilla's pdf.js, loaded only when
// a PDF is actually dropped). Used for carousel slides.

const MAX_PAGES = 30
const WIDTH = 1440

export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
export const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)

export async function pdfToImages(file: File): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const base = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n)
      const unscaled = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: WIDTH / unscaled.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
      if (blob) out.push(new File([blob], `${base} - ${String(n).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }))
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return out
}

/** Images stay as they are; each PDF becomes its pages. Order is kept. */
export async function toSlides(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    if (isPdf(f)) out.push(...(await pdfToImages(f)))
    else if (isImage(f)) out.push(f)
  }
  return out
}
