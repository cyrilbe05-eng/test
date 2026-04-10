import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useApiFetch } from '@/lib/api'
import {
  useGalleryFiles,
  useGalleryFolders,
  useCreateFolder,
  useDeleteFolder,
  useMoveFile,
  useDeleteGalleryFile,
} from '@/hooks/useGallery'
import type { GalleryFile, GalleryFolder } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GalleryProps {
  ownerId: string
  currentUserId: string
  showOwner?: boolean
  storageLimitMb?: number
  readOnly?: boolean
  canDownload?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function mimeBadgeClass(mime: string): string {
  if (mime.startsWith('image/')) return 'bg-violet-100 text-violet-700 border-violet-200'
  if (mime.startsWith('video/')) return 'bg-blue-100 text-blue-700 border-blue-200'
  if (mime === 'application/pdf') return 'bg-red-100 text-red-700 border-red-200'
  if (mime.includes('zip') || mime.includes('compressed')) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-muted text-muted-foreground border-border'
}

function mimeShortLabel(mime: string): string {
  if (mime.startsWith('image/')) return mime.split('/')[1].toUpperCase().slice(0, 4)
  if (mime.startsWith('video/')) return mime.split('/')[1].toUpperCase().slice(0, 4)
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('zip')) return 'ZIP'
  const parts = mime.split('/')
  return (parts[1] ?? parts[0]).toUpperCase().slice(0, 4)
}

// ─── Context-menu state ───────────────────────────────────────────────────────

interface ContextMenu {
  x: number
  y: number
  fileId: string
}

// ─── Move Modal ───────────────────────────────────────────────────────────────

