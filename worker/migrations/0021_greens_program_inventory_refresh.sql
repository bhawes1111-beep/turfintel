-- Phase 7 — Refresh Crossroads GC inventory with 2026 Greens Program lineup.
--
-- DATA migration (not schema). Replaces the seeded chemical + fertilizer
-- rows on crossroads-gc with the 57 products listed in the 2026 Greens
-- Program Recommendations document. Parts, fuel, and the non-chemical
-- product rows (bunker sand, cups, pin flags, line paint) are preserved.
--
-- Per the source document's own guidance, no manufacturer / EPA / cost /
-- quantity / expiry / unit values are inferred. Analysis is populated
-- only when N-P-K is explicit in the product name. Nitrogen source is
-- populated only when the source is named explicitly (Urea, UAN,
-- Calcium Nitrate, Potassium Nitrate).
--
-- Verification list rows carry category = 'Verification Needed' and a
-- notes string so the spray builder picker can warn supervisors before
-- operational use.

-- ── DELETES (8 chemicals + 5 fertilizers + 1 wetting agent) ────────────────

DELETE FROM inventory_items
 WHERE course_id = 'crossroads-gc'
   AND kind IN ('chemical', 'fertilizer');

DELETE FROM inventory_items
 WHERE course_id = 'crossroads-gc'
   AND kind = 'product'
   AND name = 'Wetting Agent — Revolution';

-- ── INSERTS — Fungicides / Plant Protectants (13) ──────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('chem-ascernity',          'chemical', 'Ascernity',                       'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-chlorothalonil-720', 'chemical', 'Chlorothalonil 720',              'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-daconil-action',     'chemical', 'Daconil Action',                  'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-fosetyl-al',         'chemical', 'Fosetyl-Al',                      'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-fame-sc',            'chemical', 'Fame SC',                         'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-manzate-max',        'chemical', 'Manzate Max',                     'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-pendant-sc',         'chemical', 'Pendant SC',                      'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-prothioconazole',    'chemical', 'Prothioconazole (generic Densicor)', 'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-segway',             'chemical', 'Segway',                          'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-serata',             'chemical', 'Serata',                          'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-tebuconazole-36f',   'chemical', 'Tebuconazole 3.6F',               'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-secure-action',      'chemical', 'Secure Action',                   'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-contrado',           'chemical', 'Contrado',                        'Fungicide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');

