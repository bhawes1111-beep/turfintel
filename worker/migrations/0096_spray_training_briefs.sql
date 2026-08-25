-- Spray Training Briefs are course-scoped training snapshots. They reference
-- an existing plan/application when possible, but never mutate that source.

CREATE TABLE IF NOT EXISTS spray_training_briefs (
  id                         TEXT PRIMARY KEY,
  course_id                  TEXT NOT NULL,
  source_type                TEXT NOT NULL,
  source_record_id           TEXT,
  source_attachment_id       TEXT,
  status                     TEXT NOT NULL DEFAULT 'draft',
  title                      TEXT NOT NULL,
  application_snapshot_json  TEXT NOT NULL DEFAULT '{}',
  products_snapshot_json     TEXT NOT NULL DEFAULT '[]',
  instructions_snapshot_json TEXT NOT NULL DEFAULT '{}',
  checklist_snapshot_json    TEXT NOT NULL DEFAULT '{}',
  knowledge_check_json       TEXT NOT NULL DEFAULT '[]',
  missing_fields_json        TEXT NOT NULL DEFAULT '[]',
  manager_edits_json         TEXT NOT NULL DEFAULT '{}',
  approved_snapshot_json     TEXT,
  approved_version           INTEGER NOT NULL DEFAULT 0,
  extraction_status          TEXT NOT NULL DEFAULT 'not_requested',
  extraction_note            TEXT,
  extraction_raw_text        TEXT,
  created_by_user_id         TEXT,
  created_by_name            TEXT,
  approved_by_user_id        TEXT,
  approved_by_name           TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at                TEXT,
  archived_at                TEXT
);

CREATE INDEX IF NOT EXISTS idx_training_briefs_course
  ON spray_training_briefs(course_id);
CREATE INDEX IF NOT EXISTS idx_training_briefs_course_status
  ON spray_training_briefs(course_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_training_briefs_source
  ON spray_training_briefs(source_type, source_record_id);

CREATE TABLE IF NOT EXISTS spray_training_brief_revisions (
  id             TEXT PRIMARY KEY,
  brief_id       TEXT NOT NULL,
  course_id      TEXT NOT NULL,
  revision_type  TEXT NOT NULL,
  snapshot_json  TEXT NOT NULL,
  edited_by_id   TEXT,
  edited_by_name TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_training_brief_revisions
  ON spray_training_brief_revisions(brief_id, created_at);

CREATE TABLE IF NOT EXISTS spray_training_brief_acknowledgments (
  id                  TEXT PRIMARY KEY,
  brief_id            TEXT NOT NULL,
  course_id           TEXT NOT NULL,
  brief_version       INTEGER NOT NULL,
  user_id             TEXT,
  assistant_name      TEXT,
  responses_json      TEXT NOT NULL DEFAULT '[]',
  score               INTEGER NOT NULL DEFAULT 0,
  total_questions     INTEGER NOT NULL DEFAULT 0,
  acknowledged        INTEGER NOT NULL DEFAULT 0,
  brief_snapshot_json TEXT NOT NULL,
  completed_at        TEXT,
  acknowledged_at     TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_training_ack_brief
  ON spray_training_brief_acknowledgments(brief_id, created_at);
CREATE INDEX IF NOT EXISTS idx_training_ack_course_user
  ON spray_training_brief_acknowledgments(course_id, user_id, created_at);
