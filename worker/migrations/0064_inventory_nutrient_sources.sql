-- Structured N-P-K source rows for chemicals and fertilizers.
--
-- Stored as JSON so one inventory item can carry multiple nitrogen,
-- phosphorus, and potassium forms with quick/slow release flags.

ALTER TABLE inventory_items ADD COLUMN nutrient_sources TEXT;
