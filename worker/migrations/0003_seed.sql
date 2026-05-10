-- Phase 5.1e — Operational seed data
--
-- A believable mid-tier 18-hole golf course operation. Hand-curated, not
-- generated. Sized to stress the operational surfaces (timelines, status
-- boards, signals, cross-module propagation) without dominating them.
--
-- Idempotent: every INSERT uses INSERT OR IGNORE so re-running the seed
-- migration is safe. Deterministic IDs (eq-*, ml-*, rep-*) ensure the
-- PK-conflict skip works correctly.
--
-- Equipment is inserted first so the maintenance_logs foreign-key
-- references resolve cleanly.

-- ──────────────────────────────────────────────────────────────────────
-- EQUIPMENT — 18 units across 6 categories
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO equipment (
  id, name, category, status, hours, next_service_hours,
  manufacturer, model, year, serial_number, fuel_type,
  assigned_operator, last_service, last_service_hours, service_interval, notes
) VALUES
  ('eq-greens-1',  'Greens Mower #1',  'Greens Mower',  'operational',       1847, 1900, 'Toro',       'Greensmaster 3150-Q',  2022, 'TGM3150-2201', 'Diesel',   'Alex Rivera',  '2026-04-22', 1800, 100, 'Primary greens cutting unit.'),
  ('eq-greens-2',  'Greens Mower #2',  'Greens Mower',  'operational',       1693, 1750, 'Toro',       'Greensmaster 3150-Q',  2022, 'TGM3150-2202', 'Diesel',   'Maya Chen',    '2026-05-02', 1650, 100, NULL),
  ('eq-greens-3',  'Greens Mower #3',  'Greens Mower',  'needs-maintenance', 2104, 2100, 'Toro',       'Greensmaster 3150-Q',  2021, 'TGM3150-2103', 'Diesel',   'Sam Doyle',    '2026-03-15', 2000, 100, 'Reel grind scheduled.'),
  ('eq-fairway-1', 'Fairway Mower #1', 'Fairway Mower', 'operational',       3250, 3300, 'John Deere', '7700A PrecisionCut',   2020, 'JD7700A-2034', 'Diesel',   'Marcus Webb',  '2026-04-15', 3200, 250, NULL),
  ('eq-fairway-2', 'Fairway Mower #2', 'Fairway Mower', 'needs-maintenance', 3398, 3375, 'John Deere', '7700A PrecisionCut',   2019, 'JD7700A-1987', 'Diesel',   'Marcus Webb',  '2026-02-28', 3100, 250, 'Reel service overdue — schedule ASAP.'),
  ('eq-fairway-3', 'Fairway Mower #3', 'Fairway Mower', 'in-service',        2890, 3050, 'Toro',       'Reelmaster 5410-D',    2021, 'TRM5410-2178', 'Diesel',   'Alex Rivera',  '2026-04-30', 2850, 200, 'In shop for hydraulic service.'),
  ('eq-rough-1',   'Rough Mower #1',   'Rough Mower',   'operational',       4120, 4200, 'Toro',       'Groundsmaster 4500-D', 2019, 'TGM4500-1956', 'Diesel',   'Diego Solis',  '2026-04-28', 4080, 250, NULL),
  ('eq-rough-2',   'Rough Mower #2',   'Rough Mower',   'operational',       3560, 3700, 'Toro',       'Groundsmaster 4700-D', 2020, 'TGM4700-2042', 'Diesel',   'Diego Solis',  '2026-04-08', 3450, 250, NULL),
  ('eq-utility-1', 'Utility Cart #1',  'Utility',       'operational',       2340, 2400, 'Toro',       'Workman GTX',          2021, 'TWGTX-2188',   'Gas',      'Casey Doyle',  '2026-04-02', 2200, 200, NULL),
  ('eq-utility-2', 'Utility Cart #2',  'Utility',       'operational',       1890, 2050, 'Toro',       'Workman GTX',          2022, 'TWGTX-2244',   'Gas',      'Jordan Park',  '2026-03-22', 1850, 200, NULL),
  ('eq-utility-3', 'Utility Cart #3',  'Utility',       'out-of-service',    4500, 4550, 'Toro',       'Workman MD',           2017, 'TWMD-1722',    'Gas',      NULL,           '2026-01-15', 4400, 200, 'Electrical fault — waiting on controller board.'),
  ('eq-utility-4', 'Utility Cart #4',  'Utility',       'operational',       3210, 3400, 'Cushman',    'Hauler 1200',          2019, 'CH1200-1989',  'Gas',      'Maya Chen',    '2026-03-10', 3050, 250, NULL),
  ('eq-spray-1',   'Spray Rig #1',     'Spray',         'operational',       1250, 1400, 'Toro',       'Multi Pro 5800-G',     2022, 'TMP5800-2218', 'Gas',      'Sam Doyle',    '2026-04-10', 1200, 150, 'Primary applications rig.'),
  ('eq-spray-2',   'Spray Rig #2',     'Spray',         'operational',        980, 1100, 'Toro',       'Multi Pro 1750',       2023, 'TMP1750-2305', 'Electric', 'Sam Doyle',    '2026-03-05',  900, 150, 'Secondary / greens-only.'),
  ('eq-sandpro-1', 'Sand Pro #1',      'Specialty',     'operational',       2150, 2300, 'Toro',       'Sand Pro 3040',        2020, 'TSP3040-2055', 'Gas',      'Diego Solis',  '2026-04-18', 2100, 150, NULL),
  ('eq-sandpro-2', 'Sand Pro #2',      'Specialty',     'needs-maintenance', 1980, 2000, 'Toro',       'Sand Pro 3040',        2020, 'TSP3040-2056', 'Gas',      'Diego Solis',  '2026-02-20', 1900, 150, 'Blade replacement scheduled.'),
  ('eq-tractor-1', 'Tractor #1',       'Specialty',     'operational',       5670, 5800, 'Kubota',     'M5-091',               2018, 'KM5091-1844',  'Diesel',   'Marcus Webb',  '2026-05-05', 5600, 200, NULL),
  ('eq-tractor-2', 'Tractor #2',       'Specialty',     'operational',       3890, 4100, 'John Deere', '4044R',                2021, 'JD4044R-2167', 'Diesel',   'Casey Doyle',  '2026-04-02', 3800, 250, NULL);

