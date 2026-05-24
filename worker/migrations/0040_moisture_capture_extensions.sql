-- Phase 7A.1: Mobile Moisture/Handwater Capture — additive extensions.
--
-- Adds the columns the mobile capture flow needs to be offline-sync-ready and
-- GPS-ready WITHOUT changing the existing observation contract that Display
-- Board, Reports, and MoistureOverview already read. All columns are nullable
-- so existing rows stay valid; rollback is `git revert` of this migration —
-- nothing references these columns yet outside the new capture path.
--
--   client_id          — uuid the browser generates BEFORE the network call.
--                        Lets a future offline queue dedupe retries server-side
--                        and lets the optimistic-insert path correlate the
--                        pending row in the store with the server's response.
--   client_observed_at — ISO timestamp the user actually tapped Save. Distinct
--                        from `observed_at` (which today is also when the
--                        server saw the row, but is supposed to be the field
--                        observation time) and from `created_at` (insert time).
--                        Used when offline queue flushes minutes/hours later.
--   lat / lng /
--   gps_accuracy       — optional geolocation snapshot at capture. Real
--                        columns (not JSON) so future proximity / bbox
--                        queries are trivial. accuracy is meters (HTML5
--                        Geolocation API convention).
--
-- Course-scoped already via course_id (set in 0032). No new indexes —
-- queries against these columns are not on the hot path yet; we'll add a
-- spatial index only when the GPS UI lands.

ALTER TABLE moisture_observations ADD COLUMN client_id          TEXT;
ALTER TABLE moisture_observations ADD COLUMN client_observed_at TEXT;
ALTER TABLE moisture_observations ADD COLUMN lat                REAL;
ALTER TABLE moisture_observations ADD COLUMN lng                REAL;
ALTER TABLE moisture_observations ADD COLUMN gps_accuracy       REAL;

-- Partial UNIQUE so retries with the same client_id dedupe at the DB level,
-- but rows with NULL client_id (the legacy / non-capture path) are never
-- constrained. SQLite treats NULLs as distinct in UNIQUE indexes, but a
-- WHERE filter makes the contract explicit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_moisture_client_id
  ON moisture_observations(client_id)
  WHERE client_id IS NOT NULL;
