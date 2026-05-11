-- Phase 5.3.5 — Operational spray seed data
--
-- Seven hand-curated spray applications anchored to TODAY = 2026-05-08.
-- Status spread: 3 completed, 1 pending-review, 1 in-progress, 2 planned.
-- Every record references seeded inventory_items via spray_products
-- .inventory_item_id, so the cross-module deduction loop becomes
-- exercisable end-to-end. Completed records carry matching
-- inventory_usage rows so the BuildSpraySheet dedupe logic
-- (alreadyProcessed = Set(inventoryUsage.sourceId)) recognizes them
-- as already-deducted and won't double-deduct.
--
-- Quantities and rates use realistic golf-course math:
--   greens   ≈ 90,000 sq ft (18 × 5,000 sq ft)
--   fairways ≈ 25 acres
--   approaches ≈ 1.5 acres
-- so a 0.5 oz / 1,000 sq ft rate on greens = ~45 oz = ~2.8 lbs.

-- ──────────────────────────────────────────────────────────────────────
-- SPRAY RECORDS
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO spray_records (
  id, application_name, target, operator, course,
  spray_date, start_time, end_time, status,
  temperature, wind, humidity, soil_temp,
  rei, phi, carrier_volume, total_volume,
  holes, notes
) VALUES
  -- 1. Dollar Spot Preventive — completed
  ('spray-001', 'Dollar Spot Preventive',
    'Clarireedia jacksonii — preventive',
    'Sam Doyle', 'Crossroads GC',
    '2026-04-28', '06:30 AM', '08:45 AM', 'completed',
    68.0, '4-7 mph SW', 72, 62.0,
    12, 0, '1.5 GPA', 12.0,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Tank-mix Heritage G + Daconil Ultrex. Greens-only application.'),

  -- 2. Spring PGR Program — completed
  ('spray-002', 'Spring PGR — Primo MAXX',
    'Vegetative suppression — improve cut quality',
    'Sam Doyle', 'Crossroads GC',
    '2026-04-22', '06:00 AM', '07:30 AM', 'completed',
    65.0, '3-5 mph S', 68, 60.0,
    4, 0, '1.0 GPA', 8.0,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Standard 14-day PGR cycle. Following GDD model.'),

  -- 3. Pre-emergent Herbicide — completed (drained Prodiamine to 0)
  ('spray-003', 'Pre-emergent Herbicide',
    'Crabgrass / goosegrass pre-emergent',
    'Marcus Webb', 'Crossroads GC',
    '2026-03-15', '08:00 AM', '11:30 AM', 'completed',
    52.0, '6-9 mph NW', 55, 48.0,
    24, 0, '0.5 GPA', 13.0,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Soil temp window hit. Single split-app this season.'),

  -- 4. SDHI Rotation — pending review
  ('spray-004', 'SDHI Rotation — Velista + Lexicon',
    'Brown patch / dollar spot rotation',
    'Sam Doyle', 'Crossroads GC',
    '2026-05-06', '06:15 AM', '08:30 AM', 'pending-review',
    72.0, '5-8 mph SSW', 78, 65.0,
    12, 0, '1.5 GPA', 12.0,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Pending agronomist sign-off before next rotation cycle.'),

  -- 5. Wetting Agent — in progress (today)
  ('spray-005', 'Wetting Agent — Greens',
    'LDS prevention + hydration',
    'Sam Doyle', 'Crossroads GC',
    '2026-05-08', '08:00 AM', NULL, 'in-progress',
    75.0, '4-6 mph W', 65, 67.0,
    0, 0, '2.0 GPA', 16.0,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Cycling watering schedule. Application in progress as of 09:30.'),

  -- 6. Greens Foliar Fertility — planned
  ('spray-006', 'Greens Foliar 12-0-12',
    'Maintenance N + K foliar uptake',
    'Sam Doyle', 'Crossroads GC',
    '2026-05-12', '06:00 AM', NULL, 'planned',
    NULL, NULL, NULL, NULL,
    0, 0, '1.5 GPA', NULL,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Mid-month foliar. Pending weather window.'),

  -- 7. Poa annua Suppression — planned
  ('spray-007', 'Poa Suppression — Fairway Mix',
    'Poa annua suppression + PGR tank mix',
    'Marcus Webb', 'Crossroads GC',
    '2026-05-15', '07:00 AM', NULL, 'planned',
    NULL, NULL, NULL, NULL,
    24, 0, '0.5 GPA', NULL,
    '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]',
    'Window after spring rain pattern stabilizes.');

-- ──────────────────────────────────────────────────────────────────────
-- SPRAY PRODUCTS — linked to inventory_items via inventory_item_id
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO spray_products (
  id, spray_record_id, inventory_item_id,
  product_name, product_type, rate, unit, quantity_used
) VALUES
  -- Record 1: Heritage G + Daconil Ultrex
  ('sprod-001a', 'spray-001', 'chem-heritage',
    'Heritage G',     'Fungicide', '0.4 oz / 1,000 sq ft', 'lbs', 2.25),
  ('sprod-001b', 'spray-001', 'chem-daconil',
    'Daconil Ultrex', 'Fungicide', '1.0 oz / 1,000 sq ft', 'lbs', 5.6),

  -- Record 2: Primo MAXX
  ('sprod-002a', 'spray-002', 'chem-primo',
    'Primo MAXX',     'PGR',       '0.125 oz / 1,000 sq ft', 'gal', 0.1),

  -- Record 3: Prodiamine
  ('sprod-003a', 'spray-003', 'chem-prodiamine',
    'Prodiamine 65 WDG','Herbicide','0.75 lb / acre',       'lbs', 18.75),

  -- Record 4: Velista + Lexicon Intrinsic (pending — quantity_used reflects plan)
  ('sprod-004a', 'spray-004', 'chem-velista',
    'Velista',          'Fungicide','0.5 oz / 1,000 sq ft', 'lbs', 2.81),
  ('sprod-004b', 'spray-004', 'chem-lexicon',
    'Lexicon Intrinsic','Fungicide','0.5 oz / 1,000 sq ft', 'lbs', 2.81),

  -- Record 5: Wetting Agent
  ('sprod-005a', 'spray-005', 'prod-wetagent',
    'Wetting Agent — Revolution', 'Surfactant', '4 oz / 1,000 sq ft', 'gal', 2.81),

  -- Record 6: Liquid fertilizer — planned, quantity_used null
  ('sprod-006a', 'spray-006', 'fert-harrells',
    'Harrells MAX Liquid 12-0-12', 'Fertilizer', '6 oz / 1,000 sq ft', 'gal', NULL),

  -- Record 7: Tribute Total + Primo MAXX tank mix — planned
  ('sprod-007a', 'spray-007', 'chem-tribute',
    'Tribute Total',  'Herbicide', '0.2 oz / 1,000 sq ft', 'gal', NULL),
  ('sprod-007b', 'spray-007', 'chem-primo',
    'Primo MAXX',     'PGR',       '0.06 oz / 1,000 sq ft','gal', NULL);

-- ──────────────────────────────────────────────────────────────────────
-- SPRAY AREAS
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO spray_areas (
  id, spray_record_id, area_name, acreage
) VALUES
  ('sarea-001a', 'spray-001', 'Greens',     3.5),
  ('sarea-002a', 'spray-002', 'Greens',     3.5),
  ('sarea-003a', 'spray-003', 'Fairways',  25.0),
  ('sarea-003b', 'spray-003', 'Approaches', 1.5),
  ('sarea-004a', 'spray-004', 'Greens',     3.5),
  ('sarea-005a', 'spray-005', 'Greens',     3.5),
  ('sarea-006a', 'spray-006', 'Greens',     3.5),
  ('sarea-006b', 'spray-006', 'Approaches', 1.5),
  ('sarea-007a', 'spray-007', 'Fairways',  25.0);

-- ──────────────────────────────────────────────────────────────────────
-- INVENTORY_USAGE — historical rows for the 3 completed records
-- so the BuildSpraySheet dedupe (alreadyProcessed.has(sourceId))
-- recognizes these as already-deducted and won't double-fire.
-- The current inventory_items.quantity values in 0005 already reflect
-- these deductions; the usage rows are the audit trail.
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_usage (
  id, product_name, quantity_used, unit,
  source_id, date, area, applicator
) VALUES
  ('use-001a', 'Heritage G',         2.25,  'lbs', 'spray-001', '2026-04-28', 'Greens',     'Sam Doyle'),
  ('use-001b', 'Daconil Ultrex',     5.6,   'lbs', 'spray-001', '2026-04-28', 'Greens',     'Sam Doyle'),
  ('use-002a', 'Primo MAXX',         0.1,   'gal', 'spray-002', '2026-04-22', 'Greens',     'Sam Doyle'),
  ('use-003a', 'Prodiamine 65 WDG',  18.75, 'lbs', 'spray-003', '2026-03-15', 'Fairways',   'Marcus Webb');
