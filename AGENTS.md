# AGENTS.md — Video Editing Workflow Platform

> This document is the **single source of truth** for every AI agent, developer, or contributor working on this project. Read it fully before writing a single line of code.

---

## 1. Project Overview

This is a **private, invite-only SaaS workflow platform** for a video content agency. It orchestrates the full lifecycle of a client video project — from upload to final approval — for a small internal team led by an admin (Cyril).

It is **not** a public product. All access is provisioned manually by the admin. There is no self-sign-up. The platform is served on the **agency's own branded domain** — clients never see a raw Supabase URL.

### Tech Stack (inherited from reference project)

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui (Radix UI primitives) |
| Styling | Tailwind CSS (`Space Grotesk` body, `Syne` headings) |
| State / Data Fetching | TanStack React Query v5 |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + RLS) |
| File Storage | **Cloud Storage Adapter** (plug-and-play — see §9) |
| Forms | React Hook Form + Zod |
| Routing | React Router DOM v6 |
| Notifications (in-app) | Sonner + shadcn Toast + Supabase Realtime |
| Notifications (external) | Transactional email + SMS/WhatsApp (see §10) |

### Design Language (from reference screenshot)

- **Background:** near-black `hsl(240 10% 4%)` — CSS var `--background`
- **Cards:** slightly lighter `hsl(240 10% 6%)` — CSS var `--card`
- **Primary accent:** vivid purple `hsl(280 100% 65%)` — CSS var `--primary`
- **Secondary accent:** hot pink/magenta `hsl(320 100% 60%)` — CSS var `--secondary`
- **Service cards** use a subtle dark border with rounded corners (`--radius: 0.75rem`), icon in a purple gradient square, white heading, muted body text
- **CTA buttons** use a pill shape with `bg-gradient-to-r from-primary to-secondary` and a soft glow shadow
- Typography: `Syne` for all headings, `Space Grotesk` for body — both from Google Fonts

---

## 2. Roles & Permissions

There are exactly **three roles** in this system. No role is self-assignable.

### 2.1 `admin`
- Cyril (and any future admins added manually in the DB)
- Creates all user accounts (client and team) and assigns plans to clients
- Assigns team members to projects
- Reviews videos before client sees them
- Can approve or reject with timeline comments
- Can make a video visible to the client
- Has full read/write access to everything

### 2.2 `team`
- Internal editors and content creators
- Receives assignment notifications
- Uploads deliverables and sets project status to `in_review`
- Receives revision instructions via timeline comments
- Can only see projects they are assigned to

### 2.3 `client`
- End customer, always tied to a **plan** (see §3)
- Has a workspace showing **all their projects** across time
- Uploads source video, instructions, and supporting files at project creation
- Is notified when their video is ready to watch
- Can **watch and download** a deliverable only after the project reaches `client_approved`
- If rejecting, provides feedback via the **Timeline Commentor** (see §6.3)
- Cannot see any other client's data

---

## 3. Plans & Packages

Every `client` profile is tied to a **plan** that governs two hard limits: the number of deliverable videos per project and the number of client-side revision rounds. These limits are enforced **server-side** — never in the UI alone.

### 3.1 `plans` table

