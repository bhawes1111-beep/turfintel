-- Phase 10 — Per-employee equipment linkage.
--
-- Adds a soft FK from equipment_reservations to a specific
-- crew_assignment so the Display Board can render chips next to the
-- operator who's actually using the machine.
--
-- Nullable + additive. Existing reservations stay valid; their
-- crew_assignment_id is NULL and they continue to render as task-level
-- chips (Phase 9 fallback behavior). Supervisors fill in the linkage
-- one reservation at a time via the Operations > Assignments tab.

ALTER TABLE equipment_reservations ADD COLUMN crew_assignment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_eq_res_crew_assignment
  ON equipment_reservations(crew_assignment_id);
