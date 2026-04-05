# Hosting & Infrastructure — Pricing Overview

## Summary

Two hosting plans are outlined below. **Plan B is recommended for launch** — it matches the current codebase with no migration needed. Plan C is a leaner future option that reduces costs further but requires significant backend work to implement.

---

## Plan B — Recommended for Launch (current codebase)

This is what the app is built on today. No migration required — deploy and go.

### Services

#### 1. Vercel — Frontend Hosting
**What it does:** Hosts the web application. Every time you push an update, Vercel automatically deploys the new version.

**Important — not limited to this project:** A single Vercel Pro account can host **multiple websites and projects**. Your business showcase website, client dashboard, and any future sites all run under the same $20/mo plan.

| Plan | Cost | Notes |
|---|---|---|
| Hobby (Free) | $0/mo | Fine for testing |
| Pro | $20/mo | Required for production (custom domain, team access, SLA) |

**Recommended: Pro at $20/mo**

---

#### 2. Supabase — Database & Authentication
**What it does:** Manages all user accounts, logins, roles (admin/client/team), and stores all project data (projects, comments, revisions, status updates, file metadata).

| Plan | Cost | Notes |
|---|---|---|
| Free | $0/mo | Development/testing only — pauses after 1 week of inactivity |
| Pro | $25/mo | Production-ready, never paused, email support |

**Recommended: Pro at $25/mo**

---

#### 3. Cloudflare R2 — File & Video Storage
**What it does:** Stores all video footage, deliverables, and project files. **No egress fees** — clients can download and stream as much as they want at no extra cost. Video uploads and downloads go directly between the browser and R2, never passing through Vercel.

| Storage | Monthly Cost |
|---|---|
| 500 GB | ~$7.50/mo |
| 1 TB | ~$15/mo |
| 2 TB | ~$30/mo |

Data transfer (downloads/streaming): **always free**

---

### Plan B — Total Monthly Cost

| Service | Role | Monthly Cost |
|---|---|---|
| Vercel Pro | Frontend (all your projects) | $20 |
| Supabase Pro | Database + Authentication | $25 |
| Cloudflare R2 | File & video storage | see below |

| Storage | R2 Cost | **Total/mo** |
|---|---|---|
| 500 GB | ~$7.50 | **~$52.50/mo** |
| 1 TB | ~$15 | **~$60/mo** |
| 2 TB | ~$30 | **~$75/mo** |

---

## Plan C — Leaner Stack (future migration)

This plan replaces Supabase with cheaper alternatives. It saves ~$25/mo but requires rewriting the auth system, all database queries, and the file storage layer. **Not recommended for launch** — worth considering once the platform is stable and running.

### What changes vs Plan B

| Layer | Plan B | Plan C |
|---|---|---|
| Auth | Supabase Auth | Clerk (free, email allowlist) |
| Database | Supabase Postgres | Cloudflare D1 (free SQLite) |
| Storage | Cloudflare R2 | Cloudflare R2 (unchanged) |
| Frontend | Vercel | Vercel (unchanged) |

**Clerk allowlist:** restricts sign-up to a specific list of approved email addresses — no one can access the portal unless you've explicitly added their email.

### Plan C — Total Monthly Cost

| Service | Role | Monthly Cost |
|---|---|---|
| Vercel Pro | Frontend + API (all your projects) | $20 |
| Clerk | Authentication + email allowlist | $0 |
| Cloudflare D1 | Database | $0 |
| Cloudflare R2 | File & video storage | see below |

| Storage | R2 Cost | **Total/mo** |
|---|---|---|
| 500 GB | ~$7.50 | **~$27.50/mo** |
| 1 TB | ~$15 | **~$35/mo** |
| 2 TB | ~$30 | **~$50/mo** |

---

## Plan Comparison

| | Plan B (launch) | Plan C (future) |
|---|---|---|
| Ready to deploy | Yes — no changes needed | No — requires backend migration |
| 500 GB/mo | ~$52.50 | ~$27.50 |
| 1 TB/mo | ~$60 | ~$35 |
| 2 TB/mo | ~$75 | ~$50 |
| Auth | Supabase | Clerk |
| Database | Supabase Postgres | Cloudflare D1 |
| Storage | Cloudflare R2 | Cloudflare R2 |

---

## What You Need to Set Up (Plan B)

1. **Create a Vercel account** — [vercel.com](https://vercel.com)
   - Sign up and connect your GitHub repository
   - Upgrade to Pro plan
   - Add your custom domain
   - Other projects (showcase website, etc.) can be added at no extra cost

2. **Create a Supabase account** — [supabase.com](https://supabase.com)
   - Create a new project
   - Upgrade to Pro plan for production
   - Share the project URL and API key with your developer

3. **Create a Cloudflare account** — [cloudflare.com](https://cloudflare.com)
   - Enable R2 Storage (requires adding a payment method)
   - Create a storage bucket for the project
   - Share the bucket credentials with your developer

---

## Notes

- All services bill monthly and can be cancelled at any time
- Storage costs scale at $0.015/GB — estimates above assume a fixed storage size
- Data transfer to clients is always free with Cloudflare R2 — no surprises on your bill
- Vercel Pro covers all your projects under one account — showcase site, client dashboard, anything else
- These are infrastructure costs only and do not include development fees

---

*Document updated: March 2026*
