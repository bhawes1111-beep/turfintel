-- Phase 5.2.5 — Operational inventory seed data
--
-- Hand-curated to feel like a believable mid-tier 18-hole golf course in
-- peak spring season (heavy spray cycle + heavy mowing). Quantities are
-- realistic; stock states are spread so LowStock surfaces meaningfully
-- populate without telegraphing crisis.
--
-- Idempotent: INSERT OR IGNORE keyed on the deterministic primary id
-- column (chem-*, fert-*, part-*, fuel-*, prod-*). Re-running the
-- migration is safe and a no-op once applied.
--
-- Chemical names match the PRODUCT_META keys in BuildSpraySheet so the
-- Inventory → Sprays cross-module signal lookups resolve cleanly by name.

-- ──────────────────────────────────────────────────────────────────────
-- CHEMICALS — 8 items (turf fungicides, herbicide, PGR)
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity, reorder_level,
  location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date
) VALUES
  ('chem-primo',      'chemical', 'Primo MAXX',          'PGR',        'gal',  4.0,    6.0,    'Chem Shed — Cabinet A', 'Helena',  185.00, 'Trinexapac-ethyl growth regulator.',         'Syngenta', '100-937',      '2027-08-31'),
  ('chem-heritage',   'chemical', 'Heritage G',          'Fungicide',  'lbs',  280.0,  200.0,  'Chem Shed — Bulk Bin',   'Helena',    4.85, 'Azoxystrobin granular — broad spectrum.',    'Syngenta', '100-1093',     '2027-05-30'),
  ('chem-daconil',    'chemical', 'Daconil Ultrex',      'Fungicide',  'lbs',  12.0,   25.0,   'Chem Shed — Cabinet B', 'Site One',  6.20, 'Chlorothalonil — contact fungicide. Low stock — order before next dollar spot cycle.', 'Syngenta', '50534-202-100','2026-11-15'),
  ('chem-headway',    'chemical', 'Headway G',           'Fungicide',  'lbs',  350.0,  250.0,  'Chem Shed — Bulk Bin',   'Helena',    5.10, 'Azoxystrobin + propiconazole.',              'Syngenta', '100-1378',     '2027-03-31'),
  ('chem-prodiamine', 'chemical', 'Prodiamine 65 WDG',   'Herbicide',  'lbs',  0.0,    15.0,   'Chem Shed — Cabinet C', 'Quali-Pro', 28.50, 'OUT — pre-emergent. Re-order for fall.',     'Quali-Pro','66222-167',    '2027-12-31'),
  ('chem-velista',    'chemical', 'Velista',             'Fungicide',  'lbs',  3.0,    8.0,    'Chem Shed — Cabinet A', 'Site One',  78.00, 'Penthiopyrad — preventive on greens.',       'Syngenta', '100-1462',     '2027-04-30'),
  ('chem-lexicon',    'chemical', 'Lexicon Intrinsic',   'Fungicide',  'lbs',  4.5,    4.0,    'Chem Shed — Cabinet A', 'BASF',     142.00, 'Pyraclostrobin + fluxapyroxad. SDHI rotation.','BASF',  '7969-365',     '2027-09-30'),
  ('chem-tribute',    'chemical', 'Tribute Total',       'Herbicide',  'gal',  2.0,    2.0,    'Chem Shed — Cabinet C', 'Bayer',    240.00, 'Three-way post-emergent. Use sparingly.',     'Bayer',    '432-1517',     '2027-07-15');

-- ──────────────────────────────────────────────────────────────────────
-- FERTILIZERS — 5 items (granular + liquid + micronutrient)
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity, reorder_level,
  location, vendor, cost_per_unit, notes,
  analysis
) VALUES
  ('fert-anderson',  'fertilizer', 'Anderson 18-3-18 Greens Grade',    'Granular',     'lbs',  1500.0, 1000.0, 'Fert Shed — Pallet 1', 'Andersons', 0.78, 'Greens-grade SCU. Late spring / summer mix.', '18-3-18'),
  ('fert-lebanon',   'fertilizer', 'Lebanon ProScape 24-0-11',          'Granular',     'lbs',  600.0,  800.0,  'Fert Shed — Pallet 2', 'Harrells',  0.62, 'Fairway/rough nitrogen + potassium boost.',   '24-0-11'),
  ('fert-promag',    'fertilizer', 'Pro-Mag Magnesium',                 'Micronutrient','lbs',  0.0,    50.0,   'Fert Shed — Shelf A',  'Harrells',  2.40, 'OUT — order before next foliar cycle.',       'Mg 11%'),
  ('fert-harrells',  'fertilizer', 'Harrells MAX Liquid 12-0-12',       'Liquid',       'gal',  18.0,   15.0,   'Liquid Bay — Tank 2',  'Harrells',  22.00,'Foliar feed for greens.',                     '12-0-12'),
  ('fert-iron',      'fertilizer', 'Iron Plus 6% Fe',                   'Micronutrient','gal',  5.0,    10.0,   'Liquid Bay — Tank 3',  'Helena',    18.50,'Iron supplement — fade-out correction.',      '0-0-0 +6% Fe');

