-- Employee payroll exclusion.
--
-- Some people may appear on TurfIntel schedules but belong to another
-- department's payroll. This private flag keeps them out of payroll
-- reports while leaving their schedule and assignment visibility intact.

ALTER TABLE crew_employees ADD COLUMN exclude_from_payroll INTEGER NOT NULL DEFAULT 0;