-- ──────────────────────────────────────────────────────────────────────
-- MAINTENANCE LOGS — 15 entries spanning completed / overdue /
-- in-progress / open. Believable operational mix.
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO maintenance_logs (
  id, equipment_id, service_type, status, priority,
  date, completed_date, hours_at_service, next_due_hours,
  cost, technician, notes, parts_used
) VALUES
  -- Completed (recent history)
  ('ml-001', 'eq-greens-1',  'Reel Service',          'completed',   'routine',  '2026-04-22', '2026-04-22', 1800, 1900,  345.00, 'Marcus Webb', 'Full reel grind and lapping. Bed knife adjusted.',                  '[{"part":"Bed Knife","partNumber":"BN-3150","quantity":1,"unitCost":85.00},{"part":"Reel Blade","partNumber":"RB-3150","quantity":11,"unitCost":23.50}]'),
  ('ml-002', 'eq-greens-2',  'Oil Change',            'completed',   'routine',  '2026-05-02', '2026-05-02', 1650, 1750,  125.00, 'Marcus Webb', 'Engine oil + hydraulic filter.',                                    '[{"part":"15W-40 Oil","partNumber":"OIL-15W40","quantity":3,"unitCost":18.00},{"part":"Hydraulic Filter","partNumber":"HF-3150","quantity":1,"unitCost":62.50}]'),
  ('ml-003', 'eq-fairway-1', 'Reel Service',          'completed',   'routine',  '2026-04-15', '2026-04-15', 3200, 3450,  480.00, 'Marcus Webb', 'All 5 reels backlapped. Front roller bearings inspected.',          '[{"part":"Bed Knife","partNumber":"BN-7700","quantity":5,"unitCost":78.00}]'),
  ('ml-004', 'eq-rough-1',   'Hydraulic Inspection',  'completed',   'routine',  '2026-04-28', '2026-04-28', 4080, 4330,   90.00, 'Marcus Webb', 'Hydraulic pressures verified, no leaks.',                            NULL),
  ('ml-005', 'eq-spray-1',   'Tank Calibration',      'completed',   'routine',  '2026-04-10', '2026-04-10', 1200, 1350,    0.00, 'Sam Doyle',   'In-house calibration. Output verified at 1.5 GPA.',                  NULL),
  ('ml-006', 'eq-tractor-1', 'Oil Change',            'completed',   'routine',  '2026-05-05', '2026-05-05', 5600, 5800,  145.00, 'Marcus Webb', NULL,                                                                 '[{"part":"15W-40 Oil","partNumber":"OIL-15W40","quantity":4,"unitCost":18.00}]'),
  -- Overdue
  ('ml-007', 'eq-fairway-2', 'Reel Service',          'overdue',     'high',     '2026-04-01', NULL,         3375, 3625,    0.00, NULL,          'Service window passed — unit operating at reduced quality.',         NULL),
  ('ml-008', 'eq-utility-3', 'Electrical Repair',     'overdue',     'critical', '2026-04-20', NULL,         4500, NULL,     0.00, NULL,          'Controller board failure. Replacement on order from vendor.',        NULL),
  -- In progress
  ('ml-009', 'eq-fairway-3', 'Hydraulic Service',     'in-progress', 'high',     '2026-05-06', NULL,         2890, 3050,    0.00, 'Marcus Webb', 'Hydraulic pump showed pressure drop. Replacing pump + lines.',       '[{"part":"Hydraulic Pump","partNumber":"HP-5410","quantity":1,"unitCost":420.00}]'),
  -- Open (queued but not started)
  ('ml-010', 'eq-sandpro-2', 'Blade Replacement',     'open',        'high',     '2026-05-07', NULL,         1980, 2150,    0.00, 'Diego Solis', 'Cutting bar replacement needed before next bunker rake cycle.',      NULL),
  ('ml-011', 'eq-greens-3',  'Reel Grind',            'open',        'routine',  '2026-05-04', NULL,         2104, 2300,    0.00, NULL,          'Quality of cut declining. Schedule on slow-spray week.',             NULL),
  ('ml-012', 'eq-spray-1',   'Pump Inspection',       'open',        'routine',  '2026-05-03', NULL,         1250, 1400,    0.00, NULL,          'Routine 150-hr pump check.',                                         NULL),
  ('ml-013', 'eq-utility-1', 'Tire Rotation',         'open',        'routine',  '2026-05-01', NULL,         2340, 2400,    0.00, NULL,          NULL,                                                                 NULL),
  ('ml-014', 'eq-tractor-2', 'PM Service',            'open',        'routine',  '2026-04-30', NULL,         3890, 4100,    0.00, NULL,          '250-hr full PM due.',                                                NULL),
  ('ml-015', 'eq-rough-2',   'Blade Sharpening',      'open',        'routine',  '2026-04-26', NULL,         3560, 3700,    0.00, NULL,          NULL,                                                                 NULL);

