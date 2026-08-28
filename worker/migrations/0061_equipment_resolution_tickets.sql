-- Equipment resolution ticket details for mechanic/supervisor close-out.
-- Maintenance logs already archive the work; these columns attach labor
-- hours and the employee responsible for the repair.

ALTER TABLE maintenance_logs ADD COLUMN labor_hours REAL;
ALTER TABLE maintenance_logs ADD COLUMN technician_employee_id TEXT;
