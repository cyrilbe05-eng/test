import { useState, useRef, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  _galleryStore, _galleryFoldersStore,
  createGalleryFolder, renameGalleryFolder, deleteGalleryFolder, moveFileToFolder,
  MOCK_PLANS, _profilesStore, pushNotification,
  type GalleryFile, type GalleryFolder,
} from '../mockData'
import { triggerNotificationUpdate } from '../useDemoNotifications'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconGrid() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}
function IconList() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}
function IconFolder({ open = false, className = '' }: { open?: boolean; className?: string }) {
  return open ? (
    <svg className={cn('w-5 h-5', className)} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v1H2V6zm0 4h20l-2 10H4L2 10z" />
    </svg>
  ) : (
    <svg className={cn('w-5 h-5', className)} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}
function IconUpload() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
function IconTrash() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
function IconPencil() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
    </svg>
  )
}
function IconMove() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  )
}
function IconX() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconDownload() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}
function IconUser() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function mimeLabel(mime: string): string {
  if (mime === 'video/mp4') return 'MP4'
  if (mime === 'video/quicktime') return 'MOV'
  if (mime.startsWith('video/')) return 'VIDEO'
  if (mime === 'image/jpeg') return 'JPG'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/gif') return 'GIF'
  if (mime === 'image/webp') return 'WEBP'
  if (mime.startsWith('image/')) return 'IMG'
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'application/zip') return 'ZIP'
  if (mime.startsWith('audio/')) return 'AUDIO'
  return 'FILE'
}