```sql
CREATE TABLE public.plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,           -- e.g. "Starter", "Growth", "Pro"
  max_deliverables      INT NOT NULL DEFAULT 1,         -- max files of type 'deliverable' per project
  max_client_revisions  INT NOT NULL DEFAULT 2,         -- -1 = unlimited
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS:** Only `admin` can INSERT / UPDATE / DELETE. All authenticated users can SELECT (needed to display plan info in dashboards).

### 3.2 Plan attached to client profile

```sql
-- Added to profiles table
plan_id UUID REFERENCES public.plans(id)   -- required for 'client' role, NULL for team/admin
```

Admin sets `plan_id` when creating a client account. Admin can change it at any time — this affects future projects only, not active ones in progress.

### 3.3 Plan snapshot on each project

When a project is created, the plan's limits are **copied onto the project row** as a snapshot. This ensures that upgrading or downgrading a client mid-project does not corrupt active work.

```sql
-- Added to projects table
max_deliverables      INT NOT NULL DEFAULT 1,
max_client_revisions  INT NOT NULL DEFAULT 2,
client_revision_count INT NOT NULL DEFAULT 0
```

### 3.4 Revision enforcement rules

- Every time a client submits a rejection, a server-side Edge Function increments `client_revision_count`
- Before accepting, it compares `client_revision_count + 1` against `max_client_revisions`
- If `max_client_revisions = -1` → always allow (unlimited plan)
- If limit is reached → return `HTTP 403` with body `{ "error": "revision_limit_reached" }`
- The UI must show remaining revisions at all times: **"X revision(s) remaining on your plan"**
- If 0 remaining, the Reject button is disabled with tooltip: _"Revision limit reached — contact your account manager"_
- **Admin → Team revision loops are always unlimited.** This cap only applies to client-facing rejections.

---

## 4. Database Schema

All tables live in the `public` schema. Row-Level Security (RLS) **must be enabled on every table**. Never expose `service_role` key to the frontend.

### 4.1 `profiles`
Extends Supabase `auth.users`. Created automatically via trigger on `auth.users` insert.

```sql
CREATE TABLE public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('admin', 'team', 'client')),
  full_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,                              -- E.164 format for SMS, nullable
  avatar_url       TEXT,
  plan_id          UUID REFERENCES public.plans(id),  -- required for 'client', null otherwise
  password_changed BOOLEAN NOT NULL DEFAULT FALSE,    -- forces change on first login
  disabled         BOOLEAN NOT NULL DEFAULT FALSE,    -- soft-disable by admin
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS policies:**
- `admin` can SELECT / UPDATE all rows
- Any authenticated user can SELECT their own row (`auth.uid() = id`)
- INSERT only via the server-side Edge Function (§7.1) — never from the client directly
- All queries implicitly filter `disabled = false` via RLS

---

### 4.2 `projects`
One row per client project.

```sql
CREATE TYPE project_status AS ENUM (
  'pending_assignment',   -- created, admin hasn't assigned team yet
  'in_progress',          -- team is actively editing
  'in_review',            -- team marked done, waiting for admin review
  'admin_approved',       -- admin approved, client notified
  'client_reviewing',     -- client is watching
  'client_approved',      -- client approved → SUCCESS
  'revision_requested'    -- client or admin rejected → revision loop
);

CREATE TABLE public.projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES public.profiles(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  status                project_status NOT NULL DEFAULT 'pending_assignment',
  instructions          TEXT,
  -- plan snapshot (copied from client's plan at creation time via trigger)
  max_deliverables      INT NOT NULL DEFAULT 1,
  max_client_revisions  INT NOT NULL DEFAULT 2,
  client_revision_count INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS policies:**
- `admin` can SELECT / UPDATE all
- `client` can SELECT all their own projects (`client_id = auth.uid()`); can INSERT
- `team` can SELECT only assigned projects (via `project_assignments`)
- No role can DELETE (soft changes via status only)

---

### 4.3 `project_files`
All files attached to a project (source uploads, deliverables, attachments).

```sql
CREATE TYPE file_type AS ENUM ('source_video', 'deliverable', 'attachment');

CREATE TABLE public.project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploader_id   UUID NOT NULL REFERENCES public.profiles(id),
  file_type     file_type NOT NULL,
  storage_key   TEXT NOT NULL,       -- opaque key in cloud storage (see §9)
  file_name     TEXT NOT NULL,       -- original filename for display
  file_size     BIGINT,              -- bytes
  mime_type     TEXT,
  approved      BOOLEAN NOT NULL DEFAULT FALSE,  -- true = client can download
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Important:** `approved` on a deliverable is set to `true` only when `project.status` transitions to `client_approved`. The download Edge Function checks this flag before issuing a signed URL to a client. Admin and team always receive signed URLs regardless.

**RLS policies:**
- `admin` can SELECT all
- `client` can SELECT files for their own projects; can INSERT source/attachment files
- `team` can SELECT / INSERT files for assigned projects

---

### 4.4 `project_assignments`
Maps team members to projects. Populated by admin only.

```sql
CREATE TABLE public.project_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id  UUID NOT NULL REFERENCES public.profiles(id),
  assigned_by     UUID NOT NULL REFERENCES public.profiles(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, team_member_id)
);
```

