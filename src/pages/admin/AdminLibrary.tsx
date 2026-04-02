import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { AdminNav } from '@/components/admin/AdminNav'

interface LibraryFile {
  id: string
  project_id: string
  project_title: string
  client_id: string
  client_name: string
  uploader_id: string
  uploader_name: string
  file_type: string
  storage_key: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  approved: number
  created_at: string
}

interface StorageStat {
  client_id: string
  client_name: string
  plan_name: string | null
  storage_limit_mb: number | null
  used_bytes: number
  file_count: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const FILE_TYPE_LABELS: Record<string, string> = {
  source_video: 'Source',
  deliverable: 'Deliverable',
  attachment: 'Attachment',
}

const FILE_TYPE_COLORS: Record<string, string> = {
  source_video: 'bg-blue-50 text-blue-700 border-blue-200',
  deliverable: 'bg-green-50 text-green-700 border-green-200',
  attachment: 'bg-orange-50 text-orange-700 border-orange-200',
}

export default function AdminLibrary() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const [clientFilter, setClientFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const queryParams = new URLSearchParams()
  if (clientFilter) queryParams.set('client_id', clientFilter)
  if (typeFilter) queryParams.set('file_type', typeFilter)
  const qs = queryParams.toString()

  const { data, isLoading } = useQuery({
    queryKey: ['admin_library', clientFilter, typeFilter],
    queryFn: () => apiFetch<{ files: LibraryFile[]; stats: StorageStat[] }>(`/api/admin/library${qs ? '?' + qs : ''}`),
  })

  const files = data?.files ?? []
  const stats = data?.stats ?? []

  // Unique clients from stats for filter dropdown
  const clientOptions = stats.map((s) => ({ id: s.client_id, name: s.client_name }))

  const filtered = files.filter((f) => {
    if (!search) return true
    const q = search.toLowerCase()
    return f.file_name.toLowerCase().includes(q) || f.client_name.toLowerCase().includes(q) || f.project_title.toLowerCase().includes(q)
  })

  const getSignedUrl = async (fileId: string, fileName: string) => {
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/project-files/${fileId}/signed-url`)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.target = '_blank'
      a.click()
    } catch {
      toast.error('Could not get download link')
    }
  }

  const deleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/api/project-files/${fileId}`, { method: 'DELETE' })
      toast.success('File deleted')
      qc.invalidateQueries({ queryKey: ['admin_library'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className="max-w-screen-2xl mx-auto px-6 py-8 space-y-8">
        {/* Storage overview */}
        <section>
          <h2 className="text-xl font-heading font-semibold tracking-tight mb-4">Storage by Client</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {stats.map((s) => {
                const usedMb = s.used_bytes / 1048576
                const limitMb = s.storage_limit_mb
                const unlimited = limitMb === -1 || limitMb === null
                const pct = unlimited ? 0 : Math.min(100, (usedMb / limitMb) * 100)
                const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-primary'
                return (
                  <button
                    key={s.client_id}
                    onClick={() => setClientFilter(clientFilter === s.client_id ? '' : s.client_id)}
                    className={`clay-card p-4 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 ${clientFilter === s.client_id ? 'ring-2 ring-primary/30' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{s.client_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.plan_name ?? 'No plan'} · {s.file_count} files</p>
                      </div>
                      {clientFilter === s.client_id && <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">Filtered</span>}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>{formatBytes(s.used_bytes)}</span>
                        <span>{unlimited ? '∞' : formatBytes(limitMb * 1048576)}</span>
                      </div>
                      {!unlimited && (
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: pct + '%' }} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* File table */}
        <section>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-xl font-heading font-semibold tracking-tight flex-1">Files</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files, clients, projects…"
              className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-64"
            />
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All types</option>
              <option value="source_video">Source</option>
              <option value="deliverable">Deliverable</option>
              <option value="attachment">Attachment</option>
            </select>
            {(clientFilter || typeFilter || search) && (
              <button
                onClick={() => { setClientFilter(''); setTypeFilter(''); setSearch('') }}
                className="text-xs text-muted-foreground hover:text-foreground bg-muted px-3 py-1.5 rounded-xl border border-border transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="clay-card py-20 text-center text-muted-foreground text-sm">No files found</div>
          ) : (
            <div className="clay-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {['File', 'Type', 'Client', 'Project', 'Uploaded by', 'Size', 'Status', 'Date', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs uppercase tracking-wide text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium truncate" title={f.file_name}>{f.file_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${FILE_TYPE_COLORS[f.file_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                          {FILE_TYPE_LABELS[f.file_type] ?? f.file_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.client_name}</td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/projects/${f.project_id}`} className="text-primary hover:underline text-xs truncate max-w-[140px] block" title={f.project_title}>
                          {f.project_title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.uploader_name}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{f.file_size != null ? formatBytes(f.file_size) : '—'}</td>
                      <td className="px-4 py-3">
                        {f.approved ? (
                          <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Approved</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => getSignedUrl(f.id, f.file_name)}
                            className="text-xs text-primary hover:underline whitespace-nowrap"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => deleteFile(f.id, f.file_name)}
                            className="text-xs text-destructive hover:underline whitespace-nowrap"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground bg-muted/20">
                {filtered.length} file{filtered.length !== 1 ? 's' : ''}{filtered.length !== files.length ? ` (filtered from ${files.length})` : ''}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
