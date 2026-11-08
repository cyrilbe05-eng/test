-- ============================================================
-- Migration 013 — contracts history (a client can have many contracts)
--
-- Additive only: one NEW table. The old contract columns on client_care
-- (contract_start, contract_end, videos_included, renewal_status) are kept
-- but no longer used by the app. Undo with 013_client_contracts.down.sql.
--
-- "Current contract" (computed in the app) = the one whose dates include
-- today, otherwise the most recently started one.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_contracts (
  id               TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL,                       -- 1, 2, 3… per client
  start_date       TEXT NOT NULL,                          -- YYYY-MM-DD
  end_date         TEXT NOT NULL,                          -- YYYY-MM-DD (inclusive)
  package          TEXT NOT NULL DEFAULT 'editing_only'
                     CHECK (package IN ('editing_only', 'full_package')),
  videos_included  INTEGER,
  renewal_status   TEXT NOT NULL DEFAULT 'not_discussed'
                     CHECK (renewal_status IN ('not_discussed', 'discussed', 'renewed', 'declined')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (client_id, number)
);
CREATE INDEX IF NOT EXISTS idx_client_contracts_client ON client_contracts(client_id, start_date);

-- COPY (one-time): today's contract data on client_care becomes contract #1.
-- A missing start or end date is filled in as one year from the other.
-- Safe to re-run: clients that already have a contract #1 are skipped.
INSERT OR IGNORE INTO client_contracts (id, client_id, number, start_date, end_date, package, videos_included, renewal_status)
SELECT lower(hex(randomblob(16))), cc.client_id, 1,
       COALESCE(cc.contract_start, date(cc.contract_end, '-1 year', '+1 day')),
       COALESCE(cc.contract_end, date(cc.contract_start, '+1 year', '-1 day')),
       'editing_only', cc.videos_included, COALESCE(cc.renewal_status, 'not_discussed')
FROM client_care cc
WHERE cc.contract_start IS NOT NULL OR cc.contract_end IS NOT NULL;
