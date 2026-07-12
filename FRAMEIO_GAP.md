# FRAMEIO_GAP.md — Frame.io feature parity analysis

> Audit of common Frame.io review features against this platform, 2026-07-12 (post-Workstream-B).
> **Status legend:** ✅ exists · 🟡 partial · ❌ missing
> **Effort:** S (≤1 day) / M (1–3 days) / L (1+ week). **Impact** is judged for a small agency
> with client review loops — your workflow, not a generic SaaS.
>
> **Nothing below gets built until you pick.** Recommended picks are marked ⭐.

| # | Frame.io feature | Status | Here today | Effort | Impact | Rec |
|---|---|---|---|---|---|---|
| 1 | Timestamped comments | ✅ | Timeline Commentor, MM:SS chips, seek-on-click | — | — | — |
| 2 | Comment ranges (in/out points) | ✅ | Just shipped (B2): start/end selection, bands on scrubber | — | — | — |
| 3 | Edit/delete comments | ✅ | Just shipped (B1) | — | — | — |
| 4 | Per-comment completion (checklist) | ✅ | Just shipped (B3): resolve/unresolve, open counter | — | — | — |
| 5 | Frame-accurate stepping (←/→ = 1 frame) | ❌ | Seconds precision only; no frame-step buttons | S | Medium — editors think in frames | ⭐ |
| 6 | Drawing/annotation overlays on the frame | ❌ | Nothing | L | Medium-high but heavy: canvas overlay, storing shapes per comment | |
| 7 | Threaded replies on comments | ❌ | Flat list grouped by revision round | M | Medium — rounds already give some structure | |
| 8 | @mentions in comments | ❌ | Chat panel has mention-ish injection, comments don't | M | Medium — pairs well with C2 forwarding | |
| 9 | Version stacking (v1/v2/v3 on one asset) | 🟡 | Multiple deliverables per project now possible (A3), but no explicit version chain/labels | M | High — revision loops are your core flow | ⭐ |
| 10 | Side-by-side / A-B version compare | ❌ | Nothing | L | Medium — nice, rarely load-bearing for small teams | |
| 11 | Per-version status/approval | 🟡 | Status is per-project; `approved` flag is per-file | M | Medium — mostly covered by project status | |
| 12 | Review links for external reviewers (no account) | ❌ | All access requires a provisioned account | M–L | High if clients forward to stakeholders; **security-sensitive** (signed public links) | ⭐ (design first) |
| 13 | Download controls (allow/deny per client) | 🟡 | Downloads gated by approval status; no per-project toggle | S | Low-medium | |
| 14 | Notifications on review activity | ✅ | In-app + branded email on all key transitions, comments, shares (C2) | — | — | — |
| 15 | Asset organization (folders/library) | ✅ | Gallery + admin library on R2 | — | — | — |
| 16 | Watermarked previews | ❌ | Nothing (would need server-side transcode — new infra) | L+ | Low for current client base | |
| 17 | Transcoded proxies / adaptive streaming | ❌ | Direct R2 signed-URL playback of the uploaded file | L+ | Medium on slow connections, but needs transcode infra (against no-new-infra constraint) | |
| 18 | Presence ("who's watching now") | ❌ | Nothing; no realtime channel in current stack | L | Low | |

## Recommended subset (in order)

1. **#5 Frame stepping (S):** `,`/`.` keys + buttons stepping ±1/24s (configurable fps), and show
   frames in the timestamp chip. Small change inside the existing player component.
2. **#9 Version stacking (M):** label deliverables v1/v2/v3 automatically per upload round (or a
   `version` column via small additive migration), collapse older versions in the review view,
   "latest" badge. Builds directly on A3.
3. **#12 External review links (M–L):** tokenized read-only review page (view + comment with a
   display name, no login). Highest client-visible value, but expands the security surface —
   I'd write a short design note for your sign-off before building.

Items #6 (drawing) and #10 (compare) are the classic "Frame.io feel" features — genuinely useful
but each is a week-plus of careful work; I'd schedule them only after the above are in use.
Items #16–18 conflict with the no-new-infra constraint (transcoding/realtime services) — park them.

**Next step:** tell me which numbers to build (or "the recommended three") and I'll sequence them
into the plan.
