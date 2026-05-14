-- TurfIntel — operational data reset (2026-05-14).
--
-- Clears all demo / seed / test operational records so the platform
-- starts from a clean state for real Crosswinds usage.
--
-- PRESERVES:
--   - schema (no DROP TABLE, no ALTER)
--   - _migrations ledger (migration history intact)
--   - courses table + the crossroads-gc row (course identity kept;
--     the demo acreage config values entered during Phase 1 testing
--     are cleared back to NULL so the superintendent enters real
--     numbers)
--
-- A full pre-reset backup was taken first:
--   backups/turfintel-backup-2026-05-14.sql
-- Restore path if needed:
--   npx wrangler d1 execute turfintel-db --remote --file=backups/turfintel-backup-2026-05-14.sql
--
-- Idempotent: every statement is a DELETE / UPDATE — safe to re-run.

-- ── Crew + assignments ────────────────────────────────────────────────
DELETE FROM crew_assignments;
DELETE FROM equipment_reservations;
DELETE FROM crew_employees;
DELETE FROM employee_schedules;
DELETE FROM schedule_template_rows;
DELETE FROM schedule_templates;

-- ── Calendar + operational comms ──────────────────────────────────────
DELETE FROM calendar_events;
DELETE FROM alerts;
DELETE FROM operations_daily_notes;
DELETE FROM operational_attachments;

-- ── Sprays ────────────────────────────────────────────────────────────
DELETE FROM spray_areas;
DELETE FROM spray_products;
DELETE FROM spray_records;

-- ── Inventory ─────────────────────────────────────────────────────────
DELETE FROM inventory_usage;
DELETE FROM inventory_items;

-- ── Equipment + maintenance ───────────────────────────────────────────
DELETE FROM maintenance_logs;
DELETE FROM service_events;
DELETE FROM repairs;
DELETE FROM equipment;

-- ── Course: keep the row + identity, clear the demo config values ─────
UPDATE courses
   SET acres_total         = NULL,
       acres_greens        = NULL,
       acres_tees          = NULL,
       acres_fairways      = NULL,
       acres_rough         = NULL,
       acres_sprayable     = NULL,
       acres_practice      = NULL,
       custom_course_areas = NULL,
       default_spray_units = NULL,
       updated_at          = datetime('now')
 WHERE id = 'crossroads-gc';
