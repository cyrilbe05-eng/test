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
      html: html ?? `<p>${text.replace(/\n/g, '<br>')}</p>`,
    })
  } catch {
    // Email failures must never break the main request
  }
}

/** Send the same email to multiple recipients. */
export async function sendEmailNotifications(
  notifications: { recipientId: string; subject: string; text: string; html?: string }[]
): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return
  await Promise.allSettled(notifications.map(sendEmailNotification))
}

const APP = process.env.APP_ORIGIN ?? ''

export function projectUrl(projectId: string, role: 'admin' | 'team' | 'client'): string {
  if (role === 'admin') return `${APP}/admin/projects/${projectId}`
  if (role === 'team') return `${APP}/team/projects/${projectId}`
  return `${APP}/workspace/projects/${projectId}`
}
