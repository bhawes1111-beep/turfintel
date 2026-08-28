-- Inventory package/container size metadata.
--
-- Stock math stays on quantity + unit. These fields describe how the
-- product is packaged when purchased or stored, e.g. "2.5 gal jug",
-- "1.33 oz container", or "50 lb bag".

ALTER TABLE inventory_items ADD COLUMN container_size TEXT;
ALTER TABLE inventory_items ADD COLUMN container_unit TEXT;
ALTER TABLE inventory_items ADD COLUMN container_type TEXT;
