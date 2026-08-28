-- Track which saved shift was applied to which calendar date.
--
-- When a supervisor edits a saved shift, the worker can refresh the
-- dates still linked here so the calendar stays in sync with the
-- reusable shift definition. Manual day edits/copies unlink the date.

CREATE TABLE IF NOT EXISTS shift_template_applications (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  template_id     TEXT NOT NULL,
  effective_date  TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_template_applications_date
  ON shift_template_applications(course_id, template_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_shift_template_applications_template
  ON shift_template_applications(template_id);

CREATE INDEX IF NOT EXISTS idx_shift_template_applications_course_date
  ON shift_template_applications(course_id, effective_date);
