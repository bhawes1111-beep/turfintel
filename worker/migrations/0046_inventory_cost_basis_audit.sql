-- Phase 7M.1 — Inventory cost-basis audit trail.
--
-- A lightweight per-row history of inventory cost-basis changes.
-- Written by the narrow PATCH /api/inventory/:id/cost-basis endpoint
-- AFTER each successful update; read by the new
-- GET /api/inventory/:id/cost-basis-audit endpoint.
--
-- This is HISTORY, not a ledger:
--   - no FK into product_catalog (catalog is not a price source)
--   - no expense, invoice, budget, or ledger column
--   - no inventory_usage join (this table never describes consumption)
--   - changed_by is a free-text marker; this table is not an actor /
--     authorization audit. The mutationAuth gate logs that separately.
--
-- change_source vocabulary is constrained at the endpoint to:
--   'manual'             — written from CostBasisEditor
--   'import-single-row'  — written from CostBasisImportReview's
--                          per-row Apply button (Phase 7L.1+)
--   'unknown'            — fallback when the caller omits the field
--
-- All inventory columns are mirrored as both previous_* and new_*
-- snapshots so the audit row is a self-contained record of the change
-- (no JOIN needed to reconstruct a diff). NULLs are preserved exactly
-- as they were on the inventory row, including "cleared cost basis"
-- which records (new_cost_per_unit, new_cost_unit, new_cost_source,
-- new_cost_notes) all NULL.

CREATE TABLE IF NOT EXISTS inventory_cost_basis_audit (
  id                      TEXT PRIMARY KEY,
  inventory_item_id       TEXT NOT NULL,
  course_id               TEXT,

  previous_cost_per_unit  REAL,
  previous_cost_unit      TEXT,
  previous_cost_source    TEXT,
  previous_cost_notes     TEXT,

  new_cost_per_unit       REAL,
  new_cost_unit           TEXT,
  new_cost_source         TEXT,
  new_cost_notes          TEXT,

  change_source           TEXT NOT NULL DEFAULT 'unknown',
  changed_at              TEXT NOT NULL,
  changed_by              TEXT,
  notes                   TEXT
);

-- The two queries this table sees are
--   (a) "history for inventory item X, newest first" — used by
--       GET /api/inventory/:id/cost-basis-audit
--   (b) "everything for a given course" — speculative; the courseId
--       is here for future cross-item review queries
-- so we index on (inventory_item_id, changed_at DESC) to make (a) cheap.
CREATE INDEX IF NOT EXISTS idx_inv_cost_basis_audit_item_changed
  ON inventory_cost_basis_audit (inventory_item_id, changed_at DESC);
