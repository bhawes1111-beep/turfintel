-- Inventory is consumed only when an application is completed.
-- Supervisors can also opt a specific application out of deductions.
ALTER TABLE spray_records ADD COLUMN deduct_inventory INTEGER NOT NULL DEFAULT 1;
