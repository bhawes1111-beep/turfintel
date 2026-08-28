-- Optional nematode-control targets for chemical inventory items.
--
-- Stored as JSON rows so one chemical can list multiple turf nematodes,
-- each with preventive, curative, preventive+curative, or suppression control.

ALTER TABLE inventory_items ADD COLUMN nematode_targets TEXT;
