import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  _storageStore, addStorageFile, deleteStorageFile, cleanupProjectStorage,
  MOCK_PROFILES,
  type StorageTag,
} from '../mockData'

const ALL_TAGS: StorageTag[] = [
  'main_deliverable', 'deliverable_version', 'draft', 'final',
  'source', 'reference', 'misc', 'archived',
]

const TAG_COLORS: Record<StorageTag, string> = {
  main_deliverable:    'bg-primary/15 text-primary border-primary/30',
  deliverable_version: 'bg-blue-500/15 text-blue-600 border-blue-300/30',
  draft:               'bg-amber-500/15 text-amber-600 border-amber-300/30',
  final:               'bg-green-500/15 text-green-600 border-green-300/30',
  source:              'bg-violet-500/15 text-violet-600 border-violet-300/30',
  reference:           'bg-sky-500/15 text-sky-600 border-sky-300/30',
  misc:                'bg-muted text-muted-foreground border-border',
  archived:            'bg-zinc-500/15 text-zinc-500 border-zinc-300/30',
}

function TagBadge({ tag, version }: { tag: StorageTag; version?: number }) {
  const label = tag === 'deliverable_version' && version
    ? `v${version}`
    : tag.replace(/_/g, ' ')
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', TAG_COLORS[tag])}>
      {label}
    </span>
  )
}

function formatBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

