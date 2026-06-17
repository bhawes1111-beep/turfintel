-- Phase E.2 — Per-date schedule overrides for the recurring weekly grid.
--
-- E.1 audit found that the recurring grid (employee_schedules) is the
-- ONLY way a supervisor can mark someone off / sick / vacation. Flipping
-- a Wednesday cell affects every Wednesday — bad for the common
-- workflow "Joe called in sick TODAY".
--
-- Design choice: separate table, NOT a column add on employee_schedules.
-- The existing UNIQUE(course_id, employee_id, day_of_week) constraint on
-- employee_schedules would force same-table overrides to share the
-- recurring row, defeating the whole point — you can't have a Wednesday
-- "off this week only" override AND keep the Wednesday recurring rule
-- around the same row. A peer table also keeps the recurring grid
-- pristine (the Weekly Schedule Editor doesn't have to learn about
-- effective_date), simplifies the daily-merge query, and gives the
-- override flow its own audit timestamps.
--
-- Lifecycle:
--   • A row in employee_schedule_overrides ALWAYS wins over the
--     matching recurring row for that date.
--   • status = 'scheduled' with NULL times means "yes working, default
--     to recurring times" — surfaced by the daily merge.
--   • status = 'off' | 'vacation' | 'sick' suppresses the employee
--     from the assignable roster for THAT date only.
--   • Deleting the override returns the employee to recurring behavior
--     without rewriting the weekly grid.
--
-- Status vocabulary mirrors employee_schedules: scheduled | off |
-- vacation | sick. coerceStatus on the worker side validates.
--
-- Additive only. No drops, no renames, no constraints on existing rows.
-- Course-scoped (Phase 5.7 contract).

CREATE TABLE IF NOT EXISTS employee_schedule_overrides (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  employee_id     TEXT NOT NULL,
  effective_date  TEXT NOT NULL,                    -- ISO 'YYYY-MM-DD'
  start_time      TEXT,                              -- 'HH:MM' or NULL
  end_time        TEXT,                              -- 'HH:MM' or NULL
  role            TEXT,                              -- optional per-day role tag
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | off | vacation | sick
  notes           TEXT,                              -- "called out", "doctor", "late", etc.
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One override per (course, employee, date) — a POST that targets an
-- existing triple dedupes via worker idempotency. Mirrors the
-- employee_schedules UNIQUE pattern.
CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_sched_override_uniq
  ON employee_schedule_overrides(course_id, employee_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_emp_sched_override_course_date
  ON employee_schedule_overrides(course_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_emp_sched_override_employee
  ON employee_schedule_overrides(employee_id);
