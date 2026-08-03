# MOBILE_APP_ASSESSMENT.md — taking Pingu Studio to iOS / Android

> Assessment only — **no code was changed to produce this**. Written 2026-08-03 against `main`.
>
> **Two effort columns throughout.** "Solo dev" is the conventional baseline: one developer already
> familiar with this codebase. "With Claude" is this project's actual working mode — see §6 for what
> that does and does not compress. Neither figure includes App Store review latency.

---

## 1. Verdict in one paragraph

The platform is in **unusually good shape** for a mobile move, for one reason: the backend is a
clean REST + JWT API that knows nothing about the browser, and it would need **zero changes**. The
question is therefore only ever about the *front end*.

| Route | Solo dev | **With Claude** |
|---|---|---|
| A · Installable home-screen app (PWA) | 1–2 weeks | **1–2 days** |
| B · Store-listed app w/ background uploads (Capacitor) | 4–6 weeks | **2–4 weeks** (mostly store gates, not coding) |
| C · React Native rewrite | 3–5 months | **4–8 weeks** — but still doubles maintenance forever |
| D · Twin native apps | 6–12 months | Not recommended at any speed |

The headline shifts: with an AI pair the *code* stops being the constraint, so the decision moves
almost entirely to **your testing time, App/Play Store gates, and long-term maintenance cost** —
none of which I can compress much. That reshapes the recommendation in §7, but doesn't reverse it.

---

## 2. What exists today (measured, not estimated)

| Layer | Size | Mobile reusability |
|---|---|---|
| API (`api/**`) | 4,544 lines, 1 catch-all function | **100% — no changes at all** |
| Shared types (`src/types`) | 247 lines | **100%** |
| Data hooks (`src/hooks`) | 530 lines | ~90% (TanStack Query runs on React Native) |
| Lib (`src/lib`) | 1,528 lines | ~50% (auth/api/utils port; upload + player logic is browser-bound) |
| UI pages (`src/pages`) | 7,905 lines across 24 files | **0% for React Native**, 100% for PWA/wrapper |
| UI components (`src/components`) | 3,999 lines across 19 files | same as above |
| Demo mode (`src/demo`) | 11,140 lines across 31 files | parallel mock app — see §7 |

**Current PWA readiness: none.** There is no `manifest.json`, no service worker, no `public/`
directory, no app icons. The only mobile-aware touches today are `viewport-fit=cover` in
`index.html` and responsive Tailwind breakpoints throughout the UI.

**Architecture facts that matter here**
- Auth is a 30-day HS256 JWT in `localStorage`, sent as `Authorization: Bearer`. No refresh tokens.
- Files never pass through the API: the browser uploads/downloads **directly to Cloudflare R2** via
  presigned URLs. This is exactly what a mobile client would do too.
- The upload pipeline (`src/lib/storage.ts`, `uploadManager.tsx`) is built on **XMLHttpRequest**,
  `navigator.onLine`, the Wake Lock API and `beforeunload` — all browser APIs with native
  equivalents, but none of it lifts and shifts to React Native unchanged.
- The video reviewer (`TimelineCommentor`) wraps **Plyr**, and paints comment markers by injecting
  DOM nodes into Plyr's progress bar. This is the single most browser-coupled component in the app.

---

## 3. Feature-by-feature mobile readiness

| Area | Works on mobile web today? | Notes |
|---|---|---|
| Login / auth | ✅ | Fine. Token storage should move to Keychain/Keystore in a native wrapper. |
| Client: watch + comment + approve | ✅ | The core client journey is already usable on a phone. Timeline comment UI is dense but functional. |
| Video playback | ✅ | Fixed extensively this cycle (content types, iOS streaming, buffering overlay). |
| Downloads | ✅ | Content-Disposition + 5 h signed URLs already solved for mobile browsers. |
| Gallery browsing | ✅ | Now lazy-loaded, so 300+ file galleries behave. |
| Uploads (foreground) | ✅ | Resilient, adaptive, resumable within the session. |
| **Uploads (backgrounded)** | ❌ | **The one genuine blocker — see §4.** |
| Push notifications | ❌ | None today (in-app + email only). |
| Kanban board | ⚠️ | HTML5 drag & drop — desktop-only interaction, needs a touch path. |
| Wide admin tables | ⚠️ | Horizontally cramped; want card layouts under `sm:`. |
| Calendar month grid | ⚠️ | Tight on phones; usable but not comfortable. |
| Drag & drop file upload | ⚠️ | Desktop-only by nature; pickers already cover mobile. |
| Charts (Recharts) | ⚠️ | Render, but small on phones. |

