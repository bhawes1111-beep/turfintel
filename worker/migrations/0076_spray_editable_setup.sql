-- Preserve the application setup needed to fully edit a saved record.
ALTER TABLE spray_records ADD COLUMN application_type TEXT;
ALTER TABLE spray_records ADD COLUMN equipment_id TEXT;
ALTER TABLE spray_records ADD COLUMN equipment_name TEXT;
ALTER TABLE spray_records ADD COLUMN tank_capacity REAL;

-- Recover setup snapshots for existing records where possible.
UPDATE spray_records
SET application_type = CASE
  WHEN LOWER(COALESCE(application_name, '') || ' ' || COALESCE(carrier_volume, '')) LIKE '%granular%' THEN 'granular'
  ELSE 'liquid'
END
WHERE application_type IS NULL;

UPDATE spray_records
SET equipment_name = (
  SELECT json_extract(calendar_events.payload_json, '$.equipment[0]')
  FROM calendar_events
  WHERE calendar_events.source_id = spray_records.id
    AND calendar_events.source_type = 'spray'
  ORDER BY calendar_events.created_at DESC
  LIMIT 1
)
WHERE equipment_name IS NULL;

UPDATE spray_records
SET equipment_id = (
  SELECT equipment.id FROM equipment
  WHERE LOWER(equipment.name) = LOWER(spray_records.equipment_name)
  LIMIT 1
)
WHERE equipment_id IS NULL AND equipment_name IS NOT NULL;

UPDATE spray_records
SET tank_capacity = (
  SELECT equipment.tank_capacity_gal FROM equipment
  WHERE equipment.id = spray_records.equipment_id
  LIMIT 1
)
WHERE tank_capacity IS NULL AND equipment_id IS NOT NULL;
