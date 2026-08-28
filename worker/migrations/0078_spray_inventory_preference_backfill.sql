-- Completed historical applications with no active usage were saved with
-- the old "do not deduct" option (or had nothing available to consume).
-- Preserve that behavior when those records are edited after migration.
UPDATE spray_records
SET deduct_inventory = 0
WHERE LOWER(COALESCE(status, '')) IN ('completed', 'complete', 'done')
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_usage
    WHERE inventory_usage.source_id = spray_records.id
      AND inventory_usage.reverted_at IS NULL
  );