Nothing here is *broken* on mobile. The gaps are (a) background uploads, (b) push, (c) a handful of
desktop-shaped layouts.

---

## 4. The one thing that actually argues for going native

Your editors upload for **45+ minutes at a time on 2–5 Mbit/s links**. On the web — including an
installed PWA — the moment the phone locks or the user switches apps, the browser suspends the page
and the transfer dies. We already fight this with a screen Wake Lock, which is a workaround, not a
fix.

Native platforms solve this properly (`URLSession` background transfers on iOS, `WorkManager` /
foreground service on Android): the OS continues the upload while the app is closed. **If mobile
uploading by editors is a real workflow, that alone justifies a native wrapper.** If mobile is
mainly for *clients reviewing videos* — watching, commenting, approving — then the web app is
already sufficient and none of this matters.

This is the question that should drive the decision, more than any technical detail below.

---

## 5. The four routes, with effort

### Option A — Progressive Web App (installable web app)
**Solo dev: 2–3 days minimum, 1–2 weeks polished · With Claude: ~1–2 days elapsed**
(manifest + service worker + icons in a single session; the rest is your phone-testing time)

Add `manifest.json`, icons, splash screens, a service worker (offline shell + update flow, which
must coexist with the existing `useVersionCheck`), then tidy the layouts flagged in §3.

- ✅ Home-screen icon, full-screen chrome, feels app-like
- ✅ Zero rewrite; one codebase; ships the moment you push
- ✅ Web push works on Android and on iOS 16.4+ for *installed* PWAs
- ❌ No App Store presence
- ❌ **Still no background uploads on iOS**
- ❌ Users must be told to "Add to Home Screen" (no store discovery)

### Option B — Capacitor wrapper (recommended if you want stores)
**Solo dev: 4–6 weeks · With Claude: 2–4 weeks, of which only ~3–5 days is coding**
(the remainder is device testing, certificates, store assets and review cycles — see §6)

Wraps the *existing* React UI in a native iOS/Android shell. Roughly: setup 1–2 d · secure token
storage 1 d · native file picker + share-to-app 2–3 d · **background upload 1–2 weeks (the risky
part — likely a custom plugin)** · push notifications 3–5 d · store assets/listings 3–5 d · mobile
UI polish 3–5 d.

- ✅ Real App Store / Play Store listings
- ✅ True background uploads and native push
- ✅ Keeps **one** UI codebase — web and mobile stay in sync forever
- ⚠️ Apple guideline 4.2 rejects "just a website" wrappers; the native push + background upload +
  share-target work is what earns approval
- ⚠️ Adds app review cycles to your release process (currently: instant Vercel deploys)

### Option C — React Native / Expo rewrite
**Solo dev: 3–5 months for parity · With Claude: 4–8 weeks for parity, ~2 weeks for one surface**
(I can produce the ~11,900 lines of UI quickly; verifying 24 screens on real devices is the cost)

Reuses the API, types and most data hooks (~2,300 lines), and **rewrites all 11,900 lines of UI**.
The video reviewer, gallery grid, kanban, calendar and upload engine all need native replacements.

- ✅ Best possible feel and performance
- ❌ Two front-ends to maintain forever — every future change costs double
- ❌ Highest risk, by a wide margin, for a 3-person-team internal tool

A defensible middle path: rewrite **only the editor upload app** (6–10 weeks) and leave everything
else on the web.

### Option D — Separate native Swift + Kotlin apps
**Effort: 6–12 months.** No case for it here. Not recommended.

---

## 6. What working with Claude actually changes

Writing code stops being the bottleneck. Everything else becomes it. Being specific about which is
which is the difference between a realistic plan and an optimistic one.

### Compresses dramatically (roughly 5–10×)
- Boilerplate with a known shape: manifest, service worker, Capacitor config, icon sets.
- **Bulk UI porting** — the 11,900-line rewrite in Option C is the single biggest beneficiary;
  screens can be converted methodically, one after another.
- Mechanical mobile polish: tables → card layouts, touch-friendly kanban, spacing passes.
- Wiring native plugins, push payloads, deep-link routing.

