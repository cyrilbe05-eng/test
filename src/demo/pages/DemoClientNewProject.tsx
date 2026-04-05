import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useDemoAuth } from '../DemoAuthContext'
import { _galleryStore, _profilesStore, _projectsStore, MOCK_PLANS, pushNotification, pushProject, addStorageFile, type GalleryFile } from '../mockData'
import { triggerNotificationUpdate } from '../useDemoNotifications'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function fileIcon(mime: string) {
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📄'
  if (mime === 'application/zip') return '📦'
  if (mime.startsWith('audio/')) return '🎵'
  return '📎'
}

// ── Selected file chip ─────────────────────────────────────────────────────────
function FileChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2">
      <span className="flex-1 truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive flex-shrink-0 text-lg leading-none"
      >
        ×
      </button>
    </li>
  )
}

// ── Gallery picker modal ───────────────────────────────────────────────────────
function GalleryPickerModal({
  ownerId,
  alreadySelected,
  onSelect,
  onClose,
}: {
  ownerId: string
  alreadySelected: string[]
  onSelect: (files: GalleryFile[]) => void
  onClose: () => void
}) {
  const galleryFiles = _galleryStore.filter((f) => f.owner_id === ownerId)
  const [checked, setChecked] = useState<Set<string>>(new Set(alreadySelected))

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function confirm() {
    const selected = galleryFiles.filter((f) => checked.has(f.id))
    onSelect(selected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in flex flex-col max-h-[80vh]">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-heading font-semibold">My Gallery</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select files to attach to this project</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        {/* file list */}
        <div className="flex-1 overflow-y-auto p-4">
          {galleryFiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-3xl mb-2">📂</p>
              <p className="text-sm">Your gallery is empty.</p>
              <p className="text-xs mt-1">Upload files from the Gallery page first.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {galleryFiles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left',
                    checked.has(f.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  <span className="text-xl flex-shrink-0">{fileIcon(f.mime_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.file_size)}</p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    checked.has(f.id) ? 'border-primary bg-primary' : 'border-muted-foreground',
                  )}>
                    {checked.has(f.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 gap-3">
          <span className="text-sm text-muted-foreground">{checked.size} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={confirm} className="btn-gradient text-sm px-4 py-2">
              Attach {checked.size > 0 ? `(${checked.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DemoClientNewProject() {
  const { profile } = useDemoAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [inspirationUrl, setInspirationUrl] = useState('')
  const [videoScript, setVideoScript] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showGallery, setShowGallery] = useState(false)

  // Selected files — mix of gallery picks and fresh uploads
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; name: string; fromGallery: boolean }[]>([])

  function removeFile(id: string) {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function onGallerySelect(files: GalleryFile[]) {
    // Merge without duplicates
    setSelectedFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id))
      const toAdd = files
        .filter((f) => !existingIds.has(f.id))
        .map((f) => ({ id: f.id, name: f.file_name, fromGallery: true }))
      // Also remove files that were deselected (not in new selection)
      const galleryIds = new Set(files.map((f) => f.id))
      const kept = prev.filter((f) => !f.fromGallery || galleryIds.has(f.id))
      return [...kept, ...toAdd]
    })
  }

  function onNewUpload(fileList: FileList | null) {
    if (!fileList || !profile) return
    const newEntries = Array.from(fileList).map((f) => {
      // Also push to gallery so the file is permanently accessible
      const gf: GalleryFile = {
        id: `gal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        owner_id: profile.id,
        folder_id: null,
        file_name: f.name,
        file_size: f.size,
        mime_type: f.type || 'application/octet-stream',
        storage_key: `gallery/${profile.id}/${f.name}`,
        created_at: new Date().toISOString(),
      }
      _galleryStore.push(gf)
      return { id: gf.id, name: f.name, fromGallery: false }
    })
    setSelectedFiles((prev) => [...prev, ...newEntries])
    toast.success(`${newEntries.length} file${newEntries.length > 1 ? 's' : ''} added (also saved to your gallery)`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title is required'); return }

    if (profile) {
      const clientProfile = _profilesStore.find((p) => p.id === profile.id)
      const clientPlan = clientProfile?.plan_id ? MOCK_PLANS.find((p) => p.id === clientProfile.plan_id) : null
      if (clientPlan && clientPlan.max_active_projects !== -1) {
        const now = new Date()
        const thisMonthCount = _projectsStore.filter((p) => {
          if (p.client_id !== profile.id) return false
          const d = new Date(p.created_at)
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }).length
        if (thisMonthCount >= clientPlan.max_active_projects) {
          toast.error(`Monthly project limit reached — your ${clientPlan.name} plan allows ${clientPlan.max_active_projects} project${clientPlan.max_active_projects !== 1 ? 's' : ''} per month.`)
          pushNotification({
            recipient_id: profile.id,
            project_id: null,
            type: 'project_created',
            message: `You've reached the monthly project limit (${clientPlan.max_active_projects}) on your ${clientPlan.name} plan. Contact your account manager to upgrade.`,
          })
          pushNotification({
            recipient_id: 'user-admin',
            project_id: null,
            type: 'project_created',
            message: `${clientProfile?.full_name ?? 'A client'} tried to create a new project but has reached their ${clientPlan.name} monthly limit (${clientPlan.max_active_projects} projects/month).`,
          })
          triggerNotificationUpdate()
          toast.info(`📧 Email sent to ${clientProfile?.email} — monthly project limit notification.`)
          return
        }
      }
    }

    setSubmitting(true)
    setTimeout(() => {
      if (profile) {
        const projectId = `proj-demo-${Date.now()}`
        pushProject({
          id: projectId,
          client_id: profile.id,
          title: title.trim(),
          description: null,
          inspiration_url: inspirationUrl.trim() || null,
          video_script: videoScript.trim() || null,
          status: 'pending_assignment',
          instructions: instructions.trim() || null,
          max_deliverables: 1,
          max_client_revisions: 2,
          client_revision_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        // Add selected files to project storage as 'source'
        selectedFiles.forEach((sf) => {
          const gf = _galleryStore.find((g) => g.id === sf.id)
          addStorageFile({
            project_id: projectId,
            uploader_id: profile.id,
            file_name: sf.name,
            file_size: gf?.file_size ?? 0,
            mime_type: gf?.mime_type ?? 'application/octet-stream',
            tag: 'source',
          })
        })
      }
      toast.success("Project created! We'll assign a team member shortly.")
      navigate('/workspace')
    }, 800)
  }

  const gallerySelectedIds = selectedFiles.filter((f) => f.fromGallery).map((f) => f.id)

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-6 flex items-center gap-3" style={{ height: '52px' }}>
            <Link to="/workspace" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← My Workspace</Link>
            <span className="text-border">/</span>
            <span className="text-sm font-medium">New Project</span>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-heading font-bold mb-2">New Project</h1>
          <p className="text-muted-foreground mb-8">Tell us what you need and attach your source material.</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Details */}
            <div className="clay-card p-6 space-y-4">
              <h2 className="font-heading font-semibold">Project Details</h2>
              <div className="space-y-1">
                <label className="text-sm font-medium">Project Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="e.g. Q2 Brand Video"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Link to Inspiration Video (optional)</label>
                <input
                  type="url"
                  value={inspirationUrl}
                  onChange={(e) => setInspirationUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  placeholder="https://youtube.com/watch?v=…"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Video Script (optional)</label>
                <textarea
                  value={videoScript}
                  onChange={(e) => setVideoScript(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                  placeholder="Paste or write the script for your video…"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Instructions for Editor</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                  placeholder="Describe what you need, style references, music preferences…"
                />
              </div>
            </div>

            {/* Source Files */}
            <div className="clay-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-semibold">Source Files</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Pick from your gallery or upload new files directly</p>
                </div>
              </div>

              {/* Two action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowGallery(true)}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-primary"
                >
                  <span className="text-2xl">📂</span>
                  <span className="text-sm font-medium">Choose from Gallery</span>
                  <span className="text-xs text-center opacity-70">Pick files you already uploaded</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-primary"
                >
                  <span className="text-2xl">⬆️</span>
                  <span className="text-sm font-medium">Upload New Files</span>
                  <span className="text-xs text-center opacity-70">Files will also be saved to your gallery</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onNewUpload(e.target.files)}
              />

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Attached ({selectedFiles.length})
                  </p>
                  <ul className="space-y-1">
                    {selectedFiles.map((f) => (
                      <FileChip
                        key={f.id}
                        name={`${f.name}${f.fromGallery ? ' · from gallery' : ' · new upload'}`}
                        onRemove={() => removeFile(f.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? 'Creating project…' : 'Submit Project'}
            </button>
          </form>
        </main>
      </div>

      {/* Gallery picker modal */}
      {showGallery && profile && (
        <GalleryPickerModal
          ownerId={profile.id}
          alreadySelected={gallerySelectedIds}
          onSelect={onGallerySelect}
          onClose={() => setShowGallery(false)}
        />
      )}
    </>
  )
}
