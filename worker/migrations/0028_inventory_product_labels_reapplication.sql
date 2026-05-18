-- Phase 27A-2.1 — Reapplication interval extraction.
--
-- Adds three nullable columns to inventory_product_labels so the
-- Chemical Import Wizard can persist the label-stated reapplication
-- window and the Agronomic Intelligence card can stop showing
-- "interval unknown" for every product.
--
-- All three columns are nullable + additive — existing label rows
-- stay valid with NULL values and behave exactly as they did before.
-- No FK changes. No index changes (the agronomic compute reads these
-- via the rowToLabel mapper from the already-indexed primary lookup
-- by inventory_item_id).

ALTER TABLE inventory_product_labels ADD COLUMN reapplication_days_min     INTEGER;
ALTER TABLE inventory_product_labels ADD COLUMN reapplication_days_max     INTEGER;
ALTER TABLE inventory_product_labels ADD COLUMN reapplication_interval_raw TEXT;