### Compresses somewhat (~2×)
- Genuinely novel logic: a background-upload plugin, a native timeline-comment player. I can write
  a strong first version, but these are *iterative* — they get fixed by watching them fail on a real
  device, which is a loop, not a one-shot.

### Does not compress at all
- **Your testing time.** Every mobile change needs a build → install → tap-through on a real phone.
- **App Store review** — days per submission, and rejections are real (guideline 4.2 for wrapper
  apps is the specific risk).
- **Play Console gates** — a *new* personal developer account must run a closed test with 12+
  testers for 14 continuous days before production access. Worth checking your account's status
  early: if it applies, it sets the calendar floor regardless of how fast we build.
- **Apple Developer enrolment** ($99/yr, identity verification) and certificate/provisioning setup.
- **A Mac for iOS builds** — or cloud builds (EAS / Codemagic) if you don't have one.
- **Long-term maintenance.** In Option C, every future feature gets built twice, forever. Fast
  building doesn't undo that; it just makes the doubling cheaper each time.

### The honest lesson from this codebase
The last few weeks are the evidence: code I wrote landed quickly, but several real bugs — mobile
playback, the gallery request storm, the migration-ordering breakage — only surfaced when **you**
used it for real. On the web that loop is fast (push → Vercel → refresh). On mobile it is
build → install → test, and behind a store it is build → submit → wait. **Plan around the
verification loop, not the typing.**

---

## 7. Recommendation

1. **Do Option A this week.** It's now a 1–2 day item, and it's the cheapest way to learn what
   people actually complain about on phones before committing to anything expensive. Nothing else
   on this page should be decided before that data exists.
2. **Then answer the §4 question:** do editors need to upload from phones with the app closed?
   - **No** → stop at the PWA + mobile polish. Likely outcome, since editors work at desks.
   - **Yes** → Option B (Capacitor). ~3–5 days of building, then store gates dominate the calendar.
3. **Option C stays hard to justify — but for a different reason now.** The old argument was "3–5
   months is too expensive". At 4–8 weeks that argument weakens; the *maintenance* argument doesn't.
   Two front-ends means every future request — every fix in this changelog — gets built twice,
   forever. Only take it if the mobile experience becomes a product in its own right rather than a
   companion to the web app.

**Value per day spent (revised):** PWA manifest + icons ≫ mobile layout polish ≫ Capacitor shell ≫
push notifications ≫ background upload plugin ≫ native rewrite.

**What I'd want from you at each step:** a phone to test on, a decision on §4, and — before Option B
— confirmation of your Apple/Play developer account status, since those gates set the calendar.

---

## 8. Things that would need attention on any route

| Item | Why it matters |
|---|---|
| **Demo mode (11,140 lines)** | A complete parallel mock UI. It doubles the surface of any rewrite and is dead weight in a native app. Decide its fate before Option C is ever considered. |
| **30-day JWT, no refresh token** | Acceptable-ish in a browser; on a phone that can be lost or stolen, it deserves shorter-lived tokens + refresh, and Keychain/Keystore storage rather than `localStorage`. |
| **Deep links** | Email links point at `/admin/projects/:id` etc. A wrapped app should open those natively (universal links / app links) instead of bouncing to the browser. |
| **`beforeunload` upload guard** | Meaningless on native — replace with a proper background task. |
| **Wake Lock workaround** | Delete it once real background transfer exists. |
| **In-browser video compression** (`videoCompress.ts`, currently disabled for CPU cost) | Native encoders are far cheaper; a wrapper could revive review copies without pinning a laptop. |
| **Offline behaviour** | There is none today. A service worker could at least cache the shell and last-seen project lists. |
| **App Store release cadence** | You currently ship instantly to `main`. Store review adds days — plan for the web app staying the fast lane. |

---

## 9. Bottom line

- **Backend: already mobile-ready. Nothing to do.** That is the expensive part of most mobile
  projects, and it's done.
- **A home-screen app is 1–2 days away.** A store-listed app with background uploads is 2–4 weeks,
  most of it waiting on Apple and Google rather than on code. A native rewrite is 4–8 weeks and
  leaves you maintaining two front-ends forever.
- **Because code is no longer the constraint, the decision is now about testing time, store gates
  and maintenance** — not about how long something takes to build.
- **The deciding question is still not technical:** whether editors must upload from phones with
  the app closed. Everything else the platform does already works acceptably in a mobile browser
  today.
