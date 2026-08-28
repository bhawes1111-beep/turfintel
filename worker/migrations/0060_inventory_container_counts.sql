-- Track how many containers are on hand so total stock can be calculated
-- as: container_count * container_size = quantity.

ALTER TABLE inventory_items ADD COLUMN container_count REAL;
ALTER TABLE inventory_items ADD COLUMN container_price REAL;
