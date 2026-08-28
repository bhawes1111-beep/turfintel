-- Per-shift unpaid lunch settings. Existing and new shifts default to the
-- established 30-minute deduction; supervisors can turn it off per shift.

ALTER TABLE employee_schedules
  ADD COLUMN lunch_break_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE employee_schedule_overrides
  ADD COLUMN lunch_break_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE shift_template_rows
  ADD COLUMN lunch_break_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE schedule_template_rows
  ADD COLUMN lunch_break_minutes INTEGER NOT NULL DEFAULT 30;
