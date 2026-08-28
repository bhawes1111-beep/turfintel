-- Backfill tank capacity for existing sprayer equipment records by common model/name.

UPDATE equipment
SET tank_capacity_gal = CASE
  WHEN lower(coalesce(name, '') || ' ' || coalesce(model, '')) LIKE '%5800%' THEN 300
  WHEN lower(coalesce(name, '') || ' ' || coalesce(model, '')) LIKE '%1750%' THEN 175
  WHEN lower(coalesce(name, '') || ' ' || coalesce(model, '')) LIKE '%backpack%' THEN 4
  ELSE tank_capacity_gal
END
WHERE tank_capacity_gal IS NULL
  AND (
    lower(category) LIKE '%spray%'
    OR lower(name) LIKE '%spray%'
    OR lower(name) LIKE '%sprayer%'
    OR lower(model) LIKE '%spray%'
    OR lower(model) LIKE '%multipro%'
  );
