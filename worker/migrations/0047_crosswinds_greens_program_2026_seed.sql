-- Phase 7R (1/?) — Crosswinds Greens Program 2026 seed.
--
-- Idempotent insert of the Crosswinds annual greens program into the
-- EXISTING Phase 7F.1 tables (spray_programs + spray_program_items).
-- No new tables, no new columns, no new write paths. Every row goes
-- through the same data model the manual planner produces — so the
-- Program Planner / Calendar / Reports / Dashboard surfaces all
-- pick it up automatically.
--
-- Invariants preserved (Phase 7F → 7Q):
--   - planning a program never deducts inventory_items.quantity
--   - planning a program never creates a spray_records row
--   - product_catalog stays read-only (no FK in this migration)
--   - status='planned' on every item; only the user can flip status
--     by linking a real completed spray record (Phase 7F.4)
--
-- Source document:
--   "Crosswinds Greens Program Recommendations '26"
--   Vendor:      Vereens Turf Products
--   Prepared by: Paul Culclasure
--   Course:      Crosswinds Golf Club
--   Default greens acreage assumption: ~4 acres (some total amounts
--   imply 4-A — e.g. 16 oz/A × 4 = 64 oz total).
--
-- All 'total amount' figures from the document are recorded in
-- application_notes (the schema has no total_amount column). Same
-- for nutrient summaries, water-in flags, granular-only flags,
-- aeration window guidance, and product alias text (Prize Phiter /
-- Prize Phyter etc.). No alias auto-merging.
--
-- Idempotent posture: the program row uses INSERT OR IGNORE on a
-- stable id. All item rows reference that program_id. Re-running
-- the migration is a no-op.

INSERT OR IGNORE INTO spray_programs (
  id, course_id, name, season_year, program_type, status, notes, source
) VALUES (
  'sp-crosswinds-greens-2026',
  NULL,
  'Crosswinds Greens Program 2026',
  2026,
  'greens',
  'active',
  'Source: Crosswinds Greens Program Recommendations ''26.' || char(10)
  || 'Vendor: Vereens Turf Products.' || char(10)
  || 'Prepared by: Paul Culclasure.' || char(10)
  || 'Course: Crosswinds Golf Club.' || char(10)
  || 'Target area: Greens.' || char(10)
  || 'Default acres: ~4 acres (assumption based on total amounts in the document).' || char(10)
  || 'Annual nutrient summary: 4.85 lbs N, 6.33 lbs K.' || char(10)
  || 'Inventory stock is not deducted from planned spray programs. Deduction happens only through completed Spray Records.',
  'imported'
);

-- ── Items ───────────────────────────────────────────────────────────────
-- One row per (date × product) tuple. Multi-product applications share
-- planned_start_date / planned_end_date / target_area. status='planned'
-- everywhere — only completed Spray Records flip an item to 'completed'
-- via the Phase 7F.4 /completed-link route.

INSERT OR IGNORE INTO spray_program_items (id, program_id, target_area, planned_start_date, planned_end_date, product_name, rate_value, rate_unit, application_notes, sort_order, status) VALUES
-- January 3
('spi-cw26-0103-secure',  'sp-crosswinds-greens-2026','Greens','2026-01-03','2026-01-03','Secure Action',     0.5,    'oz/1000 sq ft','Spray app. Nutrient summary: 0.03 lbs K/1000.', 10103,'planned'),
('spi-cw26-0103-pigment', 'sp-crosswinds-greens-2026','Greens','2026-01-03','2026-01-03','Rain Green Pigment',16,     'oz/acre',      'Total amount: 64 oz total (~4 A).', 10104,'planned'),
('spi-cw26-0103-harmony', 'sp-crosswinds-greens-2026','Greens','2026-01-03','2026-01-03','Harmony',           0.625,  'gal/acre',     'Total amount: 2.5 gal total (~4 A). Alias note: Root Harmony.', 10105,'planned'),
('spi-cw26-0103-phiter',  'sp-crosswinds-greens-2026','Greens','2026-01-03','2026-01-03','Prize Phiter',      0.625,  'gal/acre',     'Total amount: 2.5 gal total (~4 A). Alias note: Prize Phyter.', 10106,'planned'),

