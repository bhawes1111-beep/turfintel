-- Phase 5.6 — Seed a realistic Crossroads GC crew.
--
-- INSERT OR IGNORE keeps this migration idempotent: re-running it
-- won't duplicate seed rows, and any operator-edited fields survive
-- because the existing row is left untouched.
--
-- Six people: one lead equipment tech, one spray tech, one irrigation
-- tech, one greens mower operator, two general crew members. Mirrors
-- the real staffing pattern at a mid-size course.

INSERT OR IGNORE INTO crew_employees (
  id, name, role, department, status, phone, email,
  assigned_area, skills_json, certifications_json, notes
) VALUES
  (
    'emp-001',
    'Carlos Mendoza',
    'Equipment Tech / Lead',
    'Maintenance',
    'active',
    '555-0114',
    'carlos.m@crossroadsgc.example',
    'Maintenance Shop',
    '["Hydraulic systems","Reel grinding","Engine diagnostics"]',
    '["Class A Mechanic","Pesticide Applicator"]',
    'Crew lead for maintenance shop; primary on hydraulic / engine work.'
  ),
  (
    'emp-002',
    'Juan Ramirez',
    'Spray Technician',
    'Agronomy',
    'active',
    '555-0142',
    'juan.r@crossroadsgc.example',
    'Spray',
    '["Tank mixing","Calibration","Pre/post-emerge applications"]',
    '["Pesticide Applicator","CPR / First Aid"]',
    'Primary applicator; certified for restricted-use chemicals.'
  ),
  (
    'emp-003',
    'Miguel Santos',
    'Irrigation Technician',
    'Operations',
    'active',
    '555-0167',
    'miguel.s@crossroadsgc.example',
    'Irrigation',
    '["Decoder troubleshooting","Pump station","Wire tracing"]',
    '["Irrigation Auditor (CIA)"]',
    'Decoder and pump station specialist; covers night-cycle on-call.'
  ),
  (
    'emp-004',
    'Derek Lloyd',
    'Greens Mower Operator / Lead',
    'Operations',
    'active',
    '555-0188',
    'derek.l@crossroadsgc.example',
    'Greens',
    '["Greens mowing","Roll patterns","Cup setting"]',
    '["CPR / First Aid"]',
    'Crew lead for AM greens routing; sets cup positions weekly.'
  ),
  (
    'emp-005',
    'James Thompson',
    'Grounds Crew',
    'Operations',
    'active',
    '555-0203',
    'james.t@crossroadsgc.example',
    'Fairways',
    '["Fairway mowing","Bunker raking","Divot repair"]',
    '[]',
    NULL
  ),
  (
    'emp-006',
    'Tom Becker',
    'Grounds Crew',
    'Operations',
    'active',
    '555-0224',
    'tom.b@crossroadsgc.example',
    'Tees',
    '["Tee mowing","Hand watering","String trimming"]',
    '[]',
    NULL
  );
