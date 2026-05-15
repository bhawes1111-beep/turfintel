-- Phase 19 — Inventory product labels (Chemical Import Wizard).
--
-- Backs the "Add Chemical from PDF" wizard. The wizard uploads a label
-- PDF to R2 (via the existing operational_attachments system, parent_type
-- 'inventory_label'), then the user reviews/edits extracted metadata and
-- saves. The inventory_items row stays the canonical stock record — this
-- related table holds the richer regulatory/label metadata that doesn't
-- belong in the lean inventory_items schema.
--
-- inventory_item_id links 1:1 to the inventory_items row created on save.
-- pdf_attachment_id links to the operational_attachments row for the PDF.
-- raw_extraction_json preserves the full AI/manual draft so a future
-- extraction phase can re-process without re-uploading.
--
-- Additive only. Course-scoped (Phase 5.7 contract).

CREATE TABLE IF NOT EXISTS inventory_product_labels (
  id                     TEXT PRIMARY KEY,
  course_id              TEXT NOT NULL,
  inventory_item_id      TEXT NOT NULL,
  pdf_attachment_id      TEXT,                        -- operational_attachments.id, nullable
  product_name           TEXT,
  manufacturer           TEXT,
  epa_number             TEXT,
  active_ingredients     TEXT,
  signal_word            TEXT,                        -- Caution | Warning | Danger
  restricted_use         INTEGER NOT NULL DEFAULT 0,  -- 0/1
  rei_hours              TEXT,                        -- free-text: "12 hours", "4 h", etc.
  phi                    TEXT,                        -- pre-harvest interval, if listed
  frac_group             TEXT,
  hrac_group             TEXT,
  irac_group             TEXT,
  chemical_class         TEXT,
  application_rates_json TEXT,                        -- JSON array of rate strings/objects
  targets_json           TEXT,                       -- JSON array: pests/diseases/weeds
  turf_sites             TEXT,
  safety_notes           TEXT,
  storage_notes          TEXT,
  label_url              TEXT,
  raw_extraction_json    TEXT,                        -- full draft object as saved
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prod_label_course ON inventory_product_labels(course_id);
CREATE INDEX IF NOT EXISTS idx_prod_label_item   ON inventory_product_labels(inventory_item_id);
