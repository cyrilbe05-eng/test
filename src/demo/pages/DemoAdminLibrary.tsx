import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MOCK_FILES, MOCK_PROFILES, MOCK_PLANS, MOCK_PROJECTS } from '../mockData'
import { ChatPanel } from '@/components/chat/ChatPanel'
import DemoAdminLayout from './DemoAdminLayout'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const FILE_TYPE_COLORS: Record<string, string> = {
  source_video: 'bg-blue-50 text-blue-700 border border-blue-200',
  deliverable:  'bg-green-50 text-green-700 border border-green-200',
  attachment:   'bg-orange-50 text-orange-700 border border-orange-200',
}
const FILE_TYPE_LABELS: Record<string, string> = {
  source_video: 'Source',
  deliverable:  'Deliverable',
  attachment:   'Attachment',
}

interface StorageStat {
  client_id: string
  client_name: string
  plan_name: string
  storage_limit_mb: number
  used_bytes: number
  file_count: number
}

// Derive storage stats from mock data
function buildStats(): StorageStat[] {
  const clients = MOCK_PROFILES.filter((p) => p.role === 'client')
  return clients.map((c) => {
    const plan = MOCK_PLANS.find((pl) => pl.id === c.plan_id)
    const clientProjects = MOCK_PROJECTS.filter((pr) => pr.client_id === c.id)
    const clientFiles = MOCK_FILES.filter((f) => clientProjects.some((pr) => pr.id === f.project_id))
    const used_bytes = clientFiles.reduce((sum, f) => sum + (f.file_size ?? 0), 0)
    return {
      client_id: c.id,
      client_name: c.full_name,
      plan_name: plan?.name ?? 'No plan',
      storage_limit_mb: plan?.storage_limit_mb ?? -1,
      used_bytes,
      file_count: clientFiles.length,
    }
  })
}

// Enrich files with display metadata
function buildLibraryFiles() {
  return MOCK_FILES.map((f) => {
    const project = MOCK_PROJECTS.find((p) => p.id === f.project_id)
    const client = MOCK_PROFILES.find((p) => p.id === project?.client_id)
    const uploader = MOCK_PROFILES.find((p) => p.id === f.uploader_id)
    return {
      ...f,
      project_title: project?.title ?? '—',
      client_id: client?.id ?? '',
      client_name: client?.full_name ?? '—',
      uploader_name: uploader?.full_name ?? '—',
    }
  })
}

export default function DemoAdminLibrary() {
  const stats = buildStats()
  const allFiles = buildLibraryFiles()
  const [files, setFiles] = useState(allFiles)
  const [clientFilter, setClientFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const clients = MOCK_PROFILES.filter((p) => p.role === 'client')

  const filtered = files.filter((f) => {
    if (clientFilter && f.client_id !== clientFilter) return false
    if (typeFilter && f.file_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return f.file_name.toLowerCase().includes(q) || f.client_name.toLowerCase().includes(q) || f.project_title.toLowerCase().includes(q)
    }
    return true
  })

  const deleteFile = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? (demo — no actual storage affected)`)) return
    setFiles((prev) => prev.filter((f) => f.id !== id))
    toast.success('File deleted (demo)')
  }

  return (
    <DemoAdminLayout>
      <main className="px-6 py-8 space-y-8">
        {/* Storage overview */}
        <section>
          <h2 className="text-xl font-heading font-bold mb-4">Storage by Client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stats.map((s) => {
              const usedMb = s.used_bytes / 1048576
              const unlimited = s.storage_limit_mb === -1
              const pct = unlimited ? 0 : Math.min(100, (usedMb / s.storage_limit_mb) * 100)
              const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-primary'
              return (
                <button
                  key={s.client_id}
                  onClick={() => setClientFilter(clientFilter === s.client_id ? '' : s.client_id)}
                  className={cn('clay-card p-4 text-left transition-all hover:shadow-lg hover:-translate-y-0.5', clientFilter === s.client_id ? 'ring-2 ring-primary' : '')}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{s.client_name}</p>
                      <p className="text-xs text-muted-foreground">{s.plan_name} · {s.file_count} files</p>
                    </div>
                    {clientFilter === s.client_id && <span className="text-xs text-primary font-medium">Filtered</span>}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{formatBytes(s.used_bytes)}</span>
                      <span>{unlimited ? '∞ unlimited' : formatBytes(s.storage_limit_mb * 1048576)}</span>
                    </div>
                    {!unlimited && (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: pct + '%' }} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* File table */}
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-xl font-heading font-bold flex-1">Files</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files, clients, projects…" className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-64" />
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">All types</option>
              <option value="source_video">Source</option>
              <option value="deliverable">Deliverable</option>
              <option value="attachment">Attachment</option>
            </select>
            {(clientFilter || typeFilter || search) && (
              <button onClick={() => { setClientFilter(''); setTypeFilter(''); setSearch('') }} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="clay-card py-20 text-center text-muted-foreground text-sm">No files found</div>
          ) : (
            <div className="clay-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/40">
                    {['File', 'Type', 'Client', 'Project', 'Uploaded by', 'Size', 'Status', 'Date', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 max-w-[160px]"><p className="font-medium truncate text-sm" title={f.file_name}>{f.file_name}</p></td>
                      <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', FILE_TYPE_COLORS[f.file_type] ?? 'bg-muted text-muted-foreground')}>{FILE_TYPE_LABELS[f.file_type] ?? f.file_type}</span></td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{f.client_name}</td>
                      <td className="px-4 py-3 text-xs max-w-[140px]">
                        <Link to={`/admin/projects/${f.project_id}`} className="text-primary hover:underline truncate block" title={f.project_title}>{f.project_title}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{f.uploader_name}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{f.file_size != null ? formatBytes(f.file_size) : '—'}</td>
                      <td className="px-4 py-3">{f.approved ? <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Approved</span> : <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Pending</span>}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => toast.info('Download URL would be generated (demo)')} className="text-xs text-primary hover:underline whitespace-nowrap">Download</button>
                          <button onClick={() => deleteFile(f.id, f.file_name)} className="text-xs text-destructive hover:underline whitespace-nowrap">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                {filtered.length} file{filtered.length !== 1 ? 's' : ''}{filtered.length !== files.length ? ` (filtered from ${files.length})` : ''}
              </div>
            </div>
          )}
        </section>
      </main>
      <ChatPanel currentUserId="user-admin" isAdmin />
    </DemoAdminLayout>
  )
}
