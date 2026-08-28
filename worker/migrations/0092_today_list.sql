-- Personal operational checklist scoped to a course.
-- Completed items remain available in the archive.

CREATE TABLE IF NOT EXISTS today_list_items (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_today_list_course_status
  ON today_list_items(course_id, status, created_at);
