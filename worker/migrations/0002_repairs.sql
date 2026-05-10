-- Phase 5.1c — Repairs vertical persistence
-- Intentionally narrow: visibility + status tracking, not work-order automation.
-- Additional fields beyond the directive's recommendation list back existing
-- UI surfaces (issue_type, area, head_number, description, labor_hours,
-- parts_used). No GIS, no geometry, no assignment workflows.

CREATE TABLE IF NOT EXISTS repairs (
  id             TEXT PRIMARY KEY,
  issue_type     TEXT NOT NULL,
  area           TEXT NOT NULL,
  hole           INTEGER,
  head_number    TEXT,
  description    TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium',
  status         TEXT NOT NULL DEFAULT 'open',
  assigned_to    TEXT,
  labor_hours    REAL DEFAULT 0,
  parts_used     TEXT,   -- JSON array, parsed in the Worker
  date_reported  TEXT,
  completed_at   TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repairs_status   ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_priority ON repairs(priority);
CREATE INDEX IF NOT EXISTS idx_repairs_area     ON repairs(area);
