import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { themeSwap } from '@/lib/themeSwap'
import { makeAvatar } from '@/lib/avatarImage'
import { Ms, Segmented } from '@/components/ds'
import { cn } from '@/lib/utils'

// The profile card at the bottom of the sidebar. Tapping it opens a small
// menu: photo (change / remove), appearance, change password, sign out.

/** The signed-in user's photo, or their initial on the accent colour. */
export function UserAvatar({ name, src, size = 30 }: { name?: string | null; src?: string | null; size?: number }) {
  if (src) return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
  return (
    <span className="grid place-items-center rounded-full text-white flex-none" style={{ width: size, height: size, background: 'var(--ds-accent)', fontSize: Math.round(size * 0.43), fontWeight: 600 }}>
      {name?.charAt(0)}
    </span>
  )
}

export function ProfileMenu({ subtitle, onSignOut }: { subtitle?: string; onSignOut: () => void }) {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  // The menu is drawn at the frame's root (the sidebar clips its children),
  // anchored above the card.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = wrap.current?.getBoundingClientRect()
      if (r) setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - 288)), bottom: window.innerHeight - r.top + 8 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !menu.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  const save = async (avatar_url: string | null) => {
    setBusy(true)
    try {
      await apiFetch('/api/profiles/me', { method: 'PATCH', body: JSON.stringify({ avatar_url }) })
      await qc.invalidateQueries({ queryKey: ['profile'] })
      toast.success(avatar_url ? 'Photo updated' : 'Photo removed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const pick = async (f?: File) => {
    if (!f) return
    try { await save(await makeAvatar(f)) } catch (e) { toast.error((e as Error).message) }
  }

  const role = subtitle ?? ''
  return (
    <div ref={wrap} className="relative">
      {open && pos && createPortal(
        <div ref={menu} className="ds-pmenu" role="dialog" aria-label="Profile" style={{ left: pos.left, bottom: pos.bottom }}>
          <div className="flex items-center gap-3 p-4 pb-3">
            <button type="button" className="ds-pm-photo" onClick={() => file.current?.click()} disabled={busy} aria-label="Change photo">
              <UserAvatar name={profile?.full_name} src={profile?.avatar_url} size={52} />
              <span className="ds-pm-cam"><Ms name={busy ? 'progress_activity' : 'photo_camera'} className={cn(busy && 'animate-spin')} style={{ fontSize: 18, width: 18, color: '#fff' }} /></span>
            </button>
            <div className="min-w-0">
              <p className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{profile?.full_name}</p>
              <p className="truncate" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{profile?.email}</p>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-3">
            <button type="button" className="ds-ghost-btn flex-1" style={{ height: 34, fontSize: 13 }} onClick={() => file.current?.click()} disabled={busy}>Change photo</button>
            {profile?.avatar_url && <button type="button" className="ds-ghost-btn" style={{ height: 34, fontSize: 13 }} onClick={() => save(null)} disabled={busy}>Remove</button>}
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/*" className="hidden"
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />

          <div className="ds-pm-sep" />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span style={{ fontSize: 13.5 }}>Appearance</span>
            <Segmented label="Appearance" width={62} value={theme === 'dark' ? 'dark' : 'light'}
              onChange={(v) => { if ((v === 'dark') !== (theme === 'dark')) themeSwap(toggle) }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div className="ds-pm-sep" />
          <div className="p-1.5">
            <Link to="/change-password" className="ds-mitem" onClick={() => setOpen(false)}><Ms name="lock" />Change password</Link>
            <button type="button" className="ds-mitem" onClick={onSignOut}><Ms name="logout" />Sign out</button>
          </div>
        </div>,
        wrap.current?.closest('.ds') ?? document.body,
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        className="ds-pcard w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left">
        <UserAvatar name={profile?.full_name} src={profile?.avatar_url} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="truncate" style={{ fontSize: 13.5, fontWeight: 500 }}>{profile?.full_name}</span>
          {role && <span className="truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>{role}</span>}
        </span>
        <Ms name="unfold_more" style={{ fontSize: 18, width: 18 }} />
      </button>
    </div>
  )
}
