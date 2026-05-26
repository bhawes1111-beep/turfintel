-- Phase 7J.1 — Inventory cost-basis stewardship fields.
--
-- inventory_items already carries `cost_per_unit REAL` (migration 0004).
-- This migration extends the row with the rest of the cost-basis
-- stewardship surface so the spray-program cost helper can show *why*
-- a number is on file and where it came from.
--
-- New columns are all nullable. NULL is the historic default for every
-- existing row, which means:
--   - existing inventory rows continue to render exactly as before
--   - the Phase 7I.1 estimator already short-circuits on missing
--     cost basis, so no consumer needs to change
--   - cost_source defaults to 'manual' only when the steward sets a
--     value via the new narrow PATCH endpoint (Phase 7J.1 Worker code);
--     legacy rows stay NULL until touched
--
-- This is NOT a budget ledger:
--   - no expense rows
--   - no invoice rows
--   - no FK to product_catalog (catalog is not a price source)
--   - cost_per_unit remains course-scoped via inventory_items.course_id
--
-- Additive only. No data backfill, no rewrites to existing rows.

ALTER TABLE inventory_items ADD COLUMN cost_unit       TEXT;
ALTER TABLE inventory_items ADD COLUMN cost_source     TEXT;
ALTER TABLE inventory_items ADD COLUMN cost_updated_at TEXT;
ALTER TABLE inventory_items ADD COLUMN cost_notes      TEXT;
