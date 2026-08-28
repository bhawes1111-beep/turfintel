-- Optional disease-control targets for chemical inventory items.
--
-- Stored as JSON rows so one chemical can list multiple turfgrass diseases,
-- each with preventive, curative, preventive+curative, or suppression control.

ALTER TABLE inventory_items ADD COLUMN disease_targets TEXT;