-- ──────────────────────────────────────────────────────────────────────
-- PARTS — 8 items (mower wearables, irrigation, spray rig consumables)
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity, reorder_level,
  location, vendor, cost_per_unit, notes,
  part_number, equipment
) VALUES
  ('part-rotor',     'part', 'Toro Infinity R55 Rotor',          'Irrigation',  'ea',  8.0,   10.0, 'Parts Room — Bin 14', 'Site One',     142.00, 'Replacement greens-perimeter rotor.',  '89-9425',     'Toro Infinity (greens)'),
  ('part-nozzle',    'part', 'Toro 570Z Nozzle Set #10',         'Irrigation',  'set', 2.0,   5.0,  'Parts Room — Bin 14', 'Site One',      18.50, 'For tee/approach 570Zs.',              '10P-3.0',     'Toro 570Z'),
  ('part-teejet',    'part', 'TeeJet AI11004 Air Induction',     'Spray',       'ea',  24.0,  12.0, 'Parts Room — Bin 22', 'Sprayer Depot',  9.40, 'Boom replacement nozzles for greens spray.','AI11004-VS', 'Spray Rig #1'),
  ('part-bedknife',  'part', 'Bedknife — Greensmaster 3150',      'Mower',       'ea',  4.0,   6.0,  'Parts Room — Bin 03', 'Toro',          85.00, 'Greens mower bedknife — wears 2/season.','105-9120',    'Greens Mower #1/#2/#3'),
  ('part-reel',      'part', 'Reel — 11-Blade DPA',               'Mower',       'ea',  0.0,   1.0,  'Parts Room — Bin 03', 'Toro',         920.00, 'OUT — long lead time. Reorder via Toro direct.','130-3700','Greensmaster 3150'),
  ('part-hose',      'part', 'Hydraulic Hose 1/4in x 36in',       'Hydraulic',   'ea',  12.0,  8.0,  'Parts Room — Bin 18', 'Parker',        24.50, 'Generic 1/4 inch ID, JIC ends.',       'HH-1436',     '(generic)'),
  ('part-filter',    'part', 'John Deere Service Filter Kit',     'Service',     'kit', 1.0,   2.0,  'Parts Room — Bin 06', 'John Deere',   180.00, 'Critical — only 1 on hand before fairway PMs.','AT195000','Fairway Mower #1/#2'),
  ('part-spraytip',  'part', 'TeeJet TT11003 Turbo TwinJet',      'Spray',       'ea',  8.0,   4.0,  'Parts Room — Bin 22', 'Sprayer Depot',  6.20, 'Fairway boom tips.',                   'TT11003-VP',  'Spray Rig #1');

-- ──────────────────────────────────────────────────────────────────────
-- FUEL — 3 tanks (diesel, gas, 2-cycle pre-mix)
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity, location, vendor, notes,
  tank_capacity, current_level, last_fill
) VALUES
  ('fuel-diesel',   'fuel', 'Bulk Diesel Tank',     'Diesel',     'gal', 320.0, 'Fuel Yard — Tank 1', 'Crossroads Fuel', 'Primary mower fleet. Standard #2 ULSD.',              500.0, 320.0, '2026-04-28'),
  ('fuel-gas',      'fuel', 'Gasoline Tank',         'Gas',        'gal', 85.0,  'Fuel Yard — Tank 2', 'Crossroads Fuel', 'Utility carts + sand pros. Low — schedule fill.',     250.0, 85.0,  '2026-04-15'),
  ('fuel-premix',   'fuel', 'Pre-Mix 2-Cycle',       'Pre-Mix',    'gal', 5.0,   'Maintenance Bay',    'In-house mix',    'Trimmers + blowers. Critical — order ratio oil + mix.',30.0,  5.0,   '2026-03-20');

-- ──────────────────────────────────────────────────────────────────────
-- GENERAL PRODUCTS — 5 items (course consumables)
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity, reorder_level,
  location, vendor, cost_per_unit, notes
) VALUES
  ('prod-paint',    'product', 'White Line Paint',                 'Marking',   'can',  18.0,  12.0, 'Maint Storage — Shelf 4', 'Site One',  6.50, 'Tee markers + tournament lines.'),
  ('prod-sand',     'product', 'Bunker Sand — USGA Spec',          'Bulk',      'tons', 4.0,   2.0,  'Sand Bin — Yard',          'Pro Sands', 65.00,'Topped up after spring storm wash-outs.'),
  ('prod-wetagent', 'product', 'Wetting Agent — Revolution',       'Surfactant','gal',  2.0,   4.0,  'Chem Shed — Cabinet D',   'Aquatrols', 120.00,'Critical — order before next greens cycle.'),
  ('prod-cups',     'product', 'Greens Cups — Standard 4.25in',    'Course',    'ea',   36.0,  18.0, 'Maint Storage — Shelf 2', 'Site One',  12.00, 'Aluminum cups, rotate weekly.'),
  ('prod-flags',    'product', 'Pin Flags — Crossroads GC',        'Course',    'ea',   12.0,  20.0, 'Maint Storage — Shelf 2', 'In-house',  18.50, 'Critical — tournament season approaching.');
