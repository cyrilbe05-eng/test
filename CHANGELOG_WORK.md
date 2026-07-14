# CHANGELOG_WORK.md — Running work log

> One entry per logical change: what changed, why, files touched, follow-ups/risks.
> Newest entries on top. Companion docs: `REPO_MAP.md` (stack map), `WORKPLAN.md` (phased plan).

---

## 2026-07-14 — One-click review-copy generation from the original (`8c95625`)

"⚙ Generate review copy" streams the uploaded deliverable straight from R2 into the in-browser
compressor — no local file, no re-export. Recorder pauses while the remote source buffers (stalls
aren't encoded into the output). Local-file path stays as fallback. **Requires R2 bucket CORS to
allow GET from the app origin** — generation fails with an actionable message if missing.
≤25 MB originals short-circuit ("already small enough").

---

## 2026-07-14 — In-browser compression + buffering overlay (`b4dfc53`)

Review copies are now generated **in the editor's browser** — pick the normal full-quality export,
it re-encodes to ≤720p @ ~3 Mbit/s locally (canvas + MediaRecorder, no deps, no server cost) and
uploads the small result. Real-time encode (video-length wait) with progress; ≤25 MB files skip
compression; unsupported browsers get a clear fallback message. Buffering cue upgraded: centered
overlay on a dimmed player, escalating after 3 stalls to explain the connection is the limit.

---

## 2026-07-14 — Upload retune for 2–5 Mbit/s + review copies (`5020b2e`, `515c39d`)

> **⚠️ ACTION REQUIRED (one-time):** run migration 004 in the D1 console (ppingu):
> `ALTER TABLE project_files ADD COLUMN preview_storage_key TEXT;`
> `ALTER TABLE project_files ADD COLUMN preview_file_size INTEGER;`
> Deploy-safe pre-migration; only "Add review copy" errors until applied. Down script included.

- **Upload pipeline retuned for the operator's real uplink (2–5 Mbit/s, flaky):** 8 MB parts
  (was 16), concurrency 3 (was 6 — thin uplinks congest), threshold 16 MB, TARGET_MAX_PARTS 2000.
  R2 5xx on parts no longer kills uploads (endless capped-backoff retry, cancellable);
  control-plane 5xx patience 3→8 attempts.
- **Zero-cost slow-link playback ("do the 0 cost one"):** deliverables can carry a low-bitrate
  review copy. Clients stream it automatically; admin/team QC and all downloads use the original.
  Attach/replace/remove under each deliverable (team uploader or admin). R2 cleanup on delete.

---

## 2026-07-14 — Buffering visibility + upload retry pacing (`c363663`)

Mobile "plays 7–8 s then stops" = buffer starvation (high-bitrate export vs slow link), not a
defect: player now shows a debounced "Buffering…" chip and logs `bufferedAhead` so starvation is
distinguishable from stalls. *Durable fix if clients review on cellular would be preview renditions
/ adaptive streaming (e.g. Cloudflare Stream) — operator decision, costs money.*

Upload slowdown report: we probe-verified the link after each network failure and then ALSO slept
1–4 s backoff — dead time removed (immediate retry after a passing probe; short jittered pause only
on back-to-back failures). Probe timeout 5→8 s so a saturated uplink isn't misread as offline.

---

## 2026-07-14 — iOS stall at 0–1s: fix R2 object metadata, drop playback URL overrides (`e929a5f`)

After the type fix, iOS rendered the first frame but never advanced — iPhones stream via byte
ranges and our inline URLs always forced a signed `response-content-type` override (multipart
objects, stored as octet-stream, depended on it). Now playback URLs need **no overrides**:
multipart create bakes a playable Content-Type into the object (server-side call — the browser-CORS
reason for omitting it never applied there), and `ensurePlayableObject()` lazily repairs existing
objects' metadata via one-time CopyObject (≤4.5 GB) on first view — self-healing, no migration.
Oversized objects keep the override fallback; downloads unchanged.

---

## 2026-07-14 — HOTFIX for `993bfcf` regression + API typecheck guardrail (`c92544a`)

`993bfcf` shipped **without its import line** (the edit failed mid-session and wasn't re-applied):
every signed-URL/register endpoint threw `ReferenceError: inferMimeType is not defined` → video
previews errored in production. **Nothing caught it because `api/` was never type-checked**
(tsconfig includes only `src/`; esbuild bundles unbound identifiers silently). Fixed + guardrail:
`tsconfig.api.json` now covers `api/**` and runs inside `npm run build`, so this whole bug class
fails the build from now on.

Also corrected the 993bfcf content-type policy: declaring truthful `video/quicktime` on inline URLs
makes Chrome refuse `.mov` files it previously played by sniffing. Inline playback now signs a
browser-playable substitute (`quicktime`/`x-m4v` → `video/mp4`, same container family); downloads
keep the truthful type. 33 tests green.

---

## 2026-07-14 — Mobile video playback fix (`993bfcf`)

Operator report: playback broken on mobile. Root cause: videos served without a real Content-Type —
`File.type` is blank for common uploads (.mov/.mkv on Windows) and was stored as `''`; multipart R2
objects carry no type at all; and the signed-URL override let `''` through (`?? undefined` doesn't
catch it). Desktop browsers sniff the bytes and play anyway; **iOS Safari refuses**.

Fix: `api/_helpers/mime.ts` `inferMimeType()` repairs missing/octet-stream types from the file
extension — applied at **read time** in all three signed-URL handlers (existing uploads fixed with
no migration) and at write time in both register handlers. Gallery register no longer 400s on blank
mime. Player: `play-large` control (mobile tap target), `preload="metadata"`, and MediaError codes
surfaced in the error overlay + `[playback]` logs (persistent code 4 now says "format may be
unsupported" instead of blaming the connection). 30 unit tests green.

---

## 2026-07-14 — A1 round 2: uploads survive *bad* connections, not just offline (`ce37bed`)

Operator report: uploads still failing on bad internet. Root causes — the resilience only keyed on
`navigator.onLine` (which stays `true` on a zero-throughput link); any part exhausting 5 retries
**aborted the whole multipart upload and deleted every uploaded part**; control-plane calls
(create/sign/complete/register) were single-shot (a drop at `/complete` discarded a 100%-uploaded
file; a drop during re-sign escaped the retry loop entirely); 50 MB parts can never finish on a
link that drops every 30 s.

Fixes: verified-reachability probe (tiny same-origin fetch) gates all waits; transport failures now
pause-and-resume indefinitely and never discard parts (budgets apply only to real HTTP rejections);
resilient wrapper for all control-plane calls (network → wait+retry, 5xx → 3 retries, 4xx →
surface); threshold 100→32 MB, min part 50→16 MB; single-PUT path gets the same policy + idle
watchdog + URL re-issue on expiry. `putPart` → shared `putBlob`. 26 unit tests green.
Files: `src/lib/storage.ts`, `src/lib/uploadPlanner.ts` (+tests), `FileUploader.tsx`.
*Known limit (follow-up): resume across page reload still restarts the file (needs ListParts +
persisted state).*

---

## 2026-07-13 — Section-comment composer rework + completed-column sort (`ea61dcd`)

Operator feedback: the range feature was confusing; completed projects should list newest-first.

- **Composer**: explicit "One moment / A section" toggle. Root flow bug fixed — pressing play
  previously closed the composer and wiped the draft (users could never *play* to find an end
  point, only scrub). Composer now persists during playback; section mode is a guided panel with
  a live playhead readout, "Use current time" buttons, disabled submit until the end is set, and
  self-explaining button labels. Moment mode unchanged in behaviour (follows latest pause).
- **Kanban**: Client Approved column sorted by completion date desc (updated_at of the terminal
  status). Files: `TimelineCommentor.tsx`, `KanbanBoard.tsx`. Demo pages not mirrored (as before).

---

## 2026-07-12 — Workstream C: tracking & collaboration (C1–C2) + range UX

> **⚠️ ACTION REQUIRED (one-time):** run migration 003 for the status audit log:
> `wrangler d1 execute <db-name> --remote --file=db/migrations/003_status_history.sql`
> Deploy-safe pre-migration: history writes silently no-op; nothing breaks. The migration also
> backfills each project's current status as its first entry. Down script included.

- **C1 status audit log (`c5f092e`):** append-only `status_history` (old → new, actor, timestamp)
  written from all six status-mutation paths (manual updates, client approval, revision submit,
  team upload/download auto-transitions, deliverable approval). Admin project view shows a Status
  History timeline; Analytics has "Export status history (CSV)" for billing.
- **C2 forward/share (`5a8df5e`):** `POST /api/projects/:id/share` notifies team members (in-app +
  branded email with link) without creating an assignment; "Keep in the Loop" panel in admin
  project view. Clients can never be recipients. Reuses the `team_assigned` notification type —
  no schema change. *Follow-up option: team-side share UI.*
- **B2 range UX (`0e27cdb`), per operator feedback:** explicit Start/End selection — labelled
  chips that seek on click, per-end "use playhead" pins, inline hint, live dashed preview band on
  the scrubber, submit button reflects the selection.

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
