-- Phase 5.7 — Add course_id to every operational table, index it, and
-- backfill all existing rows to 'crossroads-gc'.
--
-- Nullable column → safe additive change. Backfill is run inline as a
-- single UPDATE per table; re-running this migration is idempotent
-- because the WHERE clause guards against double-writes.
--
-- The existing free-text `course` columns on alerts and spray_records
-- are left alone (they hold display labels, not FKs). Future cleanups
-- can collapse them onto courses.short_name.

-- ── equipment ─────────────────────────────────────────────────────────────
ALTER TABLE equipment ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_equipment_course_id ON equipment(course_id);
UPDATE equipment SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── maintenance_logs ──────────────────────────────────────────────────────
ALTER TABLE maintenance_logs ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_course_id ON maintenance_logs(course_id);
UPDATE maintenance_logs SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── repairs ───────────────────────────────────────────────────────────────
ALTER TABLE repairs ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_repairs_course_id ON repairs(course_id);
UPDATE repairs SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── inventory_items ───────────────────────────────────────────────────────
ALTER TABLE inventory_items ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inventory_items_course_id ON inventory_items(course_id);
UPDATE inventory_items SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── inventory_usage ───────────────────────────────────────────────────────
ALTER TABLE inventory_usage ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inventory_usage_course_id ON inventory_usage(course_id);
UPDATE inventory_usage SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── spray_records ─────────────────────────────────────────────────────────
ALTER TABLE spray_records ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_spray_records_course_id ON spray_records(course_id);
UPDATE spray_records SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── calendar_events ───────────────────────────────────────────────────────
ALTER TABLE calendar_events ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_calendar_events_course_id ON calendar_events(course_id);
UPDATE calendar_events SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── alerts ────────────────────────────────────────────────────────────────
ALTER TABLE alerts ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_alerts_course_id ON alerts(course_id);
UPDATE alerts SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── crew_employees ────────────────────────────────────────────────────────
ALTER TABLE crew_employees ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_crew_employees_course_id ON crew_employees(course_id);
UPDATE crew_employees SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── crew_assignments ──────────────────────────────────────────────────────
ALTER TABLE crew_assignments ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_crew_assignments_course_id ON crew_assignments(course_id);
UPDATE crew_assignments SET course_id = 'crossroads-gc' WHERE course_id IS NULL;

-- ── equipment_reservations ────────────────────────────────────────────────
ALTER TABLE equipment_reservations ADD COLUMN course_id TEXT;
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_course_id ON equipment_reservations(course_id);
UPDATE equipment_reservations SET course_id = 'crossroads-gc' WHERE course_id IS NULL;
