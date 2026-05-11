-- Phase 5.2 — Inventory vertical persistence
--
-- One unified inventory_items table with a `kind` discriminator. This matches
-- the existing OperationsContext.state.inventoryProducts merge pattern (which
-- already collapsed PRODUCTS + CHEMICALS into a single list) and lets the
-- BuildSpraySheet cross-module signal continue looking up products by name
-- without a per-kind table join. Kind-specific columns are nullable; rows
-- only fill the columns relevant to their kind.

CREATE TABLE IF NOT EXISTS inventory_items (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,             -- 'product' | 'chemical' | 'fertilizer' | 'part' | 'fuel'
  name            TEXT NOT NULL,
  category        TEXT,                       -- product category, chemical type (Fungicide/PGR/...), part category, fuel type
  unit            TEXT,
  quantity        REAL NOT NULL DEFAULT 0,
  reorder_level   REAL,
  location        TEXT,
  vendor          TEXT,
  cost_per_unit   REAL,
  notes           TEXT,
  -- Chemical-specific
  manufacturer    TEXT,
  epa_number      TEXT,
  expiry_date     TEXT,
  -- Part-specific
  part_number     TEXT,
  equipment       TEXT,                       -- which equipment a part belongs to
  -- Fertilizer-specific
  analysis        TEXT,                       -- N-P-K or similar label
  -- Fuel-specific
  tank_capacity   REAL,
  current_level   REAL,
  last_fill       TEXT,
  -- Cross-module signal payload (Inventory → Sprays uses this for lookup)
  related_usage   TEXT,                       -- JSON array
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_usage (
  id              TEXT PRIMARY KEY,
  product_name    TEXT NOT NULL,
  quantity_used   REAL NOT NULL,
  unit            TEXT,
  source_id       TEXT,                       -- e.g. spray record id (used for dedupe)
  date            TEXT,
  area            TEXT,
  applicator      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_kind     ON inventory_items(kind);
CREATE INDEX IF NOT EXISTS idx_inventory_name     ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory_items(kind, quantity);
CREATE INDEX IF NOT EXISTS idx_usage_source       ON inventory_usage(source_id);
