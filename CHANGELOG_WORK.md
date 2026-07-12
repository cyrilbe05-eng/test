# CHANGELOG_WORK.md — Running work log

> One entry per logical change: what changed, why, files touched, follow-ups/risks.
> Newest entries on top. Companion docs: `REPO_MAP.md` (stack map), `WORKPLAN.md` (phased plan).

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