function MoveModal({
  fileId,
  ownerId,
  folders,
  onClose,
}: {
  fileId: string
  ownerId: string
  folders: GalleryFolder[]
  onClose: () => void
}) {
  const moveFile = useMoveFile()

  const handleMove = async (folderId: string | null) => {
    try {
      await moveFile.mutateAsync({ id: fileId, folderId, ownerId })
      toast.success('File moved')
      onClose()
    } catch {
      toast.error('Failed to move file')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-heading font-semibold text-sm mb-4">Move to folder</h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => handleMove(null)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            Root
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => handleMove(f.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {f.name}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
  file,
  viewMode,
  canDownload,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDownload,
}: {
  file: GalleryFile
  viewMode: 'grid' | 'list'
  canDownload: boolean
  onContextMenu: (e: React.MouseEvent, fileId: string) => void
  onDragStart: (fileId: string) => void
  onDragEnd: () => void
  onDownload: (fileId: string, fileName: string) => void
}) {
  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')

  // We use a lazy signed URL query only when needed via thumbnail
  const apiFetch = useApiFetch()
  const { data: signedUrl } = useQuery({
    queryKey: ['gallery_signed_url', file.id],
    queryFn: () => apiFetch<{ url: string }>(`/api/gallery/${file.id}/signed-url`),
    staleTime: 1000 * 60 * 4,
    enabled: isImage || isVideo,
  })

  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
      setPlaying(false)
    } else {
      videoRef.current.play()
      setPlaying(true)
    }
  }

  if (viewMode === 'list') {
    return (
      <div
        draggable
        onDragStart={() => onDragStart(file.id)}
        onDragEnd={onDragEnd}
        onContextMenu={(e) => onContextMenu(e, file.id)}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing rounded-lg select-none"
      >
        <div className="w-8 h-8 flex-shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center relative">
          {isImage && signedUrl?.url ? (
            <img src={signedUrl.url} alt={file.file_name} className="w-full h-full object-cover" />
          ) : isVideo && signedUrl?.url ? (
            <>
              <video ref={videoRef} src={signedUrl.url} className="w-full h-full object-cover" muted preload="metadata" onEnded={() => setPlaying(false)} />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                  <svg className="w-2 h-2 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </>
          ) : (
            <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded border', mimeBadgeClass(file.mime_type))}>
              {mimeShortLabel(file.mime_type)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.file_name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</p>
        </div>
        {canDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.file_name) }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(file.id)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, file.id)}
      className="clay-card overflow-hidden cursor-grab active:cursor-grabbing select-none group"
    >
      <div className="aspect-video bg-muted/50 flex items-center justify-center overflow-hidden relative">
        {isImage && signedUrl?.url ? (
          <img src={signedUrl.url} alt={file.file_name} className="w-full h-full object-cover" />
        ) : isVideo && signedUrl?.url ? (
          <>
            <video
              ref={videoRef}
              src={signedUrl.url}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onEnded={() => setPlaying(false)}
            />
            {/* Play/pause overlay */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                {playing ? (
                  <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </button>
            {/* Video badge */}
            {!playing && (
              <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                VIDEO
              </span>
            )}
          </>
        ) : (
          <span className={cn('text-xs font-bold px-2 py-1 rounded-lg border', mimeBadgeClass(file.mime_type))}>
            {mimeShortLabel(file.mime_type)}
          </span>
        )}
      </div>
      <div className="p-3 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{file.file_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(file.file_size)}</p>
        </div>
        {canDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.file_name) }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Folder Card ──────────────────────────────────────────────────────────────

function FolderCard({
  folder,
  fileCount,
  viewMode,
  isDragOver,
  onNavigate,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folder: GalleryFolder
  fileCount: number
  viewMode: 'grid' | 'list'
  isDragOver: boolean
  onNavigate: (id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (folderId: string) => void
}) {
  if (viewMode === 'list') {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={() => onDrop(folder.id)}
        onClick={() => onNavigate(folder.id)}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors select-none',
          isDragOver ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-muted/40'
        )}
      >
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground">{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(folder.id)}
      onClick={() => onNavigate(folder.id)}
      className={cn(
        'clay-card p-4 cursor-pointer transition-all select-none',
        isDragOver ? 'bg-primary/10 ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
      )}
    >
      <svg className="w-8 h-8 text-amber-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
      <p className="text-sm font-medium truncate">{folder.name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
    </div>
  )
}

// ─── Main Gallery Component ───────────────────────────────────────────────────

export function Gallery({ ownerId, currentUserId: _currentUserId, storageLimitMb = -1, readOnly = false, canDownload = true }: GalleryProps) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([])

  // UI state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Drag state
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [moveModalFileId, setMoveModalFileId] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Data
  const { data: allFiles = [], isLoading: filesLoading } = useGalleryFiles(ownerId)
  const { data: allFolders = [], isLoading: foldersLoading } = useGalleryFolders(ownerId)

  const createFolder = useCreateFolder()
  const deleteFolder = useDeleteFolder()
  const moveFile = useMoveFile()
  const deleteFile = useDeleteGalleryFile()

  const isLoading = filesLoading || foldersLoading

  // Filter to current folder
  const currentFolders = allFolders.filter((f) => f.parent_id === currentFolderId)
  const currentFiles = allFiles.filter((f) => f.folder_id === currentFolderId)

  // Storage usage
  const totalBytes = allFiles.reduce((sum, f) => sum + f.file_size, 0)
  const totalMb = totalBytes / 1048576
  const usagePct = storageLimitMb > 0 ? Math.min(100, (totalMb / storageLimitMb) * 100) : 0
  const usageBarColor = usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-amber-400' : 'bg-primary'

  // ── Folder navigation ──
  const navigateInto = (folderId: string) => {
    const folder = allFolders.find((f) => f.id === folderId)
    if (!folder) return
    setCurrentFolderId(folderId)
    setFolderPath((prev) => [...prev, { id: folderId, name: folder.name }])
  }

  const navigateTo = (index: number) => {
    if (index === -1) {
      setCurrentFolderId(null)
      setFolderPath([])
    } else {
      const target = folderPath[index]
      setCurrentFolderId(target.id)
      setFolderPath((prev) => prev.slice(0, index + 1))
    }
  }

  // ── Create folder ──
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await createFolder.mutateAsync({ name, ownerId, parentId: currentFolderId })
      toast.success('Folder created')
    } catch {
      toast.error('Failed to create folder')
    }
    setCreatingFolder(false)
    setNewFolderName('')
  }

  // ── Drag & drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = async (targetFolderId: string) => {
    if (!draggingFileId) return
    setDragOverFolderId(null)
    try {
      await moveFile.mutateAsync({ id: draggingFileId, folderId: targetFolderId, ownerId })
      toast.success('File moved')
    } catch {
      toast.error('Failed to move file')
    }
    setDraggingFileId(null)
  }

  // ── Context menu ──
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, fileId })
  }

  const handleDeleteFile = async (fileId: string) => {
    setContextMenu(null)
    try {
      await deleteFile.mutateAsync({ id: fileId, ownerId })
      toast.success('File deleted')
    } catch {
      toast.error('Failed to delete file')
    }
  }

  const handleDeleteFolder = async (folder: GalleryFolder) => {
    if (!confirm(`Delete folder "${folder.name}"? Files inside will be moved to root.`)) return
    try {
      await deleteFolder.mutateAsync({ id: folder.id, ownerId })
      toast.success('Folder deleted')
    } catch {
      toast.error('Failed to delete folder')
    }
  }

  // ── Download ──
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/gallery/${fileId}/signed-url`)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('Failed to download file')
    }
  }

  // ── Upload ──
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    let successCount = 0
    for (const file of Array.from(files)) {
      try {
        // 1. Get presigned upload URL
        const { uploadUrl, storageKey } = await apiFetch<{ uploadUrl: string; storageKey: string }>(
          '/api/gallery/upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              folderId: currentFolderId,
              ownerId,
            }),
          }
        )
        // 2. PUT file directly to R2
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        // 3. Register in DB
        await apiFetch('/api/gallery/register', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            storageKey,
            folderId: currentFolderId,
            ownerId,
          }),
        })
        successCount++
      } catch {
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`)
      qc.invalidateQueries({ queryKey: ['gallery_files', ownerId] })
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Render ──
  return (
    <div className="flex flex-col h-full" onClick={() => setContextMenu(null)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm min-w-0">
          <button
            onClick={() => navigateTo(-1)}
            className={cn(
              'font-medium transition-colors hover:text-foreground',
              currentFolderId === null ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            All Files
          </button>
          {folderPath.map((seg, i) => (
            <span key={seg.id} className="flex items-center gap-1 min-w-0">
              <svg className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => navigateTo(i)}
                className={cn(
                  'font-medium truncate transition-colors hover:text-foreground',
                  i === folderPath.length - 1 ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {seg.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded-md transition-all', viewMode === 'grid' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              title="Grid view"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded-md transition-all', viewMode === 'list' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              title="List view"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Create folder */}
          {!readOnly && (
            <button
              onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9-1V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              New Folder
            </button>
          )}

          {/* Upload */}
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary text-white font-medium shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {uploading ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                )}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* New folder inline input */}
      {creatingFolder && (
        <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
            }}
            placeholder="Folder name"
            className="flex-1 bg-transparent text-sm outline-none border-b border-primary pb-0.5 placeholder:text-muted-foreground"
          />
          <button onClick={handleCreateFolder} className="text-xs text-primary font-medium hover:underline">Create</button>
          <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : currentFolders.length === 0 && currentFiles.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <svg className="w-8 h-8 text-muted-foreground mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-muted-foreground text-sm">
              {readOnly ? 'No files here yet.' : 'No files yet. Upload your first file to get started.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {currentFolders.map((folder) => (
              <div key={folder.id} className="group relative">
                <FolderCard
                  folder={folder}
                  fileCount={allFiles.filter((f) => f.folder_id === folder.id).length}
                  viewMode="grid"
                  isDragOver={dragOverFolderId === folder.id}
                  onNavigate={navigateInto}
                  onDragOver={(e) => { handleDragOver(e); setDragOverFolderId(folder.id) }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={handleDrop}
                />
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-card/80 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Delete folder"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {currentFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="grid"
                canDownload={canDownload}
                onContextMenu={handleContextMenu}
                onDragStart={setDraggingFileId}
                onDragEnd={() => setDraggingFileId(null)}
                onDownload={handleDownload}
              />
            ))}
          </div>
        ) : (
          <div className="clay-card overflow-hidden">
            {currentFolders.map((folder) => (
              <div key={folder.id} className="group relative flex items-center">
                <FolderCard
                  folder={folder}
                  fileCount={allFiles.filter((f) => f.folder_id === folder.id).length}
                  viewMode="list"
                  isDragOver={dragOverFolderId === folder.id}
                  onNavigate={navigateInto}
                  onDragOver={(e) => { handleDragOver(e); setDragOverFolderId(folder.id) }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={handleDrop}
                />
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    className="mr-4 w-5 h-5 rounded-full bg-card text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-shrink-0"
                    title="Delete folder"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {currentFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="list"
                canDownload={canDownload}
                onContextMenu={handleContextMenu}
                onDragStart={setDraggingFileId}
                onDragEnd={() => setDraggingFileId(null)}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>

      {/* Storage usage bar */}
      {storageLimitMb !== -1 && storageLimitMb > 0 && (
        <div className="px-6 py-3 border-t border-border bg-card/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Storage</span>
            <span>{formatBytes(totalBytes)} / {formatBytes(storageLimitMb * 1048576)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', usageBarColor)} style={{ width: usagePct + '%' }} />
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-xl py-1 w-44"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMoveModalFileId(contextMenu.fileId); setContextMenu(null) }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Move to folder
          </button>
          {canDownload && (() => {
            const file = currentFiles.find((f) => f.id === contextMenu.fileId)
            if (!file) return null
            return (
              <button
                onClick={() => { handleDownload(file.id, file.file_name); setContextMenu(null) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            )
          })()}
          {!readOnly && (
            <button
              onClick={() => handleDeleteFile(contextMenu.fileId)}
              className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}

      {/* Move modal */}
      {moveModalFileId && (
        <MoveModal
          fileId={moveModalFileId}
          ownerId={ownerId}
          folders={allFolders}
          onClose={() => setMoveModalFileId(null)}
        />
      )}
    </div>
  )
}
