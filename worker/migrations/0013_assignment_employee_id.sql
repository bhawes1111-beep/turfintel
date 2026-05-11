-- Phase 5.6b — Add employee_id FK to crew_assignments.
--
-- Existing rows continue to carry employee_name as the canonical
-- identifier; this column is additive and nullable so legacy writes
-- that only know the name keep working. The Phase 5.4c UNIQUE index on
-- (calendar_event_id, employee_name) is preserved for dedupe — see the
-- brief: "Keep it for compatibility."
--
-- Backfill: any pre-existing assignment whose employee_name matches a
-- crew_employees.name (after Phase 5.6 seeded the table) gets its
-- employee_id populated. Unmatched rows stay NULL — the operator can
-- inspect them and decide whether to delete or rename.

ALTER TABLE crew_assignments ADD COLUMN employee_id TEXT;

CREATE INDEX IF NOT EXISTS idx_crew_assignments_employee_id
  ON crew_assignments(employee_id);

UPDATE crew_assignments
   SET employee_id = (
     SELECT id FROM crew_employees
      WHERE crew_employees.name = crew_assignments.employee_name
      LIMIT 1
   )
 WHERE employee_id IS NULL;
