-- Phase 5.4c — Crew Assignments + Equipment Reservations persistence
--
-- Final operational state domains move from OperationsContext into D1.
-- Both tables link back to calendar_events via calendar_event_id so the
-- reservation/assignment survives reload alongside the event it belongs
-- to (the existing fire-and-forget handoff: MaintenanceLogs schedules a
-- maintenance event, then writes the equipment reservation against the
-- server-returned event id).
--
-- One row per (event, person) and (event, equipment). UNIQUE indexes
-- enforce that dedupe so repeat dispatches collapse — mirrors the
-- calendar_events (source_id + event_type + start_date) idempotency
-- guard from Phase 5.4a.

CREATE TABLE IF NOT EXISTS crew_assignments (
  id                TEXT PRIMARY KEY,
  calendar_event_id TEXT,                                -- FK → calendar_events.id (soft)
  employee_name     TEXT NOT NULL,
  role              TEXT,
  status            TEXT NOT NULL DEFAULT 'assigned',    -- assigned | confirmed | cancelled
  notes             TEXT,
  assigned_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_assignments_event_person
  ON crew_assignments(calendar_event_id, employee_name);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_event
  ON crew_assignments(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_status
  ON crew_assignments(status);

CREATE TABLE IF NOT EXISTS equipment_reservations (
  id                TEXT PRIMARY KEY,
  calendar_event_id TEXT,                                -- FK → calendar_events.id (soft)
  equipment_id      TEXT,                                -- FK → equipment.id (soft, optional)
  equipment_name    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'reserved',    -- reserved | in-use | released | cancelled
  notes             TEXT,
  reserved_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_reservations_event_equipment
  ON equipment_reservations(calendar_event_id, equipment_name);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_event
  ON equipment_reservations(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_equipment_id
  ON equipment_reservations(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_status
  ON equipment_reservations(status);
