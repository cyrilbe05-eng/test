# Setup Guide — Studio Portal

This document is split into two parts:

- **Part A — Developer setup** (done by you, once, before handoff)
- **Part B — Client guide** (handed to the client — covers day-to-day admin use only)

---

# Part A — Developer Setup

Everything in this section is done by you. The client does not need to see or touch any of it.

**Estimated time: 1–2 hours**

---

## 1. Clerk (user authentication)

### 1.1 Create the account

1. Go to **https://clerk.com** → Sign up
2. Create a new application — name it anything (e.g. "Studio Portal")
3. When asked which sign-in method: select **Email address + Password** only
4. Click **Create application**

### 1.2 Enable the email allowlist

1. Clerk dashboard → **Configure → Restrictions**
2. Turn on **Allowlist**

This prevents anyone not on the list from signing in or creating an account.

### 1.3 Switch to production

By default Clerk is in "Development" mode. Before going live:

1. Clerk dashboard → top left dropdown → **Production**
2. Follow the prompts to set up a production instance
3. Your live keys will start with `pk_live_` and `sk_live_`

### 1.4 Copy your API keys

1. Clerk dashboard → **Configure → API Keys**
2. Copy the **Publishable key** (`pk_live_...`)
3. Copy the **Secret key** (`sk_live_...`)

---

## 2. Cloudflare (database + file storage)

### 2.1 Create the account

1. Go to **https://cloudflare.com** → Sign up
2. Add a payment method (required for R2, even on free tier)

### 2.2 Find your Account ID

1. Log into the Cloudflare dashboard
2. Look at the URL — it looks like `dash.cloudflare.com/abc123def456`
3. That string after the last `/` is your **Account ID**

### 2.3 Create the D1 database

1. Left sidebar → **Workers & Pages → D1 SQL Database**
2. Click **Create database**, name it `studio-portal`, click **Create**
3. Note the **Database ID** shown on the database page

### 2.4 Initialize the database

The project has four schema files that must all be applied, in order. Run each one separately.

1. D1 database page → **Console** tab
2. For each file below, copy its full contents, paste into the console, and click **Execute** — each should return "Success"

**Run in this order:**

| Step | File | What it creates |
|---|---|---|
| 1 | `db/schema.sql` | Core tables (profiles, projects, plans, files, etc.) |
| 2 | `db/gallery_schema.sql` | Gallery files and folders |
| 3 | `db/chat_schema.sql` | Messaging (connections, groups, messages) |
| 4 | `db/calendar_schema.sql` | Calendar events, participants, comments |
| 5 | `db/seed.sql` | Default plans (Starter, Growth, Pro) |

> Clear the console between each file to avoid confusion.

### 2.5 Create a D1 API token

1. Cloudflare top-right → **My Profile → API Tokens → Create Token**
2. Use template: **Edit Cloudflare Workers**
3. Account Resources: select your account
4. Click **Continue to summary → Create Token**
5. Copy the token — **shown only once**

### 2.6 Create the R2 bucket

1. Left sidebar → **R2 Object Storage → Create bucket**
2. Name: `studio-portal-files` (no spaces)
3. Keep the default region → **Create bucket**

### 2.7 Configure R2 CORS

On the bucket page → **Settings → CORS Policy → Add CORS policy**:

```json
[
  {
    "AllowedOrigins": ["https://REPLACE-WITH-YOUR-VERCEL-URL.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

You will update this with the real URL after Step 3.

### 2.8 Create R2 API credentials

1. R2 main page (not inside a bucket) → **Manage R2 API tokens → Create API token**
2. Permissions: **Object Read & Write**
3. Scope: your bucket (`studio-portal-files`)
4. Click **Create API Token**
5. Copy the **Access Key ID** and **Secret Access Key** — **shown only once**

---

## 3. Vercel (hosting + API)

### 3.1 Create the account

1. Go to **https://vercel.com** → Sign up with GitHub
2. Upgrade to **Pro** ($20/mo)

### 3.2 Deploy the project

1. Vercel dashboard → **Add New → Project**
2. Import the GitHub repository
3. Vite is auto-detected — keep defaults
4. **Do not click Deploy yet** — add environment variables first

### 3.3 Add environment variables

In the "Configure Project" screen → **Environment Variables**, add each row below:

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_live_...`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 Database ID |
| `CLOUDFLARE_D1_TOKEN` | D1 API token |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Same as `CLOUDFLARE_ACCOUNT_ID` |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `CLOUDFLARE_R2_BUCKET_NAME` | `studio-portal-files` |
| `APP_ORIGIN` | `https://your-project.vercel.app` (fill in after deploy) |
| `SMTP_HOST` | Your SMTP server host (see step 3.3a below) |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | SMTP username (see step 3.3a) |
| `SMTP_PASS` | SMTP password or API key (see step 3.3a) |
| `SMTP_FROM` | Sender address shown to clients, e.g. `noreply@yourstudio.com` |
| `CRON_SECRET` | Any long random string — generate one at random.org or run `openssl rand -hex 32` |

