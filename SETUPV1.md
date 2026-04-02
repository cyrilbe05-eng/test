# SETUPV1.md — Studio Portal: Full Setup & Deployment Guide

> This document covers everything needed to go from zero to a live, fully functional Studio Portal instance.
> Follow the sections in order.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Project Setup](#2-supabase-project-setup)
3. [Database Migration](#3-database-migration)
4. [Storage Bucket](#4-storage-bucket)
5. [Authentication Settings](#5-authentication-settings)
6. [Create the Admin Account](#6-create-the-admin-account)
7. [Environment Variables](#7-environment-variables)
8. [Local Dry Test Run](#8-local-dry-test-run)
9. [Edge Functions Deployment](#9-edge-functions-deployment)
10. [Generate Real TypeScript Types](#10-generate-real-typescript-types)
11. [Frontend Deployment](#11-frontend-deployment)
12. [Custom Domain](#12-custom-domain)
13. [Post-Deploy: Create Client & Team Accounts](#13-post-deploy-create-client--team-accounts)
14. [Summary Timeline](#14-summary-timeline)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Prerequisites

Install these tools before starting:

```bash
# Node.js 18+ (check version)
node -v

# npm (comes with Node)
npm -v

# Supabase CLI
npm install -g supabase

# Vercel CLI (if deploying to Vercel)
npm install -g vercel
```

Accounts you need:
- [supabase.com](https://supabase.com) — free tier is fine for testing, Pro for production
- [resend.com](https://resend.com) — transactional email (free: 3,000 emails/month)
- [twilio.com](https://twilio.com) — SMS/WhatsApp notifications (optional but recommended)
- A domain name for the agency (e.g. `studio.youragency.com`)

---

## 2. Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose a name (e.g. `studio-portal`), a strong database password, and the closest region
4. Wait ~2 minutes for the project to provision
5. Go to **Project Settings → API**
6. Note down:
   - **Project URL** → `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** → `eyJhbGci...` (safe for the browser)
   - **service_role key** → `eyJhbGci...` (**keep this secret — never commit it**)

---

## 3. Database Migration

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Open the file `supabase/migrations/001_initial_schema.sql` from this repo
4. Paste the entire contents into the SQL editor
5. Click **Run**

This creates:
- All 7 tables: `plans`, `profiles`, `projects`, `project_files`, `project_assignments`, `timeline_comments`, `notifications`
- All database triggers (auto-create profile, plan snapshot, updated_at, external notification hook)
- All Row Level Security (RLS) policies
- 3 default plans: Starter (1 deliverable, 2 revisions), Growth (2 deliverables, 4 revisions), Pro (5 deliverables, unlimited revisions)

**Enable the pg_net extension** (required for the notification trigger):

1. Supabase dashboard → **Database → Extensions**
2. Search for `pg_net` and enable it

**Set the Edge Function URL** (required for the notification trigger to call your functions):

Run this in the SQL Editor (replace with your actual project ref):

```sql
ALTER DATABASE postgres SET "app.edge_function_url" = 'https://xxxxxxxxxxxx.supabase.co/functions/v1';
```

---

## 4. Storage Bucket

1. Supabase dashboard → **Storage**
2. Click **New bucket**
3. Name: `project-files`
4. **Public bucket: OFF** — this must be private. All access goes through signed URLs.
5. Click **Save**

---

## 5. Authentication Settings

**Disable public email sign-ups** (critical — this is an invite-only platform):

1. Supabase dashboard → **Authentication → Providers**
2. Click **Email**
3. Toggle **Enable email signups** → **OFF**
4. Save

This means only the admin can create accounts via the `create-user` Edge Function.

---

## 6. Create the Admin Account

Since self-signup is disabled, create the admin account manually:

1. Supabase dashboard → **Authentication → Users**
2. Click **Add user → Create new user**
3. Enter Cyril's email and a temporary password
4. Check **Auto Confirm User**
5. Click **Create User**

Now set the admin role in the database. Go to **SQL Editor** and run:

```sql
UPDATE public.profiles
SET
  role = 'admin',
  full_name = 'Cyril',       -- replace with actual name
  password_changed = true     -- skip forced password change for admin
WHERE email = 'cyril@yourdomain.com';  -- replace with actual email
```

> If `password_changed = false` is preferred (to force a password change on first login), omit that line.

---

## 7. Environment Variables

### 7.1 Frontend — `.env` (safe to commit)

Edit the `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...   # anon / public key
```

### 7.2 Edge Functions — `.env.server` (NEVER commit — add to `.gitignore`)

Create a file called `.env.server` in the project root (for reference only — secrets are set via CLI):

```bash
# Supabase
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...       # service_role key from Project Settings → API

# Email — Resend (resend.com)
RESEND_API_KEY=re_...

# SMS / WhatsApp — Twilio (twilio.com)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890              # E.164 format, e.g. +33612345678

# App origin (used for CORS + email links)
APP_ORIGIN=https://studio.youragency.com
```

> The `.env.server` file is already in `.gitignore`. Do NOT commit it.

---

## 8. Local Dry Test Run

Once `.env` is filled in with real Supabase credentials, you can run the app locally:

```bash
# Install dependencies (if not done yet)
npm install

# Start local dev server
npm run dev
```

Open [http://localhost:5173/login](http://localhost:5173/login) in your browser.

Log in with Cyril's admin credentials. You should land on `/admin` with the kanban board.

**What works without Edge Functions:**
- Login / logout
- Admin kanban board and list view
- Creating projects (as client)
- Uploading files (source videos, attachments, deliverables)
- Timeline comments
- Status transitions (drag-and-drop on kanban)
- Real-time notification bell
- Analytics dashboard

**What requires Edge Functions to be deployed:**
- Creating client / team accounts (uses `create-user`)
- Disabling accounts (uses `disable-user`)
- Client revision submission with server-enforced cap (uses `submit-revision`)
- Secure download links for clients (uses `get-download-url`)
- Email + SMS notifications (uses `send-notification`)

---

## 9. Edge Functions Deployment

```bash
# Log in to Supabase CLI
supabase login

# Link to your project (replace xxxxxxxxxxxx with your project ref)
supabase link --project-ref xxxxxxxxxxxx

# Set all secrets (from your .env.server values)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set TWILIO_ACCOUNT_SID=AC...
supabase secrets set TWILIO_AUTH_TOKEN=...
supabase secrets set TWILIO_FROM_NUMBER=+1234567890
supabase secrets set APP_ORIGIN=https://studio.youragency.com

# Deploy all 5 Edge Functions
supabase functions deploy create-user
supabase functions deploy disable-user
supabase functions deploy submit-revision
supabase functions deploy get-download-url
supabase functions deploy send-notification
```

Verify deployment:

1. Supabase dashboard → **Edge Functions**
2. All 5 functions should appear with a green status

---

## 10. Generate Real TypeScript Types

After the migration has been applied, generate accurate types from your live schema:

```bash
npx supabase gen types typescript --project-id xxxxxxxxxxxx > src/integrations/supabase/types.ts
```

Then remove all `@ts-expect-error` comments from the codebase (there are ~10, added as stubs before the real schema existed):

```bash
# Find all suppression comments
grep -rn "ts-expect-error" src/
```

Delete each `// @ts-expect-error — replace with generated Supabase types after migration` line. The real generated types will make all insert/update calls fully type-safe.

Rebuild to confirm zero errors:

```bash
npx tsc --noEmit
npm run build
```

---

## 11. Frontend Deployment

### Option A — Vercel (recommended)

```bash
vercel
```

Follow the prompts. When asked about environment variables, add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Or set them in the Vercel dashboard → **Project → Settings → Environment Variables**.

After deploy, every `git push` to `main` will auto-deploy.

### Option B — Netlify

```bash
npm run build
```

Then either:
- Drag & drop the `dist/` folder to [netlify.com/drop](https://app.netlify.com/drop)
- Or connect your GitHub repo in Netlify dashboard (set build command: `npm run build`, publish directory: `dist`)

Set environment variables in **Netlify → Site Settings → Environment Variables**.

### Option C — Cloudflare Pages

1. Connect your GitHub repo in the Cloudflare Pages dashboard
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Add environment variables in the dashboard

### Option D — Any static host (S3, etc.)

```bash
npm run build
# Upload contents of dist/ to your host
```

> **Important:** All options must serve `index.html` for all routes (SPA fallback). Vercel and Netlify handle this automatically. For other hosts, configure a rewrite rule: all paths → `index.html`.

---

## 12. Custom Domain

### Vercel
1. Vercel dashboard → **Project → Domains**
2. Add your domain (e.g. `studio.youragency.com`)
3. Add the CNAME record shown to your DNS provider
4. SSL is automatic

### Netlify
1. Netlify dashboard → **Site Settings → Domain Management**
2. Add custom domain
3. Follow DNS instructions
4. SSL is automatic

> DNS propagation can take 5–30 minutes (sometimes up to 24h).

Once the domain is live, update your Edge Function secret:

```bash
supabase secrets set APP_ORIGIN=https://studio.youragency.com
```

And redeploy all functions:

```bash
supabase functions deploy create-user
supabase functions deploy disable-user
supabase functions deploy submit-revision
supabase functions deploy get-download-url
supabase functions deploy send-notification
```

---

## 13. Post-Deploy: Create Client & Team Accounts

Once the platform is live and Edge Functions are deployed:

1. Log in as **Cyril** (admin) at `https://studio.youragency.com/login`
2. Navigate to **Users** in the top nav
3. Click **+ Create Account**
4. Fill in: Full Name, Email, Phone (optional), Role, and Plan (for clients)
5. The system:
   - Auto-generates a 16-character secure temporary password
   - Sends a welcome email with login URL + credentials (via Resend)
   - Sends a welcome SMS with the same info (via Twilio, if phone provided)
6. The user logs in, is forced to change their password, then lands on their role's home

---

## 14. Summary Timeline

| Task | Estimated Time |
|---|---|
| Supabase project creation | 5 min |
| Database migration + pg_net + edge function URL | 10 min |
| Storage bucket + auth settings | 5 min |
| Create admin account | 5 min |
| Fill in `.env` | 2 min |
| Local dry test run | 5 min |
| Edge Function deployment | 10 min |
| Generate real TypeScript types + rebuild | 5 min |
| Frontend deploy to Vercel | 5 min |
| Custom domain + DNS | 15 min (+ DNS propagation) |
| **Total (excluding DNS wait)** | **~67 min** |

---

## 15. Troubleshooting

### Login fails / "Invalid email or password"
- Make sure the admin profile row exists in `public.profiles` with `role = 'admin'`
- Check that email signups are disabled (so no conflict)
- Verify `.env` has the correct Supabase URL and anon key

### "relation does not exist" errors in browser console
- The SQL migration was not run, or only partially ran
- Re-run `001_initial_schema.sql` in the SQL Editor — it is idempotent for most operations

### Files upload but video won't play
- The `project-files` bucket must be **private**
- Signed URLs are generated on the fly — check the browser console for CORS or 403 errors
- Ensure `VITE_SUPABASE_URL` is correct in `.env`

### Edge Functions return 500
- Check that all secrets are set: `supabase secrets list`
- Check function logs: Supabase dashboard → Edge Functions → click function → Logs
- Ensure `pg_net` extension is enabled for the notification trigger

### Notifications not arriving by email/SMS
- Verify `RESEND_API_KEY` and Twilio credentials are set correctly
- Check `send-notification` function logs
- Ensure `app.edge_function_url` database setting is correct
- For Twilio SMS: the `TWILIO_FROM_NUMBER` must be a verified number in your Twilio account

### RLS blocking queries unexpectedly
- Open Supabase dashboard → **Table Editor** → check if RLS is enabled on the table
- Use the **SQL Editor** to test queries with `SET ROLE authenticated; SET request.jwt.claim.sub = '<user-uuid>';`

### Bundle size warning during build
- This is a warning, not an error — the app works fine
- To reduce it later: add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split vendor libs (recharts, plyr, etc.)

---

*Last updated: 2026-03-08*
