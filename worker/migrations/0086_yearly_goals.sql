CREATE TABLE IF NOT EXISTS yearly_goals (
  id                   TEXT PRIMARY KEY,
  goal_year            INTEGER NOT NULL,
  note                 TEXT NOT NULL,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'in-progress',
  course_id            TEXT,
  carried_from_goal_id TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_yearly_goals_course_year
  ON yearly_goals(course_id, goal_year);

CREATE INDEX IF NOT EXISTS idx_yearly_goals_status
  ON yearly_goals(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_yearly_goals_carried_from
  ON yearly_goals(carried_from_goal_id)
  WHERE carried_from_goal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS yearly_goal_options (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  course_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_yearly_goal_options_course_label
  ON yearly_goal_options(course_id, label COLLATE NOCASE);