function fileBgColor(mime: string): string {
  if (mime.startsWith('video/')) return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
  if (mime.startsWith('image/')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (mime === 'application/pdf') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (mime === 'application/zip') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (mime.startsWith('audio/')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  return 'bg-muted text-muted-foreground'
}

// For image files — show actual thumbnail using object-URL if a File object is known
// In demo mode we don't have real files; we render a colored placeholder with mime badge
function FileThumbnail({ file, size = 'md' }: { file: GalleryFile; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-32' : size === 'md' ? 'h-24' : 'h-14'
  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')

  if (isImage || isVideo) {
    return (
      <div className={cn('w-full rounded-lg overflow-hidden flex items-center justify-center relative', dim, fileBgColor(file.mime_type))}>
        {isVideo && (
          <svg className="w-8 h-8 opacity-60" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        {isImage && (
          <svg className="w-8 h-8 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
        <span className="absolute bottom-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded bg-black/30 text-white">{mimeLabel(file.mime_type)}</span>
      </div>
    )
  }

  return (
    <div className={cn('w-full rounded-lg flex items-center justify-center font-bold text-sm tracking-wide', dim, fileBgColor(file.mime_type))}>
      {mimeLabel(file.mime_type)}
    </div>
  )
}

// ── Move-to-folder modal ───────────────────────────────────────────────────────
function MoveModal({
  file,
  folders,
  onMove,
  onClose,
}: {
  file: GalleryFile
  folders: GalleryFolder[]
  onMove: (folderId: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-sm">Move "{file.file_name}"</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><IconX /></button>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => onMove(null)}
            className={cn('w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm transition-colors', file.folder_id === null && 'bg-primary/10 text-primary font-medium')}
          >
            <IconFolder className="text-amber-500" />
            Root (no folder)
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => onMove(f.id)}
              className={cn('w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm transition-colors', file.folder_id === f.id && 'bg-primary/10 text-primary font-medium')}
            >
              <IconFolder className="text-amber-500" />
              {f.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Context menu (right-click / ⋮ menu) ───────────────────────────────────────
function ContextMenu({
  x, y,
  items,
  onClose,
}: {
  x: number; y: number
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[]
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[160px] bg-card border border-border rounded-xl shadow-2xl py-1 animate-scale-in"
        style={{ left: x, top: y }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            className={cn('w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors', item.danger && 'text-red-500 hover:text-red-500')}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────
export interface DemoGalleryProps {
  /** If null: show ALL files (admin/team view). If set: show only this user's files (client view). */
  filterOwnerId: string | null
  /** The currently logged-in user id — used for upload ownership + storage limit checks */
  currentUserId: string
  /** If true, show owner badges on files/folders (admin/team view) */
  showOwner?: boolean
  /** Storage limit check owner id (for client: their own id; for team/admin: null = no limit) */
  storageLimitOwnerId?: string | null
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DemoGallery({ filterOwnerId, currentUserId, showOwner = false, storageLimitOwnerId = null }: DemoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<GalleryFile | null>(null)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFolderMode, setNewFolderMode] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder'; id: string } | null>(null)
  const [, forceRender] = useState(0)
  const refresh = useCallback(() => forceRender((n) => n + 1), [])

  // ── Derived data ──────────────────────────────────────────────────────────────
  const allFiles: GalleryFile[] = filterOwnerId
    ? _galleryStore.filter((f) => f.owner_id === filterOwnerId)
    : _galleryStore

  const allFolders: GalleryFolder[] = filterOwnerId
    ? _galleryFoldersStore.filter((f) => f.owner_id === filterOwnerId)
    : _galleryFoldersStore

  // Breadcrumb path
  function getFolderPath(folderId: string | null): GalleryFolder[] {
    if (!folderId) return []
    const folder = allFolders.find((f) => f.id === folderId)
    if (!folder) return []
    return [...getFolderPath(folder.parent_id), folder]
  }
  const breadcrumb = getFolderPath(currentFolderId)

  // Items in current folder
  const folders = allFolders.filter((f) => f.parent_id === currentFolderId)
  const files = allFiles.filter((f) => f.folder_id === currentFolderId)

  // Owner name helper
  function ownerName(ownerId: string) {
    return _profilesStore.find((p) => p.id === ownerId)?.full_name?.split(' ')[0] ?? '?'
  }

  // ── Storage limit check ───────────────────────────────────────────────────────
  function checkStorageLimit(incomingSize: number): boolean {
    if (!storageLimitOwnerId) return true
    const userProfile = _profilesStore.find((u) => u.id === storageLimitOwnerId)
    const plan = MOCK_PLANS.find((p) => p.id === userProfile?.plan_id)
    if (!plan || plan.storage_limit_mb === -1) return true
    const limitBytes = plan.storage_limit_mb * 1024 * 1024
    const currentUsed = _galleryStore.filter((f) => f.owner_id === storageLimitOwnerId).reduce((s, f) => s + f.file_size, 0)
    if (currentUsed + incomingSize > limitBytes) {
      const limitLabel = plan.storage_limit_mb >= 1024 ? `${plan.storage_limit_mb / 1024} GB` : `${plan.storage_limit_mb} MB`
      pushNotification({ recipient_id: currentUserId, project_id: null as unknown as string, type: 'project_created', message: `Storage limit reached on your ${plan.name} plan (${limitLabel}).` })
      triggerNotificationUpdate()
      toast.error(`Storage limit reached (${limitLabel} on ${plan.name} plan)`, { duration: 6000 })
      return false
    }
    return true
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const totalIncoming = Array.from(incoming).reduce((s, f) => s + f.size, 0)
    if (!checkStorageLimit(totalIncoming)) return
    const newFiles: GalleryFile[] = Array.from(incoming).map((f) => {
      const gf: GalleryFile = {
        id: `gal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        owner_id: currentUserId,
        folder_id: currentFolderId,
        file_name: f.name,
        file_size: f.size,
        mime_type: f.type || 'application/octet-stream',
        storage_key: `gallery/${currentUserId}/${f.name}`,
        created_at: new Date().toISOString(),
      }
      _galleryStore.push(gf)
      return gf
    })
    refresh()
    toast.success(`${newFiles.length} file${newFiles.length > 1 ? 's' : ''} uploaded`)
  }

  // ── File delete ───────────────────────────────────────────────────────────────
  function handleDeleteFile(id: string) {
    const idx = _galleryStore.findIndex((f) => f.id === id)
    if (idx !== -1) _galleryStore.splice(idx, 1)
    refresh()
    toast.success('File deleted')
  }

  // ── File download ─────────────────────────────────────────────────────────────
  function handleDownloadFile(id: string) {
    const file = _galleryStore.find((f) => f.id === id)
    toast.success(`Downloading "${file?.file_name ?? 'file'}"… (demo)`)
  }

  // ── Folder actions ────────────────────────────────────────────────────────────
  function handleCreateFolder() {
    if (!newFolderName.trim()) return
    createGalleryFolder(currentUserId, newFolderName.trim(), currentFolderId)
    setNewFolderName('')
    setNewFolderMode(false)
    refresh()
    toast.success(`Folder "${newFolderName.trim()}" created`)
  }

  function handleRenameFolder(folderId: string) {
    if (!renameValue.trim()) return
    renameGalleryFolder(folderId, renameValue.trim())
    setRenamingFolderId(null)
    refresh()
  }

  function handleDeleteFolder(folderId: string) {
    const folder = allFolders.find((f) => f.id === folderId)
    deleteGalleryFolder(folderId)
    if (currentFolderId === folderId) setCurrentFolderId(null)
    refresh()
    toast.success(`Folder "${folder?.name}" deleted`)
  }

  // ── Move file ──────────────────────────────────────────────────────────────────
  function handleMoveFile(folderId: string | null) {
    if (!moveTarget) return
    moveFileToFolder(moveTarget.id, folderId)
    setMoveTarget(null)
    refresh()
    const dest = folderId ? allFolders.find((f) => f.id === folderId)?.name : 'root'
    toast.success(`Moved to ${dest}`)
  }

  // ── Drag-and-drop between folders ────────────────────────────────────────────
  function onFileDragStart(fileId: string) {
    setDraggingFileId(fileId)
  }
  function onFolderDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault()
    if (draggingFileId) {
      moveFileToFolder(draggingFileId, folderId)
      setDraggingFileId(null)
      refresh()
      const dest = folderId ? allFolders.find((f) => f.id === folderId)?.name : 'root'
      toast.success(`Moved to ${dest}`)
    } else {
      // File upload drop
      addFiles(e.dataTransfer.files)
    }
    setDraggingOver(false)
  }

  // ── Context menu triggers ─────────────────────────────────────────────────────
  function openContextMenu(e: React.MouseEvent, type: 'file' | 'folder', id: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, type, id })
  }

  const ctxFile = contextMenu?.type === 'file' ? _galleryStore.find((f) => f.id === contextMenu.id) : null
  const ctxFolder = contextMenu?.type === 'folder' ? allFolders.find((f) => f.id === contextMenu.id) : null

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totalFiles = allFiles.length
  const totalSize = allFiles.reduce((s, f) => s + f.file_size, 0)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={cn('px-2 py-1 rounded-md transition-colors hover:bg-muted truncate', currentFolderId === null ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            All Files
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1 min-w-0">
              <IconChevronRight />
              <button
                onClick={() => setCurrentFolderId(f.id)}
                className={cn('px-2 py-1 rounded-md transition-colors hover:bg-muted truncate', currentFolderId === f.id ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Stats */}
        <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">{totalFiles} files · {formatBytes(totalSize)}</span>

        {/* View toggle */}
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          <button onClick={() => setView('grid')} className={cn('p-1.5 rounded-md transition-colors', view === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} title="Grid view">
            <IconGrid />
          </button>
          <button onClick={() => setView('list')} className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')} title="List view">
            <IconList />
          </button>
        </div>

        {/* New folder */}
        <button
          onClick={() => { setNewFolderMode(true); setNewFolderName('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <IconPlus /><span className="hidden sm:block">New Folder</span>
        </button>

        {/* Upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium shadow-sm hover:brightness-110 transition-all active:scale-[0.98]"
        >
          <IconUpload /><span className="hidden sm:block">Upload</span>
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </div>

      {/* New Folder input */}
      {newFolderMode && (
        <div className="flex items-center gap-2 mb-4 animate-slide-up">
          <IconFolder className="text-amber-500 flex-shrink-0" />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setNewFolderMode(false) }}
            placeholder="Folder name"
            className="flex-1 px-3 py-1.5 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button onClick={handleCreateFolder} className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Create</button>
          <button onClick={() => setNewFolderMode(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><IconX /></button>
        </div>
      )}

      {/* Drop zone / content */}
      <div
        className={cn('flex-1 min-h-0 rounded-2xl transition-all', draggingOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5')}
        onDragOver={(e) => { e.preventDefault(); setDraggingOver(true) }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={(e) => { e.preventDefault(); onFolderDrop(e, currentFolderId) }}
      >
        {folders.length === 0 && files.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <IconUpload />
            </div>
            <div className="text-center">
              <p className="font-medium">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground mt-1">You can also drag files onto folders below</p>
            </div>
          </div>
        ) : view === 'grid' ? (
          <GridView
            folders={folders}
            files={files}
            showOwner={showOwner}
            ownerName={ownerName}
            renamingFolderId={renamingFolderId}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onConfirmRename={handleRenameFolder}
            onStartRename={(id, name) => { setRenamingFolderId(id); setRenameValue(name) }}
            onCancelRename={() => setRenamingFolderId(null)}
            onFolderOpen={setCurrentFolderId}
            onFolderDelete={handleDeleteFolder}
            onFolderDrop={onFolderDrop}
            draggingFileId={draggingFileId}
            onFileDragStart={onFileDragStart}
            onFileDragEnd={() => setDraggingFileId(null)}
            onFileDelete={handleDeleteFile}
            onFileDownload={handleDownloadFile}
            onFileMoveOpen={setMoveTarget}
            onContextMenu={openContextMenu}
            allFiles={allFiles}
            currentUserId={currentUserId}
            onUpload={() => fileInputRef.current?.click()}
          />
        ) : (
          <ListView
            folders={folders}
            files={files}
            showOwner={showOwner}
            ownerName={ownerName}
            renamingFolderId={renamingFolderId}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onConfirmRename={handleRenameFolder}
            onStartRename={(id, name) => { setRenamingFolderId(id); setRenameValue(name) }}
            onCancelRename={() => setRenamingFolderId(null)}
            onFolderOpen={setCurrentFolderId}
            onFolderDelete={handleDeleteFolder}
            onFolderDrop={onFolderDrop}
            draggingFileId={draggingFileId}
            onFileDragStart={onFileDragStart}
            onFileDragEnd={() => setDraggingFileId(null)}
            onFileDelete={handleDeleteFile}
            onFileDownload={handleDownloadFile}
            onFileMoveOpen={setMoveTarget}
            onContextMenu={openContextMenu}
            allFiles={allFiles}
          />
        )}
      </div>

      {/* Move modal */}
      {moveTarget && (
        <MoveModal
          file={moveTarget}
          folders={filterOwnerId ? allFolders : allFolders}
          onMove={handleMoveFile}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.type === 'file' && ctxFile ? [
              { label: 'Move to folder', icon: <IconMove />, onClick: () => setMoveTarget(ctxFile) },
              { label: 'Download', icon: <IconDownload />, onClick: () => handleDownloadFile(ctxFile.id) },
              { label: 'Delete', icon: <IconTrash />, onClick: () => handleDeleteFile(ctxFile.id), danger: true },
            ] : contextMenu.type === 'folder' && ctxFolder ? [
              { label: 'Rename', icon: <IconPencil />, onClick: () => { setRenamingFolderId(ctxFolder.id); setRenameValue(ctxFolder.name) } },
              { label: 'Delete folder', icon: <IconTrash />, onClick: () => handleDeleteFolder(ctxFolder.id), danger: true },
            ] : []
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// ── Shared sub-view props ─────────────────────────────────────────────────────
interface ViewProps {
  folders: GalleryFolder[]
  files: GalleryFile[]
  showOwner: boolean
  ownerName: (id: string) => string
  renamingFolderId: string | null
  renameValue: string
  onRenameValueChange: (v: string) => void
  onConfirmRename: (id: string) => void
  onStartRename: (id: string, name: string) => void
  onCancelRename: () => void
  onFolderOpen: (id: string) => void
  onFolderDelete: (id: string) => void
  onFolderDrop: (e: React.DragEvent, folderId: string | null) => void
  draggingFileId: string | null
  onFileDragStart: (id: string) => void
  onFileDragEnd: () => void
  onFileDelete: (id: string) => void
  onFileDownload: (id: string) => void
  onFileMoveOpen: (file: GalleryFile) => void
  onContextMenu: (e: React.MouseEvent, type: 'file' | 'folder', id: string) => void
  allFiles: GalleryFile[]
  currentUserId?: string
  onUpload?: () => void
}

// ── Grid View ──────────────────────────────────────────────────────────────────
function GridView({
  folders, files, showOwner, ownerName,
  renamingFolderId, renameValue, onRenameValueChange, onConfirmRename, onStartRename, onCancelRename,
  onFolderOpen, onFolderDelete,
  onFolderDrop, draggingFileId: _draggingFileId,
  onFileDragStart, onFileDragEnd, onFileDelete, onFileDownload, onFileMoveOpen, onContextMenu,
  allFiles, onUpload,
}: ViewProps) {
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null)

  return (
    <div className="space-y-4">
      {/* Folders */}
      {folders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Folders</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {folders.map((folder) => {
              const count = allFiles.filter((f) => f.folder_id === folder.id).length
              const isRenaming = renamingFolderId === folder.id
              const isDropTarget = dropTarget === folder.id
              return (
                <div
                  key={folder.id}
                  className={cn(
                    'group relative border rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-amber-400/60 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all bg-card',
                    isDropTarget && 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-900/20',
                  )}
                  onDoubleClick={() => !isRenaming && onFolderOpen(folder.id)}
                  onContextMenu={(e) => openCtx(e, folder.id)}
                  onDragOver={(e) => { e.preventDefault(); setDropTarget(folder.id) }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => { setDropTarget(null); onFolderDrop(e, folder.id) }}
                >
                  <IconFolder open={isDropTarget} className="text-amber-400 w-8 h-8" />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => onRenameValueChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onConfirmRename(folder.id); if (e.key === 'Escape') onCancelRename() }}
                      onBlur={() => onConfirmRename(folder.id)}
                      className="text-xs w-full border-b border-primary bg-transparent focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-xs font-medium truncate">{folder.name}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">{count} file{count !== 1 ? 's' : ''}</p>
                  {showOwner && (
                    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground"><IconUser />{ownerName(folder.owner_id)}</span>
                  )}
                  {/* Hover actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onStartRename(folder.id, folder.name) }} className="p-1 rounded-md hover:bg-muted/80 text-muted-foreground" title="Rename"><IconPencil /></button>
                    <button onClick={(e) => { e.stopPropagation(); onFolderDelete(folder.id) }} className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500" title="Delete folder"><IconTrash /></button>
                  </div>
                </div>
              )

              function openCtx(e: React.MouseEvent, id: string) {
                e.preventDefault()
                onContextMenu(e, 'folder', id)
              }
            })}
          </div>
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div>
          {folders.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Files</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* Upload tile */}
            {onUpload && (
              <button
                onClick={onUpload}
                className="border-2 border-dashed border-border rounded-xl p-3 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground aspect-square"
              >
                <IconPlus />
                <span className="text-xs">Add files</span>
              </button>
            )}
            {files.map((file) => (
              <div
                key={file.id}
                className="group relative border rounded-xl p-3 flex flex-col gap-2 bg-card hover:border-primary/40 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing animate-scale-in"
                draggable
                onDragStart={() => onFileDragStart(file.id)}
                onDragEnd={onFileDragEnd}
                onContextMenu={(e) => onContextMenu(e, 'file', file.id)}
              >
                <FileThumbnail file={file} size="md" />
                <p className="text-xs font-medium truncate" title={file.file_name}>{file.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(file.file_size)}</p>
                {showOwner && (
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground"><IconUser />{ownerName(file.owner_id)}</span>
                )}
                {/* Hover actions */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={() => onFileDownload(file.id)} className="p-1 rounded-md bg-card hover:bg-muted text-muted-foreground" title="Download"><IconDownload /></button>
                  <button onClick={() => onFileMoveOpen(file)} className="p-1 rounded-md bg-card hover:bg-muted text-muted-foreground" title="Move"><IconMove /></button>
                  <button onClick={() => onFileDelete(file.id)} className="p-1 rounded-md bg-card hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500" title="Delete"><IconTrash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && folders.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No files in this location — drag files here or upload above.</p>
      )}
    </div>
  )
}

// ── List View ──────────────────────────────────────────────────────────────────
function ListView({
  folders, files, showOwner, ownerName,
  renamingFolderId, renameValue, onRenameValueChange, onConfirmRename, onStartRename, onCancelRename,
  onFolderOpen, onFolderDelete,
  onFolderDrop,
  onFileDragStart, onFileDragEnd, onFileDelete, onFileDownload, onFileMoveOpen, onContextMenu,
  allFiles,
}: ViewProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span className="w-8" />
        <span>Name</span>
        <span className="w-20 text-right hidden sm:block">Size</span>
        {showOwner && <span className="w-20 hidden md:block">Owner</span>}
        <span className="w-20 text-right hidden md:block">Modified</span>
        <span className="w-16" />
      </div>

      {/* Folders */}
      {folders.map((folder) => {
        const count = allFiles.filter((f) => f.folder_id === folder.id).length
        const isRenaming = renamingFolderId === folder.id
        const isDropTarget = dropTarget === folder.id
        return (
          <div
            key={folder.id}
            className={cn(
              'group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/50 last:border-b-0',
              isDropTarget && 'bg-amber-50 dark:bg-amber-900/10 ring-inset ring-1 ring-amber-400',
            )}
            onDoubleClick={() => !isRenaming && onFolderOpen(folder.id)}
            onContextMenu={(e) => onContextMenu(e, 'folder', folder.id)}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(folder.id) }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => { setDropTarget(null); onFolderDrop(e, folder.id) }}
          >
            <span className="w-8 flex-shrink-0"><IconFolder className="text-amber-400" /></span>
            <span className="flex items-center gap-1 min-w-0">
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => onRenameValueChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onConfirmRename(folder.id); if (e.key === 'Escape') onCancelRename() }}
                  onBlur={() => onConfirmRename(folder.id)}
                  className="text-sm w-full border-b border-primary bg-transparent focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm font-medium truncate">{folder.name}</span>
              )}
              <span className="text-xs text-muted-foreground flex-shrink-0">({count})</span>
            </span>
            <span className="w-20 text-right text-xs text-muted-foreground hidden sm:block">—</span>
            {showOwner && <span className="w-20 text-xs text-muted-foreground hidden md:block">{ownerName(folder.owner_id)}</span>}
            <span className="w-20 text-right text-xs text-muted-foreground hidden md:block">{formatDistanceToNow(new Date(folder.created_at), { addSuffix: true })}</span>
            <span className="w-16 flex items-center justify-end gap-1">
              <button onClick={(e) => { e.stopPropagation(); onStartRename(folder.id, folder.name) }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground" title="Rename"><IconPencil /></button>
              <button onClick={(e) => { e.stopPropagation(); onFolderDelete(folder.id) }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500" title="Delete"><IconTrash /></button>
            </span>
          </div>
        )
      })}

      {/* Files */}
      {files.map((file) => (
        <div
          key={file.id}
          className="group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b border-border/50 last:border-b-0 cursor-grab active:cursor-grabbing"
          draggable
          onDragStart={() => onFileDragStart(file.id)}
          onDragEnd={onFileDragEnd}
          onContextMenu={(e) => onContextMenu(e, 'file', file.id)}
        >
          <span className="w-8 flex-shrink-0"><FileThumbnail file={file} size="sm" /></span>
          <span className="text-sm font-medium truncate min-w-0">{file.file_name}</span>
          <span className="w-20 text-right text-xs text-muted-foreground hidden sm:block">{formatBytes(file.file_size)}</span>
          {showOwner && <span className="w-20 text-xs text-muted-foreground hidden md:block">{ownerName(file.owner_id)}</span>}
          <span className="w-20 text-right text-xs text-muted-foreground hidden md:block">{formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}</span>
          <span className="w-16 flex items-center justify-end gap-1">
            <button onClick={() => onFileDownload(file.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground" title="Download"><IconDownload /></button>
            <button onClick={() => onFileMoveOpen(file)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground" title="Move"><IconMove /></button>
            <button onClick={() => onFileDelete(file.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500" title="Delete"><IconTrash /></button>
          </span>
        </div>
      ))}

      {folders.length === 0 && files.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">This folder is empty.</p>
      )}
    </div>
  )
}
