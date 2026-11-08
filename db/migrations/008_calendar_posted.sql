-- 008: "Posted" flag on calendar entries
--
-- Lets the client mark a planned piece as actually published. It is the final
-- state after approval, so it wins over every lifecycle colour and shows the
-- entry in light grey — the calendar then reads: violet planned → blue in
-- production → green approved → grey posted (done and out).
--
-- Deliberately its own column rather than a new content_status value: that
-- column has a CHECK constraint, and widening a CHECK in SQLite means
-- rebuilding the table. Additive and reversible this way.

ALTER TABLE calendar_events ADD COLUMN posted INTEGER NOT NULL DEFAULT 0;
