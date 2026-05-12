-- Phase 1 — Course Configuration: acreage + flexible custom areas + defaults.
--
-- Additive ALTER only. Existing rows keep NULLs and continue to behave as
-- before until a superintendent fills the configuration in Settings >
-- Course Configuration. Phase 1b wires these values into the Spray
-- Application Builder.

ALTER TABLE courses ADD COLUMN acres_total      REAL;
ALTER TABLE courses ADD COLUMN acres_greens     REAL;
ALTER TABLE courses ADD COLUMN acres_tees       REAL;
ALTER TABLE courses ADD COLUMN acres_fairways   REAL;
ALTER TABLE courses ADD COLUMN acres_rough      REAL;
ALTER TABLE courses ADD COLUMN acres_sprayable  REAL;
ALTER TABLE courses ADD COLUMN acres_practice   REAL;

-- Flexible list of additional named areas, JSON-encoded:
--   [{ "name": "Nursery", "acres": 1.5 }, { "name": "Bunker Sand", "acres": 0.6 }]
-- NULL is treated as an empty list by the Worker / client.
ALTER TABLE courses ADD COLUMN custom_course_areas TEXT;

-- Default rate units used when a new spray row is created. One of:
--   'oz_per_acre' | 'oz_per_1000sqft' | 'gallons_per_acre' | 'gallons_per_1000sqft'
ALTER TABLE courses ADD COLUMN default_spray_units TEXT;
