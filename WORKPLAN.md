# WORKPLAN.md — Phased plan & checklist

> Companion to `REPO_MAP.md`. Ordered by the brief's priorities (P0 → P3).
> Working method: small conventional commits **directly to `main`** (per your standing preference —
> overrides the brief's "one concern per branch"), one concern per commit, `CHANGELOG_WORK.md` updated
> per change, tsc + lint green before every commit.

## Ground rules applied to this repo specifically

- **DB changes**: D1 has no migrations framework here. Every schema change will be a new numbered file in
  `db/migrations/NNN_name.sql` (additive only) with a paired `NNN_name.down.sql`. **You run them manually
  via wrangler against D1** — I never touch production data (brief rule 6). Each phase below flags its
  migration files explicitly.
- **No new runtime dependencies** without sign-off. Dev-only exceptions proposed in Phase 0.
- **Demo mode**: UI features will be built in the production app only; demo pages (`src/demo/*`) get
  mirrored only where cheap, otherwise noted as a known divergence in the changelog.
- **Every touched area gets tests** — which first requires a test harness (Phase 0).

---

## Phase 0 — Foundations (small, unblocks everything)

- [ ] **Fix lint**: add `eslint.config.js` (flat config) using the already-installed plugins
      (@eslint/js, typescript-eslint, react-hooks, react-refresh). Zero new deps. Fix or explicitly
      inline-disable whatever it flags; get `npm run lint` green.
- [ ] **Test harness** ⚠️ *needs your OK (dev-only dependency)*: add **Vitest** (+ @testing-library/react
      for component tests). Rationale: Vite-native, zero config with the existing toolchain, dev-only.
      Alternative: no harness, manual testing only — but the brief mandates tests for touched areas.
- [ ] **CHANGELOG_WORK.md** scaffold (created alongside this plan).
- [ ] Baseline smoke: `npm run build` passes locally.

**Exit criteria:** lint + tsc + build green; `npm test` runs; changelog in place.

---

## Phase 1 — Workstream A (P0, active bugs)

### A2 — Video playback stability *(first: it's the loudest user-facing bug)*
1. Reproduce: audit `TimelineCommentor.tsx` Plyr lifecycle. Prime suspects from discovery:
   - Player destroy/recreate on every `signedUrl`/`canComment` change (effect deps) — dropped listeners,
     re-mount races on source load.
   - One-shot `error` → URL re-fetch: if the fresh URL equals the old one or errors again, player is dead
     until refresh (matches the reported symptom).
   - Comment-marker DOM injection into `.plyr__progress` + CSS/z-index — candidate for the vanishing
     control bar.
2. Fix root cause(s); add lightweight diagnostic logging (console + optional API log) so recurrences are
   diagnosable.
3. Tests: player-lifecycle unit tests where feasible; manual repro checklist in changelog.

### A1 — Resilient uploads
**Chosen approach (per brief, reported before building):** extend the existing R2 multipart pipeline —
no new infra, no new deps.
1. **Lower the multipart threshold** from 4.5 GB to ~50–100 MB so virtually all video uploads get
   per-part retry/resume semantics (part size scaled down accordingly, e.g. 10–25 MB parts). Single-PUT
   stays only for small files where restart cost is trivial.
2. **In-session resume**: on part failure past retry budget, pause (keep completed parts) instead of
   abort; `navigator.onLine` + `online` event to auto-resume. Abort only on explicit user cancel.
3. **Cross-reload resume (stretch, same session storage)**: persist `{key, uploadId, completed parts}`
   in `localStorage`; on re-select of the same file (size+name+lastModified match), offer resume via
   existing `multipart/sign` endpoint. Flag: needs a small API addition to list uploaded parts
   (`ListParts`) — still no new infra.
4. **Connection-quality UX**: state machine surfaced in `FileUploader` — uploading % / connection
   unstable, retrying / paused, will resume / failed / done. Detect instability from retry frequency +
   `navigator.onLine`.
5. Tests: unit tests for part scheduling/retry/resume logic (extracted pure functions).

**DB impact:** none. **API impact:** optional `multipart/parts` (ListParts) endpoint.

### A3 — Multiple deliverables per project
1. Investigate the actual constraint: schema already allows N deliverable rows; suspects are
   `plans.max_deliverables` default = 1 (snapshot onto projects) and/or UI hiding the upload control at
   limit. Confirm where enforcement bites.
2. Likely fix: plan defaults/values (operator action in D1 or Plans admin UI) + UI for add/list/remove
   deliverables within a project + server-side cap check kept intact.
3. Backwards compat: existing projects keep their snapshot; no destructive change anticipated. If a
   schema change is needed after all, it will be additive with a down script and flagged to you first.

**Exit criteria:** interrupted upload on a throttled connection resumes without restarting; no
refresh-to-play; 2+ deliverables on a fresh project.

---

## Phase 2 — Workstream B (P1, review features)

### B1 — Edit/delete comments
- API: `timeline-comments/:id/update` + `DELETE` with ownership check (author or admin); `edited_at`
  column (additive migration **M1**, with down).
- UI: edit-in-place + delete-with-confirm in `TimelineCommentor`; "(edited)" indicator.

### B2 — Timeline range comments
- Additive migration **M2**: `timestamp_end_sec REAL NULL` on `timeline_comments`. NULL = point comment
  (existing rows unaffected — backwards compatible by construction).
- UI: set-start/set-end selection on the Plyr progress bar; range band rendered on the timeline;
  click-to-seek to range start. Point comments unchanged.

### B3 — Revision checklist
- Additive migration **M3**: `resolved` (0/1) + `resolved_by` + `resolved_at` on `timeline_comments`
  (a comment *is* a revision item — no new table needed).
- UI: checkbox per comment for team/admin; outstanding-vs-done counts per deliverable/version;
  filter toggle.

### B4 — FRAMEIO_GAP.md *(document only — comes back to you for feature selection)*

**Exit criteria:** B1–B3 shipped with tests; B4 doc awaiting your picks.

---

## Phase 3 — Workstream C (P1, tracking & collaboration)

### C1 — Status-change audit log
- Additive migration **M4**: append-only `status_history` table (project_id, old_status, new_status,
  actor_id, created_at). Writes hooked into the two status-mutation handlers (`projects/:id/status`,
  `revisions/submit`, `approve-client`). Backfill: current status as first entry (script for you to run).
- UI: history timeline on project detail (admin); CSV export endpoint for billing.

### C2 — Forward / keep in the loop
- Reuse `project_assignments` + `notifications` (type additions are CHECK-constraint text — additive
  migration **M5** if a new type is needed) + existing email channel. "Share with team member" action on
  project/deliverable; respects existing access rules.

**Exit criteria:** every status change recorded + exportable; share/notify works end-to-end.

---

## Phase 4 — Workstream D (P2, operator tooling)

- **D2 first** (developer/admin visibility): reuse `role='admin'` gating; add an ops area rather than a
  4th role unless you want one — *will confirm with you before building either way*.
- **D1 feedback form** → additive migration **M6**: `tickets` table (status, priority, page context,
  description, optional screenshot via existing R2 path).
- **D3 tickets + notifications**: ticket list in ops area; notification destination as a **setting**
  (email via existing SMTP first; webhook second) — not hardcoded.
- **D4 health dashboard**: recommendation doc first (per brief) — likely: Vercel function logs + a
  lightweight `/api/health` + upload success/failure counters in D1; external uptime ping (e.g.
  UptimeRobot free) as the no-new-code option. *No dependency added without your OK.*

---

## Phase 5 — Workstream E (P3, investigate-and-report first)

- **E2 CODEBASE_AUDIT.md** — deps/dead code/perf report (supabase/ leftovers, Clerk residue, the
  3,700-line API monolith split proposal, bcryptjs vs node crypto, etc.). Report only.
- **E3 SECURITY_AUDIT.md** — auth/authz on every route group, upload validation, secrets hygiene
  (JWT_SECRET rotation, 30-day tokens, impersonation endpoint), dependency scan. Report with severities;
  critical fixes proposed for sign-off.
- **E1 UI clutter pass** — specific tweak list proposed for approval before touching anything.

---

## Standing stop-and-ask list (per brief §5)

1. Vitest dev-dependency (Phase 0) — awaiting OK.
2. Any migration beyond the additive M1–M6 set above.
3. D4 monitoring approach + any dependency.
4. B4 feature selection after FRAMEIO_GAP.md.
5. Security fixes beyond quick wins (after E3).
6. Anything requiring a production D1/R2 operation — always yours to run.