-- ──────────────────────────────────────────────────────────────────────
-- REPAIRS — 8 irrigation tickets covering every issue type the UI
-- recognizes, with varied priorities and statuses.
-- ──────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO repairs (
  id, issue_type, area, hole, head_number, description,
  priority, status, assigned_to, labor_hours, parts_used,
  date_reported, completed_at, notes
) VALUES
  ('rep-001', 'broken-head',      'Greens',        4,    'G-04-3', 'Sprinkler head sheared at base. No coverage on back-right of green.',     'high',   'open',         NULL,          0.0, NULL,                                                                                                  '2026-05-07', NULL,         'Hand-watering required until repair.'),
  ('rep-002', 'leaking-valve',    'Fairway',      12,    'FW-12-S','Slow leak at solenoid manifold. Pressure loss noted on adjacent zone.',   'medium', 'in-progress',  'Diego Solis', 1.5, '[{"part":"Solenoid","qty":1}]',                                                                       '2026-05-04', NULL,         NULL),
  ('rep-003', 'stuck-valve',      'Approach',      7,    'AP-07-W','Valve will not close. Standing water at approach.',                        'high',   'parts-needed', 'Diego Solis', 0.5, '[{"part":"Hunter ICV-101","qty":1}]',                                                                 '2026-05-03', NULL,         'New valve ordered, ETA Friday.'),
  ('rep-004', 'pop-up-failure',   'Greens',        2,    'G-02-1', 'Pop-up not retracting. Mowing hazard.',                                    'medium', 'completed',    'Diego Solis', 1.0, '[{"part":"Pop-Up Body","qty":1}]',                                                                    '2026-04-28', '2026-04-29','Body assembly replaced.'),
  ('rep-005', 'line-break',       'Rough',         9,    NULL,     'Lateral line break between heads 9-N and 9-S. Trench complete.',           'high',   'completed',    'Marcus Webb', 4.0, '[{"part":"PVC 1in","qty":12},{"part":"PVC Couplers","qty":4}]',                                       '2026-04-22', '2026-04-23','Repair held overnight. Pressure test passed.'),
  ('rep-006', 'controller-fault', 'Pump Station',  NULL, NULL,     'Field controller A-03 not responding. Replaced communication module.',     'high',   'completed',    'Sam Doyle',   2.5, '[{"part":"Comm Module","qty":1}]',                                                                    '2026-04-19', '2026-04-19', NULL),
  ('rep-007', 'clogged-nozzle',   'Tees',         16,    'T-16-3', 'Nozzle clogged with sediment. Quick clean.',                               'low',    'open',         NULL,          0.0, NULL,                                                                                                  '2026-05-06', NULL,         NULL),
  ('rep-008', 'stuck-valve',      'Fairway',       5,    'FW-05-N','Valve cycling but not opening fully. Reduced coverage on hole 5.',         'medium', 'open',         NULL,          0.0, NULL,                                                                                                  '2026-05-05', NULL,         'Diaphragm may need replacement.');
