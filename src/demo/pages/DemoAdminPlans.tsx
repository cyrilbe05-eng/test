import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MOCK_PLANS } from '../mockData'
import { ChatPanel } from '@/components/chat/ChatPanel'
import DemoAdminLayout from './DemoAdminLayout'
import type { Plan } from '@/types'

interface PlanForm {
  name: string
  max_deliverables: string
  max_client_revisions: string
  storage_limit_mb: string
  max_active_projects: string
}

const emptyForm: PlanForm = { name: '', max_deliverables: '1', max_client_revisions: '2', storage_limit_mb: '20480', max_active_projects: '3' }

function storageLabel(mb: number): string {
  if (mb === -1) return 'Unlimited'
  if (mb >= 1024) return `${mb / 1024} GB`
  return `${mb} MB`
}

export default function DemoAdminPlans() {
  const [plans, setPlans] = useState<Plan[]>(MOCK_PLANS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PlanForm>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState<PlanForm>(emptyForm)

  const startEdit = (plan: Plan) => {
    setEditingId(plan.id)
    setEditForm({
      name: plan.name,
      max_deliverables: String(plan.max_deliverables),
      max_client_revisions: String(plan.max_client_revisions),
      storage_limit_mb: String(plan.storage_limit_mb),
      max_active_projects: String(plan.max_active_projects ?? -1),
    })
  }

  const saveEdit = () => {
    setPlans((prev) => prev.map((p) =>
      p.id === editingId
        ? { ...p, name: editForm.name, max_deliverables: Number(editForm.max_deliverables), max_client_revisions: Number(editForm.max_client_revisions), storage_limit_mb: Number(editForm.storage_limit_mb), max_active_projects: Number(editForm.max_active_projects) }
        : p
    ))
    toast.success('Plan updated (demo)')
    setEditingId(null)
  }

  const createPlan = () => {
    if (!newForm.name) { toast.error('Name required'); return }
    const newPlan: Plan = {
      id: 'plan-demo-' + Date.now(),
      name: newForm.name,
      max_deliverables: Number(newForm.max_deliverables),
      max_client_revisions: Number(newForm.max_client_revisions),
      storage_limit_mb: Number(newForm.storage_limit_mb),
      max_active_projects: Number(newForm.max_active_projects),
      created_at: new Date().toISOString(),
    }
    setPlans((prev) => [...prev, newPlan])
    toast.success('Plan created (demo)')
    setCreating(false)
    setNewForm(emptyForm)
  }

  const deletePlan = (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? (demo)`)) return
    setPlans((prev) => prev.filter((p) => p.id !== plan.id))
    toast.success(`Plan "${plan.name}" deleted (demo)`)
  }

  return (
    <DemoAdminLayout>
      <main className="max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-heading font-bold">Plans</h2>
            <p className="text-muted-foreground text-sm">Define the tiers available to clients.</p>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)} className="px-5 py-2 bg-primary rounded-xl text-white text-sm font-semibold shadow-clay hover:brightness-110 transition-all active:scale-[0.98]">
              + New Plan
            </button>
          )}
        </div>

        <div className="space-y-3">
          {creating && (
            <div className="clay-card p-5 ring-2 ring-primary">
              <p className="text-sm font-medium mb-4 text-primary">New plan</p>
              <PlanFormFields form={newForm} onChange={setNewForm} />
              <div className="flex gap-3 mt-4">
                <button onClick={createPlan} disabled={!newForm.name} className="px-4 py-2 bg-primary rounded-lg text-white text-sm font-medium disabled:opacity-50">Create</button>
                <button onClick={() => { setCreating(false); setNewForm(emptyForm) }} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              </div>
            </div>
          )}

          {plans.map((plan) => (
            <div key={plan.id} className={cn('clay-card p-5', editingId === plan.id ? 'ring-2 ring-primary' : '')}>
              {editingId === plan.id ? (
                <>
                  <PlanFormFields form={editForm} onChange={setEditForm} />
                  <div className="flex gap-3 mt-4">
                    <button onClick={saveEdit} disabled={!editForm.name} className="px-4 py-2 bg-primary rounded-lg text-white text-sm font-medium disabled:opacity-50">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base">{plan.name}</h3>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      <span><span className="text-foreground font-medium">{plan.max_deliverables === -1 ? '∞' : plan.max_deliverables}</span> deliverable{plan.max_deliverables !== 1 ? 's' : ''}</span>
                      <span><span className="text-foreground font-medium">{plan.max_client_revisions === -1 ? 'Unlimited' : plan.max_client_revisions}</span> revision{plan.max_client_revisions !== 1 ? 's' : ''}</span>
                      <span><span className="text-foreground font-medium">{storageLabel(plan.storage_limit_mb)}</span> storage</span>
                      <span><span className="text-foreground font-medium">{plan.max_active_projects === -1 ? '∞' : plan.max_active_projects}</span> active project{plan.max_active_projects !== 1 ? 's' : ''}</span>
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

        <div className="mt-8 clay-card p-5 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Field reference</p>
          <p><span className="text-foreground">Deliverables</span> — number of approved videos per project. <code className="bg-muted px-1 rounded">-1</code> = unlimited.</p>
          <p><span className="text-foreground">Revisions</span> — client revision rounds. <code className="bg-muted px-1 rounded">-1</code> = unlimited.</p>
          <p><span className="text-foreground">Storage</span> — total MB across all projects. <code className="bg-muted px-1 rounded">-1</code> = unlimited. (1 GB = 1024 MB)</p>
          <p><span className="text-foreground">Active Projects</span> — max simultaneous non-completed projects. <code className="bg-muted px-1 rounded">-1</code> = unlimited.</p>
        </div>
      </main>
      <ChatPanel currentUserId="user-admin" isAdmin />
    </DemoAdminLayout>
  )
}

function PlanFormFields({ form, onChange }: { form: PlanForm; onChange: (f: PlanForm) => void }) {
  const set = (key: keyof PlanForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value })
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
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

const inputCls = 'w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30'
