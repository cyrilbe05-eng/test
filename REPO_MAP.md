# REPO_MAP.md — Pingu Studio (video review & collaboration platform)

> Discovery snapshot, 2026-07-12. Stack confirmed **from code**, not from docs — several in-repo docs
> describe earlier architectures (see "Documentation status" at the bottom).

## 1. What this is

A private, invite-only video-review platform ("Pingu Studio") for a video agency. Three roles:
**admin** (the operator, Cyril), **team** (editors), **client**. Clients create projects and upload
source video; admin assigns editors; editors upload deliverables; admin then client review with
timestamped comments; revision loops are capped per plan; approved deliverables unlock download.

## 2. Actual tech stack (confirmed from code)

| Layer | Technology | Where |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite 6 (SWC) | `src/`, `vite.config.ts` |
| UI | Tailwind CSS 3, shadcn-style Radix primitives, lucide-react, Sonner toasts | `src/components/`, `tailwind.config.ts` |
| Data fetching | TanStack React Query v5 | `src/hooks/*` |
| Routing | React Router DOM v6 | `src/App.tsx` |
| Forms | React Hook Form + Zod | throughout pages |
| Video player | Plyr 3 | `src/components/project/TimelineCommentor.tsx` |
| Charts | Recharts | analytics pages |
| Backend | **One Vercel serverless catch-all function** (~3,740 lines) + one cron function | `api/[...slug].ts`, `api/cron/budget-nudge.ts` |
| API build | esbuild pre-bundle to `api/[...slug].mjs` (part of `npm run build`) | `build-api.mjs` |
| Database | **Cloudflare D1** (SQLite) via Cloudflare REST API — no ORM, raw SQL | `api/_helpers/db.ts` |
| File storage | **Cloudflare R2** via AWS S3 SDK presigned URLs (browser uploads direct to R2) | `api/_helpers/r2.ts` |
| Auth | **Custom email+password**: bcryptjs hashes, HS256 JWT (jose, 30-day expiry), `Authorization: Bearer` | `api/_helpers/auth.ts`, `src/lib/auth.ts` |
| Email | nodemailer over SMTP, branded HTML template; silently no-ops if SMTP env unset | `api/_helpers/email.ts` |
| Hosting | Vercel — SPA rewrites, immutable asset caching, weekly cron (Mon 09:00 `budget-nudge`) | `vercel.json` |
| CI | **None** (no `.github/workflows`). Deploys via Vercel Git integration on push to `main` |  |
| Tests | **None. No test framework installed.** |  |
| Lint | ESLint 9 in devDeps, `npm run lint` script exists — **but no `eslint.config.js`, so lint is currently broken** |  |

**Migration history baked into the code:** Supabase (v1) → Clerk + D1/R2 (v2) → custom JWT auth (v3, current).
Leftovers: `profiles.id` values are former Clerk user IDs; `auth.ts` exports a `createClerkAdmin()` stub;
`.env` still contains `VITE_CLERK_PUBLISHABLE_KEY`; `supabase/` folder is dead code from v1.

**Demo mode:** `VITE_DEMO_MODE=true` swaps in a complete parallel mock app (`src/demo/*`, ~20 pages with
`mockData.ts`, no API calls). Doubles the UI surface — any UI change must decide whether to mirror it in demo.

## 3. Database schema (Cloudflare D1, applied manually via wrangler)

Four schema files in `db/` (no migrations framework; "migrations" are commented-out `ALTER TABLE` helpers
inside `schema.sql` that the operator runs by hand in the D1 console):

- **`schema.sql`** (core): `plans` (limits: max_deliverables, max_client_revisions, storage_limit_mb,
  max_active_projects), `profiles` (role check: admin/team/client, disabled flag, password_changed),
  `projects` (7-status CHECK, plan snapshot columns, client_revision_count), `project_files`
  (source_video/deliverable/attachment, storage_key, approved flag), `project_assignments`,
  `deadlines` (one per assignment, met/missed), `timeline_comments` (timestamp_sec REAL, revision_round),
  `team_notes`, `notifications` (8 types, read flag)
- **`gallery_schema.sql`**: `gallery_folders`, `gallery_files`
- **`chat_schema.sql`**: `chat_connections`, `chat_groups`, `chat_group_members`, `chat_messages`, `chat_read_receipts`
- **`calendar_schema.sql`**: `calendar_events`, `calendar_event_participants`, `calendar_event_comments`
- **`seed.sql`**: default plans

No RLS (that was Supabase-era) — **all authorization lives in the API handlers** via `requireAuth()` +
`requireRole()` + per-handler ownership checks.

Status state machine: `pending_assignment → in_progress → in_review → admin_approved →
client_reviewing → client_approved`, with `revision_requested` looping back to `in_review`.
Client rejections are capped server-side against the plan snapshot; admin rejection loops are unlimited.

## 4. API surface (`api/[...slug].ts`, router at ~line 3405)

All under `/api/...`, JSON, Bearer JWT. Route groups:

| Group | Endpoints (abridged) |
|---|---|
| `auth` | login, change-password |
| `users` | list, clients, team, create, delete, update, disable, enable, reset-password, impersonate |
| `projects` | list, create, get, assign, unassign, status, approve-client, delete |
| `project-files` | per-project list, register, upload-url (single presigned PUT), **multipart create/sign/complete/abort**, delete, approve, signed-url (`?download=1` for attachment disposition) |
| `messages` | connections, groups, list, send |
| `gallery` | list, register, upload-url, folders CRUD, delete, signed-url |
| `calendar` | events CRUD, event comments |
| `deadlines` | my, get, per-project |
| `notifications` | list, mark-all-read, mark-read |
| `plans` | list, CRUD |
| `profiles` | me |
| `project-assignments` | all, per-project |
| `timeline-comments` | **create, list only — no edit/delete** (relevant to B1) |
| `team-notes` | per-project |
| `revisions` | submit (server-enforced cap) |
| `downloads` | signed download |
| `admin` | library |
| `cron` | budget-nudge |

