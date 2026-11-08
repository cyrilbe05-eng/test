import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const notification = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Load recipient profile
    const { data: recipient } = await supabase
      .from('profiles')
      .select('email, phone, full_name')
      .eq('id', notification.recipient_id)
      .single()

    if (!recipient) return new Response('ok')

    const appOrigin = Deno.env.get('APP_ORIGIN') ?? ''
    const projectUrl = notification.project_id ? `${appOrigin}/workspace/projects/${notification.project_id}` : appOrigin

    // Send email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Studio Portal <noreply@yourdomain.com>',
          to: recipient.email,
          subject: getSubject(notification.type),
          html: `<p>Hi ${recipient.full_name},</p><p>${notification.message}</p><p><a href="${projectUrl}">View Project →</a></p>`,
        }),
      })
    }

    // Send SMS via Twilio (if phone provided)
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER')

    if (twilioSid && twilioToken && twilioFrom && recipient.phone && shouldSendSms(notification.type)) {
      const body = new URLSearchParams({
        To: recipient.phone,
        From: twilioFrom,
        Body: `${notification.message} ${projectUrl}`,
      })
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
    }

    return new Response('ok')
  } catch (e) {
    console.error('send-notification error:', e)
    return new Response('ok') // Always return 200 to not break the trigger
  }
})

function getSubject(type: string): string {
  const subjects: Record<string, string> = {
    project_created: 'New project created',
    team_assigned: 'You have been assigned to a project',
    status_changed: 'Project status updated',
    comment_added: 'New comment on your project',
    video_ready_for_review: 'Your video is ready for review',
    revision_requested: 'Revision requested',
    project_approved: 'Project approved',
  }
  return subjects[type] ?? 'Studio Portal notification'
}

// Per the AGENTS.md delivery matrix
function shouldSendSms(type: string): boolean {
  return ['project_created', 'team_assigned', 'video_ready_for_review', 'revision_requested'].includes(type)
}