-- ── INSERTS — Insecticides / Nematicides (2) ───────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('chem-fipronil-0143g', 'chemical', 'Fipronil 0.0143G', 'Insecticide', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('chem-nemamectin',     'chemical', 'Nemamectin',       'Nematicide',  NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');

-- ── INSERTS — Fertilizers / Nutrients (16) ─────────────────────────────────
-- analysis populated only when N-P-K is explicit in the product name.
-- nitrogen_source populated only when explicit (Urea, UAN, Calcium Nitrate, Potassium Nitrate).

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('fert-potassium-nitrate',  'fertilizer', 'Potassium Nitrate 13.5-0-46', 'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '13.5-0-46', 'Potassium Nitrate',          'crossroads-gc'),
  ('fert-calcium-nitrate',    'fertilizer', 'Calcium Nitrate 15.5-0-0',    'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '15.5-0-0',  'Calcium Nitrate',            'crossroads-gc'),
  ('fert-uan-32',             'fertilizer', 'UAN 32-0-0',                  'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '32-0-0',    'Urea Ammonium Nitrate (UAN)','crossroads-gc'),
  ('fert-urea',               'fertilizer', 'Urea',                        'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,        'Urea',                       'crossroads-gc'),
  ('fert-kmag',               'fertilizer', 'KMag 0-0-22',                 'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0-0-22',    NULL,                         'crossroads-gc'),
  ('fert-18-3-18-greens',     'fertilizer', '18-3-18 Greens Grade',        'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '18-3-18',   NULL,                         'crossroads-gc'),
  ('fert-13-2-13',            'fertilizer', '13-2-13',                     'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '13-2-13',   NULL,                         'crossroads-gc'),
  ('fert-5-4-5-greens',       'fertilizer', '5-4-5 Greens Grade',          'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '5-4-5',     NULL,                         'crossroads-gc'),
  ('fert-turf-royale-mini',   'fertilizer', 'Turf Royale Mini 28-7-14',    'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '28-7-14',   NULL,                         'crossroads-gc'),
  ('fert-rootnote',           'fertilizer', 'Rootnote 3-18-18',            'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '3-18-18',   NULL,                         'crossroads-gc'),
  ('fert-powerchord',         'fertilizer', 'PowerChord 0-0-26',           'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0-0-26',    NULL,                         'crossroads-gc'),
  ('fert-kickdrum',           'fertilizer', 'KickDrum 0-0-29',             'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0-0-29',    NULL,                         'crossroads-gc'),
  ('fert-verdecal-lime',      'fertilizer', 'VerdeCal Lime',               'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,        NULL,                         'crossroads-gc'),
  ('fert-verdecal-gypsum',    'fertilizer', 'VerdeCal Gypsum',             'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,        NULL,                         'crossroads-gc'),
  ('fert-epsom-salt',         'fertilizer', 'Epsom Salt',                  'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,        NULL,                         'crossroads-gc'),
  ('fert-redox-k',            'fertilizer', 'Redox K+',                    'Fertilizer', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,        NULL,                         'crossroads-gc');

-- ── INSERTS — Biostimulants / Soil Biology / Organics (10) ─────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('bio-sea-sugar',       'fertilizer', 'Sea Sugar',         'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-sweet-heat',      'fertilizer', 'Sweet Heat',        'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-double-bass',     'fertilizer', 'Double Bass (Kelp)', 'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-biorhythm',       'fertilizer', 'BioRhythm',         'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-ampliphy-18',     'fertilizer', 'Ampliphy 18',       'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-microtone',       'fertilizer', 'Microtone',         'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-triden-microbes', 'fertilizer', 'Triden Microbes',   'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-mycoreplenish',   'fertilizer', 'MycoReplenish',     'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-ecolite',         'fertilizer', 'Ecolite',           'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('bio-prize-phiter',    'fertilizer', 'Prize Phiter',      'Biostimulant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');

-- ── INSERTS — Surfactants / Water Management (3) ───────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('surf-hydra-30',  'chemical', 'Hydra 30 Plus', 'Surfactant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('surf-excalibur', 'chemical', 'Excalibur',     'Surfactant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('surf-oars-ps',   'chemical', 'Oars PS',       'Surfactant', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');

-- ── INSERTS — Pigments / Colorants (2) ─────────────────────────────────────

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('pig-rain-green', 'chemical', 'Rain Green Pigment', 'Pigment', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('pig-rain',       'chemical', 'Rain Pigment',       'Pigment', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');

-- ── INSERTS — Verification Needed (11) ─────────────────────────────────────
-- Each carries an explicit operational warning so supervisors review
-- naming, manufacturer, analysis, and active ingredient before use.

INSERT OR IGNORE INTO inventory_items (
  id, kind, name, category, unit, quantity,
  reorder_level, location, vendor, cost_per_unit, notes,
  manufacturer, epa_number, expiry_date,
  analysis, nitrogen_source,
  course_id
) VALUES
  ('verify-tm-45',       'chemical', 'TM 4.5',       'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-26-phite',    'chemical', '26 PHite',     'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-dual-shield', 'chemical', 'Dual Shield',  'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-pedigree',    'chemical', 'Pedigree',     'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-resilia',     'chemical', 'Resilia',      'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-zelto',       'chemical', 'Zelto',        'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-crescendo',   'chemical', 'Crescendo',    'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-appear',      'chemical', 'Appear / Appear II', 'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-root-harmony','chemical', 'Root Harmony', 'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-veriphy-18',  'chemical', 'Veriphy 18',   'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc'),
  ('verify-highnote',    'chemical', 'Highnote',     'Verification Needed', NULL, 0, NULL, NULL, NULL, NULL, 'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.', NULL, NULL, NULL, NULL, NULL, 'crossroads-gc');
