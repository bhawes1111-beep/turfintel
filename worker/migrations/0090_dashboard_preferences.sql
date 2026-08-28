CREATE TABLE IF NOT EXISTS dashboard_preferences (
  user_id     TEXT NOT NULL,
  course_id   TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_preferences_course
  ON dashboard_preferences(course_id);
