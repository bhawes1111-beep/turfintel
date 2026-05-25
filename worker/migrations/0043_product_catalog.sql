-- Phase 7C.1 — Product Catalog (global product-intelligence layer).
--
-- A new GLOBALLY-SCOPED table (no course_id column) that holds what a
-- product IS, distinct from what a course OWNS (inventory_items).
-- Same physical product means the same catalog row regardless of which
-- course is looking — FRAC group, REI hours, label URL, active
-- ingredients are not per-course facts.
--
-- Course-scoped state (stock quantity, vendor, cost, expiry) stays on
-- inventory_items, which gains an optional product_catalog_id FK to
-- link a stock row to the canonical product. Legacy inventory rows
-- without a link continue to work unchanged.
--
-- Phase 7C.1 ships READ-ONLY:
--   - no UI consumes the table yet (lands in Commits 4-5)
--   - no Spray Builder integration yet (Commit 6)
--   - no user-editable catalog (no POST/PATCH/DELETE Worker routes)
--   - no auto-link of inventory rows (manual via future UI)
-- This commit just establishes the schema + Worker GET endpoints so
-- the import script (Commit 3) has somewhere to write to.

CREATE TABLE IF NOT EXISTS product_catalog (
  id                      TEXT PRIMARY KEY,        -- stable, e.g. 'pc-primo-maxx-100-1146'

  -- Identity
  product_name            TEXT NOT NULL,
  brand_owner             TEXT,                    -- bottle marketer / licensee (e.g. "Syngenta")
  manufacturer            TEXT,                    -- physical manufacturer if distinct
  epa_number              TEXT,                    -- regulatory id; primary dedup key when present
  formulation             TEXT,                    -- e.g. "1 SC", "50 WG", "4 EC"

  -- Classification (required: category; the rest optional, parallel vocabs)
  category                TEXT NOT NULL,           -- 'herbicide' | 'fungicide' | 'insecticide' | 'pgr' | 'fertilizer' | 'biostimulant'
  frac_group              TEXT,                    -- e.g. "11", "M3"
  hrac_group              TEXT,
  irac_group              TEXT,
  pgr_class               TEXT,                    -- e.g. "GA inhibitor", "Type II"
  chemical_class          TEXT,                    -- descriptive (e.g. "strobilurin")

  -- Composition
  active_ingredients_json TEXT,                    -- JSON: [{ name, percentage }]
  fertilizer_analysis     TEXT,                    -- N-P-K shorthand (e.g. "18-3-6")

  -- Application metadata
  rates_json              TEXT,                    -- JSON array of rate objects
  targets_json            TEXT,                    -- JSON array of pests/diseases/weeds
  turf_sites_json         TEXT,                    -- JSON: ['greens', 'tees', ...]

  -- Regulatory + safety
  restricted_use          INTEGER NOT NULL DEFAULT 0,
  signal_word             TEXT,                    -- 'Caution' | 'Warning' | 'Danger'
  rei_hours               REAL,                    -- numeric, hours
  phi_hours               REAL,                    -- numeric, hours

  -- Documentation
  label_url               TEXT,
  notes                   TEXT,

  -- Lifecycle + provenance
  status                  TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'discontinued' | 'unverified'
  is_active               INTEGER NOT NULL DEFAULT 1,      -- 0/1 mirror of status='active' for cheap filtering
  search_text             TEXT,                            -- denormalized lowercased blob: name + manufacturer
                                                          -- + epa + active ingredients. Single LIKE-able column
                                                          -- so the search endpoint stays one query.
  source                  TEXT,                            -- 'seed-import' | 'user-added' | 'epa-sync'
  source_version          TEXT,                            -- which dataset version this row came from

  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name      ON product_catalog(product_name);
CREATE INDEX IF NOT EXISTS idx_product_catalog_category  ON product_catalog(category);
CREATE INDEX IF NOT EXISTS idx_product_catalog_epa       ON product_catalog(epa_number);
CREATE INDEX IF NOT EXISTS idx_product_catalog_frac      ON product_catalog(frac_group);
CREATE INDEX IF NOT EXISTS idx_product_catalog_status    ON product_catalog(status);
CREATE INDEX IF NOT EXISTS idx_product_catalog_is_active ON product_catalog(is_active);

-- Inventory rows can OPTIONALLY link to a catalog product. Nullable so
-- legacy inventory rows stay valid. A single catalog product can be
-- linked from many inventory rows (each course's stock of the same
-- product). No FK constraint — the catalog is global; an inventory row
-- can outlive a catalog row if the catalog ever gets cleaned. Index
-- supports the future "show me everything in this course's inventory
-- linked to this catalog product" query.
ALTER TABLE inventory_items ADD COLUMN product_catalog_id TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_catalog ON inventory_items(product_catalog_id);
