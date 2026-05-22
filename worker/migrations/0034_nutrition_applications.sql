-- Phase: Plant Nutrition Intelligence Foundation.
--
-- Standalone nutrient applications — fertility put down that ISN'T captured
-- as a spray record (granular spreads, direct foliar feeds, etc.). Fertilizer
-- *sprays* are NOT copied here; they contribute to seasonal totals live via
-- the existing N-P-K derivation, with a clear source link. Merging the two
-- (deduped by source_spray_id) is done in the client calc layer.
--
-- N/P/K lbs are stored as a COMPUTED SNAPSHOT at entry time so seasonal
-- totals stay stable even if a product's analysis is edited later. Micros
-- are optional columns — populated only when the observer actually knows
-- them (no fabricated micro precision).
--
-- Additive only. Course-scoped.

CREATE TABLE IF NOT EXISTS nutrition_applications (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL,
  application_date TEXT NOT NULL,             -- YYYY-MM-DD
  area             TEXT,                       -- free-text surface (e.g. "Greens")
  product_id       TEXT,                       -- optional inventory_items link
  product_name     TEXT NOT NULL,
  analysis         TEXT,                       -- N-P-K label "18-3-18" (optional)
  rate             REAL,
  unit             TEXT,                       -- lb/acre, oz/1000sqft, etc.
  area_acres       REAL,                       -- acres treated (for totals)
  n_lb             REAL,                        -- computed snapshot
  p_lb             REAL,
  k_lb             REAL,
  ca_lb            REAL,                        -- optional micros (entered, not derived)
  mg_lb            REAL,
  s_lb             REAL,
  fe_lb            REAL,
  mn_lb            REAL,
  source           TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'spray'
  source_spray_id  TEXT,                        -- link when promoted from a spray
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nutrition_course_date ON nutrition_applications(course_id, application_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_source      ON nutrition_applications(course_id, source_spray_id);
