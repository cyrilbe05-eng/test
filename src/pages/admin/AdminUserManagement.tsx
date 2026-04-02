import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { AdminNav } from '@/components/admin/AdminNav'
import { CreateUserModal } from '@/components/admin/CreateUserModal'
import type { Profile } from '@/types'

interface UserRow extends Profile {
  plans: { name: string; storage_limit_mb: number } | null
  used_bytes: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const roleColor: Record<string, string> = {
  admin: 'bg-violet-50 text-violet-700 border-violet-200',
  team: 'bg-blue-50 text-blue-700 border-blue-200',
  client: 'bg-green-50 text-green-700 border-green-200',
}

export default function AdminUserManagement() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()
  const apiFetch = useApiFetch()

  const { data: users, isLoading } = useQuery({
    queryKey: ['all_users'],
    queryFn: () => apiFetch<UserRow[]>('/api/users'),
  })

  const disableUser = async (userId: string, name: string) => {
    if (!confirm('Disable account for ' + name + '? They will be immediately signed out.')) return
    try {
      await apiFetch('/api/users/' + userId + '/disable', { method: 'PATCH' })
      toast.success(name + "'s account disabled")
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const enableUser = async (userId: string, name: string) => {
    try {
      await apiFetch('/api/users/' + userId + '/enable', { method: 'PATCH' })
      toast.success(name + "'s account re-enabled")
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const deleteUser = async (userId: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This will remove all their projects, files, and Cloudflare storage. This cannot be undone.`)) return
    try {
      await apiFetch('/api/users/' + userId, { method: 'DELETE' })
      toast.success(name + ' deleted')
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight">Users</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{users?.length ?? 0} accounts</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-semibold shadow-clay hover:brightness-110 transition-all active:scale-[0.98]">+ Create Account</button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : (
          <div className="clay-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Name', 'Email', 'Role', 'Plan', 'Storage', 'Phone', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap text-xs uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(users ?? []).map((u) => {
                  const limitMb = u.plans?.storage_limit_mb ?? null
                  const unlimited = limitMb === -1 || limitMb === null
                  const usedMb = (u.used_bytes ?? 0) / 1048576
                  const pct = unlimited ? 0 : Math.min(100, (usedMb / limitMb!) * 100)
                  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-primary'
                  return (
                    <tr key={u.id} className={'hover:bg-muted/20 transition-colors ' + (u.disabled ? 'opacity-50' : '')}>
                      <td className="px-4 py-3 font-medium">{u.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={'px-2.5 py-1 rounded-full text-xs font-medium border ' + (roleColor[u.role] ?? '')}>{u.role}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.plans?.name ?? '—'}</td>
                      <td className="px-4 py-3 min-w-[140px]">
                        {u.role === 'client' && u.plans ? (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {formatBytes(u.used_bytes ?? 0)}{!unlimited && ` / ${formatBytes(limitMb! * 1048576)}`}
                            </p>
                            {!unlimited && (
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden w-24">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: pct + '%' }} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        {u.disabled
                          ? <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">Active</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.role !== 'admin' && (
                            u.disabled
                              ? <button onClick={() => enableUser(u.id, u.full_name)} className="text-xs text-primary hover:underline">Enable</button>
                              : <button onClick={() => disableUser(u.id, u.full_name)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Disable</button>
                          )}
                          {u.role !== 'admin' && (
                            <button onClick={() => deleteUser(u.id, u.full_name)} className="text-xs text-destructive hover:underline">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['all_users'] })} />}
    </div>
  )
}
