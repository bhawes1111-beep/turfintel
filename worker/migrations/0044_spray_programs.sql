-- Phase 7F (1/?) — Spray Program Planner data model.
--
-- Spray PROGRAMS represent intent (what's planned); spray_records remain
-- the record of what was actually applied. Two tables, course-scoped,
-- with NO automatic side effects:
--   - planning a program never deducts from inventory_items
--   - planning a program never creates a spray_records row
--   - product_catalog stays read-only (FKs only, no SQL FK constraint
--     so the global catalog can be cleaned without orphaning a plan)
--
-- The optional linked_spray_record_id column on items is the plan-vs-
-- actual bridge — populated later, never auto-populated here.

CREATE TABLE IF NOT EXISTS spray_programs (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT,
  name                TEXT NOT NULL,
  -- e.g. 2026; INTEGER but app may also pass null.
  season_year         INTEGER,
  -- Free-text but the app constrains to:
  --   'greens' | 'tees' | 'fairways' | 'rough' | 'landscape' | 'custom'
  program_type        TEXT,
  -- Lifecycle: 'draft' | 'active' | 'archived' (default 'draft').
  status              TEXT NOT NULL DEFAULT 'draft',
  notes               TEXT,
  -- 'manual' | 'imported'. Imported is reserved for the future PDF /
  -- structured-import workflow; nothing in this commit writes 'imported'.
  source              TEXT NOT NULL DEFAULT 'manual',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_spray_programs_course  ON spray_programs(course_id);
CREATE INDEX IF NOT EXISTS idx_spray_programs_status  ON spray_programs(status);
CREATE INDEX IF NOT EXISTS idx_spray_programs_season  ON spray_programs(season_year);

-- ── Items ────────────────────────────────────────────────────────────────
-- Each item is one product × one planned window. Items can carry both an
-- inventory link (stock) and a catalog link (intelligence) — independent
-- pointers, both nullable, neither enforced by SQL FK so cleanup of the
-- global catalog cannot orphan a plan.

CREATE TABLE IF NOT EXISTS spray_program_items (
  id                       TEXT PRIMARY KEY,
  program_id               TEXT NOT NULL,
  course_id                TEXT,
  -- e.g. 'Greens', 'Tees', 'Practice Area 1'.
  target_area              TEXT,
  planned_start_date       TEXT,
  planned_end_date         TEXT,
  -- Human-readable window when dates aren't precise yet
  -- (e.g. "Early April", "Pre-emergent 1st app").
  planned_window_label     TEXT,
  product_name             TEXT,
  inventory_item_id        TEXT,
  product_catalog_id       TEXT,
  rate_value               REAL,
  rate_unit                TEXT,
  carrier_volume_value     REAL,
  carrier_volume_unit      TEXT,
  application_notes        TEXT,
  -- Hand-orderable within a program; default 0 so ungorted inserts
  -- still produce stable output.
  sort_order               INTEGER NOT NULL DEFAULT 0,
  -- Item lifecycle: 'planned' | 'completed' | 'skipped' | 'canceled'.
  -- 'completed' is only set later when an item is linked to a real
  -- spray_record (Phase 7F.x). NEVER auto-flips in this commit.
  status                   TEXT NOT NULL DEFAULT 'planned',
  -- Plan-vs-actual bridge. Always null in this commit.
  linked_spray_record_id   TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spray_program_items_program   ON spray_program_items(program_id);
CREATE INDEX IF NOT EXISTS idx_spray_program_items_course    ON spray_program_items(course_id);
CREATE INDEX IF NOT EXISTS idx_spray_program_items_status    ON spray_program_items(status);
-- Composite index for the per-program ordered fetch.
CREATE INDEX IF NOT EXISTS idx_spray_program_items_sort      ON spray_program_items(program_id, sort_order, created_at);
-- Lookup paths for the optional linkage columns.
CREATE INDEX IF NOT EXISTS idx_spray_program_items_inv       ON spray_program_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_spray_program_items_cat       ON spray_program_items(product_catalog_id);
CREATE INDEX IF NOT EXISTS idx_spray_program_items_rec       ON spray_program_items(linked_spray_record_id);