-- January 13
('spi-cw26-0113-tm45',    'sp-crosswinds-greens-2026','Greens','2026-01-13','2026-01-13','TM 4.5',             1.25,  'gal/acre',     'Total amount: 5 gal total (~4 A). Nutrient summary: 0.09 lbs K/1000.', 10113,'planned'),
('spi-cw26-0113-kelp',    'sp-crosswinds-greens-2026','Greens','2026-01-13','2026-01-13','Double Bass Kelp',   0.625, 'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10114,'planned'),
('spi-cw26-0113-kickdrum','sp-crosswinds-greens-2026','Greens','2026-01-13','2026-01-13','Kickdrum 0-0-29 K Acetate',1.25,'gal/acre','Total amount: 5 gal total (~4 A).', 10115,'planned'),

-- January 24 — Water in app
('spi-cw26-0124-segway',     'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Segway',                       39.2, 'oz/acre',      'Water in app. Total amount: 4 bottles total. Nutrient summary: 0.08 lbs N/1000, 0.16 lbs K/1000.', 10124,'planned'),
('spi-cw26-0124-phiter',     'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Prize Phiter',                 0.625,'gal/acre',     'Water in app. Total amount: 2.5 gal total (~4 A). Alias note: Prize Phyter.', 10125,'planned'),
('spi-cw26-0124-pn',         'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10126,'planned'),
('spi-cw26-0124-cn',         'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10127,'planned'),
('spi-cw26-0124-epsom',      'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Epsom Salt',                   7.5,  'lb/acre',      'Water in app. Total amount: 25 lb total (~4 A).', 10128,'planned'),
('spi-cw26-0124-harmony',    'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Harmony',                      1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A). Alias note: Root Harmony.', 10129,'planned'),
('spi-cw26-0124-hydra',      'sp-crosswinds-greens-2026','Greens','2026-01-24','2026-01-24','Hydra 30 Plus',                1.0,  'gal/acre',     'Water in app. Total amount: 4 gal total (~4 A).', 10130,'planned'),

-- February 3
('spi-cw26-0203-secure',  'sp-crosswinds-greens-2026','Greens','2026-02-03','2026-02-03','Secure Action',     0.5,    'oz/1000 sq ft','Total amount: 88 oz total. Nutrient summary: 0.03 lbs K/1000.', 10203,'planned'),
('spi-cw26-0203-pigment', 'sp-crosswinds-greens-2026','Greens','2026-02-03','2026-02-03','Rain Green Pigment',16,     'oz/acre',      'Total amount: 64 oz total (~4 A).', 10204,'planned'),
('spi-cw26-0203-harmony', 'sp-crosswinds-greens-2026','Greens','2026-02-03','2026-02-03','Harmony',           0.625,  'gal/acre',     'Total amount: 2.5 gal total (~4 A). Alias note: Root Harmony.', 10205,'planned'),
('spi-cw26-0203-phiter',  'sp-crosswinds-greens-2026','Greens','2026-02-03','2026-02-03','Prize Phiter',      0.625,  'gal/acre',     'Total amount: 2.5 gal total (~4 A). Alias note: Prize Phyter.', 10206,'planned'),

-- February 14
('spi-cw26-0214-fosetyl',  'sp-crosswinds-greens-2026','Greens','2026-02-14','2026-02-14','Fosetyl Al',                4.0,  'oz/1000 sq ft','Total amount: 45 lb total, 9 bottles. Nutrient summary: 0.09 lbs K/1000.', 10214,'planned'),
('spi-cw26-0214-manzate',  'sp-crosswinds-greens-2026','Greens','2026-02-14','2026-02-14','Manzate Max',               4.4,  'oz/1000 sq ft','Total amount: 48 lb total.', 10215,'planned'),
('spi-cw26-0214-kickdrum', 'sp-crosswinds-greens-2026','Greens','2026-02-14','2026-02-14','Kickdrum 0-0-29 K Acetate', 1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 10216,'planned'),

-- February 28 — Water in app
('spi-cw26-0228-serata',  'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Serata',                       NULL, NULL,        'Water in app. Total amount: 3 bottles total. Nutrient summary: 0.08 lbs N/1000, 0.16 lbs K/1000.', 10228,'planned'),
('spi-cw26-0228-pedigree','sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Pedigree',                     1.25, 'gal/acre',  'Water in app. Total amount: 5 gal total (~4 A).', 10229,'planned'),
('spi-cw26-0228-phiter',  'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Prize Phiter',                 0.625,'gal/acre',  'Water in app. Total amount: 2.5 gal total (~4 A). Alias note: Prize Phyter.', 10230,'planned'),
('spi-cw26-0228-pn',      'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',   'Water in app. Total amount: 50 lb total (~4 A).', 10231,'planned'),
('spi-cw26-0228-cn',      'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',   'Water in app. Total amount: 50 lb total (~4 A).', 10232,'planned'),
('spi-cw26-0228-harmony', 'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Harmony',                      1.25, 'gal/acre',  'Water in app. Total amount: 5 gal total (~4 A). Alias note: Root Harmony.', 10233,'planned'),
('spi-cw26-0228-hydra',   'sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','Hydra 30 Plus',                1.0,  'gal/acre',  'Water in app.', 10234,'planned'),
('spi-cw26-0228-verdecal','sp-crosswinds-greens-2026','Greens','2026-02-28','2026-02-28','PUSH VerdeCal Lime / Hi Cal',  200,  'lb/acre',   'Granular only. Total amount: 16 bags total (~4 A).', 10235,'planned'),

-- March 14
('spi-cw26-0314-chloro',  'sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','Chlorothalonil 720',           3.67, 'oz/1000 sq ft','Total amount: 5 gal total. Nutrient summary: 0.08 lbs N/1000, 0.21 lbs K/1000. Related-not-merged: Daconil Action / Chlorothalonil.', 10314,'planned'),
('spi-cw26-0314-pn',      'sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',     'Total amount: 50 lb total (~4 A).', 10315,'planned'),
('spi-cw26-0314-cn',      'sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',     'Total amount: 50 lb total (~4 A).', 10316,'planned'),
('spi-cw26-0314-seasugar','sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','Sea Sugar',                    0.625,'gal/acre',    'Total amount: 2.5 gal total (~4 A).', 10317,'planned'),
('spi-cw26-0314-sweet',   'sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','Sweet Heat',                   0.625,'gal/acre',    'Total amount: 2.5 gal total (~4 A).', 10318,'planned'),
('spi-cw26-0314-26phite', 'sp-crosswinds-greens-2026','Greens','2026-03-14','2026-03-14','26 PHite',                     1.25, 'gal/acre',    'Total amount: 5 gal total (~4 A).', 10319,'planned'),

-- Mid March (window) — when watering or rain
('spi-cw26-mid-mar-push', 'sp-crosswinds-greens-2026','Greens','2026-03-15','2026-03-21','PUSH 13-2-13', 100, 'lb/acre', 'Granular only. Timing: mid-March, when watering or rain. Total amount: 8 bags total (~4 A). Nutrient summary: 0.3 lbs N/1000, 0.3 lbs K/1000.', 10399,'planned'),

-- March 28 — Water in app
('spi-cw26-0328-fame',     'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','Fame SC',                       16.0, 'oz/acre',  'Water in app. Total amount: 64 oz total (~4 A). Nutrient summary: 0.11 lbs P and K/1000.', 10328,'planned'),
('spi-cw26-0328-dual',     'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','Dual Shield',                   32.0, 'oz/acre',  'Water in app. Total amount: 1 gal total (~4 A).', 10329,'planned'),
('spi-cw26-0328-rootnote', 'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','Rootnote 3-18-18',              2.5,  'gal/acre', 'Water in app. Total amount: 10 gal total (~4 A).', 10330,'planned'),
('spi-cw26-0328-harmony',  'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','Harmony',                       1.25, 'gal/acre', 'Water in app. Total amount: 5 gal total (~4 A). Alias note: Root Harmony.', 10331,'planned'),
('spi-cw26-0328-hydra',    'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','Hydra 30 Plus',                 1.0,  'gal/acre', 'Water in app.', 10332,'planned'),
('spi-cw26-0328-kmag',     'sp-crosswinds-greens-2026','Greens','2026-03-28','2026-03-28','PUSH KMag 0-0-22',              100,  'lb/acre',  'Granular only. Total amount: 8 bags total (~4 A). Nutrient summary: 0.51 lbs K/1000, 0.25 lbs Mg/1000.', 10333,'planned'),

-- April 5
('spi-cw26-0405-appear',  'sp-crosswinds-greens-2026','Greens','2026-04-05','2026-04-05','Appear',     6.0,  'oz/1000 sq ft','Total amount: 8 gal total.', 10405,'planned'),
('spi-cw26-0405-seasugar','sp-crosswinds-greens-2026','Greens','2026-04-05','2026-04-05','Sea Sugar',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10406,'planned'),
('spi-cw26-0405-sweet',   'sp-crosswinds-greens-2026','Greens','2026-04-05','2026-04-05','Sweet Heat', 0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10407,'planned'),

-- April 11
('spi-cw26-0411-chloro', 'sp-crosswinds-greens-2026','Greens','2026-04-11','2026-04-11','Chlorothalonil 720', 3.5,  'oz/1000 sq ft','Total amount: 5 gal total. Nutrient summary: 0.10 lbs N/1000. Related-not-merged: Daconil Action / Chlorothalonil.', 10411,'planned'),
('spi-cw26-0411-uan',    'sp-crosswinds-greens-2026','Greens','2026-04-11','2026-04-11','UAN 32-0-0',         1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 10412,'planned'),

-- April 15 — Granular only
('spi-cw26-0415-13218', 'sp-crosswinds-greens-2026','Greens','2026-04-15','2026-04-15','Vereens 13-2-13', 100, 'lb/acre', 'Granular only. Total amount: 8 bags total (~4 A). Nutrient summary: 0.3 lbs N/1000, 0.3 lbs K/1000.', 10415,'planned'),

-- April 25 — Water in app
('spi-cw26-0425-proth',     'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Prothioconazole',  8.5,  'oz/acre', 'Water in app. Total amount: 34 oz total (~4 A). Generic equivalent note (not merged): Densicor. Nutrient summary: 0.06 lbs N/1000.', 10425,'planned'),
('spi-cw26-0425-zelto',     'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Zelto',            1.0,  'gal/acre','Water in app. Total amount: 4 gal total (~4 A).', 10426,'planned'),
('spi-cw26-0425-crescendo', 'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Crescendo',        4.0,  'lb/acre', 'Water in app. Total amount: 16 lb total (~4 A).', 10427,'planned'),
('spi-cw26-0425-ampliphy',  'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Ampliphy 18',      1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A). Not merged with Veriphy 18 — see catalog review.', 10428,'planned'),
('spi-cw26-0425-sweet',     'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Sweet Heat',       1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A).', 10429,'planned'),
('spi-cw26-0425-excalibur', 'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','Excalibur',        1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A).', 10430,'planned'),
('spi-cw26-0425-verdecalg', 'sp-crosswinds-greens-2026','Greens','2026-04-25','2026-04-25','PUSH VerdeCal G',  150,  'lb/acre', 'Granular only. Total amount: 12 bags total (~4 A). Nutrient summary: 0.76 lbs Ca/1000.', 10431,'planned'),

-- May 9
('spi-cw26-0509-fipronil','sp-crosswinds-greens-2026','Greens','2026-05-09','2026-05-09','Fipronil 0.0143G', 87,  'lb/acre', 'Granular only. Total amount: 12 bags total (~4 A). Nutrient summary: 0.3 lbs N/1000, 0.3 lbs K/1000.', 10509,'planned'),
('spi-cw26-0509-13218',   'sp-crosswinds-greens-2026','Greens','2026-05-09','2026-05-09','Vereens 13-2-13', 100, 'lb/acre', 'Granular only. Total amount: 8 bags total (~4 A).', 10510,'planned'),

-- May 16 — if possible 1 turn of heads at app
('spi-cw26-0516-pendant', 'sp-crosswinds-greens-2026','Greens','2026-05-16','2026-05-16','Pendant SC',                   1.46, 'oz/1000 sq ft','Timing: if possible, 1 turn of heads at application. Total amount: 1.5 gal total. Nutrient summary: 0.08 lbs N/1000, 0.13 lbs K/1000.', 10516,'planned'),
('spi-cw26-0516-pn',      'sp-crosswinds-greens-2026','Greens','2026-05-16','2026-05-16','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',      'Total amount: 50 lb total (~4 A).', 10517,'planned'),
('spi-cw26-0516-cn',      'sp-crosswinds-greens-2026','Greens','2026-05-16','2026-05-16','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',      'Total amount: 50 lb total (~4 A).', 10518,'planned'),
('spi-cw26-0516-microtone','sp-crosswinds-greens-2026','Greens','2026-05-16','2026-05-16','Microtone',                   1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 10519,'planned'),
('spi-cw26-0516-excalibur','sp-crosswinds-greens-2026','Greens','2026-05-16','2026-05-16','Excalibur',                   80,   'oz/acre',      'Total amount: 2.5 gal total (~4 A).', 10520,'planned'),

-- May 25 — Water in app
('spi-cw26-0525-pedigree','sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Pedigree',                      1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A). Nutrient summary: 0.13 lbs N/1000, 0.02 lbs P/1000, 0.03 lbs K/1000.', 10525,'planned'),
('spi-cw26-0525-nema',    'sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Nemamectin',                    0.28, 'oz/1000 sq ft','Water in app. Total amount: 48 oz total.', 10526,'planned'),
('spi-cw26-0525-urea',    'sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Urea',                          12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10527,'planned'),
('spi-cw26-0525-redox',   'sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Redox K+',                      2.5,  'lb/acre',      'Water in app. Total amount: 10 lb total (~4 A).', 10528,'planned'),
('spi-cw26-0525-seasugar','sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Sea Sugar',                     1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A).', 10529,'planned'),
('spi-cw26-0525-excalibur','sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','Excalibur',                    80,   'oz/acre',      'Water in app. Total amount: 2.5 gal total (~4 A).', 10530,'planned'),
('spi-cw26-0525-1838',    'sp-crosswinds-greens-2026','Greens','2026-05-25','2026-05-25','PUSH 18-3-18',                  150,  'lb/acre',      'Granular only. Total amount: 600 lb total, 12 bags (~4 A). Nutrient summary: 0.62 lbs N/1000, 0.62 lbs K/1000.', 10531,'planned'),

-- June 13 — One week prior to aeration
('spi-cw26-0613-pendant', 'sp-crosswinds-greens-2026','Greens','2026-06-13','2026-06-13','Pendant SC',         1.46, 'oz/1000 sq ft','Timing: one week prior to aeration. Total amount: 1.5 gal total. Nutrient summary: 0.06 lbs N/1000, 0.07 lbs K/1000.', 10613,'planned'),
('spi-cw26-0613-contrado','sp-crosswinds-greens-2026','Greens','2026-06-13','2026-06-13','Contrado',           12.0, 'oz/acre',      'Total amount: 36 oz total (~4 A).', 10614,'planned'),
('spi-cw26-0613-biorhythm','sp-crosswinds-greens-2026','Greens','2026-06-13','2026-06-13','BioRhythym',         1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 10615,'planned'),
('spi-cw26-0613-power',   'sp-crosswinds-greens-2026','Greens','2026-06-13','2026-06-13','PowerChord 0-0-26',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10616,'planned'),
('spi-cw26-0613-push',    'sp-crosswinds-greens-2026','Greens','2026-06-13','2026-06-13','PUSH Vereens 18-3-18',100, 'lb/acre',      'Granular only. Total amount: 8 bags total (~4 A). Timing: if possible, wait until afternoon and water in so morning spray has time on the leaf blade. Nutrient summary: 0.41 lbs N/1000, 0.41 lbs K/1000.', 10617,'planned'),

-- June 23–25 — Aeration window (incorporated into holes)
('spi-cw26-aeration-ecolite',  'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','Ecolite',           10,  'lb/1000 sq ft','Aeration window June 23–25. Incorporated into holes pre-sand. Total amount: 450 lb/A, 36 bags. Nutrient summary: 0.65 lbs N/1000, 0.65 lbs K/1000.', 10623,'planned'),
('spi-cw26-aeration-myco',     'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','MycoReplenish',     8,   'lb/1000 sq ft','Aeration window June 23–25. Incorporated into holes pre-sand. Total amount: 350 lb/A, 28 bags.', 10624,'planned'),
('spi-cw26-aeration-545',      'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','5-4-5 Greens Grade',8,   'lb/1000 sq ft','Aeration window June 23–25. Incorporated post-sand, pre-drag. Total amount: 350 lb/A, 28 bags.', 10625,'planned'),
('spi-cw26-aeration-verdecal', 'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','VerdeCal Lime',     5,   'lb/1000 sq ft','Aeration window June 23–25. Incorporated into holes. Total amount: 18 bags.', 10626,'planned'),
('spi-cw26-aeration-veriphy',  'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','Veriphy 18',        1.25,'gal/acre',      'Aeration window June 23–25. Spray on sand. Water in multiple cycles to flush. Total amount: 5 gal total (~4 A). Not merged with Ampliphy 18 — see catalog review. Nutrient summary: 0.06 lbs N/1000.', 10627,'planned'),
('spi-cw26-aeration-triden',   'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','Triden Microbes',   0.5, 'lb/acre',       'Aeration window June 23–25. Spray on sand. Water in multiple cycles to flush. Total amount: 2 lb total (~4 A).', 10628,'planned'),
('spi-cw26-aeration-sweet',    'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','Sweet Heat',        1.25,'gal/acre',      'Aeration window June 23–25. Spray on sand. Water in multiple cycles to flush. Total amount: 5 gal total (~4 A).', 10629,'planned'),
('spi-cw26-aeration-oars',     'sp-crosswinds-greens-2026','Greens','2026-06-23','2026-06-25','Oars PS',           5.5, 'oz/1000 sq ft', 'Aeration window June 23–25. Spray on sand. Water in multiple cycles to flush. Total amount: 7.5 gal total.', 10630,'planned'),

-- June 30 — Following DryJect
('spi-cw26-0630-fame',     'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Fame',              16.0, 'oz/acre', 'Timing: following DryJect.', 10630.5,'planned'),
('spi-cw26-0630-dual',     'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Dual Shield',       32.0, 'oz/acre', 'Total amount: 1 gal total (~4 A).', 10631,'planned'),
('spi-cw26-0630-veriphy',  'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Veriphy 18',        1.25, 'gal/acre','Total amount: 5 gal total (~4 A). Not merged with Ampliphy 18 — see catalog review.', 10632,'planned'),
('spi-cw26-0630-triden',   'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Triden Microbes',   0.5,  'lb/acre', 'Total amount: 2 lb total (~4 A).', 10633,'planned'),
('spi-cw26-0630-sweet',    'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Sweet Heat',        1.25, 'gal/acre','Total amount: 5 gal total (~4 A).', 10634,'planned'),
('spi-cw26-0630-excalibur','sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','Excalibur',         80,   'oz/acre', 'Total amount: 2.5 gal total (~4 A).', 10635,'planned'),
('spi-cw26-0630-royale',   'sp-crosswinds-greens-2026','Greens','2026-06-30','2026-06-30','PUSH Turf Royale Mini 28-7-14',50,'lb/acre','Granular only. Total amount: 4 bags total (~4 A). Nutrient summary: 0.32 lbs N/1000, 0.08 lbs P/1000, 0.16 lbs K/1000.', 10636,'planned'),

-- July 16
('spi-cw26-0716-proth',    'sp-crosswinds-greens-2026','Greens','2026-07-16','2026-07-16','Prothioconazole', 8.5,  'oz/acre', 'Total amount: 34 oz total (~4 A). Generic equivalent note (not merged): Densicor. Nutrient summary: 0.06 lbs N/1000, 0.07 lbs K/1000.', 10716,'planned'),
('spi-cw26-0716-biorhythm','sp-crosswinds-greens-2026','Greens','2026-07-16','2026-07-16','BioRhythym',      1.25, 'gal/acre','Total amount: 5 gal total (~4 A).', 10717,'planned'),
('spi-cw26-0716-power',    'sp-crosswinds-greens-2026','Greens','2026-07-16','2026-07-16','PowerChord 0-0-26',0.625,'gal/acre','Total amount: 2.5 gal total (~4 A).', 10718,'planned'),

-- July 25 — Water in app
('spi-cw26-0725-resilia',  'sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Resilia',         4.0,  'oz/1000 sq ft','Water in app. Total amount: 5.5 gal total. Nutrient summary: 0.13 lbs N/1000, 0.02 lbs P/1000, 0.03 lbs K/1000.', 10725,'planned'),
('spi-cw26-0725-indemnify','sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Indemnify',       NULL, NULL,           'Water in app. Total amount: 2 bottles.', 10726,'planned'),
('spi-cw26-0725-urea',     'sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Urea',            12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10727,'planned'),
('spi-cw26-0725-redox',    'sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Redox K+',        2.5,  'lb/acre',      'Water in app. Total amount: 10 lb total (~4 A).', 10728,'planned'),
('spi-cw26-0725-seasugar', 'sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Sea Sugar',       1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A).', 10729,'planned'),
('spi-cw26-0725-excalibur','sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','Excalibur',       80,   'oz/acre',      'Water in app. Total amount: 2.5 gal total (~4 A).', 10730,'planned'),
('spi-cw26-0725-1838',     'sp-crosswinds-greens-2026','Greens','2026-07-25','2026-07-25','PUSH 18-3-18',    100,  'lb/acre',      'Granular only. Total amount: 8 bags total (~4 A). Nutrient summary: 0.41 lbs N/1000, 0.41 lbs K/1000.', 10731,'planned'),

-- Sometime in July
('spi-cw26-mid-jul-aqua', 'sp-crosswinds-greens-2026','Greens','2026-07-10','2026-07-31','PUSH Aqua Aid VerdeCal G', 150, 'lb/acre', 'Granular only. Timing: sometime in July. Total amount: 12 bags total (~4 A).', 10799,'planned'),

-- August 8
('spi-cw26-0808-fosetyl',  'sp-crosswinds-greens-2026','Greens','2026-08-08','2026-08-08','Fosetyl Al',        4.0,  'oz/1000 sq ft','Total amount: 45 lb total, 9 bottles. Nutrient summary: 0.06 lbs N/1000, 0.07 lbs K/1000.', 10808,'planned'),
('spi-cw26-0808-secure',   'sp-crosswinds-greens-2026','Greens','2026-08-08','2026-08-08','Secure Action',     0.5,  'oz/1000 sq ft','Total amount: 88 oz total.', 10809,'planned'),
('spi-cw26-0808-biorhythm','sp-crosswinds-greens-2026','Greens','2026-08-08','2026-08-08','BioRhythym',        1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 10810,'planned'),
('spi-cw26-0808-power',    'sp-crosswinds-greens-2026','Greens','2026-08-08','2026-08-08','PowerChord 0-0-26', 0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10811,'planned'),
('spi-cw26-0808-kelp',     'sp-crosswinds-greens-2026','Greens','2026-08-08','2026-08-08','Double Bass Kelp',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 10812,'planned'),

-- August 22 — Water in app
('spi-cw26-0822-proth',    'sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','Prothioconazole',8.5,  'oz/acre', 'Water in app. Total amount: 34 oz total (~4 A). Generic equivalent note (not merged): Densicor. Nutrient summary: 0.06 lbs N/1000.', 10822,'planned'),
('spi-cw26-0822-ampliphy', 'sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','Ampliphy 18',    1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A). Not merged with Veriphy 18 — see catalog review.', 10823,'planned'),
('spi-cw26-0822-dual',     'sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','Dual Shield',    32.0, 'oz/acre', 'Water in app. Total amount: 1 gal total (~4 A).', 10824,'planned'),
('spi-cw26-0822-sweet',    'sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','Sweet Heat',     1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A).', 10825,'planned'),
('spi-cw26-0822-excalibur','sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','Excalibur',      1.25, 'gal/acre','Water in app. Total amount: 5 gal total (~4 A).', 10826,'planned'),
('spi-cw26-0822-1838',     'sp-crosswinds-greens-2026','Greens','2026-08-22','2026-08-22','PUSH 18-3-18',   100,  'lb/acre', 'Granular only. Total amount: 8 bags total (~4 A). Nutrient summary: 0.41 lbs N/1000, 0.41 lbs K/1000.', 10827,'planned'),

-- September 19 — Water in app
('spi-cw26-0919-ascernity','sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Ascernity',                    1.0,  'oz/1000 sq ft','Water in app. Total amount: 176 oz total. Nutrient summary: 0.08 lbs N/1000, 0.13 lbs K/1000.', 10919,'planned'),
('spi-cw26-0919-nema',     'sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Nemamectin',                   0.28, 'oz/1000 sq ft','Water in app. Total amount: 48 oz total.', 10920,'planned'),
('spi-cw26-0919-pn',       'sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10921,'planned'),
('spi-cw26-0919-cn',       'sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 10922,'planned'),
('spi-cw26-0919-triden',   'sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Triden Microbes',              0.25, 'lb/acre',      'Water in app. Total amount: 1 lb total (~4 A).', 10923,'planned'),
('spi-cw26-0919-excalibur','sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','Excalibur',                    1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A).', 10924,'planned'),
('spi-cw26-0919-kmag',     'sp-crosswinds-greens-2026','Greens','2026-09-19','2026-09-19','PUSH KMag',                    100,  'lb/acre',      'Granular only. Total amount: 8 bags total (~4 A). Nutrient summary: 0.50 lbs K/1000, 0.25 lbs Mg/1000.', 10925,'planned'),

-- October 3
('spi-cw26-1003-appear',   'sp-crosswinds-greens-2026','Greens','2026-10-03','2026-10-03','Appear II',         6.0,  'oz/1000 sq ft','Total amount: 8 gal total. Nutrient summary: 0.06 lbs N/1000, 0.02 lbs K/1000.', 11003,'planned'),
('spi-cw26-1003-secure',   'sp-crosswinds-greens-2026','Greens','2026-10-03','2026-10-03','Secure Action',     0.5,  'oz/1000 sq ft','Total amount: 88 oz total.', 11004,'planned'),
('spi-cw26-1003-biorhythm','sp-crosswinds-greens-2026','Greens','2026-10-03','2026-10-03','BioRhythym',        1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 11005,'planned'),
('spi-cw26-1003-kelp',     'sp-crosswinds-greens-2026','Greens','2026-10-03','2026-10-03','Double Bass Kelp',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 11006,'planned'),

-- October 17
('spi-cw26-1017-chloro',   'sp-crosswinds-greens-2026','Greens','2026-10-17','2026-10-17','Chlorothalonil',    3.67, 'oz/1000 sq ft','Total amount: 5 gal total. Nutrient summary: 0.06 lbs N/1000, 0.06 lbs K/1000. Related-not-merged: Daconil Action / Chlorothalonil 720.', 11017,'planned'),
('spi-cw26-1017-biorhythm','sp-crosswinds-greens-2026','Greens','2026-10-17','2026-10-17','BioRhythym',        1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 11018,'planned'),
('spi-cw26-1017-power',    'sp-crosswinds-greens-2026','Greens','2026-10-17','2026-10-17','PowerChord 0-0-26', 0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 11019,'planned'),
('spi-cw26-1017-kelp',     'sp-crosswinds-greens-2026','Greens','2026-10-17','2026-10-17','Double Bass Kelp',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 11020,'planned'),
('spi-cw26-1017-excalibur','sp-crosswinds-greens-2026','Greens','2026-10-17','2026-10-17','Excalibur',         80,   'oz/acre',      'Total amount: 2.5 gal total (~4 A).', 11021,'planned'),

-- October 24 — Water in app
('spi-cw26-1024-ascernity','sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Ascernity',                    1.0,  'oz/1000 sq ft','Water in app. Total amount: 176 oz total. Nutrient summary: 0.08 lbs N/1000, 0.13 lbs K/1000.', 11024,'planned'),
('spi-cw26-1024-segway',   'sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Segway',                       0.6,  'oz/1000 sq ft','Water in app. Total amount: 3 bottles total.', 11025,'planned'),
('spi-cw26-1024-dual',     'sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Dual Shield',                  32.0, 'oz/acre',      'Water in app. Total amount: 1 gal total (~4 A).', 11026,'planned'),
('spi-cw26-1024-pn',       'sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Potassium Nitrate 13.5-0-46',  12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 11027,'planned'),
('spi-cw26-1024-cn',       'sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Calcium Nitrate 15.5-0-0',     12.5, 'lb/acre',      'Water in app. Total amount: 50 lb total (~4 A).', 11028,'planned'),
('spi-cw26-1024-microtone','sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Microtone',                    1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A).', 11029,'planned'),
('spi-cw26-1024-excalibur','sp-crosswinds-greens-2026','Greens','2026-10-24','2026-10-24','Excalibur',                    80,   'oz/acre',      'Water in app. Total amount: 2.5 gal total (~4 A).', 11030,'planned'),

-- November 14
('spi-cw26-1114-appear',   'sp-crosswinds-greens-2026','Greens','2026-11-14','2026-11-14','Appear II',         6.0,  'oz/1000 sq ft','Total amount: 8 gal total. Nutrient summary: 0.06 lbs N/1000, 0.02 lbs K/1000.', 11114,'planned'),
('spi-cw26-1114-daconil',  'sp-crosswinds-greens-2026','Greens','2026-11-14','2026-11-14','Daconil Action',    3.67, 'oz/1000 sq ft','Total amount: 5 gal total. Related-not-merged: Chlorothalonil / Chlorothalonil 720.', 11115,'planned'),
('spi-cw26-1114-biorhythm','sp-crosswinds-greens-2026','Greens','2026-11-14','2026-11-14','BioRhythym',        1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 11116,'planned'),
('spi-cw26-1114-kelp',     'sp-crosswinds-greens-2026','Greens','2026-11-14','2026-11-14','Double Bass Kelp',  0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 11117,'planned'),

-- November 28 — Water in app
('spi-cw26-1128-teb',      'sp-crosswinds-greens-2026','Greens','2026-11-28','2026-11-28','Tebuconazole 3.6F',            0.6,  'oz/1000 sq ft','Water in app. Total amount: 106 oz total. Nutrient summary: 0.08 lbs N/1000, 0.26 lbs K/1000.', 11128,'planned'),
('spi-cw26-1128-pn',       'sp-crosswinds-greens-2026','Greens','2026-11-28','2026-11-28','Potassium Nitrate 13.5-0-46',  25,   'lb/acre',      'Water in app. Total amount: 50 lb total (~2 A doubled rate).', 11129,'planned'),
('spi-cw26-1128-epsom',    'sp-crosswinds-greens-2026','Greens','2026-11-28','2026-11-28','Epsom Salt',                   7.5,  'lb/acre',      'Water in app. Total amount: 25 lb total (~4 A).', 11130,'planned'),
('spi-cw26-1128-rootharm', 'sp-crosswinds-greens-2026','Greens','2026-11-28','2026-11-28','Root Harmony',                 1.25, 'gal/acre',     'Water in app. Total amount: 5 gal total (~4 A). Alias note: Harmony.', 11131,'planned'),
('spi-cw26-1128-hydra',    'sp-crosswinds-greens-2026','Greens','2026-11-28','2026-11-28','Hydra 30 Plus',                1.0,  'gal/acre',     'Water in app.', 11132,'planned'),

-- December 12
('spi-cw26-1212-fosetyl',  'sp-crosswinds-greens-2026','Greens','2026-12-12','2026-12-12','Fosetyl Al',                4.0,  'oz/1000 sq ft','Total amount: 45 lb total, 9 bottles. Nutrient summary: 0.03 lbs K/1000.', 11212,'planned'),
('spi-cw26-1212-pendant',  'sp-crosswinds-greens-2026','Greens','2026-12-12','2026-12-12','Pendant SC',                1.46, 'oz/1000 sq ft','Total amount: 1.5 gal total.', 11213,'planned'),
('spi-cw26-1212-kelp',     'sp-crosswinds-greens-2026','Greens','2026-12-12','2026-12-12','Double Bass Kelp',          0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A).', 11214,'planned'),
('spi-cw26-1212-kickdrum', 'sp-crosswinds-greens-2026','Greens','2026-12-12','2026-12-12','Kickdrum 0-0-29 K Acetate', 1.25, 'gal/acre',     'Total amount: 5 gal total (~4 A).', 11215,'planned'),
('spi-cw26-1212-rootharm', 'sp-crosswinds-greens-2026','Greens','2026-12-12','2026-12-12','Root Harmony',              0.625,'gal/acre',     'Total amount: 2.5 gal total (~4 A). Alias note: Harmony.', 11216,'planned'),

-- December 26 — Water in app
('spi-cw26-1226-appear',  'sp-crosswinds-greens-2026','Greens','2026-12-26','2026-12-26','Appear II',                    6.0,  'oz/1000 sq ft','Water in app. Total amount: 8 gal total. Nutrient summary: 0.08 lbs N/1000, 0.26 lbs K/1000.', 11226,'planned'),
('spi-cw26-1226-rain',    'sp-crosswinds-greens-2026','Greens','2026-12-26','2026-12-26','Rain Pigment',                 16,   'oz/acre',      'Water in app. Total amount: 64 oz total (~4 A). Alias note: Rain Green Pigment.', 11227,'planned'),
('spi-cw26-1226-pn',      'sp-crosswinds-greens-2026','Greens','2026-12-26','2026-12-26','Potassium Nitrate 13.5-0-46',  25,   'lb/acre',      'Water in app. Total amount: 100 lb total (~4 A doubled rate).', 11228,'planned'),
('spi-cw26-1226-harmony', 'sp-crosswinds-greens-2026','Greens','2026-12-26','2026-12-26','Harmony',                      0.625,'gal/acre',     'Water in app. Total amount: 2.5 gal total (~4 A). Alias note: Root Harmony.', 11229,'planned'),
('spi-cw26-1226-hydra',   'sp-crosswinds-greens-2026','Greens','2026-12-26','2026-12-26','Hydra 30 Plus',                1.0,  'gal/acre',     'Water in app.', 11230,'planned');
