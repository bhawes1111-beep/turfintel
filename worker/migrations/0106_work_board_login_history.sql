-- Durable employee Work Board login history and personal PIN setup state.

ALTER TABLE crew_employees ADD COLUMN work_board_pin_set_at TEXT;

UPDATE crew_employees
SET work_board_pin_set_at = updated_at
WHERE work_board_pin_hash IS NOT NULL
  AND work_board_pin_set_at IS NULL;

CREATE TABLE IF NOT EXISTS work_board_login_events (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL,
  course_id       TEXT NOT NULL,
  logged_in_at    TEXT NOT NULL DEFAULT (datetime('now')),
  pin_was_default INTEGER NOT NULL DEFAULT 0,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_work_board_login_events_course_time
  ON work_board_login_events(course_id, logged_in_at);
CREATE INDEX IF NOT EXISTS idx_work_board_login_events_employee_time
  ON work_board_login_events(employee_id, logged_in_at);
