UPDATE inventory_items
SET name = UPPER(TRIM(name)),
    updated_at = datetime('now')
WHERE name IS NOT NULL
  AND name != UPPER(TRIM(name));
