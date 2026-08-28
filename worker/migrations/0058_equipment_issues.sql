-- Equipment issue intake and mechanic board approvals.
-- Staff can submit issues from the public display-board flow. Supervisors
-- review the pending queue before anything appears on the mechanic board.

CREATE TABLE IF NOT EXISTS equipment_issues (
  id TEXT PRIMARY KEY,
  course_id TEXT,
  equipment_id TEXT,
  equipment_name TEXT NOT NULL,
  category TEXT,
  issue_type TEXT NOT NULL DEFAULT 'issue',
  priority TEXT NOT NULL DEFAULT 'routine',
  status TEXT NOT NULL DEFAULT 'pending_review',
  location TEXT,
  reported_by TEXT,
  description TEXT NOT NULL,
  supervisor_notes TEXT,
  reviewed_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_issues_course_status
  ON equipment_issues(course_id, status);

CREATE INDEX IF NOT EXISTS idx_equipment_issues_equipment
  ON equipment_issues(equipment_id);

CREATE INDEX IF NOT EXISTS idx_equipment_issues_created
  ON equipment_issues(created_at);
