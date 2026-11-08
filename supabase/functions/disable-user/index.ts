import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('Unauthorized', 401)

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return err('Unauthorized', 401)

    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'admin') return err('Forbidden', 403)

    const { user_id } = await req.json()
    if (!user_id) return err('user_id required', 400)

    // Soft-disable in profiles
    await supabase.from('profiles').update({ disabled: true }).eq('id', user_id)

    // Invalidate sessions via ban (immediate, then unban — Supabase method)
    await supabase.auth.admin.updateUserById(user_id, { ban_duration: 'none' })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error(e)
    return err('Internal error', 500)
  }
})

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
