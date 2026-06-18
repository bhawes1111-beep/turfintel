-- Phase E.5 — Day-agnostic shift templates ("A Shift", "B Shift", etc.)
--
-- Distinct from the existing schedule_templates / schedule_template_rows
-- which are KEYED BY day_of_week and rewrite the recurring weekly grid
-- (employee_schedules) on apply. Those stay in place untouched —
-- they're the right tool for "rebuild the whole week from a recipe."
--
-- Shift templates are day-agnostic. Each template is a labeled bundle
-- of (employee × status × times × role × notes) that the supervisor
-- can apply to ANY date. Applying writes rows into
-- employee_schedule_overrides for that effective_date — leaving the
-- recurring weekly grid completely untouched.
--
-- Lifecycle:
--   • Save current Today's Schedule as a template → POST.
--   • Apply template to date D → INSERTs overrides for D.
--   • Replace flag determines whether existing overrides for D are
--     deleted first or merged with the template rows.
--
-- Additive only — no ALTERs on existing tables.

CREATE TABLE IF NOT EXISTS shift_templates (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  name          TEXT NOT NULL,                   -- 'A Shift', 'Tournament Morning', etc.
  label         TEXT,                            -- short tag for calendar tile
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One template name per course — duplicates would confuse the picker.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_templates_course_name
  ON shift_templates(course_id, name);

CREATE INDEX IF NOT EXISTS idx_shift_templates_course
  ON shift_templates(course_id);

CREATE TABLE IF NOT EXISTS shift_template_rows (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | off | vacation | sick
  start_time    TEXT,                                -- 'HH:MM' or NULL
  end_time      TEXT,                                -- 'HH:MM' or NULL
  role          TEXT,
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shift_template_rows_tpl
  ON shift_template_rows(template_id);

CREATE INDEX IF NOT EXISTS idx_shift_template_rows_employee
  ON shift_template_rows(employee_id);
