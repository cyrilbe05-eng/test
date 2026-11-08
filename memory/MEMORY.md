# Project Memory — Cyril Client Dashboard

## What this is
Private SaaS video-editing workflow platform. Invite-only. Three roles: admin (Cyril), team (editors), client.

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (dark theme: bg `hsl(240 10% 4%)`, primary purple `hsl(280 100% 65%)`, secondary pink `hsl(320 100% 60%)`)
- Fonts: Syne (headings), Space Grotesk (body) — Google Fonts in index.html
- Supabase (auth + DB + storage) — client at `src/integrations/supabase/client.ts`
- TanStack React Query v5 for data fetching
- React Router v6 for routing
- Plyr.js for video player in TimelineCommentor
- Sonner for toasts, Recharts for analytics

## Key Files
- `AGENTS.md` — single source of truth spec (856 lines)
- `src/App.tsx` — all routes with ProtectedRoute guards
- `src/integrations/supabase/types.ts` — **stub types** — replace with `npx supabase gen types typescript --project-id <ref>` after running migrations
- `src/lib/storage.ts` — StorageAdapter interface + Supabase stub implementation
- `supabase/migrations/001_initial_schema.sql` — all 7 tables, triggers, RLS
- `supabase/functions/` — 5 Edge Functions: create-user, disable-user, submit-revision, get-download-url, send-notification

## DB Tables
plans, profiles, projects, project_files, project_assignments, timeline_comments, notifications

## Routes
- `/login` — public
- `/change-password` — any auth user with password_changed=false
- `/admin` → AdminProjects (kanban/list)
- `/admin/projects/:id` → AdminProjectDetail
- `/admin/users` → AdminUserManagement
- `/admin/analytics` → AdminAnalytics
- `/workspace` → ClientWorkspace
- `/workspace/new` → ClientNewProject
- `/workspace/projects/:id` → ClientProjectDetail
- `/team` → TeamDashboard
- `/team/projects/:id` → TeamProjectDetail

## UI Modernization (March 2026)
- Added rich animation system to `src/index.css`: fade-in, slide-up, slide-in-left/right, scale-in, pulse-glow, shimmer, stagger-1…7 helpers
- Added `.glass`, `.sidebar-item`, `.timeline-pin`, `.text-shimmer` utility classes
- `Profile` type + mockData: added `time_saved_hours: number | null` field
- `DemoClientWorkspace`: Slack-style sidebar (avatar, project nav, section list), "Time Saved" stat card (set by admin), animated stat grid
- `DemoClientProjectDetail`: Frame.io-style review — interactive timeline scrubber, comment pins on video + timeline, comment sidebar, play/pause simulation, timestamp-aware comments, Enter-to-post textarea
- `DemoAdminUsers`: Clients table has inline "Time Saved" edit (hover to reveal, click to edit, save/cancel); split into Clients / Team / Admins sections with avatar initials
- `DemoAdminProjects`: Kanban has drop-zone highlight, colored column headers, hover glow on cards, empty-state drop targets; updated header with logo pulse-glow
- `DemoAdminProjectDetail`: Three-column layout (left metadata sidebar | video+actions | comment sidebar), same Frame.io timeline pins, 3-col layout matches client view

## Chat System (March 2026)
- `mockData.ts`: added `ChatConnection` & `ChatMessage` interfaces + `MOCK_CONNECTIONS` / `MOCK_MESSAGES` arrays
- `src/demo/useDemoChat.ts`: module-level singleton store; exports `addConnection`, `removeConnection`, `sendMessage`, `markMessagesRead`, `useDemoChat(userId, isAdmin)` hook
- `src/components/chat/ChatPanel.tsx`: floating FAB → list → DM thread; gradient bubbles, read receipts, unread badge
- Mounted on all 6 demo pages (client workspace, client project detail, team dashboard, admin projects, admin project detail, admin users)
- Admin sees all connections as "A ↔ B"; users see only their own connections
- **Admin Connections tab** (DemoAdminUsers): tab switcher → add-connection form + remove button per pair

## Known Issues / Next Steps
- `src/integrations/supabase/types.ts` uses `Record<string, Json>` for Insert/Update (stub) — supabase.from().insert/update calls have `@ts-expect-error` pragmas until real types are generated
- `.env` has placeholder Supabase URL/key — must be configured before use
- `supabase/migrations/001_initial_schema.sql` must be applied via Supabase CLI or dashboard
- `project-files` storage bucket must be created as **private** in Supabase dashboard
- Edge Functions need `.env.server` configured (SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, TWILIO_*)
- pg_net extension must be enabled in Supabase for external notification trigger
- Bundle size ~1.1 MB — consider code-splitting with vite manualChunks if needed

## Build Status
`npm run build` passes clean (only chunk-size advisory warning). `tsc --noEmit` passes 0 errors.
