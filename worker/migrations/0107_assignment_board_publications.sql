-- Daily Assignment Board publication state.
--
-- Assignments remain editable in their existing tables. This record only
-- controls when the Display Board expands from each employee's first job to
-- every ordered job for the selected course and date.

CREATE TABLE IF NOT EXISTS assignment_board_publications (
  id               TEXT PRIMARY KEY,
  course_id        TEXT NOT NULL,
  publication_date TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'posted'
                   CHECK (status IN ('posted')),
  posted_by        TEXT,
  posted_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (course_id, publication_date)
);

CREATE INDEX IF NOT EXISTS idx_assignment_board_publications_course_date
  ON assignment_board_publications (course_id, publication_date);
