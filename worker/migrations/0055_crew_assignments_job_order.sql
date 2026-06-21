-- Phase DAB.10a — Multiple jobs per employee per day.
--
-- Adds `job_order INTEGER NOT NULL DEFAULT 0` to crew_assignments so
-- the same employee can hold an ordered list of jobs against the
-- SAME calendar_event_id — supporting:
--
--   Brian Warren
--     1st Job — Mow greens   (job_order = 0)
--     2nd Job — Blow paths   (job_order = 1)
--     3rd Job — Help rake    (job_order = 2)
--
-- The existing UNIQUE(calendar_event_id, employee_name) index from
-- 0010 prevented more than one row per (event, employee). We drop
-- that index and replace it with a wider unique on
-- (calendar_event_id, employee_name, job_order) so the same (event,
-- employee) can hold multiple ordered rows, while still preventing
-- duplicates at the same order.
--
-- Migration is purely additive at the row level: existing rows
-- naturally default to job_order = 0 and continue to satisfy the
-- new unique. Legacy single-job assignments render as the "1st Job"
-- without any data rewrite.
--
-- A second convenience index on (calendar_event_id, job_order)
-- backs the typical "load all jobs for this event, ordered" query
-- the Display Board + DAB editor will run in DAB.10b.

ALTER TABLE crew_assignments ADD COLUMN job_order INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS idx_crew_assignments_event_person;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_assignments_event_person_order
  ON crew_assignments(calendar_event_id, employee_name, job_order);

CREATE INDEX IF NOT EXISTS idx_crew_assignments_event_order
  ON crew_assignments(calendar_event_id, job_order);
