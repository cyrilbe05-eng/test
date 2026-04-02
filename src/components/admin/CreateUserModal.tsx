import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Plan } from '@/types'

const schema = z.object({
  full_name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.enum(['client', 'team']),
  plan_id: z.string().optional(),
}).refine((d) => d.role !== 'client' || !!d.plan_id, { message: 'Plan required for clients', path: ['plan_id'] })

type FormData = z.infer<typeof schema>

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function CreateUserModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const apiFetch = useApiFetch()
  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiFetch<Plan[]>('/api/plans'),
  })

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { role: 'client' } })
  const role = watch('role')

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const result = await apiFetch<{ id: string; email: string; temporary_password: string }>('/api/users/create', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      toast.success('Account created for ' + data.full_name)
      if (result?.temporary_password) toast.info('Temp password: ' + result.temporary_password, { duration: 15000 })
      onCreated(); onClose()
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative clay-card w-full max-w-md shadow-xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-semibold">Create Account</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['client', 'team'] as const).map((r) => (
              <label key={r} className="relative">
                <input type="radio" value={r} {...register('role')} className="sr-only peer" />
                <div className="border border-border peer-checked:border-primary peer-checked:bg-primary/10 rounded-xl p-3 text-center cursor-pointer transition-all">
                  <span className="text-sm font-medium capitalize">{r}</span>
                </div>
              </label>
            ))}
          </div>
          <Field label="Full Name" error={errors.full_name?.message}><input {...register('full_name')} className={inputCls} placeholder="Jane Smith" /></Field>
          <Field label="Email" error={errors.email?.message}><input type="email" {...register('email')} className={inputCls} placeholder="jane@example.com" /></Field>
          <Field label="Phone (optional)" error={errors.phone?.message}><input {...register('phone')} className={inputCls} placeholder="+33612345678" /></Field>
          {role === 'client' && (
            <Field label="Plan" error={errors.plan_id?.message}>
              <select {...register('plan_id')} className={inputCls}>
                <option value="">Select a plan...</option>
                {plans?.map((p) => {
                  const storage = p.storage_limit_mb === -1 ? 'unlimited storage' : p.storage_limit_mb >= 1024 ? `${p.storage_limit_mb / 1024} GB` : `${p.storage_limit_mb} MB`
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.max_deliverables} deliverable{p.max_deliverables !== 1 ? 's' : ''}, {p.max_client_revisions === -1 ? 'unlimited' : p.max_client_revisions} revisions, {storage}
                    </option>
                  )
                })}
              </select>
            </Field>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
