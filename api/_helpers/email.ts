import * as nodemailer from 'nodemailer'
import { dbQuery } from './db.js'

interface Profile { id: string; email: string; full_name: string }

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  })
}

/** Send an email notification. Silently no-ops if SMTP is not configured. */
export async function sendEmailNotification({
  recipientId,
  subject,
  text,
  html,
}: {
  recipientId: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return

  try {
    const rows = await dbQuery<Profile>(
      'SELECT id, email, full_name FROM profiles WHERE id = ?',
      [recipientId]
    )
    const recipient = rows[0]
    if (!recipient?.email) return

    await transporter().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient.email,
      subject,
      text,
      html: html ?? autoLinkifyHtml(text),
    })
  } catch (err) {
    console.error('[email] send failed for recipient', recipientId, err)
  }
}

/** Send the same email to multiple recipients. */
export async function sendEmailNotifications(
  notifications: { recipientId: string; subject: string; text: string; html?: string }[]
): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return
  await Promise.allSettled(notifications.map(sendEmailNotification))
}

// Fallback to the production dashboard domain so notification emails always
// contain a clickable absolute URL even if APP_ORIGIN isn't configured in the
// deploy environment. Strip any trailing slash so we don't produce //paths.
const APP = (process.env.APP_ORIGIN || 'https://dashboard.projectpingu.com').replace(/\/$/, '')

export function projectUrl(projectId: string, role: 'admin' | 'team' | 'client'): string {
  if (role === 'admin') return `${APP}/admin/projects/${projectId}`
  if (role === 'team') return `${APP}/team/projects/${projectId}`
  return `${APP}/workspace/projects/${projectId}`
}

/**
 * Render plain text as HTML with bare URLs converted to <a> tags. Mail clients
 * (notably Gmail desktop) don't always auto-link URLs in HTML bodies — wrapping
 * them ourselves guarantees a clickable link in the rendered email.
 */
function autoLinkifyHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // Match http(s) URLs up to the next whitespace character.
  const linked = escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" style="color:#2563eb;text-decoration:underline">${url}</a>`,
  )
  return `<p style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111827">${linked.replace(/\n/g, '<br>')}</p>`
}
