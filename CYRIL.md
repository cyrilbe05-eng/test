# Pingu Studio — Setup Guide

This guide explains how to get the app running in production, written for someone non-technical. You do not need to touch any code.

---

## What this app uses

| Service | What it does | Free tier? |
|---|---|---|
| **Vercel** | Hosts the website and backend | Yes (100k API calls/month, 100 GB bandwidth) |
| **Cloudflare D1** | Database (stores users, projects, messages, etc.) | Yes |
| **Cloudflare R2** | File storage (uploaded videos, images) | Yes (10 GB free) |
| **Clerk** | User login and authentication | Yes (up to 10,000 users) |

You need accounts on all four. All have generous free tiers for a small team.

---

## Step 1 — Cloudflare Setup (Database + Storage)

### Create a Cloudflare account
Go to [cloudflare.com](https://cloudflare.com) and sign up for free.

### Create a D1 Database
1. In the Cloudflare dashboard, go to **Workers & Pages → D1**
2. Click **Create database**
3. Name it `pingu-studio` (or anything you like)
4. Copy and save the **Database ID** — you'll need it later

### Run the database schema
This creates all the tables. You do this once.

1. Install Wrangler (Cloudflare's CLI tool) on your computer:
   ```
   npm install -g wrangler
   ```
2. Log in:
   ```
   wrangler login
   ```
3. Run each file in order (replace `pingu-studio` with your database name):
   ```
   wrangler d1 execute pingu-studio --file=db/schema.sql
   wrangler d1 execute pingu-studio --file=db/gallery_schema.sql
   wrangler d1 execute pingu-studio --file=db/chat_schema.sql
   wrangler d1 execute pingu-studio --file=db/calendar_schema.sql
   wrangler d1 execute pingu-studio --file=db/seed.sql
   ```
   Each command should say "Success".

### Create an R2 Bucket (file storage)
1. In Cloudflare dashboard, go to **R2**
2. Click **Create bucket**
3. Name it `pingu-studio-files` (or anything you like)
4. Copy and save the **bucket name**

### Get your Cloudflare API credentials
1. Go to **My Profile → API Tokens**
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Copy and save the token
5. Also copy your **Account ID** from the right sidebar of any Cloudflare page

### Get R2 Access Keys
1. In R2, click **Manage R2 API Tokens**
2. Click **Create API Token**
3. Give it **Object Read & Write** permissions
4. Copy the **Access Key ID** and **Secret Access Key** — the secret is only shown once, save it immediately

---

## Step 2 — Clerk Setup (User Login)

### Create a Clerk account
Go to [clerk.com](https://clerk.com) and sign up.

### Create an application
1. Click **Add application**
2. Name it `Pingu Studio`
3. Choose **Email** as the sign-in method (disable Google/social login — only whitelisted emails should access this)
4. Click **Create application**

### Get your API keys
In your Clerk dashboard, go to **API Keys**. You'll see:
- **Publishable key** — starts with `pk_live_...`
- **Secret key** — starts with `sk_live_...`

Copy both.

### Invite users and set their roles
Every person who uses the app must be invited manually. This is how access stays controlled.

1. Go to **Users** in the Clerk dashboard
2. Click **Create user**
3. Enter their email address and a temporary password
4. After creating, click on the user
5. Scroll to **Public metadata** and add:

For an admin:
```json
{ "role": "admin" }
```

For a client:
```json
{ "role": "client" }
```

For a team member:
```json
{ "role": "team" }
```

6. Save. The user can now log in with that role.

> **Important:** If a user has no role set, they will be blocked from accessing any page. Always set the role before telling someone their account is ready.

---

## Step 3 — Vercel Setup (Hosting)

### Create a Vercel account
Go to [vercel.com](https://vercel.com) and sign up. Connect it to your GitHub account.

### Import the project
1. Click **Add New → Project**
2. Select the `Cyril-Client-Dashboard` repository from GitHub
3. Click **Deploy** — it will fail at first, that's expected (no env variables yet)

### Add environment variables
This is where you enter all the secret keys. They are stored securely in Vercel and never exposed publicly. This replaces the `.env` file — you never need to touch that file for production.

Go to your project in Vercel → **Settings → Environment Variables** and add each one:

| Variable Name | Where to find it |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys (starts with `pk_live_`) |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys (starts with `sk_live_`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar |
| `CLOUDFLARE_D1_DATABASE_ID` | Cloudflare → D1 → your database → Settings |
| `CLOUDFLARE_D1_TOKEN` | Cloudflare → API Tokens (the token you created earlier) |
| `CLOUDFLARE_R2_BUCKET_NAME` | The bucket name you chose (e.g. `pingu-studio-files`) |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Same as your Cloudflare Account ID |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 API Token → Access Key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API Token → Secret Access Key |

After adding all variables, go to **Deployments** and click **Redeploy**. The app should now be live.

---

## Step 4 — First Login

1. Go to your Vercel URL (e.g. `pingu-studio.vercel.app`)
2. Log in with the admin account you created in Clerk
3. You should land on the admin dashboard

---

## Day-to-day: Adding new users

Whenever you need to add a client or team member:

1. Go to [clerk.com](https://clerk.com) → your app → **Users**
2. Click **Create user**, enter their email and a password
3. Click on the user → **Public metadata** → set `{ "role": "client" }` or `{ "role": "team" }`
4. Send them the login URL and their credentials

That's it. They will only see what their role allows.

---

## About the `.env` file

The `.env` file in the project folder on your computer holds the same keys for **local development only**. It is intentionally excluded from GitHub (via `.gitignore`) so your secrets are never accidentally published. Vercel has its own secure copy of all the keys entered in Step 3 — those are what the live app uses. The two are completely separate.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| User gets "Access denied" after login | Role not set in Clerk | Add `{ "role": "..." }` to their public metadata |
| File uploads fail | R2 credentials wrong or bucket name mismatch | Double-check `CLOUDFLARE_R2_BUCKET_NAME` and access keys in Vercel |
| Database errors / blank data | Schema not applied | Re-run the `wrangler d1 execute` commands from Step 1 |
| App shows old version | Vercel cache | Go to Vercel → Deployments → Redeploy |
| Login page shows but login fails | Clerk keys wrong | Check `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Vercel env vars |

---

## Summary checklist

- [ ] Cloudflare account created
- [ ] D1 database created and all schema files executed
- [ ] R2 bucket created and API token generated
- [ ] Clerk account created, application set up, email-only sign-in enabled
- [ ] All users invited in Clerk with correct roles set
- [ ] Vercel project created and linked to GitHub
- [ ] All 9 environment variables added in Vercel
- [ ] App redeployed after adding variables
- [ ] Admin login tested successfully