## 5. Upload pipeline (relevant to A1)

Browser → presigned URL → **direct to R2** (server never proxies file bytes — memory-safe already).

- **≥ 4.5 GB**: multipart — 250 MB parts, 6 concurrent, per-part retry (5 attempts, expo backoff + jitter),
  90 s idle-progress watchdog, proactive URL refresh at 18 h, free re-sign on 403, ETag integrity check at
  complete, abort cleanup on failure. Robust.
- **< 4.5 GB (the common case)**: **single PUT** with 3 whole-file retries — an interruption restarts
  from **zero**. This is the gap users are hitting in A1.
- No offline/pause detection, no connection-quality signal, no resume after page reload in either path.
- File registration in D1 happens *after* R2 upload (`registerWithRetry`, 3 attempts, idempotent per git history).

## 6. Frontend layout

```
src/
├── App.tsx                    # DEMO_MODE switch; all routes, role-guarded via <ProtectedRoute>
├── pages/
│   ├── Login.tsx / ChangePassword.tsx
│   ├── admin/       Projects (kanban), ProjectDetail, UserManagement, Analytics,
│   │                Library, Plans, Gallery, Messages, Calendar
│   ├── workspace/   ClientWorkspace, NewProject, ProjectDetail, Gallery, Messages,
│   │                Calendar, Analytics
│   └── team/        Dashboard, ProjectDetail, Gallery, Messages, Calendar, Stats
├── components/
│   ├── auth/ProtectedRoute    # session + role + password_changed gate
│   ├── project/               # TimelineCommentor (Plyr wrapper), FileUploader,
│   │                          # counters, status badge, ProjectCard
│   ├── admin/                 # AdminLayout, KanbanBoard, CreateUserModal
│   ├── chat/ gallery/ calendar/ notifications/ workspace/ (layouts)
├── hooks/                     # useAuth, useProjects, useNotifications, useChat,
│                              # useGallery, useCalendar, useVersionCheck (stale-bundle refresh)
├── lib/                       # api.ts (fetch + Bearer), auth.ts (token storage),
│                              # storage.ts (upload adapter + multipart), theme.tsx, utils.ts
├── types/index.ts             # shared TS types (also imported by the API — keep browser-safe)
└── demo/                      # full parallel mock app (VITE_DEMO_MODE)
```

Player notes (relevant to A2): `TimelineCommentor` fetches a fresh signed URL on mount, creates a Plyr
instance in a `useEffect` keyed on `[signedUrl, fileId, canComment]` (destroy/recreate on any change),
one-shot re-fetch of the signed URL on player `error`, and injects comment-marker DOM nodes directly
into Plyr's progress bar.

## 7. Environment & secrets

- `.env` (browser): `VITE_DEMO_MODE`, `VITE_CLERK_PUBLISHABLE_KEY` (dead — Clerk removed)
- Server env (Vercel dashboard): `JWT_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
  `CLOUDFLARE_D1_TOKEN`, `CLOUDFLARE_R2_*` (bucket, account, access key, secret), `SMTP_*` (host, port,
  user, pass, from)

## 8. Documentation status (important — conflicting docs)

| Doc | Status |
|---|---|
| `AGENTS.md` | **Outdated architecture** (Supabase/RLS/Edge Functions era). Product rules, roles, state machine, and security intent are still the best reference; the tech instructions are not. |
| `SETUPV1.md` | Outdated (Supabase v1 setup) |
| `CYRIL.md` | Mostly current (D1/R2/Vercel setup) but its Clerk auth section is superseded by custom JWT auth |
| `docs/auth-migration-guide.md` | Describes the Clerk → custom-auth migration (current auth) |
| `docs/` others | setup, admin setup, user management, hosting pricing guides |
| `supabase/` | Dead code from v1 — not deployed, not referenced |

## 9. Known baseline state (verified 2026-07-12)

- `npx tsc --noEmit` — **passes**
- `npm run lint` — **broken**: ESLint 9 flat config required, no `eslint.config.js` in repo
  (all needed plugins already in devDeps; fix is config-only)
- No tests to run
- Git: solo project, direct commits to `main`, conventional commit messages, Vercel auto-deploys `main`

## 10. Gaps vs. the working brief (what exists / what doesn't)

| Brief item | Current state |
|---|---|
| A1 resumable uploads | Multipart infra exists but only engages ≥ 4.5 GB; single-PUT path restarts from zero; no connection-quality UX, no resume across reload |
| A2 playback stability | Plyr lifecycle candidates identified (effect-keyed destroy/recreate, one-shot URL refresh, DOM injection into controls) — needs reproduction |
| A3 multiple deliverables | Schema already supports N files; cap comes from `plans.max_deliverables` snapshot (default 1) + UI — needs investigation, likely not a schema change |
| B1 edit/delete comments | **Missing** — API has create/list only |
| B2 comment ranges | **Missing** — `timestamp_sec` single point only |
| B3 revision checklist | **Missing** — no done/outstanding state on comments |
| B4 Frame.io gap doc | Not written |
| C1 status audit log | **Missing** — status overwritten in place, no history table |
| C2 forward/share | **Missing** — assignment exists, ad-hoc share/notify does not |
| D1–D4 tooling | **Missing** — no feedback form, no developer role (only admin/team/client), no tickets, no health dashboard |
| E1–E3 audits | Not written |
