-- Add sprayer tank capacity so spray sheets can use fleet equipment as rigs.

ALTER TABLE equipment ADD COLUMN tank_capacity_gal REAL;

UPDATE equipment
SET tank_capacity_gal = CASE
  WHEN name LIKE '%Spray Rig #1%' THEN 300
  WHEN name LIKE '%Spray Rig #2%' THEN 175
  ELSE tank_capacity_gal
END
WHERE lower(category) LIKE '%spray%'
   OR lower(name) LIKE '%spray%'
   OR lower(name) LIKE '%sprayer%';
