CREATE TABLE IF NOT EXISTS weekly_goal_options (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  course_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_goal_options_course_label
  ON weekly_goal_options(course_id, label COLLATE NOCASE);

INSERT OR IGNORE INTO weekly_goal_options (id, label, course_id)
SELECT 'goalopt-seed-' || lower(hex(randomblob(8))), note, course_id
FROM weekly_goals
WHERE trim(coalesce(note, '')) <> ''
GROUP BY course_id, lower(note);
