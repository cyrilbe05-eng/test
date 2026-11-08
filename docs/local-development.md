# Running the app locally (safe test copy)

Everything here runs on your own computer against a **local test database**.
It cannot reach the production Cloudflare database, file storage or email.

## First time

```powershell
cd C:\dev\test-main
npm install
npm run local:db     # builds .local-data/local.db with realistic FAKE data
```

## Every time

```powershell
npm run local:dev    # then open http://localhost:5173
```

Stop it with **Ctrl + C**. Run `npm run local:db` again any time you want a
fresh set of fake data (it is regenerated relative to today's date).

## Logins (password for all: `LocalTest123!`)

| Who | Email |
|---|---|
| Admin (full) | admin@pingu.local |
| Manager | manager@pingu.local |
| Editor | elias@pingu.local (also nora@, sami@; clara@ is a copywriter) |
| Client | bloom@client.local (also atlas@, nova@, harbor@, peak@, lumen@, orbit@, saffron@ …@client.local) |

## What's different from production

- The API runs from `api/[...slug].ts` exactly as on Vercel, but `LOCAL_DB_FILE`
  makes `api/_helpers/db.ts` use the local SQLite file instead of Cloudflare.
  That variable is never set on Vercel.
- Email is switched off (no `SMTP_*` settings), so nothing is ever sent.
- File storage (R2) is disabled: videos and uploads don't work locally.
- `.local-data/` is git-ignored. If you later load a copy of production data
  there, it stays on this computer.

## Database changes

New tables for Client Care are in `db/migrations/011_client_care.sql`
(undo: `011_client_care.down.sql`). The local database gets them
automatically. **Production is only migrated when you decide to.**
