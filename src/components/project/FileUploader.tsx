import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStorageAdapter } from '@/lib/storage'
import { useUploadManager } from '@/lib/uploadManager'
import { cn } from '@/lib/utils'
import type { FileType } from '@/types'

const FILE_TYPE_LABEL: Record<FileType, string> = {
  source_video: 'Source video',
  deliverable: 'Deliverable',
  attachment: 'Supporting file',
}

interface Props {
  projectId: string
  fileType: FileType
  accept?: string
  maxSizeMb?: number
  onUploaded?: () => void
  disabled?: boolean
  /** Overrides the dropzone copy (defaults to a generic prompt). */
  label?: string
  /** Context line shown in the upload dock, e.g. the project title. */
  context?: string
}

/** Dropzone that hands files to the app-level upload queue.
 *
 *  Progress is NOT rendered here: uploads keep running when the user leaves
 *  the page, so the floating UploadDock owns all progress UI. This component
 *  is purely the drop target + file picker. */
export function FileUploader({ projectId, fileType, accept, maxSizeMb = 50000, onUploaded, disabled, label, context }: Props) {
  const storageAdapter = useStorageAdapter()
  const { enqueue } = useUploadManager()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    const picked = Array.from(files)
    const tooBig = picked.filter((f) => f.size > maxSizeMb * 1024 * 1024)
    tooBig.forEach((f) => toast.error(`${f.name} exceeds the ${maxSizeMb} MB limit`))
    const accepted = picked.filter((f) => f.size <= maxSizeMb * 1024 * 1024)
    if (accepted.length === 0) return

    enqueue(accepted.map((file) => ({
      file,
      label: context ? `${FILE_TYPE_LABEL[fileType]} · ${context}` : FILE_TYPE_LABEL[fileType],
      invalidate: [['project_files', projectId], ['projects']],
      run: async ({ onProgress, onConnectionState }) => {
        await storageAdapter.upload({ file, projectId, fileType, onProgress, onConnectionState })
        // Local refresh for the page that started it (no-op once unmounted —
        // the manager's invalidate keys cover the general case).
        try { onUploaded?.() } catch { /* page gone */ }
      },
    })))
    toast.success(accepted.length > 1 ? `${accepted.length} files added to the upload queue` : `${accepted[0].name} added to the upload queue`)
  }

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
        dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
        disabled && 'opacity-50 pointer-events-none',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />
      <div className="space-y-1.5">
        <div className={cn('mx-auto w-10 h-10 rounded-lg flex items-center justify-center transition-colors', dragging ? 'bg-primary/25' : 'bg-primary/10')}>
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        {dragging ? (
          <p className="text-sm text-primary font-semibold">Release to upload here</p>
        ) : (
          <p className="text-sm text-foreground font-medium">
            {label ?? 'Drop files here'} or <span className="text-primary">click to browse</span>
          </p>
        )}
        {!dragging && (
          <p className="text-xs text-muted-foreground">
            Several files at once is fine — they upload in the background.
          </p>
        )}
      </div>
    </div>
  )
}