### 3.3a Set up an SMTP relay (email sending)

The platform sends automated emails to clients when their video budget goes unused. You need an SMTP relay — the easiest free option is **Resend**.

1. Go to **https://resend.com** → Sign up (free tier: 3,000 emails/month)
2. Add and verify your sending domain (follow their DNS instructions — takes ~5 minutes)
3. Resend dashboard → **API Keys → Create API Key** → copy it
4. Use these values for the SMTP env vars:

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Your Resend API key (`re_...`) |
| `SMTP_FROM` | A verified address on your domain, e.g. `noreply@yourstudio.com` |

> **Alternative:** Any SMTP provider works — Gmail, SendGrid, Mailgun, Postmark. The variables are the same; just use that provider's SMTP credentials.

### 3.4 Deploy

Click **Deploy**. Takes ~2 minutes. Copy the resulting URL.

### 3.5 Finalize CORS and Clerk

**R2 CORS:** Go back to the R2 bucket → Settings → CORS Policy → replace `REPLACE-WITH-YOUR-VERCEL-URL` with the real URL.

**Clerk domain:** Clerk dashboard → **Configure → Domains** → add the Vercel URL.

**`APP_ORIGIN` env var:** Vercel project → **Settings → Environment Variables** → update `APP_ORIGIN` to the real URL → redeploy.

---

## 4. Create the client's admin account

### 4.1 Create the login in Clerk

1. Clerk dashboard → **Users → Create user**
2. Enter the client's email and set a temporary password
3. Click **Create**
4. On the user's page, copy the **User ID** — looks like `user_2NNEqL2nrIRdJ194ndJqow`

### 4.2 Add to allowlist

1. Clerk → **Configure → Restrictions → Allowlist → Add email**
2. Add the client's email

### 4.3 Insert the admin profile into D1

1. Cloudflare → D1 → your database → **Console** tab
2. Paste the SQL below, replacing the three values:

```sql
INSERT INTO profiles (id, role, full_name, email, password_changed)
VALUES (
  'CLERK_USER_ID_HERE',
  'admin',
  'Full Name Here',
  'email@here.com',
  0
);
```

- `CLERK_USER_ID_HERE` → the User ID you copied from Clerk (e.g. `user_2NNEqL2nrIRdJ194ndJqow`)
- `Full Name Here` → the client's name
- `email@here.com` → the client's email
- Leave `0` as-is — the app will prompt them to change their password on first login

3. Click **Execute**

### 4.4 Send credentials to the client

Send the client:
- The portal URL
- Their email
- The temporary password you set in step 4.1
- Tell them they will be asked to choose a new password on first login

---

## 5. Optional — Custom domain

If the client has a domain (e.g. `portal.theirstudio.com`):

1. Vercel project → **Settings → Domains** → add the domain, follow DNS instructions
2. Update `APP_ORIGIN` in Vercel env vars to the new domain
3. Update R2 CORS to use the new domain
4. Update Clerk → Configure → Domains

---

## 6. Handoff checklist

Before handing off, confirm:

- [ ] App is live and accessible at the Vercel URL
- [ ] Client can log in and land on the admin dashboard
- [ ] All 4 schema files + seed.sql were executed successfully in D1
- [ ] R2 CORS is set to the correct URL
- [ ] `APP_ORIGIN` env var matches the live URL
- [ ] SMTP env vars are set and a test email goes through (see step 3.3a)
- [ ] `CRON_SECRET` env var is set
- [ ] Calendar page loads for admin, team, and client roles
- [ ] Gallery upload works (test with a small file)
- [ ] Messaging works between two users
- [ ] Client analytics page loads under `/workspace/analytics`
- [ ] Client has been given the URL and their login credentials
- [ ] Client has read Part B of this document

---

---

# Part B — Client Guide

**This section is for you — the platform owner.**

