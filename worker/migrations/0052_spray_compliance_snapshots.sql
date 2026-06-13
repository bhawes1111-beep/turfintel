-- Phase S.3 — Spray Compliance Field Snapshots.
--
-- Phase S.1 audited the spray module and found a real compliance gap:
-- product intelligence (EPA #, active ingredients, REI/PHI) lives on
-- the global product_catalog table, but spray_records / spray_products
-- never SNAPSHOT those values at application time. That means a later
-- catalog cleanup or product-data correction silently rewrites the
-- meaning of past spray records — bad for state regulatory review and
-- bad for plan-vs-actual cost analysis.
--
-- This migration adds snapshot columns ONLY. No drops, no renames, no
-- constraint changes. Every column is nullable so existing rows
-- continue to read as-is. createSpray fills them at write time when
-- the client (BuildSpraySheet) supplies them; old payloads that don't
-- send the new fields produce NULLs and the read path renders "—"
-- following the existing record-detail style.
--
-- Columns added on spray_products (per-product snapshots):
--   • epa_number_snapshot            — regulatory id frozen at this app
--   • active_ingredients_snapshot    — JSON, frozen ingredient list
--   • product_cost_snapshot          — cost per unit at application time
--   • product_cost_unit_snapshot     — unit basis ("$/gal", "$/lb", etc.)
--   • total_cost_snapshot            — extended cost = qty × cost/unit
--
-- Columns added on spray_records (per-application compliance + cost):
--   • applicator_license             — pesticide license # (free-text)
--   • wind_speed_mph                 — numeric speed, kept alongside
--                                       free-text `wind` for back-compat
--   • wind_direction                 — cardinal-or-variable (N/NE/.../
--                                       Variable/Calm), separate from speed
--   • total_cost_snapshot            — sum of per-product totals at save
--
-- The existing `wind` free-text column is intentionally preserved. A
-- supervisor can keep typing "4-6 mph NE" the way they always have,
-- AND/OR fill the structured speed + direction fields when state
-- regulators ask for them. Reports read whichever surface is populated.
--
-- Course scoping unchanged: spray_records already carries course_id
-- (added in 0015); spray_products inherits scope via the parent record.

ALTER TABLE spray_products ADD COLUMN epa_number_snapshot         TEXT;
ALTER TABLE spray_products ADD COLUMN active_ingredients_snapshot TEXT;
ALTER TABLE spray_products ADD COLUMN product_cost_snapshot       REAL;
ALTER TABLE spray_products ADD COLUMN product_cost_unit_snapshot  TEXT;
ALTER TABLE spray_products ADD COLUMN total_cost_snapshot         REAL;

ALTER TABLE spray_records ADD COLUMN applicator_license  TEXT;
ALTER TABLE spray_records ADD COLUMN wind_speed_mph      REAL;
ALTER TABLE spray_records ADD COLUMN wind_direction      TEXT;
ALTER TABLE spray_records ADD COLUMN total_cost_snapshot REAL;
