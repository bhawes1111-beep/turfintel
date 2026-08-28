-- Optional clock times for manual lunch tracking. Auto lunch remains enabled
-- by default so existing and newly-created shifts keep the 30-minute rule.

ALTER TABLE employee_schedules ADD COLUMN lunch_start_time TEXT;
ALTER TABLE employee_schedules ADD COLUMN lunch_end_time TEXT;
ALTER TABLE employee_schedules ADD COLUMN auto_lunch_break INTEGER NOT NULL DEFAULT 1;

ALTER TABLE employee_schedule_overrides ADD COLUMN lunch_start_time TEXT;
ALTER TABLE employee_schedule_overrides ADD COLUMN lunch_end_time TEXT;
ALTER TABLE employee_schedule_overrides ADD COLUMN auto_lunch_break INTEGER NOT NULL DEFAULT 1;

ALTER TABLE shift_template_rows ADD COLUMN lunch_start_time TEXT;
ALTER TABLE shift_template_rows ADD COLUMN lunch_end_time TEXT;
ALTER TABLE shift_template_rows ADD COLUMN auto_lunch_break INTEGER NOT NULL DEFAULT 1;

ALTER TABLE schedule_template_rows ADD COLUMN lunch_start_time TEXT;
ALTER TABLE schedule_template_rows ADD COLUMN lunch_end_time TEXT;
ALTER TABLE schedule_template_rows ADD COLUMN auto_lunch_break INTEGER NOT NULL DEFAULT 1;
