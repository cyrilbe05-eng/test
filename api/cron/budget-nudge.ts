/**
 * Cron: budget nudge emails
 * Runs weekly (configured in vercel.json).
 *
 * Finds clients who have unused video budget (max_deliverables > approved deliverables so far)
 * and whose most recent project activity is older than IDLE_DAYS.
 * Sends a plain-text email via the SMTP relay configured in env vars.
 *
 * Required env vars (add to Vercel):
 *   SMTP_HOST        e.g. smtp.resend.com
 *   SMTP_PORT        e.g. 465
 *   SMTP_USER        e.g. resend (or your SMTP username)
 *   SMTP_PASS        e.g. <your smtp password or API key>
 *   SMTP_FROM        e.g. noreply@yourstudio.com
 *   CRON_SECRET      a random secret — Vercel passes it as Bearer token for cron routes
 *   APP_ORIGIN       e.g. https://your-project.vercel.app
 *
 * This endpoint ONLY responds to:
 *   - Vercel cron calls (Authorization: Bearer <CRON_SECRET>)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbQuery } from '../_helpers/db'
import * as nodemailer from 'nodemailer'

const IDLE_DAYS = 14  // send nudge if no project activity for this many days

interface ClientBudget {
  id: string
  full_name: string
  email: string
  plan_name: string
  max_deliverables: number
  approved_count: number
  last_activity: string | null  // ISO date of most recent project updated_at
}

function createTransport() {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Protect: only Vercel cron or a manual call with the correct secret
  const auth = req.headers['authorization'] ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    // Find clients with unused video budget and no recent activity
    const clients = await dbQuery<ClientBudget>(`
      SELECT
        p.id,
        p.full_name,
        p.email,
        pl.name          AS plan_name,
        pl.max_deliverables,
        COALESCE((
          SELECT COUNT(*)
          FROM project_files pf
          JOIN projects pr ON pr.id = pf.project_id
          WHERE pr.client_id = p.id
            AND pf.file_type = 'deliverable'
            AND pf.approved = 1
        ), 0)            AS approved_count,
        (
          SELECT MAX(pr2.updated_at)
          FROM projects pr2
          WHERE pr2.client_id = p.id
        )                AS last_activity
      FROM profiles p
      JOIN plans pl ON pl.id = p.plan_id
      WHERE p.role = 'client'
        AND p.disabled = 0
    `)

    const now = Date.now()
    const idleMs = IDLE_DAYS * 24 * 60 * 60 * 1000

    const nudgeTargets = clients.filter((c) => {
      const remaining = c.max_deliverables === -1 ? Infinity : c.max_deliverables - c.approved_count
      if (remaining <= 0) return false
      // If no activity at all, or last activity was more than IDLE_DAYS ago
      const lastMs = c.last_activity ? new Date(c.last_activity).getTime() : 0
      return now - lastMs > idleMs
    })

    if (nudgeTargets.length === 0) {
      res.json({ sent: 0, message: 'No clients need nudging' })
      return
    }

    const transport = createTransport()
    const appOrigin = process.env.APP_ORIGIN ?? ''
    let sent = 0
    const errors: string[] = []

    for (const client of nudgeTargets) {
      const remaining = client.max_deliverables === -1 ? 'unlimited' : String(client.max_deliverables - client.approved_count)
      const daysIdle = client.last_activity
        ? Math.floor((now - new Date(client.last_activity).getTime()) / (24 * 60 * 60 * 1000))
        : null

      const idleMsg = daysIdle != null
        ? `Your last project was updated ${daysIdle} day${daysIdle !== 1 ? 's' : ''} ago.`
        : `You haven't started any projects yet.`

      const text = [
        `Hi ${client.full_name},`,
        '',
        `You still have ${remaining} video${remaining !== '1' ? 's' : ''} available on your ${client.plan_name} plan — don't let them go to waste!`,
        '',
        idleMsg,
        '',
        `Ready to get started? Submit your next project here:`,
        `${appOrigin}/workspace/new`,
        '',
        `If you have any questions, just reply to this email.`,
        '',
        `— Your Studio Team`,
      ].join('\n')

      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: client.email,
          subject: `You still have ${remaining} video${remaining !== '1' ? 's' : ''} available on your plan`,
          text,
        })
        sent++
      } catch (err: any) {
        errors.push(`${client.email}: ${err.message}`)
      }
    }

    res.json({ sent, errors: errors.length ? errors : undefined })
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Internal error' })
  }
}
