-- Phase 7R.3 — Fix Crosswinds Greens Program 2026 course scoping.
--
-- Root cause: migration 0047 seeded the program row + 153 item rows
-- with course_id = NULL. The read-side API (worker/lib/scope.js
-- buildCourseFilter) emits `WHERE course_id = ?`, which never
-- matches NULL — so the seeded rows were invisible in the Program
-- Planner, Program Calendar, Dashboard Snapshot, and Spray reports.
--
-- Production has exactly one course: id='crossroads-gc',
-- name='Crosswinds GC' (the slug is legacy from before the
-- Crosswinds rename; same physical course). resolveCourseId()
-- defaults legacy clients to 'crossroads-gc' so it is also the
-- correct write-side scope.
--
-- This migration is a targeted UPDATE: it only touches the
-- spec'd program id + its items, and only writes course_id when
-- the existing value is NULL (idempotent — a re-run is a no-op).
-- No schema change, no new tables, no new columns, no INSERT,
-- no DELETE, no other table touched.

UPDATE spray_programs
   SET course_id  = 'crossroads-gc',
       updated_at = datetime('now')
 WHERE id         = 'sp-crosswinds-greens-2026'
   AND course_id IS NULL;

UPDATE spray_program_items
   SET course_id  = 'crossroads-gc',
       updated_at = datetime('now')
 WHERE program_id = 'sp-crosswinds-greens-2026'
   AND course_id IS NULL;
