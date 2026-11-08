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

    const { project_id, file_id } = await req.json()
    if (!project_id || !file_id) return err('project_id and file_id required', 400)

    // Verify project belongs to caller client
    const { data: project } = await supabase.from('projects').select('*').eq('id', project_id).single()
    if (!project) return err('Project not found', 404)
    if (project.client_id !== user.id) return err('Forbidden', 403)
    if (project.status !== 'client_approved') return err('Project not approved', 403)

    // Verify file is approved deliverable
    const { data: file } = await supabase.from('project_files').select('*').eq('id', file_id).single()
    if (!file) return err('File not found', 404)
    if (!file.approved) return err('File not approved for download', 403)

    // Issue signed URL (1 hour)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('project-files')
      .createSignedUrl(file.storage_key, 3600)
    if (signedError || !signedData) return err('Failed to create signed URL', 500)

    // Audit log (fire and forget)
    supabase.from('notifications').insert({
      recipient_id: user.id,
      project_id,
      type: 'project_approved',
      message: `Download issued for "${file.file_name}"`,
    }).then(() => {})

    return new Response(JSON.stringify({ signedUrl: signedData.signedUrl }), {
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
