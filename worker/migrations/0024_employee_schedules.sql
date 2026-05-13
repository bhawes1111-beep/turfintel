-- Phase 13 — Employee weekly schedules.
--
-- One row per (course_id, employee_id, day_of_week). Recurring weekly
-- shifts only in Phase 1; the is_recurring flag is reserved for future
-- non-recurring exceptions (e.g. "this Wednesday only" overrides).
--
-- Status vocabulary:
--   scheduled   working that day
--   off         scheduled day off
--   vacation    PTO
--   sick        called out / sick leave
--
-- The UNIQUE constraint on (course_id, employee_id, day_of_week) makes
-- the row idempotent — a POST that targets an existing day dedupes
-- and PATCH is used to change times / status.
--
-- Additive only. No backfill — schedules start empty and the
-- Assignment Board falls back to the active-employee list until a
-- supervisor adds rows here.

CREATE TABLE IF NOT EXISTS employee_schedules (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  day_of_week   INTEGER NOT NULL,                  -- 0=Sun … 6=Sat
  start_time    TEXT,                              -- 'HH:MM'
  end_time      TEXT,                              -- 'HH:MM'
  role          TEXT,                              -- optional per-day role override
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | off | vacation | sick
  is_recurring  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_schedule_uniq
  ON employee_schedules(course_id, employee_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_emp_schedule_emp
  ON employee_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_schedule_day
  ON employee_schedules(day_of_week);
CREATE INDEX IF NOT EXISTS idx_emp_schedule_course
  ON employee_schedules(course_id);
