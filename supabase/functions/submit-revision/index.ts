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

    const { project_id } = await req.json()
    if (!project_id) return err('project_id required', 400)

    // Verify caller is the project's client
    const { data: project } = await supabase.from('projects').select('*').eq('id', project_id).single()
    if (!project) return err('Project not found', 404)
    if (project.client_id !== user.id) return err('Forbidden', 403)

    // Enforce revision cap
    if (
      project.max_client_revisions !== -1 &&
      project.client_revision_count >= project.max_client_revisions
    ) {
      return err('revision_limit_reached', 403)
    }

    // Increment revision count + update status
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        status: 'revision_requested',
        client_revision_count: project.client_revision_count + 1,
      })
      .eq('id', project_id)
    if (updateError) return err(updateError.message, 500)

    // Notify admin + assigned team
    const { data: assignments } = await supabase
      .from('project_assignments')
      .select('team_member_id')
      .eq('project_id', project_id)

    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')

    const recipients = [
      ...(admins ?? []).map((a) => a.id),
      ...(assignments ?? []).map((a) => a.team_member_id),
    ]

    for (const recipient_id of recipients) {
      await supabase.from('notifications').insert({
        recipient_id,
        project_id,
        type: 'revision_requested',
        message: `Client requested a revision on project "${project.title}"`,
      })
    }

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
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*' },
    status,
  })
}
