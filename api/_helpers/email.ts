import * as nodemailer from 'nodemailer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dbQuery } from './db.js'

interface Profile { id: string; email: string; full_name: string }

// Brand palette pulled from src/index.css (HSL → hex).
const BRAND = {
  primary: '#3a45d8',     // hsl(234 76% 58%) — vivid indigo-violet
  secondary: '#9268d8',   // hsl(262 60% 62%) — playful purple
  bg: '#f4f5fa',          // hsl(220 30% 97%) — page background
  card: '#ffffff',
  text: '#1f2230',        // dark slate
  textMuted: '#6b7280',   // gray-500
  border: '#e5e7eb',      // gray-200
}

// Logo loaded once at module init and embedded inline (cid:) in every email.
// Reading via fileURLToPath so Vercel's static tracer detects the path and
// bundles the PNG with the function. Cached so we don't pay the I/O per email.
let LOGO_BUFFER: Buffer | null = null
function getLogo(): Buffer | null {
  if (LOGO_BUFFER) return LOGO_BUFFER
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    LOGO_BUFFER = fs.readFileSync(path.join(here, 'pingu-excited.png'))
    return LOGO_BUFFER
  } catch (err) {
    console.warn('[email] could not load logo asset:', (err as Error).message)
    return null
  }
}

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

    const logo = getLogo()
    const renderedHtml = html ?? renderBrandedHtml(subject, text, recipient.full_name, !!logo)

    await transporter().sendMail({
      from: process.env.SMTP_FROM,
      to: recipient.email,
      subject,
      text,
      html: renderedHtml,
      attachments: logo ? [{
        filename: 'pingu.png',
        content: logo,
        cid: 'pingu-logo@projectpingu',
        contentDisposition: 'inline',
      }] : undefined,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render a branded HTML email matching the dashboard's visual style:
 * indigo→purple gradient header with the Pingu mascot, white card body,
 * a primary CTA button if a URL is detected in `text`, and a small footer.
 *
 * The text body is parsed for "View ...: <url>" or any bare http(s) URL — the
 * URL is pulled out and surfaced as a button so it stands out, while the
 * surrounding prose stays in the body. Email clients render this with the
 * gradient/button intact; the plain-text version is sent as fallback.
 */
function renderBrandedHtml(
  subject: string,
  text: string,
  recipientName: string,
  hasLogo: boolean,
): string {
  // Pull the first URL out of the body so we can render it as a CTA button.
  // The remaining prose still mentions the link in case the button doesn't
  // render (older clients, plain-text mode).
  const urlMatch = text.match(/https?:\/\/[^\s<]+/)
  const ctaUrl = urlMatch?.[0]

  // Strip "View ...: <url>" / "View it here: <url>" lines from the prose so
  // they don't appear twice (once as text, once as the button).
  const prose = text
    .replace(/\n*View [^\n:]*:\s*https?:\/\/\S+/gi, '')
    .replace(/\n+/g, '\n')
    .trim()

  const greeting = recipientName ? `Hi ${escapeHtml(recipientName.split(' ')[0])},` : 'Hi,'
  const proseHtml = escapeHtml(prose).replace(/\n/g, '<br>')
  const subjectHtml = escapeHtml(subject)
  const logoImg = hasLogo
    ? `<img src="cid:pingu-logo@projectpingu" alt="Pingu Studio" width="64" height="64" style="display:block;width:64px;height:64px;border:0;outline:none;" />`
    : ''
  const ctaButton = ctaUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
        <tr>
          <td bgcolor="${BRAND.primary}" style="border-radius:12px;background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.secondary} 100%);box-shadow:0 4px 12px rgba(58,69,216,0.25);">
            <a href="${escapeHtml(ctaUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
              View in Pingu Studio →
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:12px;color:${BRAND.textMuted};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        Or copy and paste this URL into your browser:<br>
        <a href="${escapeHtml(ctaUrl)}" style="color:${BRAND.primary};word-break:break-all;">${escapeHtml(ctaUrl)}</a>
      </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subjectHtml}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BRAND.text};">
  <!-- preheader: hidden but shown in inbox previews -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};">
    ${subjectHtml}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.bg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${BRAND.card};border-radius:20px;overflow:hidden;box-shadow:0 6px 24px rgba(31,34,48,0.08);">
          <!-- Gradient header with mascot -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.secondary} 100%);padding:32px 24px 28px;">
              ${logoImg}
              <div style="margin-top:12px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">
                Pingu Studio
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <div style="font-size:13px;color:${BRAND.textMuted};margin-bottom:8px;">${greeting}</div>
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;color:${BRAND.text};">
                ${subjectHtml}
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.text};">
                ${proseHtml}
              </p>
              ${ctaButton}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.textMuted};">
                You're getting this because you have an account on Pingu Studio.<br>
                Manage your notifications from your <a href="${APP}" style="color:${BRAND.primary};text-decoration:none;">dashboard</a>.
              </p>
            </td>
          </tr>
        </table>
        <div style="margin-top:16px;font-size:11px;color:${BRAND.textMuted};">
          © ${new Date().getFullYear()} Pingu Studio
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}
