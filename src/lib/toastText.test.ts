import { describe, expect, it, vi } from 'vitest'

const calls: Record<string, unknown[][]> = {}
vi.mock('sonner', () => {
  const make = (k: string) => (...args: unknown[]) => { (calls[k] ??= []).push(args) }
  return { toast: { success: make('success'), error: make('error'), info: make('info'), warning: make('warning'), message: make('message'), loading: make('loading') } }
})

describe('installToastText', () => {
  it('shows pop-up messages without spaced dashes', async () => {
    const { toast } = await import('sonner')
    const { installToastText } = await import('./toastText')
    installToastText()
    toast.success('Project approved — client notified')
    toast.error('Revision limit reached — contact your account manager')
    toast.info('Done', { description: 'Saved — all good' })
    toast.success('How-to tutorial')
    expect(calls.success[0][0]).toBe('Project approved: client notified')
    expect(calls.error[0][0]).toBe('Revision limit reached: contact your account manager')
    expect((calls.info[0][1] as { description: string }).description).toBe('Saved: all good')
    expect(calls.success[1][0]).toBe('How-to tutorial')
  })
})
