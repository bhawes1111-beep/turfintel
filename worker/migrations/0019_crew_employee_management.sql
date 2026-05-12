-- Phase 4 — Employee Management vertical.
--
-- Lifts personnel-management concerns out of Operations into a dedicated
-- Employee Management workspace. The crew_assignments / employee_id
-- linkage stays untouched; this migration only widens the
-- crew_employees row to carry the new management-only fields.
--
-- Additive only. All columns nullable. No seed values for pay_rate —
-- pay rate is private management data and must never be inferred.

ALTER TABLE crew_employees ADD COLUMN pay_rate          REAL;     -- USD/hour (private)
ALTER TABLE crew_employees ADD COLUMN hire_date         TEXT;     -- ISO date string
ALTER TABLE crew_employees ADD COLUMN pesticide_license TEXT;     -- license number(s), free text for now
ALTER TABLE crew_employees ADD COLUMN emergency_contact TEXT;     -- name + phone, free text for now