Your portal is live. This guide explains everything you need to run it day-to-day. No technical knowledge required.

---

## Logging in

Go to your portal URL and sign in with your email and password. You will be asked to set a new password on your first login.

---

## Adding team members

Your team members are the video editors and staff who work on client projects.

1. In the admin panel, go to **Users**
2. Click **Create Account**
3. Fill in their name, email, and set their role to **Team**
4. Click **Create**

They will receive an email from the system with a link to log in and set their password.

---

## Adding clients

1. Go to **Users → Create Account**
2. Fill in their name, email, set role to **Client**, and choose their plan
3. Click **Create**

They will receive login instructions by email. Once they log in, they can submit new video projects through their workspace.

---

## Plans

Three plans are pre-configured when the platform is set up:

| Plan | Active Projects | Deliverables | Revisions | Storage |
|---|---|---|---|---|
| Starter | 1 | 1 | 2 | 20 GB |
| Growth | 3 | 2 | 4 | 100 GB |
| Pro | Unlimited | 5 | Unlimited | Unlimited |

You can create, edit, or delete plans at any time from the **Plans** page in the admin nav. Every field is editable:

- **Active Projects** — how many concurrent open projects a client can have at once
- **Deliverables** — how many approved videos a client can receive per project
- **Revisions** — how many revision rounds they can request
- **Storage** — total upload space across all their projects (in MB; 1 GB = 1024 MB)

Use `-1` in any field to make it unlimited.

You assign a plan to each client when you create their account. The limits are automatically enforced — clients cannot upload more than their storage cap, and cannot request more revisions than their plan allows.

> **Note:** You cannot delete a plan that has clients assigned to it. Reassign those clients to another plan first via the Users page.

---

## Media Library

Go to **Library** in the admin nav to see every file uploaded across all clients and projects.

From there you can:
- Filter by client or file type (source, deliverable, attachment)
- Search by file name, client, or project
- Download any file
- Delete any file (removes it from storage permanently)
- See per-client storage usage at a glance

---

## How a project flows

1. **Client submits** a project with their source footage and instructions
2. **You assign** a team member to the project (Projects page → project → Assign)
3. **Team member works** on the video and uploads the deliverable
4. **Team member submits** for your review
5. **You review** the video — you can add timestamped comments or approve it
6. If approved, the **client is notified** and can review the video
7. The client either **approves** (unlocking their download) or **requests a revision** (if they have revisions remaining)
8. If revision requested, the team is notified and the cycle repeats from step 3

---

## Managing users

Go to **Users** in the admin nav to see all accounts with their role, plan, and storage usage.

**Disable** — immediately blocks login. The account and all data are preserved. Click **Enable** to restore access.

**Delete** — permanently removes the account, all their projects, all uploaded files (from storage too), and their Clerk login. For clients, this includes everything in their projects. This cannot be undone — you will be asked to confirm before it runs.

> You cannot disable or delete the admin account.

---

## Automated email reminders

The platform automatically emails clients who still have unused video budget (e.g. they paid for 2 deliverables but haven't submitted a project in 14+ days). This runs every Monday morning.

No action needed on your part — it runs in the background as long as the SMTP settings were configured correctly during setup.

---

## Content Calendar

Go to **Calendar** in the admin nav to manage your content schedule.

- Create manual events with a title, date, color, content type (Reel, Story, Carousel, Post), status (Idea, Drafting, Scheduled), and optional inspiration URL, script, and caption
- Assign any event to specific clients or team members — they will see it on their own calendar view
- Click any event to open a full detail panel and edit it inline
- Leave comments on events for team/client communication
- The calendar also shows project deadlines and deliverable milestones automatically

Clients and team members each have their own calendar view showing only the events relevant to them.

---

## Client Analytics

Each client has an **Analytics** page in their workspace (`/workspace/analytics`) where they can see:

- Projects started, revision comments, and team comments for any selected time period (this week, this month, or a custom date range)
- All-time totals and project status breakdown
- Bar charts for projects and revisions over the last 6 months
- Plan usage — active project limit and per-project revision usage

No setup required — it's populated automatically from existing project and plan data.

---

## If something stops working

Contact your developer. For reference, the platform runs on:

- **Vercel** — the website host
- **Clerk** — user logins
- **Cloudflare** — the database and file storage

Your developer has all the credentials and can diagnose any issue quickly.

---

*Document updated: March 2026 — added Plans management, Media Library, email reminders, and user deletion.*