**RLS policies:**
- `admin` full access
- `team` can SELECT their own rows
- `client` no access

---

### 4.5 `timeline_comments`
The core revision communication mechanism. Timestamps reference the video timeline in seconds.

```sql
CREATE TYPE comment_author_role AS ENUM ('admin', 'team', 'client');

CREATE TABLE public.timeline_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES public.profiles(id),
  author_role     comment_author_role NOT NULL,
  timestamp_sec   NUMERIC(8, 2),      -- nullable for general (non-timestamped) comments
  comment_text    TEXT NOT NULL,
  revision_round  INT NOT NULL DEFAULT 1,  -- which revision cycle this comment belongs to
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS policies:**
- `admin` can SELECT / INSERT on all projects
- `client` can SELECT / INSERT on their own projects
- `team` can SELECT / INSERT on assigned projects

---

### 4.6 `notifications`
In-app notification log. Also triggers external delivery (email / SMS) via Edge Function hook.

```sql
CREATE TYPE notification_type AS ENUM (
  'project_created',
  'team_assigned',
  'status_changed',
  'comment_added',
  'video_ready_for_review',
  'revision_requested',
  'project_approved'
);

CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL REFERENCES public.profiles(id),
  project_id    UUID REFERENCES public.projects(id),
  type          notification_type NOT NULL,
  message       TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS policies:**
- Each user can only SELECT their own notifications (`recipient_id = auth.uid()`)
- INSERT only via server-side triggers / Edge Functions — never from the client directly

---

### 4.7 Database Triggers (required)

```sql
-- 1. Auto-create profile on user signup
CREATE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Auto-update updated_at on projects
CREATE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Snapshot plan limits onto new project at creation time
CREATE FUNCTION snapshot_plan_on_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_plan plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan
  FROM public.plans
  WHERE id = (SELECT plan_id FROM public.profiles WHERE id = NEW.client_id);
  IF FOUND THEN
    NEW.max_deliverables     := v_plan.max_deliverables;
    NEW.max_client_revisions := v_plan.max_client_revisions;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_snapshot_plan
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION snapshot_plan_on_project();
```

---

## 5. Authentication & Account Management

### 5.1 No Self-Sign-Up
- Supabase Auth **must have email sign-ups disabled** in the dashboard
- The only way an account is created is via the admin-only `create-user` Edge Function (§7.1)
- Login is **email + password** only — no OAuth, no magic link

### 5.2 Branded Login Portal
- Login page lives at `https://<agency-domain>/login`
- Fully styled in the agency design language (dark theme, purple/magenta accents, Syne headings)
- No Supabase branding anywhere visible
- `<title>` and favicon must match the agency brand

### 5.3 Session Handling

