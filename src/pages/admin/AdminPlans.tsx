import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { AdminLayout } from '@/components/admin/AdminLayout'
import type { Plan } from '@/types'

interface PlanForm {
  name: string
  max_deliverables: string
  max_client_revisions: string
  storage_limit_mb: string
  max_active_projects: string
}

const emptyForm: PlanForm = { name: '', max_deliverables: '1', max_client_revisions: '2', storage_limit_mb: '20480', max_active_projects: '1' }

function storageLabel(mb: number): string {
  if (mb === -1) return 'Unlimited'
  if (mb >= 1024) return `${mb / 1024} GB`
  return `${mb} MB`
}

function revisionsLabel(n: number): string {
  return n === -1 ? 'Unlimited' : String(n)
}

export default function AdminPlans() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PlanForm>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState<PlanForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiFetch<Plan[]>('/api/plans'),
  })

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id)
    setEditForm({
      name: plan.name,
      max_deliverables: String(plan.max_deliverables),
      max_client_revisions: String(plan.max_client_revisions),
      storage_limit_mb: String(plan.storage_limit_mb),
      max_active_projects: String(plan.max_active_projects),
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      await apiFetch(`/api/plans/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          max_deliverables: Number(editForm.max_deliverables),
          max_client_revisions: Number(editForm.max_client_revisions),
          storage_limit_mb: Number(editForm.storage_limit_mb),
          max_active_projects: Number(editForm.max_active_projects),
        }),
      })
      toast.success('Plan updated')
      setEditingId(null)
      qc.invalidateQueries({ queryKey: ['plans'] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const createPlan = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: newForm.name,
          max_deliverables: Number(newForm.max_deliverables),
          max_client_revisions: Number(newForm.max_client_revisions),
          storage_limit_mb: Number(newForm.storage_limit_mb),
          max_active_projects: Number(newForm.max_active_projects),
        }),
      })
      toast.success('Plan created')
      setCreating(false)
      setNewForm(emptyForm)
      qc.invalidateQueries({ queryKey: ['plans'] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const deletePlan = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? Any clients on this plan must be reassigned first.`)) return
    try {
      await apiFetch(`/api/plans/${plan.id}`, { method: 'DELETE' })
      toast.success(`Plan "${plan.name}" deleted`)
      qc.invalidateQueries({ queryKey: ['plans'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <AdminLayout>
      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight">Plans</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Define the tiers available to clients.</p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-semibold shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
            >
              + New Plan
            </button>
          )}
        </div>

        <div className="space-y-3">
          {/* New plan row */}
          {creating && (
            <div className="clay-card p-5 ring-2 ring-primary/20">
              <p className="text-sm font-semibold mb-4 text-primary">New plan</p>
              <PlanFormFields form={newForm} onChange={setNewForm} />
              <div className="flex gap-2 mt-4">
                <button onClick={createPlan} disabled={saving || !newForm.name} className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:brightness-110 transition-all">
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button onClick={() => { setCreating(false); setNewForm(emptyForm) }} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : (plans ?? []).map((plan) => (
            <div key={plan.id} className={`clay-card p-5 transition-all ${editingId === plan.id ? 'ring-2 ring-primary/20' : ''}`}>
              {editingId === plan.id ? (
                <>
                  <PlanFormFields form={editForm} onChange={setEditForm} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={saveEdit} disabled={saving || !editForm.name} className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:brightness-110 transition-all">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">Cancel</button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="bg-muted px-2.5 py-1 rounded-full text-xs">
                        <span className="text-foreground font-medium">{plan.max_deliverables === -1 ? '∞' : plan.max_deliverables}</span> deliverable{plan.max_deliverables !== 1 ? 's' : ''}
                      </span>
                      <span className="bg-muted px-2.5 py-1 rounded-full text-xs">
                        <span className="text-foreground font-medium">{revisionsLabel(plan.max_client_revisions)}</span> revision{plan.max_client_revisions !== 1 ? 's' : ''}
                      </span>
                      <span className="bg-muted px-2.5 py-1 rounded-full text-xs">
                        <span className="text-foreground font-medium">{storageLabel(plan.storage_limit_mb)}</span> storage
                      </span>
                      <span className="bg-muted px-2.5 py-1 rounded-full text-xs">
                        <span className="text-foreground font-medium">{plan.max_active_projects === -1 ? '∞' : plan.max_active_projects}</span> active project{plan.max_active_projects !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEdit(plan)} className="text-sm text-primary hover:underline">Edit</button>
                    <button onClick={() => deletePlan(plan)} className="text-sm text-destructive hover:underline">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Usage hint */}
        <div className="mt-8 clay-card p-5 text-sm text-muted-foreground space-y-1.5">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-2">Field reference</p>
          <p><span className="text-foreground font-medium">Deliverables</span> — videos a client can receive per project. <code className="bg-muted px-1.5 py-0.5 rounded-lg text-xs">-1</code> = unlimited.</p>
          <p><span className="text-foreground font-medium">Revisions</span> — revision rounds the client can request. <code className="bg-muted px-1.5 py-0.5 rounded-lg text-xs">-1</code> = unlimited.</p>
          <p><span className="text-foreground font-medium">Storage</span> — total MB across all projects. <code className="bg-muted px-1.5 py-0.5 rounded-lg text-xs">-1</code> = unlimited. (1 GB = 1024 MB)</p>
          <p><span className="text-foreground font-medium">Active Projects</span> — max simultaneous open projects a client can have. <code className="bg-muted px-1.5 py-0.5 rounded-lg text-xs">-1</code> = unlimited.</p>
        </div>
      </main>
    </AdminLayout>
  )
}

function PlanFormFields({ form, onChange }: { form: PlanForm; onChange: (f: PlanForm) => void }) {
  const set = (key: keyof PlanForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value })

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="col-span-2 sm:col-span-1 space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input value={form.name} onChange={set('name')} placeholder="e.g. Growth" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Deliverables (-1 = ∞)</label>
        <input type="number" value={form.max_deliverables} onChange={set('max_deliverables')} min="-1" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Revisions (-1 = ∞)</label>
        <input type="number" value={form.max_client_revisions} onChange={set('max_client_revisions')} min="-1" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Storage MB (-1 = ∞)</label>
        <input type="number" value={form.storage_limit_mb} onChange={set('storage_limit_mb')} min="-1" className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Active Projects (-1 = ∞)</label>
        <input type="number" value={form.max_active_projects} onChange={set('max_active_projects')} min="-1" className={inputCls} />
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all'
