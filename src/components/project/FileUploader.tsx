import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStorageAdapter } from '@/lib/storage'
import { cn } from '@/lib/utils'
import type { FileType } from '@/types'

interface Props {
  projectId: string
  fileType: FileType
  accept?: string
  maxSizeMb?: number
  onUploaded?: () => void
  disabled?: boolean
}

export function FileUploader({ projectId, fileType, accept, maxSizeMb = 2000, onUploaded, disabled }: Props) {
  const storageAdapter = useStorageAdapter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const uploadFile = async (file: File) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`File exceeds ${maxSizeMb} MB limit`)
      return
    }
    setProgress(0)
    try {
      await storageAdapter.upload({
        file,
        projectId,
        fileType,
        onProgress: setProgress,
      })

      toast.success(`${file.name} uploaded`)
      onUploaded?.()
    } catch (err) {
      toast.error((err as Error).message ?? 'Upload failed')
    } finally {
      setProgress(null)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    Array.from(files).forEach(uploadFile)
  }

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
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
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="space-y-2">
        <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-sm text-foreground font-medium">
          Drop file{accept?.includes('video') ? 's' : ''} here or <span className="text-primary">click to browse</span>
        </p>
        {maxSizeMb && <p className="text-xs text-muted-foreground">Max {maxSizeMb} MB</p>}
      </div>

      {progress !== null && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted rounded-b-xl overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