```ts
// src/integrations/supabase/client.ts
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

### 5.4 Route Protection
Every authenticated route uses `<ProtectedRoute>` which:
1. Calls `supabase.auth.getSession()`
2. Redirects to `/login` if no session
3. Checks `profile.role` and redirects to the correct root if a user hits a wrong-role path
4. Checks `profile.password_changed` — redirects to `/change-password` if `false`

```
/login                    → public
/change-password          → any authenticated user with password_changed = false
/admin/*                  → role === 'admin' only
/workspace/*              → role === 'client' only
/team/*                   → role === 'team' only
```

### 5.5 Password Policy
- Minimum 12 characters
- Must contain uppercase, lowercase, number, and symbol
- Enforced via Zod on the admin creation form and the change-password form
- Temporary password is auto-generated (16 chars, cryptographically random) and sent in the welcome message

### 5.6 Temporary Password Flow
1. Admin creates account → system generates temp password → sends welcome email + SMS with credentials
2. On first login, `password_changed = false` → user is hard-redirected to `/change-password`
3. Cannot navigate elsewhere until password is changed
4. On success, `password_changed` is set to `true` → redirect to role's home

---

## 6. Core User Flows

### 6.1 Client Creates a Project
1. Client logs into their workspace at `/workspace`
2. Clicks **"New Project"**
3. Fills in: title, instructions/description, uploads source video + supporting files
4. Files upload via Storage Adapter (§9); keys saved to `project_files`
5. `projects` row created (`status = 'pending_assignment'`); plan limits snapshotted via DB trigger
6. `notifications` inserted for all `admin` profiles, type `project_created`
7. Client sees project card in a **"Waiting for assignment"** state

### 6.2 Admin Assigns Team
1. Admin sees new project on the workflow board at `/admin/projects`
2. Opens project detail — views source video and instructions
3. Selects one or more team members → `project_assignments` rows created
4. Each assigned team member receives `team_assigned` notification (in-app + email + SMS)
5. Project status → `in_progress`

### 6.3 Team Edits & Submits for Review
1. Team member goes to `/team` → sees assigned projects
2. Opens project, reads instructions, watches source video
3. Uploads deliverable video(s) — up to `max_deliverables` files per project
4. Sets project status to `in_review`
5. Admin receives `video_ready_for_review` notification

### 6.4 Admin Reviews
1. Admin watches the deliverable in the built-in **Timeline Commentor** player
2. **Path A — Approve:** Status → `admin_approved`. Client notified (in-app + email + SMS).
3. **Path B — Reject:** Admin adds timestamped comments. Status → `revision_requested`. Assigned team notified. Loops back to §6.3. _(Admin rejection loops are always unlimited.)_

### 6.5 Client Reviews
1. Client receives notification: _"Your video is ready"_
2. Client watches deliverable in workspace player; remaining revisions counter visible at all times
3. **Path A — Approve:** Status → `client_approved`. Download becomes available. Admin + team notified. **SUCCESS.**
4. **Path B — Reject:** Client submits timestamped feedback. Revision count incremented server-side. If under limit → status → `revision_requested`, admin + team notified, loops to §6.3. If at limit → action is blocked.

### 6.6 Timeline Commentor Format
Every revision comment enforces this structure in the UI form:

```
[MM:SS] — <description of the change required>
```

Examples:
```
[00:45] — Cut the pause here, jump directly to the next sentence
[01:12] — Replace the background music, it's too loud relative to the voiceover
[02:30] — Add lower-third text: "Book a call → link.com"
```

- `timestamp_sec` stores the numeric seconds value
- The player **seeks to that timestamp** when the user clicks a comment in the thread
- `revision_round` on each comment tracks which revision cycle it belongs to; old rounds are collapsible

### 6.7 Client Download
- Download button only renders when `project.status = 'client_approved'` AND `project_file.approved = true`
- Clicking calls `get-download-url` Edge Function which issues a signed URL (1 hour expiry)
- The signed URL is never embedded in the page source — always fetched fresh on click
- Download is logged (timestamp + `profile.id`) for audit purposes

---

## 7. Admin-Only Edge Functions

All Edge Functions run server-side with `service_role`. Each must verify the caller is `admin` via JWT before executing.

### 7.1 `create-user`

**Input:**
```json
{
  "full_name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+33612345678",
  "role": "client" | "team",
  "plan_id": "<uuid>"   // required if role = 'client'
}
```

**Steps:**
1. Verify caller role = `admin`
2. Generate a 16-char cryptographically random temporary password
3. Call `supabase.auth.admin.createUser()` with `email_confirm: true`, passing `full_name`, `role`, `plan_id` in `raw_user_meta_data`
4. DB trigger creates `profiles` row
5. Send welcome email AND SMS with login URL + temp credentials (see §10)
6. Return `{ id, email, temporary_password }`

### 7.2 `disable-user`
- Sets `profiles.disabled = true`
- Calls `supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })` to invalidate active sessions
- Does **not** delete the auth user or any project data

### 7.3 `submit-revision` (client-triggered, server-enforced)
Called when a client submits a rejection. Must be server-side to enforce revision caps:

1. Verify caller is the project's `client_id`
2. Load `project.client_revision_count` and `project.max_client_revisions`
3. If `max_client_revisions !== -1` AND `client_revision_count >= max_client_revisions` → return `403 revision_limit_reached`
4. Insert `timeline_comments` rows
5. Increment `client_revision_count`
6. Update `project.status = 'revision_requested'`
7. Insert notifications for admin + assigned team

### 7.4 `get-download-url`
Called when client clicks Download:

1. Verify caller is the project's `client_id`
2. Verify `project.status = 'client_approved'`
3. Verify `project_file.approved = true`
4. Generate signed URL (3600s expiry)
5. Insert download audit log row
6. Return `{ signedUrl }`

---

## 8. Frontend Page & Component Map

```
src/
├── pages/
│   ├── Login.tsx                          # branded login, email + password
│   ├── ChangePassword.tsx                 # forced on first login
│   ├── admin/
│   │   ├── AdminProjects.tsx              # kanban board + list view toggle
│   │   ├── AdminProjectDetail.tsx         # video player, timeline comments, assign team
│   │   ├── AdminUserManagement.tsx        # create/disable client & team accounts
│   │   └── AdminAnalytics.tsx            # reporting dashboard (see §11)
│   ├── workspace/                         # client portal (branded)
│   │   ├── ClientWorkspace.tsx            # all client projects, status overview
│   │   ├── ClientNewProject.tsx           # upload form
│   │   └── ClientProjectDetail.tsx        # watch, approve/reject, download, revision counter
│   └── team/
│       ├── TeamDashboard.tsx              # assigned projects list
│       └── TeamProjectDetail.tsx          # view instructions, upload deliverable, set status
├── components/
│   ├── auth/
│   │   ├── ProtectedRoute.tsx
│   │   └── ForcePasswordChange.tsx
│   ├── project/
│   │   ├── ProjectStatusBadge.tsx         # color-coded pill per status
│   │   ├── TimelineCommentor.tsx          # Plyr.js player + timestamped comment thread
│   │   ├── FileUploader.tsx               # wraps Storage Adapter (§9)
│   │   ├── DeliverableCounter.tsx         # shows X / N deliverables used
│   │   ├── RevisionCounter.tsx            # remaining revisions counter (client-facing)
│   │   └── ProjectCard.tsx               # used in all dashboard lists
│   ├── admin/
│   │   ├── KanbanBoard.tsx                # drag-and-drop columns per project_status
│   │   ├── ProjectTable.tsx               # sortable/filterable list view
│   │   └── CreateUserModal.tsx            # admin account creation form
│   ├── notifications/
│   │   └── NotificationBell.tsx           # real-time unread count + dropdown
│   └── ui/                               # shadcn/ui — do not modify
├── integrations/
│   └── supabase/
│       ├── client.ts
│       └── types.ts                      # regenerate after every migration
├── lib/
│   ├── storage.ts                         # Storage Adapter (§9)
│   └── utils.ts
└── hooks/
    ├── useAuth.ts                         # current user + role + plan
    ├── useProjects.ts                     # project CRUD + status transitions
    ├── useNotifications.ts                # real-time Supabase Realtime subscription
    └── use-toast.ts
```

---

## 9. Cloud Storage Adapter (Plug-and-Play)

> **Current state:** No dedicated storage backend yet. All file logic must go through a single abstraction so the provider can be swapped without touching any component.

### 9.1 The Adapter Interface

```ts
// src/lib/storage.ts
export interface StorageAdapter {
  /** Upload a file. Returns an opaque storage key — never a URL. */
  upload(params: {
    file: File;
    projectId: string;
    fileType: 'source_video' | 'deliverable' | 'attachment';
    onProgress?: (percent: number) => void;
  }): Promise<{ key: string }>;

  /** Get a short-lived signed URL. Never cache or persist this. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Hard delete a file by key. */
  delete(key: string): Promise<void>;
}
```

### 9.2 Key Naming Convention

```
projects/{projectId}/{fileType}/{timestamp}-{sanitizedFileName}
```

Example: `projects/abc-123/deliverable/1712345678-final-cut.mp4`

### 9.3 Current Stub (Supabase Storage)

```ts
import { supabase } from '@/integrations/supabase/client';

