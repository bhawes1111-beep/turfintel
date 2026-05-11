-- Phase 5.6 — Crew vertical persistence
--
-- The static EMPLOYEES array in src/data/crew.js becomes a D1 table so
-- OperationsBoard has real people to drag and CrewEmployees has real
-- cards to render. Scope is deliberately narrow per Phase 5.6 brief: no
-- payroll, no PTO, no availability engine, no hourly rate. Skills and
-- certifications round-trip as JSON-encoded arrays.

CREATE TABLE IF NOT EXISTS crew_employees (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  role                TEXT,
  department          TEXT,
  status              TEXT NOT NULL DEFAULT 'active',  -- active | inactive | on-leave
  phone               TEXT,
  email               TEXT,
  assigned_area       TEXT,                            -- preferred workspace (Greens, Spray, Maintenance...)
  skills_json         TEXT,                            -- JSON array of skill strings
  certifications_json TEXT,                            -- JSON array of certification strings
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crew_employees_status     ON crew_employees(status);
CREATE INDEX IF NOT EXISTS idx_crew_employees_department ON crew_employees(department);
CREATE INDEX IF NOT EXISTS idx_crew_employees_role       ON crew_employees(role);
