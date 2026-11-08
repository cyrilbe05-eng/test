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

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Unauthorized', 401)

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return errorResponse('Unauthorized', 401)

    const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'admin') return errorResponse('Forbidden', 403)

    // Parse body
    const body = await req.json()
    const { full_name, email, phone, role, plan_id } = body

    if (!full_name || !email || !role) return errorResponse('Missing required fields', 400)
    if (role === 'client' && !plan_id) return errorResponse('plan_id required for client role', 400)
    if (!['client', 'team'].includes(role)) return errorResponse('Invalid role', 400)

    // Generate temp password
    const tempPassword = generatePassword(16)

    // Create auth user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role, plan_id: plan_id ?? null },
    })
    if (createError) return errorResponse(createError.message, 400)

    // Update profile with phone + plan_id (trigger may not set all fields)
    await supabase.from('profiles').update({ phone: phone ?? null, plan_id: plan_id ?? null }).eq('id', newUser.user!.id)

    return new Response(
      JSON.stringify({ id: newUser.user!.id, email, temporary_password: tempPassword }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, status: 201 }
    )
  } catch (err) {
    console.error(err)
    return errorResponse('Internal error', 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    status,
  })
}

function generatePassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => charset[b % charset.length]).join('')
}