export const storageAdapter: StorageAdapter = {
  async upload({ file, projectId, fileType }) {
    const key = `projects/${projectId}/${fileType}/${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
    const { error } = await supabase.storage
      .from('project-files')
      .upload(key, file, { upsert: false });
    if (error) throw error;
    return { key };
  },

  async getSignedUrl(key, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
      .from('project-files')
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw error;
    return data.signedUrl;
  },

  async delete(key) {
    const { error } = await supabase.storage
      .from('project-files')
      .remove([key]);
    if (error) throw error;
  },
};
```

The `project-files` bucket must be **private** (zero public access). Signed URLs are the only valid access path.

### 9.4 Swapping to a Real Provider
1. Create `src/lib/storage.{provider}.ts` implementing `StorageAdapter`
2. Update the single export in `src/lib/storage.ts` to point to the new implementation
3. Zero component-level changes needed

---

## 10. External Notifications (Email + SMS/WhatsApp)

All external delivery is handled by a single Edge Function: `send-notification`, triggered by a Postgres hook after every INSERT into `notifications`.

### 10.1 Postgres Trigger → Edge Function

```sql
CREATE FUNCTION notify_external()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url  := current_setting('app.edge_function_url') || '/send-notification',
    body := row_to_json(NEW)::text
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION notify_external();
```

### 10.2 `send-notification` Edge Function Responsibilities
1. Load recipient's `profiles` row (email + phone)
2. Render message from `notification_type` and `message` fields
3. Send **email** via Resend (key in `.env.server`)
4. Send **SMS or WhatsApp** via Twilio if `phone IS NOT NULL`
5. Log delivery status — fire and forget, do not block the main flow

### 10.3 Notification Delivery Matrix

| Event | In-app | Email | SMS/WhatsApp |
|---|---|---|---|
| Client creates project | Admin ✓ | Admin ✓ | Admin ✓ |
| Admin assigns team member | Team member ✓ | Team member ✓ | Team member ✓ |
| Team sets `in_review` | Admin ✓ | Admin ✓ | Admin ✓ |
| Admin approves (`admin_approved`) | Client ✓ | Client ✓ | Client ✓ |
| Admin rejects with comments | Assigned team ✓ | Assigned team ✓ | — |
| Client approves (`client_approved`) | Admin + Team ✓ | Admin ✓ | — |
| Client rejects (revision) | Admin + Team ✓ | Admin + Team ✓ | Admin ✓ |

---

## 11. Admin Dashboard — Kanban + List + Analytics

### 11.1 Kanban Board (`/admin/projects` — default view)
- One column per `project_status` (7 columns)
- Each card shows: client name, project title, assigned team avatars, last updated timestamp
- Cards are **draggable** between columns — triggers a status update with confirmation for sensitive transitions (e.g. → `client_approved`)
- Color-coded urgency: `revision_requested` = red, `pending_assignment` = amber, others = neutral

### 11.2 List View (toggle from kanban)
- Sortable table: client, title, status badge, assigned team, created date, last updated
- Filterable by status, team member, date range
- Row click opens project detail

### 11.3 Analytics Dashboard (`/admin/analytics`)
All metrics derived from existing tables — no separate analytics DB needed. Use `recharts` (already in the reference project's dependencies) for all charts.

| Metric | Chart type | Source |
|---|---|---|
| Projects by status | Donut | `projects.status` counts |
| Monthly project volume | Line | `projects.created_at` by month |
| Average turnaround time | KPI card | `created_at` → `updated_at` at `client_approved` |
| Average client revision rounds | KPI card | avg `client_revision_count` |
| Client revision rate (% with ≥1 revision) | KPI card | `client_revision_count > 0` ratio |
| Team member workload | Bar | `project_assignments` grouped by `team_member_id` |

---

## 12. Video Player — Timeline Commentor

The `TimelineCommentor` component wraps **Plyr.js** (`plyr` npm package). Plyr is chosen for its clean, fully styleable HTML5 player with a well-documented JS API for programmatic seeking — essential for timestamp-driven comment navigation — and solid support for large video files.

### 12.1 Behavior
- Video source is always a **fresh signed URL** fetched on mount (never hardcoded)
- Signed URL is refreshed automatically if the player fires an `error` event (expired URL)
- Comment thread lives alongside the player; clicking a comment calls `player.currentTime = timestamp_sec`
- When the player is paused, an **"Add comment at [MM:SS]"** button appears pre-filled with current timestamp
- Comments are grouped by `revision_round` — older rounds are collapsible

### 12.2 Access Rules in the Component

| Role | Can view comments | Can add comments | Condition |
|---|---|---|---|
| `client` | Own rounds only | Yes | Only when `status = 'client_reviewing'` |
| `team` | All rounds | No | Read-only |
| `admin` | All rounds | Yes | Always |

---

## 13. Security Rules (Non-Negotiable)

1. **Never expose `service_role` key** in frontend code or any env var accessible to the browser
2. **RLS on every table.** Every migration that adds a table must include RLS policies in the same file
3. **All file access via signed URLs.** `project-files` bucket is private. Zero public URLs
4. **Validate role server-side.** Edge Functions must re-query `profiles.role` from the DB — never trust a JWT claim alone
5. **No direct `auth.users` manipulation from components.** All user management goes through Edge Functions
6. **Zod on all forms.** Every form that writes to the DB has a Zod schema. `as any` is banned
7. **CORS.** Edge Functions allow only the agency domain origin. No `*` wildcard in production
8. **`.env` hygiene.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. Everything else in `.env.server` (Edge Functions only, never committed)
9. **Revision cap enforced server-side.** The UI counter is informational only. `submit-revision` Edge Function is the authority
10. **Download gating.** Signed download URLs for deliverables only issued by `get-download-url` Edge Function after verifying `project.status = 'client_approved'` AND `project_file.approved = true`

---

## 14. Project Status State Machine

```
[Client Creates Project]
         │
         ▼
  pending_assignment
         │ Admin assigns team
         ▼
    in_progress
         │ Team uploads deliverable(s) + sets status
         ▼
      in_review ◄──────────────────────────────────────────┐
         │ Admin watches                                    │
    ┌────┴────┐                                             │
    │         │                                             │
 Admin      Admin                                           │
Approves   Rejects (unlimited — no cap)                    │
    │         │ + timeline comments                         │
    │         └──► revision_requested ──────────────────────┘
    ▼                   (team edits)
admin_approved
    │ Client notified (email + SMS)
    ▼
client_reviewing
    │ Client watches — remaining revisions counter visible
    ┌────┴────┐
    │         │
Client     Client
Approves  Rejects (capped by plan)
    │         │ + timeline comments
    │         │ revision_count < max  → allowed
    │         │ revision_count = max → BLOCKED (403)
    │         └──► revision_requested ──────────────────────┐
    ▼                   (team edits)                         │
client_approved                                       in_review ──┘
(SUCCESS)
Download unlocked
```

---

## 15. Environment Variables

```bash
# .env  (browser-safe — only anon/publishable keys — can be committed)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>

# .env.server  (Edge Functions only — NEVER in Vite build — NEVER committed)
SUPABASE_SERVICE_ROLE_KEY=<service role key>
RESEND_API_KEY=<transactional email key>
TWILIO_ACCOUNT_SID=<twilio sid>
TWILIO_AUTH_TOKEN=<twilio token>
TWILIO_FROM_NUMBER=<E.164 sender or WhatsApp sandbox number>
STORAGE_PROVIDER_KEY=<cloud storage api key>       # when real storage is plugged in
STORAGE_PROVIDER_BUCKET=<bucket name>
APP_ORIGIN=https://<agency-domain>                 # used for CORS + email links
```

---

## 16. Commands

```bash
# Install dependencies
npm install

# Local dev
npm run dev

# Type-check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build

# Regenerate Supabase types after every schema migration
npx supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts

# Run Supabase locally (optional)
npx supabase start
```

---

## 17. Agent Checklist Before Any Code Change

- [ ] Does this change touch auth or RLS? → Add/update policies in a new migration file
- [ ] Does this change add a table? → Schema + RLS + triggers + regenerate types
- [ ] Does this change upload or read a file? → Use `storageAdapter` only, never call storage directly from a component
- [ ] Does this change involve a new route? → Add role guard in `App.tsx` and `ProtectedRoute`
- [ ] Does this change trigger a notification? → Insert to `notifications` via server function, not client-side
- [ ] Does this change let a client reject? → Must go through `submit-revision` Edge Function — never update status client-side
- [ ] Does this change serve a deliverable to a client? → Must go through `get-download-url` Edge Function — check `approved` flag
- [ ] Does this change expose sensitive data? → Confirm RLS blocks cross-user access
- [ ] Is there a Zod schema for all new form inputs? → Required before any DB write
- [ ] Does this change add an Edge Function? → Verify admin JWT check, CORS header, and error logging are all present

---

*Last updated: 2026-03-08 — update this date whenever the document changes.*
