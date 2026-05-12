-- Phase 8 — Operational photo attachments (metadata).
--
-- Image bytes live in R2 (env.PHOTOS). This table stores only the
-- metadata needed to find, list, and serve those objects.
--
-- parent_type vocabulary for Phase 1:
--   daily_briefing       — operations_daily_notes.id
--   operations_task      — calendar_events.id (placeholder-ready)
--
-- Future parent types (spray_record, equipment_issue, damage_report)
-- can be added without schema changes — only application code needs
-- to validate the new vocabulary string.
--
-- Additive only. NULL-safe on every field that isn't structurally
-- required (file_size + caption + uploaded_by may be NULL).

CREATE TABLE IF NOT EXISTS operational_attachments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  parent_type   TEXT NOT NULL,                         -- 'daily_briefing' | 'operations_task' | …
  parent_id     TEXT NOT NULL,
  file_name     TEXT,                                  -- original client-side name
  content_type  TEXT NOT NULL,                         -- 'image/jpeg' | 'image/png' | …
  r2_key        TEXT NOT NULL UNIQUE,                  -- key inside env.PHOTOS bucket
  file_size     INTEGER,                               -- bytes; nullable when client doesn't report
  caption       TEXT,
  uploaded_by   TEXT,                                  -- free-text author name
  status        TEXT NOT NULL DEFAULT 'active',        -- active | deleted (soft)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attach_parent ON operational_attachments(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_attach_course ON operational_attachments(course_id);
CREATE INDEX IF NOT EXISTS idx_attach_status ON operational_attachments(status);
