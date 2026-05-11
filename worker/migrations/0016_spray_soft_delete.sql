-- Phase 5.9 — Spray soft-delete + inventory-restoration audit fields.
--
-- Spray records become a permanent operational ledger. DELETE now sets
-- a deleted_at marker, hides the row from default lists, and walks the
-- inventory_usage rows tied to the spray to add quantities back to
-- inventory_items. The reverted_at marker on inventory_usage preserves
-- the complete audit trail — nothing is ever removed.
--
-- All columns are nullable / default 0 so the migration is additive and
-- idempotent on re-run.

ALTER TABLE spray_records ADD COLUMN deleted_at         TEXT;
ALTER TABLE spray_records ADD COLUMN deleted_by         TEXT;
ALTER TABLE spray_records ADD COLUMN inventory_reverted INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_spray_records_deleted_at ON spray_records(deleted_at);

ALTER TABLE inventory_usage ADD COLUMN reverted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_inventory_usage_reverted_at ON inventory_usage(reverted_at);
