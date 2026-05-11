-- Phase 5.7 — Courses table + initial seed.
--
-- Adds a first-class `courses` table that the operational verticals
-- (equipment, sprays, calendar_events, crew_assignments, …) scope to
-- via `course_id` in migration 0015. The geo "active course" concept
-- in src/context/CourseContext stays separate — it owns the course
-- map (lat/lng/aerial), not the data scope.
--
-- Slug-style ids: 'crossroads-gc'. Predictable, URL-safe, stable across
-- environments. The Phase 5.7 backfill uses 'crossroads-gc' as the
-- default for every existing operational row.

CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT,
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);

INSERT OR IGNORE INTO courses (id, name, short_name, location, status) VALUES
  ('crossroads-gc', 'Crossroads Golf Club', 'Crossroads GC', 'Savannah, GA', 'active');
