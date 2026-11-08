# Admin Setup Guide

How to create the first admin user (or any future admin).

---

## Step 1 — Create the user in Clerk

1. Go to [clerk.com](https://clerk.com) → your app → **Users** → **Create user**
2. Fill in email + password
3. Click **Create**
4. Copy the **User ID** (starts with `user_...`)

---

## Step 2 — Add the profile row in D1

1. Go to [cloudflare.com](https://cloudflare.com) → **Workers & Pages** → **D1** → your database → **Console**
2. Run this query (replace all values):

```sql
INSERT INTO profiles (id, role, full_name, email, phone, plan_id, client_id_label, password_changed, disabled, created_at, updated_at)
VALUES (
  'user_3Bx4ugVG0Xu81Sp0ls8jYicW3X2',
  'admin',
  'Cyril Baouab',
  'cyril@projectpingu.com',
  NULL,
  NULL,
  NULL,
  1,
  0,
  datetime('now'),
  datetime('now')
);
```

- Replace `user_XXXXXXXXXXXXXXXXXXXXXXXXXX` with the Clerk User ID from Step 1
- Replace `Your Name` and `your@email.com` with the real values
- `password_changed = 1` means they won't be prompted to change password on first login

---

## Step 3 — Set the role in Clerk metadata

1. In Clerk dashboard → **Users** → click the user
2. Scroll to **Public metadata**
3. Click **Edit** and enter:
```json
{ "role": "admin" }
```
4. Save

---

## Step 4 — Log in

Go to your app and log in with the credentials you set in Step 1. You'll have full admin access.

---

## Promoting an existing team member to admin

If the user already exists in the app (created via the admin UI as `team`):

**In D1 Console:**
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'their@email.com';
```

**In Clerk dashboard:**
1. Go to **Users** → click the user
2. Edit **Public metadata** → set `{ "role": "admin" }`
3. Save

Both must be updated — D1 controls what the app sees, Clerk metadata is checked on token verification.
