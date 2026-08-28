-- Course-scoped weekly goals and improvement notes for owner reporting.

CREATE TABLE IF NOT EXISTS weekly_goals (
  id         TEXT PRIMARY KEY,
  goal_date  TEXT NOT NULL,
  note       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'in-progress',
  course_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_course_date
  ON weekly_goals(course_id, goal_date);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_status
  ON weekly_goals(status);
