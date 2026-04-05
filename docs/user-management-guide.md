# User Management Guide — Studio Portal

This guide covers everything about adding, managing, and removing clients and team members.

---

## Where to manage users

Go to **Admin → Users** in the top navigation bar. You will see a table of all accounts showing name, email, role, plan, storage usage, phone, and status.

---

## Adding a team member

Team members are your video editors and internal staff. They can be assigned to projects, upload deliverables, and see their own calendar.

1. Click **+ Create Account** (top right of the Users page)
2. Select **Team** (the role toggle at the top of the form)
3. Fill in:
   - **Full Name** — required
   - **Email** — required, must be unique
   - **Phone** — optional
4. Click **Create Account**

A temporary password will appear in a blue notification bar at the top of the screen for 15 seconds — **copy it immediately**. Send it to the team member along with the portal URL.

They will be prompted to set a new password on their first login.

> Team members do not need a plan assigned. The plan field only appears for clients.

---

## Adding a client

Clients can submit projects, review deliverables, request revisions, and see their own workspace and analytics.

1. Click **+ Create Account**
2. Select **Client**
3. Fill in:
   - **Full Name** — required
   - **Email** — required, must be unique
   - **Phone** — optional
   - **Plan** — required. Choose from the plans you have configured. The plan controls how many active projects, deliverables, revisions, and storage the client gets.
4. Click **Create Account**

Copy the temporary password from the notification bar — it disappears after 15 seconds. Send it to the client along with the portal URL.

They will be prompted to set a new password on their first login.

---

## What the client receives on first login

When a client logs in for the first time with their temporary password, the portal immediately redirects them to a password change screen. They must set a new password before they can access anything. This happens automatically — no setup needed on your end.

---

## Editing a user

Currently, user details (name, phone, plan) can be updated via the API but there is no edit form in the UI — you would need to do this directly through the Cloudflare D1 console if needed.

To change a client's plan via D1:

1. Cloudflare → D1 → your database → **Console**
2. Run:
```sql
UPDATE profiles SET plan_id = 'NEW_PLAN_ID_HERE' WHERE email = 'client@example.com';
```

To find a plan's ID:
```sql
SELECT id, name FROM plans;
```

---

## Disabling a user

Disabling blocks the account immediately without deleting any data.

1. Find the user in the table
2. Click **Disable** in the Actions column
3. Confirm the prompt

The user is immediately signed out of all active sessions and cannot log back in. Their projects and files are untouched. Their row will appear faded in the table with a red "Disabled" badge.

To restore access, click **Enable** next to their name.

> You cannot disable the admin account.

---

## Deleting a user

Deletion is permanent and cannot be undone.

**What gets deleted for a client:**
- All their projects
- All files in those projects (removed from Cloudflare R2 storage)
- Their gallery files and folders
- Their notifications and timeline comments
- Their chat messages and connections
- Their Clerk login and allowlist entry

**What gets deleted for a team member:**
- Files they personally uploaded (deliverables)
- Their project assignments
- Their gallery files and folders
- Their notifications and timeline comments
- Their chat messages and group chats they created
- Their Clerk login and allowlist entry

To delete:
1. Click **Delete** in the Actions column
2. Read the confirmation prompt carefully
3. Click OK to proceed

> You cannot delete the admin account.

---

## Temporary password visibility

The temporary password is shown **once**, in a toast notification that disappears after 15 seconds. It is returned by the API at account creation time and is not stored anywhere — if you miss it, you will need to reset it manually via the Clerk dashboard:

1. Clerk dashboard → **Users** → find the user → **Edit** → set a new password

---

## What each role can do

| Feature | Admin | Team | Client |
|---|---|---|---|
| View all projects | Yes | Only assigned | Only own |
| Submit new projects | No | No | Yes |
| Upload deliverables | No | Yes | No |
| Request revisions | No | No | Yes |
| Approve deliverables | Yes | No | Yes (own projects) |
| Assign team members | Yes | No | No |
| View deadlines | Yes | Own only | No |
| Calendar | Full | Assigned events + own deadlines | Own events only |
| Gallery | Yes | Yes | Yes (own folder) |
| Messaging | Yes | Yes | Yes |
| Analytics | Yes (all clients) | Own stats | Own stats |
| Manage users | Yes | No | No |
| Manage plans | Yes | No | No |

---

*Document updated: April 2026*
