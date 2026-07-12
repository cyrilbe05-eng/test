# CHANGELOG_WORK.md — Running work log

> One entry per logical change: what changed, why, files touched, follow-ups/risks.
> Newest entries on top. Companion docs: `REPO_MAP.md` (stack map), `WORKPLAN.md` (phased plan).

---

## 2026-07-12 — Workstream B: review features (B1–B3) (`c6faadf`)

> **⚠️ ACTION REQUIRED (one-time):** run the additive migration before the new comment actions work:
> `wrangler d1 execute <db-name> --remote --file=db/migrations/002_comment_features.sql`
> (Rollback available: `002_comment_features.down.sql`.) Deploy-safe pre-migration: all existing
> flows keep working; only edit/range/resolve return a clear "needs migration" error until applied.

- **B1 edit/delete:** author-only edit with "(edited)" stamp; delete by author or admin with
  confirmation. `PATCH/DELETE /api/timeline-comments/:id` in the existing catch-all router.
- **B2 range comments:** optional `timestamp_end_sec`; compose form gets "set range end at
  playhead"; ranges show as translucent bands on the scrubber; chip label `MM:SS–MM:SS` seeks to
  range start. Point comments unchanged.
- **B3 revision checklist:** team/admin check comments off as addressed (`resolved`,
  `resolved_by`, `resolved_at`); resolved items dim + strikethrough; open-items counter in the
  comments header. Clients don't see checklist controls.
- Files: `api/[...slug].ts`, `src/components/project/TimelineCommentor.tsx`, `src/types/index.ts`,
  `db/migrations/002_*`. Demo pages intentionally not mirrored (mock-only surface — divergence noted).

---

## 2026-07-12 — Workstream A complete (P0 bugs) + Phase 0 foundations

Operator confirmations incorporated: storage stays Cloudflare R2; the single catch-all API function
is deliberate (Vercel free-tier function limit) — all new endpoints go inside it.

### A3 — Multiple deliverables (`ff17672`)
Root cause: admin-created projects skipped the plan lookup and hardcoded `max_deliverables = 1`
(and the lookup read the *caller's* plan, never the assigned client's). Now: limits snapshot from
the effective client's plan; new admin-only `PATCH /api/projects/:id/limits` + ✎ control in the
admin project view for one-off overrides; deliverable cap now also enforced server-side at
presigned-URL issuance (admin bypasses). No schema change; existing projects unaffected.

### A1 — Resilient uploads (`6080957`, prep fix `7704e89`)
Multipart threshold dropped 4.5 GB → 100 MB with part size scaling 50 MB+ (policy in
`src/lib/uploadPlanner.ts`, unit-tested) — an interruption now costs one part, not the file.
Offline gaps pause and auto-resume (online event + poll) without burning retry budget, on both
paths. Uploader UI shows: %, "Connection unstable — retrying…", "Offline — will resume
automatically", and a per-file Retry button. Single-PUT now sends fileSize so the plan storage
gate counts it. **Also fixed a latent prod bug** (`7704e89`): multipart sign/complete/abort
authorization queried `project_assignments.user_id` (column doesn't exist → 500 for every team
multipart call); correct column is `team_member_id`.
*Follow-up (stretch): cross-page-reload resume via ListParts; gallery upload path could adopt the
same adapter later.*

### A2 — Playback stability (`003f4ed`)
Root cause: `<video>` was conditionally rendered and the Plyr instance destroyed/recreated when
`signedUrl`/`canComment` changed; Plyr re-parents the video node, so React reconciliation could
touch a moved node — controls left bound to detached DOM (vanishing scrubber) and a dead player
until refresh. Now: one Plyr instance per mount in a dedicated host div, in-place source swaps
with position/play-state restore, 3-attempt signed-URL fetch with backoff, rate-limited error
recovery (`src/lib/playbackRecovery.ts`, unit-tested), Retry button, `[playback]` console
breadcrumbs for future diagnosis.

### Phase 0 — Foundations (`d353031`, `72284c4`)
- Lint was entirely broken (ESLint 9, no flat config). Added `eslint.config.js` (no new deps),
  fixed findings incl. a real rules-of-hooks violation in `DemoCalendarPage`; `--max-warnings 0`
  green. `.gitignore` bracket-glob fix so the built `api/[...slug].mjs` is actually ignored.
- Vitest + Testing Library (dev-only) with `npm test`; 22 tests green at time of writing.
- Verified: `tsc`, lint, `npm run build` all green before every push.

---

## 2026-07-12 — Discovery & planning (no code changes)

**What:** Mapped the codebase, produced `REPO_MAP.md` and `WORKPLAN.md`.

**Key findings:**
- Actual stack: React/Vite SPA + single Vercel catch-all API function + Cloudflare D1 (REST) + R2
  (presigned URLs) + custom JWT auth. In-repo docs `AGENTS.md`/`SETUPV1.md` describe an older Supabase
  architecture — do not follow them for tech decisions.
- Baseline: `tsc --noEmit` ✅ · `npm run lint` ❌ (ESLint 9 present but no `eslint.config.js` in repo) ·
  no tests / no test framework · `npm run build` not yet verified.
- A1 context: multipart upload with per-part retry already exists but only for files ≥ 4.5 GB; the
  common single-PUT path restarts from zero on interruption.
- A3 context: schema already supports multiple deliverables; the limit is plan defaults
  (`max_deliverables = 1`) and/or UI gating — likely no schema change needed.
- B1/B2/B3, C1/C2, D1–D4 confirmed missing (see REPO_MAP §10).

**Files touched:** `REPO_MAP.md`, `WORKPLAN.md`, `CHANGELOG_WORK.md` (all new, docs only).

**Follow-ups / open questions for the operator:**
1. OK to add Vitest (+ @testing-library/react) as dev-only dependencies? (Phase 0)
2. Phase 0 will fix the broken lint config (no new deps) — flagged here since it may surface
   pre-existing lint errors across the codebase.
