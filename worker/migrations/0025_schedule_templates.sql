-- Phase 14 — Schedule Templates + Role Templates.
--
-- Two additive tables. schedule_templates holds the header (name,
-- description, category, course_id). schedule_template_rows holds the
-- per-(employee, day) line items, mirroring the shape of
-- employee_schedules so applying a template is a pure copy.
--
-- Apply flow lives in the worker:
--   1. wipe existing employee_schedules for the course
--   2. for each template row, verify the employee still exists in
--      crew_employees; if yes, INSERT into employee_schedules
--   3. return { applied, skipped } so callers can report safely-skipped
--      rows
--
-- ON DELETE CASCADE on the header is intentional — templates without
-- rows are useless, so dropping a template wipes its rows too.

CREATE TABLE IF NOT EXISTS schedule_templates (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'standard',
    -- standard | tournament | weather | spray | cultural_practice | …
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedule_template_rows (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  day_of_week   INTEGER NOT NULL,                       -- 0=Sun … 6=Sat
  start_time    TEXT,
  end_time      TEXT,
  role          TEXT,                                   -- optional operational tag
  status        TEXT NOT NULL DEFAULT 'scheduled'       -- scheduled | off | vacation | sick
);

CREATE INDEX IF NOT EXISTS idx_sched_tpl_course ON schedule_templates(course_id);
CREATE INDEX IF NOT EXISTS idx_sched_tpl_row_template ON schedule_template_rows(template_id);
CREATE INDEX IF NOT EXISTS idx_sched_tpl_row_employee ON schedule_template_rows(employee_id);