// ── Upload Modal ────────────────────────────────────────────────────────────────
export function UploadModal({
  projectId,
  uploaderId,
  onClose,
  onUploaded,
  allowedTags,
}: {
  projectId: string
  uploaderId: string
  onClose: () => void
  onUploaded: () => void
  allowedTags: StorageTag[]
}) {
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(50)
  const [tag, setTag] = useState<StorageTag>(allowedTags[0])

  function handleSubmit() {
    if (!fileName.trim()) { toast.error('Enter a file name'); return }
    addStorageFile({
      project_id: projectId,
      uploader_id: uploaderId,
      file_name: fileName.trim(),
      file_size: fileSize * 1024 * 1024,
      mime_type: 'video/mp4',
      tag,
    })
    toast.success(`${fileName} uploaded`)
    onUploaded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-semibold">Upload File</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">File Name</label>
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. final-cut-v3.mp4"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Size (MB)</label>
            <input
              type="number"
              min={1}
              value={fileSize}
              onChange={(e) => setFileSize(Number(e.target.value))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tag</label>
            <div className="flex flex-wrap gap-2">
              {allowedTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className={cn(
                    'px-3 py-1 rounded-lg border text-xs font-medium transition-colors',
                    tag === t ? TAG_COLORS[t] + ' ring-2 ring-primary/40' : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="btn-gradient px-4 py-2 text-sm">Upload</button>
        </div>
      </div>
    </div>
  )
}

// ── Cleanup Confirm Modal ────────────────────────────────────────────────────────
function CleanupModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string
  onClose: () => void
  onDone: () => void
}) {
  const toDelete = _storageStore.filter(
    (f) => f.project_id === projectId &&
    f.tag !== 'main_deliverable' &&
    f.tag !== 'final' &&
    f.tag !== 'source'
  )

  function handleConfirm() {
    cleanupProjectStorage(projectId)
    toast.success(`${toDelete.length} file${toDelete.length !== 1 ? 's' : ''} deleted`)
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-semibold text-destructive">Clean Up Storage</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-4">
            The following files will be <strong className="text-destructive">permanently deleted</strong>. Files tagged <em>main deliverable</em>, <em>final</em>, and <em>source</em> are kept.
          </p>
          {toDelete.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nothing to delete — storage is already clean.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {toDelete.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm py-1 border-b border-border/40">
                  <TagBadge tag={f.tag} version={f.version} />
                  <span className="flex-1 truncate">{f.file_name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatBytes(f.file_size)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted transition-colors">Cancel</button>
          {toDelete.length > 0 && (
            <button onClick={handleConfirm} className="px-4 py-2 rounded-lg text-sm bg-destructive text-white hover:brightness-110 transition-colors">
              Delete {toDelete.length} file{toDelete.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Export ─────────────────────────────────────────────────────────────────
export interface StorageTabProps {
  projectId: string
  projectTitle: string
  currentUserId: string
  role: 'admin' | 'team' | 'client'
}

export function DemoProjectStorageTab({ projectId, projectTitle, currentUserId, role }: StorageTabProps) {
  const [, forceRender] = useState(0)
  const refresh = () => forceRender((n) => n + 1)

  const [showUpload, setShowUpload] = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [filterTag, setFilterTag] = useState<StorageTag | 'all'>('all')

  const files = _storageStore.filter((f) => f.project_id === projectId)

  const visibleFiles = role === 'client'
    ? files.filter((f) => f.tag === 'main_deliverable')
    : filterTag === 'all'
      ? files
      : files.filter((f) => f.tag === filterTag)

  const presentTags = Array.from(new Set(files.map((f) => f.tag)))

  const uploadableTags: StorageTag[] =
    role === 'admin'
      ? ALL_TAGS
      : role === 'team'
        ? ['main_deliverable', 'draft', 'source', 'reference', 'misc']
        : ['source', 'reference', 'misc']

  const mainDeliverable = files.find((f) => f.tag === 'main_deliverable')

  if (role === 'client') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-sm">Your Deliverable</h3>
        </div>
        {mainDeliverable ? (
          <div className="clay-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{mainDeliverable.file_name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(mainDeliverable.file_size)}</p>
            </div>
            <button
              onClick={() => toast.info('Download requires production storage')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-xs font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </div>
        ) : (
          <div className="clay-card p-8 text-center">
            <p className="text-muted-foreground text-sm">No deliverable ready yet.</p>
            <p className="text-xs text-muted-foreground mt-1">You'll be notified when your video is ready for download.</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold">
            📁 {projectTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{files.length} file{files.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {role === 'admin' && (
            <button
              onClick={() => setShowCleanup(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clean Up
            </button>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="btn-gradient flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload
          </button>
        </div>
      </div>

      {/* Filter tags */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterTag('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
              filterTag === 'all' ? 'bg-primary/15 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/40',
            )}
          >
            All ({files.length})
          </button>
          {presentTags.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTag(t)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                filterTag === t ? TAG_COLORS[t] + ' ring-1 ring-primary/20' : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {t.replace(/_/g, ' ')} ({files.filter((f) => f.tag === t).length})
            </button>
          ))}
        </div>
      )}

      {/* File list */}
      {visibleFiles.length === 0 ? (
        <div className="clay-card p-10 text-center">
          <p className="text-3xl mb-2">📂</p>
          <p className="text-muted-foreground text-sm">
            {files.length === 0 ? 'No files uploaded yet.' : 'No files match this filter.'}
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Upload the first file →
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {visibleFiles.map((f) => {
            const uploader = MOCK_PROFILES.find((p) => p.id === f.uploader_id)
            return (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 group transition-colors">
                {/* File icon */}
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                  {f.mime_type.startsWith('video') ? '🎬' : f.mime_type.startsWith('image') ? '🖼️' : '📎'}
                </div>
                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{f.file_name}</span>
                    <TagBadge tag={f.tag} version={f.version} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{formatBytes(f.file_size)}</span>
                    {uploader && <span className="text-xs text-muted-foreground">· {uploader.full_name}</span>}
                    <span className="text-xs text-muted-foreground">· {new Date(f.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toast.info('Download requires production storage')}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Download"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  {(role === 'admin' || f.uploader_id === currentUserId) && (
                    <button
                      onClick={() => { deleteStorageFile(f.id); refresh(); toast.success('File deleted') }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showUpload && (
        <UploadModal
          projectId={projectId}
          uploaderId={currentUserId}
          allowedTags={uploadableTags}
          onClose={() => setShowUpload(false)}
          onUploaded={refresh}
        />
      )}

      {showCleanup && (
        <CleanupModal
          projectId={projectId}
          onClose={() => setShowCleanup(false)}
          onDone={refresh}
        />
      )}
    </div>
  )
}
