-- Track shop-facing progress separately from the open/completed archive status.

ALTER TABLE maintenance_logs ADD COLUMN ticket_stage TEXT;

UPDATE maintenance_logs
SET ticket_stage = CASE
  WHEN status IN ('completed', 'resolved', 'closed') THEN 'resolved'
  WHEN status IN ('in-progress', 'in_progress') THEN 'being_repaired'
  ELSE 'needs_service'
END
WHERE ticket_stage IS NULL;
