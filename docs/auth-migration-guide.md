# Auth Migration Guide — Clerk → Custom JWT

Clerk has been fully removed. Auth is now handled by your own JWT + D1 + bcrypt stack. Follow these steps to get everything working.

---

## Step 1 — Add the JWT_SECRET environment variable in Vercel

1. Go to [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `JWT_SECRET`
   - **Value:** any long random string (64+ characters). You can generate one at [generate-secret.vercel.app](https://generate-secret.vercel.app/64)
   - **Environments:** Production, Preview, Development (check all three)
3. Click **Save**

> This secret signs and verifies all login tokens. Never share it or commit it to git.

---

## Step 2 — Add the password_hash column to D1

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **D1** → your database
2. Click **Console**
3. Run:

```sql
ALTER TABLE profiles ADD COLUMN password_hash TEXT;
```

4. Click **Execute** — you should see `success: true`

---

## Step 3 — Set the initial password for the admin account

You cannot log in yet because there is no password hash stored. You need to insert a bcrypt hash directly.

### Option A — Use this pre-generated hash (recommended for first setup)

This hash corresponds to the temporary password: `Admin@Pingu2024!`

```sql
UPDATE profiles
SET password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCc1HVyHMRqXqnbLgNqj.oC'
WHERE email = 'cyril@projectpingu.com';
```

> After logging in, immediately go to **Change Password** to set a real password.

### Option B — Generate your own hash

If you want a different temporary password:

1. Go to [bcrypt-generator.com](https://bcrypt-generator.com)
2. Enter your desired temporary password, cost factor **12**
3. Copy the generated hash
4. Run in the D1 console:

```sql
UPDATE profiles
SET password_hash = 'PASTE_YOUR_HASH_HERE'
WHERE email = 'cyril@projectpingu.com';
```

---

## Step 4 — Redeploy

Push the code to trigger a Vercel deployment. If it was already pushed:

1. Go to Vercel → your project → **Deployments**
2. Click the three dots on the latest deployment → **Redeploy**

Wait for the build to finish (should be clean — no Clerk errors).

---

## Step 5 — Log in

1. Go to `dashboard.projectpingu.com/login`
2. Enter `cyril@projectpingu.com` and the temporary password from Step 3
3. You will be redirected to the **Change Password** page — set a real secure password
4. You will then land on the admin dashboard

---

## Step 6 — Add new users

When adding new users (admin, team, or client), they no longer go through Clerk. The flow is:

1. **Admin → Users → Create user** (this inserts a row in D1 with no password_hash)
2. Tell the user their email
3. **You (admin) set their initial password** via the D1 console:

```sql
UPDATE profiles
SET password_hash = 'BCRYPT_HASH_OF_TEMP_PASSWORD'
WHERE email = 'newuser@example.com';
```

4. Share the temporary password with the user — they will be forced to change it on first login (`password_changed = 0`)

> Future improvement: add a "Send invite / reset password" email flow so admins don't need to touch D1 for each user.

---

## What changed in the code

| Before (Clerk) | After (Custom JWT) |
|---|---|
| `useSignIn()` from `@clerk/react` | `fetch('/api/auth/login')` |
| `signIn.password()` | `POST /api/auth/login` → bcrypt compare |
| `signIn.finalize()` | Returns JWT, stored in `localStorage` |
| `useUser()` from `@clerk/react` | `useAuth()` reads token from localStorage |
| `useClerk().signOut()` | `clearToken()` + `navigate('/login')` |
| `verifyToken()` from `@clerk/backend` | `jwtVerify()` from `jose` |
| `user.updatePassword()` | `POST /api/auth/change-password` → bcrypt hash stored in D1 |

No Clerk packages remain. `@clerk/react` and `@clerk/backend` have been removed.

---

## Environment variables required

| Variable | Where | Purpose |
|---|---|---|
| `JWT_SECRET` | Vercel | Signs and verifies login tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Vercel | D1 access (already set) |
| `CLOUDFLARE_D1_DATABASE_ID` | Vercel | D1 access (already set) |
| `CLOUDFLARE_D1_TOKEN` | Vercel | D1 access (already set) |
| `CLOUDFLARE_R2_*` | Vercel | File storage (already set) |

The only **new** variable you need to add is `JWT_SECRET`.
