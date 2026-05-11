-- Phase 5.3 — Sprays vertical persistence
--
-- Three tables: spray_records (top-level, conditions inline), spray_products
-- (per-product line items, optionally linked to inventory_items for the
-- cross-module deduction flow), and spray_areas (per-area line items).
--
-- Conditions kept inline on spray_records (just 4 fields — temp/wind/
-- humidity/soil_temp). The directive listed spray_conditions as optional;
-- a separate table would be over-modelled at four columns.
--
-- The spray_products.inventory_item_id FK is the load-bearing piece of
-- this phase: it's how the existing Inventory → Sprays signal becomes
-- bidirectional once spray records persist (a completed spray's products
-- decrement linked inventory items via the existing inventoryStore
-- recordInventoryUsage() flow).

CREATE TABLE IF NOT EXISTS spray_records (
  id                TEXT PRIMARY KEY,
  application_name  TEXT,
  target            TEXT,                  -- target pest or use ("dollar spot", "weed pre-emergent", ...)
  operator          TEXT,                  -- applicator
  course            TEXT,
  spray_date        TEXT,
  start_time        TEXT,
  end_time          TEXT,
  status            TEXT NOT NULL DEFAULT 'planned',  -- planned | in-progress | pending-review | completed
  -- Conditions at application
  temperature       REAL,
  wind              TEXT,                  -- e.g. "5-8 mph SW"
  humidity          INTEGER,
  soil_temp         REAL,
  -- Application meta
  rei               INTEGER,
  phi               INTEGER,
  carrier_volume    TEXT,
  total_volume      REAL,
  holes             TEXT,                  -- JSON array of hole numbers
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spray_products (
  id                  TEXT PRIMARY KEY,
  spray_record_id     TEXT NOT NULL REFERENCES spray_records(id) ON DELETE CASCADE,
  inventory_item_id   TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  product_type        TEXT,                -- Fungicide/Herbicide/PGR/Fertilizer
  rate                TEXT,                 -- e.g. "1.5 lbs / 1,000 sq ft"
  unit                TEXT,
  quantity_used       REAL,                 -- populated at completion time
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spray_areas (
  id                  TEXT PRIMARY KEY,
  spray_record_id     TEXT NOT NULL REFERENCES spray_records(id) ON DELETE CASCADE,
  area_name           TEXT NOT NULL,
  acreage             REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spray_status     ON spray_records(status);
CREATE INDEX IF NOT EXISTS idx_spray_date       ON spray_records(spray_date);
CREATE INDEX IF NOT EXISTS idx_spray_products   ON spray_products(spray_record_id);
CREATE INDEX IF NOT EXISTS idx_spray_inv_link   ON spray_products(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_spray_areas      ON spray_areas(spray_record_id);
