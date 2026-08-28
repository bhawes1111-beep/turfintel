-- Employee training records.
--
-- Training is separate from certifications: certifications are credentials
-- on an employee profile; these rows are per-training history and renewal
-- tracking records.

CREATE TABLE IF NOT EXISTS employee_training_records (
  id             TEXT PRIMARY KEY,
  course_id      TEXT,
  employee_id    TEXT NOT NULL,
  training_name  TEXT NOT NULL,
  category       TEXT,
  status         TEXT NOT NULL DEFAULT 'planned',
  completed_date TEXT,
  due_date       TEXT,
  expires_date   TEXT,
  trainer        TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employee_training_course
  ON employee_training_records(course_id);

CREATE INDEX IF NOT EXISTS idx_employee_training_employee
  ON employee_training_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_training_status
  ON employee_training_records(status);

CREATE INDEX IF NOT EXISTS idx_employee_training_due
  ON employee_training_records(due_date);

CREATE INDEX IF NOT EXISTS idx_employee_training_expires
  ON employee_training_records(expires_date);
