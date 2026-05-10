-- Phase 5.0 — Equipment + Maintenance persistence
-- Intentionally narrow: this is operational visibility, not enterprise CMMS.
-- Additional fields beyond the Phase 5.0 directive's recommendation list
-- exist only because they back existing UI surfaces that already display them
-- (manufacturer, model, year, fuel_type, etc.). No speculative columns.

CREATE TABLE IF NOT EXISTS equipment (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'operational',
  hours               INTEGER NOT NULL DEFAULT 0,
  next_service_hours  INTEGER,
  manufacturer        TEXT,
  model               TEXT,
  year                INTEGER,
  serial_number       TEXT,
  fuel_type           TEXT,
  assigned_operator   TEXT,
  last_service        TEXT,
  last_service_hours  INTEGER,
  service_interval    INTEGER,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id                TEXT PRIMARY KEY,
  equipment_id      TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  service_type      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  priority          TEXT NOT NULL DEFAULT 'routine',
  date              TEXT,
  completed_date    TEXT,
  hours_at_service  INTEGER,
  next_due_hours    INTEGER,
  cost              REAL DEFAULT 0,
  technician        TEXT,
  notes             TEXT,
  parts_used        TEXT, -- JSON array, parsed in the Worker
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_events (
  id                   TEXT PRIMARY KEY,
  equipment_id         TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  projected_due_hours  INTEGER,
  service_type         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'scheduled',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_equipment ON maintenance_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status    ON maintenance_logs(status);
CREATE INDEX IF NOT EXISTS idx_service_equipment     ON service_events(equipment_id);
