# MOBILE_APP_ASSESSMENT.md — taking Pingu Studio to iOS / Android

> Assessment only — **no code was changed to produce this**. Written 2026-08-03 against `main`.
> Effort figures assume **one developer already familiar with this codebase**, and include testing
> but not App Store review latency.

---

## 1. Verdict in one paragraph

The platform is in **unusually good shape** for a mobile move, for one reason: the backend is a
clean REST + JWT API that knows nothing about the browser, and it would need **zero changes**. The
question is therefore only ever about the *front end*. If "mobile app" means *an icon on the home
screen that opens the platform and feels app-like*, that is **~1–2 weeks** of work and no rewrite.
If it means *a real App Store / Play Store listing with true background uploads and push
notifications*, that is **~4–6 weeks** by wrapping the existing UI. A full React Native rewrite —
the only route to a "100% native feel" — is **3–5 months** and, in my judgement, is not justified
by what this platform actually does.

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
**Effort: 2–3 days minimum · 1–2 weeks with a mobile UI polish pass**

Add `manifest.json`, icons, splash screens, a service worker (offline shell + update flow, which
must coexist with the existing `useVersionCheck`), then tidy the layouts flagged in §3.

- ✅ Home-screen icon, full-screen chrome, feels app-like
- ✅ Zero rewrite; one codebase; ships the moment you push
- ✅ Web push works on Android and on iOS 16.4+ for *installed* PWAs
- ❌ No App Store presence
- ❌ **Still no background uploads on iOS**
- ❌ Users must be told to "Add to Home Screen" (no store discovery)

### Option B — Capacitor wrapper (recommended if you want stores)
**Effort: 4–6 weeks for a solid v1**

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
**Effort: 3–5 months for parity · 6–10 weeks for one focused surface**

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

## 6. Recommendation

1. **Do Option A now.** For a couple of days' work everyone gets a home-screen app, and you learn
   what people actually complain about on phones before committing to anything expensive.
2. **Then answer the §4 question:** do editors need to upload from phones with the app closed?
   - **No** → stop at the PWA. Add the UI polish (tables → cards, touch-friendly kanban) and you're
     done. This is the likely outcome given editors work at desks.
   - **Yes** → Option B (Capacitor). Budget 4–6 weeks and expect the background-upload plugin to be
     the hard part.
3. **Only consider Option C** if the app becomes a client-facing product with real store presence
   ambitions. For an internal agency tool it would be over-engineering.

**Rough ordering of value per day spent:** PWA manifest + icons ≫ mobile layout polish ≫ push
notifications ≫ Capacitor shell ≫ background upload plugin ≫ native rewrite.

---

## 7. Things that would need attention on any route

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

## 8. Bottom line

- **Backend: already mobile-ready. Nothing to do.** That is the expensive part of most mobile
  projects, and it's done.
- **A home-screen app is days away.** A store-listed app with background uploads is about a month.
  A native rewrite is a quarter or more and would leave you maintaining two front-ends.
- **The deciding question isn't technical:** it's whether editors must upload from phones with the
  app closed. Everything else the platform does already works acceptably in a mobile browser today.
