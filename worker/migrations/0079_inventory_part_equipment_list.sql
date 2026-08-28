-- Parts can be shared by more than one fleet unit.
ALTER TABLE inventory_items ADD COLUMN equipment_list TEXT;

-- Preserve existing single-equipment assignments as a one-item JSON list.
UPDATE inventory_items
SET equipment_list = json_array(equipment)
WHERE kind = 'part'
  AND equipment IS NOT NULL
  AND TRIM(equipment) <> '';
