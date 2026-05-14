PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE equipment (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'operational',
  hours               INTEGER NOT NULL DEFAULT 0,
  next_service_hours  INTEGER,
  manufacturer        TEXT,
  model               TEXT,
  year                INTEGER,
  serial_number       TEXT,
  fuel_type           TEXT,
  assigned_operator   TEXT,
  last_service        TEXT,
  last_service_hours  INTEGER,
  service_interval    INTEGER,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT);
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-greens-1','Greens Mower #1','Greens Mower','operational',1847,1900,'Toro','Greensmaster 3150-Q',2022,'TGM3150-2201','Diesel','Alex Rivera','2026-04-22',1800,100,'Primary greens cutting unit.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-greens-2','Greens Mower #2','Greens Mower','operational',1693,1750,'Toro','Greensmaster 3150-Q',2022,'TGM3150-2202','Diesel','Maya Chen','2026-05-02',1650,100,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-greens-3','Greens Mower #3','Greens Mower','needs-maintenance',2104,2100,'Toro','Greensmaster 3150-Q',2021,'TGM3150-2103','Diesel','Sam Doyle','2026-03-15',2000,100,'Reel grind scheduled.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-fairway-1','Fairway Mower #1','Fairway Mower','operational',3250,3300,'John Deere','7700A PrecisionCut',2020,'JD7700A-2034','Diesel','Marcus Webb','2026-04-15',3200,250,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-fairway-2','Fairway Mower #2','Fairway Mower','needs-maintenance',3398,3375,'John Deere','7700A PrecisionCut',2019,'JD7700A-1987','Diesel','Marcus Webb','2026-02-28',3100,250,'Reel service overdue — schedule ASAP.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-fairway-3','Fairway Mower #3','Fairway Mower','in-service',2890,3050,'Toro','Reelmaster 5410-D',2021,'TRM5410-2178','Diesel','Alex Rivera','2026-04-30',2850,200,'In shop for hydraulic service.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-rough-1','Rough Mower #1','Rough Mower','operational',4120,4200,'Toro','Groundsmaster 4500-D',2019,'TGM4500-1956','Diesel','Diego Solis','2026-04-28',4080,250,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-rough-2','Rough Mower #2','Rough Mower','operational',3560,3700,'Toro','Groundsmaster 4700-D',2020,'TGM4700-2042','Diesel','Diego Solis','2026-04-08',3450,250,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-utility-1','Utility Cart #1','Utility','operational',2340,2400,'Toro','Workman GTX',2021,'TWGTX-2188','Gas','Casey Doyle','2026-04-02',2200,200,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-utility-2','Utility Cart #2','Utility','operational',1890,2050,'Toro','Workman GTX',2022,'TWGTX-2244','Gas','Jordan Park','2026-03-22',1850,200,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-utility-3','Utility Cart #3','Utility','out-of-service',4500,4550,'Toro','Workman MD',2017,'TWMD-1722','Gas',NULL,'2026-01-15',4400,200,'Electrical fault — waiting on controller board.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-utility-4','Utility Cart #4','Utility','operational',3210,3400,'Cushman','Hauler 1200',2019,'CH1200-1989','Gas','Maya Chen','2026-03-10',3050,250,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-spray-1','Spray Rig #1','Spray','operational',1250,1400,'Toro','Multi Pro 5800-G',2022,'TMP5800-2218','Gas','Sam Doyle','2026-04-10',1200,150,'Primary applications rig.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-spray-2','Spray Rig #2','Spray','operational',980,1100,'Toro','Multi Pro 1750',2023,'TMP1750-2305','Electric','Sam Doyle','2026-03-05',900,150,'Secondary / greens-only.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-sandpro-1','Sand Pro #1','Specialty','operational',2150,2300,'Toro','Sand Pro 3040',2020,'TSP3040-2055','Gas','Diego Solis','2026-04-18',2100,150,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-sandpro-2','Sand Pro #2','Specialty','needs-maintenance',1980,2000,'Toro','Sand Pro 3040',2020,'TSP3040-2056','Gas','Diego Solis','2026-02-20',1900,150,'Blade replacement scheduled.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-tractor-1','Tractor #1','Specialty','operational',5670,5800,'Kubota','M5-091',2018,'KM5091-1844','Diesel','Marcus Webb','2026-05-05',5600,200,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "equipment" ("id","name","category","status","hours","next_service_hours","manufacturer","model","year","serial_number","fuel_type","assigned_operator","last_service","last_service_hours","service_interval","notes","created_at","updated_at","course_id") VALUES('eq-tractor-2','Tractor #2','Specialty','operational',3890,4100,'John Deere','4044R',2021,'JD4044R-2167','Diesel','Casey Doyle','2026-04-02',3800,250,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
CREATE TABLE maintenance_logs (
  id                TEXT PRIMARY KEY,
  equipment_id      TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  service_type      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  priority          TEXT NOT NULL DEFAULT 'routine',
  date              TEXT,
  completed_date    TEXT,
  hours_at_service  INTEGER,
  next_due_hours    INTEGER,
  cost              REAL DEFAULT 0,
  technician        TEXT,
  notes             TEXT,
  parts_used        TEXT, -- JSON array, parsed in the Worker
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT);
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-001','eq-greens-1','Reel Service','completed','routine','2026-04-22','2026-04-22',1800,1900,345,'Marcus Webb','Full reel grind and lapping. Bed knife adjusted.','[{"part":"Bed Knife","partNumber":"BN-3150","quantity":1,"unitCost":85.00},{"part":"Reel Blade","partNumber":"RB-3150","quantity":11,"unitCost":23.50}]','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-002','eq-greens-2','Oil Change','completed','routine','2026-05-02','2026-05-02',1650,1750,125,'Marcus Webb','Engine oil + hydraulic filter.','[{"part":"15W-40 Oil","partNumber":"OIL-15W40","quantity":3,"unitCost":18.00},{"part":"Hydraulic Filter","partNumber":"HF-3150","quantity":1,"unitCost":62.50}]','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-003','eq-fairway-1','Reel Service','completed','routine','2026-04-15','2026-04-15',3200,3450,480,'Marcus Webb','All 5 reels backlapped. Front roller bearings inspected.','[{"part":"Bed Knife","partNumber":"BN-7700","quantity":5,"unitCost":78.00}]','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-004','eq-rough-1','Hydraulic Inspection','completed','routine','2026-04-28','2026-04-28',4080,4330,90,'Marcus Webb','Hydraulic pressures verified, no leaks.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-005','eq-spray-1','Tank Calibration','completed','routine','2026-04-10','2026-04-10',1200,1350,0,'Sam Doyle','In-house calibration. Output verified at 1.5 GPA.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-006','eq-tractor-1','Oil Change','completed','routine','2026-05-05','2026-05-05',5600,5800,145,'Marcus Webb',NULL,'[{"part":"15W-40 Oil","partNumber":"OIL-15W40","quantity":4,"unitCost":18.00}]','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-007','eq-fairway-2','Reel Service','overdue','high','2026-04-01',NULL,3375,3625,0,NULL,'Service window passed — unit operating at reduced quality.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-008','eq-utility-3','Electrical Repair','overdue','critical','2026-04-20',NULL,4500,NULL,0,NULL,'Controller board failure. Replacement on order from vendor.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-009','eq-fairway-3','Hydraulic Service','in-progress','high','2026-05-06',NULL,2890,3050,0,'Marcus Webb','Hydraulic pump showed pressure drop. Replacing pump + lines.','[{"part":"Hydraulic Pump","partNumber":"HP-5410","quantity":1,"unitCost":420.00}]','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-010','eq-sandpro-2','Blade Replacement','open','high','2026-05-07',NULL,1980,2150,0,'Diego Solis','Cutting bar replacement needed before next bunker rake cycle.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-011','eq-greens-3','Reel Grind','open','routine','2026-05-04',NULL,2104,2300,0,NULL,'Quality of cut declining. Schedule on slow-spray week.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-012','eq-spray-1','Pump Inspection','open','routine','2026-05-03',NULL,1250,1400,0,NULL,'Routine 150-hr pump check.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-013','eq-utility-1','Tire Rotation','open','routine','2026-05-01',NULL,2340,2400,0,NULL,NULL,NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-014','eq-tractor-2','PM Service','open','routine','2026-04-30',NULL,3890,4100,0,NULL,'250-hr full PM due.',NULL,'2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "maintenance_logs" ("id","equipment_id","service_type","status","priority","date","completed_date","hours_at_service","next_due_hours","cost","technician","notes","parts_used","created_at","course_id") VALUES('ml-015','eq-rough-2','Blade Sharpening','open','routine','2026-04-26',NULL,3560,3700,0,NULL,NULL,NULL,'2026-05-11 20:38:27','crossroads-gc');
CREATE TABLE service_events (
  id                   TEXT PRIMARY KEY,
  equipment_id         TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  projected_due_hours  INTEGER,
  service_type         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'scheduled',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE repairs (
  id             TEXT PRIMARY KEY,
  issue_type     TEXT NOT NULL,
  area           TEXT NOT NULL,
  hole           INTEGER,
  head_number    TEXT,
  description    TEXT,
  priority       TEXT NOT NULL DEFAULT 'medium',
  status         TEXT NOT NULL DEFAULT 'open',
  assigned_to    TEXT,
  labor_hours    REAL DEFAULT 0,
  parts_used     TEXT,   -- JSON array, parsed in the Worker
  date_reported  TEXT,
  completed_at   TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT);
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-001','broken-head','Greens',4,'G-04-3','Sprinkler head sheared at base. No coverage on back-right of green.','high','open',NULL,0,NULL,'2026-05-07',NULL,'Hand-watering required until repair.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-002','leaking-valve','Fairway',12,'FW-12-S','Slow leak at solenoid manifold. Pressure loss noted on adjacent zone.','medium','in-progress','Diego Solis',1.5,'[{"part":"Solenoid","qty":1}]','2026-05-04',NULL,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-003','stuck-valve','Approach',7,'AP-07-W','Valve will not close. Standing water at approach.','high','parts-needed','Diego Solis',0.5,'[{"part":"Hunter ICV-101","qty":1}]','2026-05-03',NULL,'New valve ordered, ETA Friday.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-004','pop-up-failure','Greens',2,'G-02-1','Pop-up not retracting. Mowing hazard.','medium','completed','Diego Solis',1,'[{"part":"Pop-Up Body","qty":1}]','2026-04-28','2026-04-29','Body assembly replaced.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-005','line-break','Rough',9,NULL,'Lateral line break between heads 9-N and 9-S. Trench complete.','high','completed','Marcus Webb',4,'[{"part":"PVC 1in","qty":12},{"part":"PVC Couplers","qty":4}]','2026-04-22','2026-04-23','Repair held overnight. Pressure test passed.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-006','controller-fault','Pump Station',NULL,NULL,'Field controller A-03 not responding. Replaced communication module.','high','completed','Sam Doyle',2.5,'[{"part":"Comm Module","qty":1}]','2026-04-19','2026-04-19',NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-007','clogged-nozzle','Tees',16,'T-16-3','Nozzle clogged with sediment. Quick clean.','low','open',NULL,0,NULL,'2026-05-06',NULL,NULL,'2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
INSERT INTO "repairs" ("id","issue_type","area","hole","head_number","description","priority","status","assigned_to","labor_hours","parts_used","date_reported","completed_at","notes","created_at","updated_at","course_id") VALUES('rep-008','stuck-valve','Fairway',5,'FW-05-N','Valve cycling but not opening fully. Reduced coverage on hole 5.','medium','open',NULL,0,NULL,'2026-05-05',NULL,'Diaphragm may need replacement.','2026-05-11 20:38:27','2026-05-11 20:38:27','crossroads-gc');
CREATE TABLE inventory_items (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,             -- 'product' | 'chemical' | 'fertilizer' | 'part' | 'fuel'
  name            TEXT NOT NULL,
  category        TEXT,                       -- product category, chemical type (Fungicide/PGR/...), part category, fuel type
  unit            TEXT,
  quantity        REAL NOT NULL DEFAULT 0,
  reorder_level   REAL,
  location        TEXT,
  vendor          TEXT,
  cost_per_unit   REAL,
  notes           TEXT,
  -- Chemical-specific
  manufacturer    TEXT,
  epa_number      TEXT,
  expiry_date     TEXT,
  -- Part-specific
  part_number     TEXT,
  equipment       TEXT,                       -- which equipment a part belongs to
  -- Fertilizer-specific
  analysis        TEXT,                       -- N-P-K or similar label
  -- Fuel-specific
  tank_capacity   REAL,
  current_level   REAL,
  last_fill       TEXT,
  -- Cross-module signal payload (Inventory → Sprays uses this for lookup)
  related_usage   TEXT,                       -- JSON array
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT, nitrogen_source TEXT);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-rotor','part','Toro Infinity R55 Rotor','Irrigation','ea',8,10,'Parts Room — Bin 14','Site One',142,'Replacement greens-perimeter rotor.',NULL,NULL,NULL,'89-9425','Toro Infinity (greens)',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-nozzle','part','Toro 570Z Nozzle Set #10','Irrigation','set',2,5,'Parts Room — Bin 14','Site One',18.5,'For tee/approach 570Zs.',NULL,NULL,NULL,'10P-3.0','Toro 570Z',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-teejet','part','TeeJet AI11004 Air Induction','Spray','ea',24,12,'Parts Room — Bin 22','Sprayer Depot',9.4,'Boom replacement nozzles for greens spray.',NULL,NULL,NULL,'AI11004-VS','Spray Rig #1',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-bedknife','part','Bedknife — Greensmaster 3150','Mower','ea',4,6,'Parts Room — Bin 03','Toro',85,'Greens mower bedknife — wears 2/season.',NULL,NULL,NULL,'105-9120','Greens Mower #1/#2/#3',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-reel','part','Reel — 11-Blade DPA','Mower','ea',0,1,'Parts Room — Bin 03','Toro',920,'OUT — long lead time. Reorder via Toro direct.',NULL,NULL,NULL,'130-3700','Greensmaster 3150',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-hose','part','Hydraulic Hose 1/4in x 36in','Hydraulic','ea',12,8,'Parts Room — Bin 18','Parker',24.5,'Generic 1/4 inch ID, JIC ends.',NULL,NULL,NULL,'HH-1436','(generic)',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-filter','part','John Deere Service Filter Kit','Service','kit',1,2,'Parts Room — Bin 06','John Deere',180,'Critical — only 1 on hand before fairway PMs.',NULL,NULL,NULL,'AT195000','Fairway Mower #1/#2',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('part-spraytip','part','TeeJet TT11003 Turbo TwinJet','Spray','ea',8,4,'Parts Room — Bin 22','Sprayer Depot',6.2,'Fairway boom tips.',NULL,NULL,NULL,'TT11003-VP','Spray Rig #1',NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fuel-diesel','fuel','Bulk Diesel Tank','Diesel','gal',320,NULL,'Fuel Yard — Tank 1','Crossroads Fuel',NULL,'Primary mower fleet. Standard #2 ULSD.',NULL,NULL,NULL,NULL,NULL,NULL,500,320,'2026-04-28',NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fuel-gas','fuel','Gasoline Tank','Gas','gal',85,NULL,'Fuel Yard — Tank 2','Crossroads Fuel',NULL,'Utility carts + sand pros. Low — schedule fill.',NULL,NULL,NULL,NULL,NULL,NULL,250,85,'2026-04-15',NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fuel-premix','fuel','Pre-Mix 2-Cycle','Pre-Mix','gal',5,NULL,'Maintenance Bay','In-house mix',NULL,'Trimmers + blowers. Critical — order ratio oil + mix.',NULL,NULL,NULL,NULL,NULL,NULL,30,5,'2026-03-20',NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('prod-paint','product','White Line Paint','Marking','can',18,12,'Maint Storage — Shelf 4','Site One',6.5,'Tee markers + tournament lines.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('prod-sand','product','Bunker Sand — USGA Spec','Bulk','tons',4,2,'Sand Bin — Yard','Pro Sands',65,'Topped up after spring storm wash-outs.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('prod-cups','product','Greens Cups — Standard 4.25in','Course','ea',36,18,'Maint Storage — Shelf 2','Site One',12,'Aluminum cups, rotate weekly.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('prod-flags','product','Pin Flags — Crossroads GC','Course','ea',12,20,'Maint Storage — Shelf 2','In-house',18.5,'Critical — tournament season approaching.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-11 21:36:29','2026-05-11 21:36:29','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-ascernity','chemical','Ascernity','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-chlorothalonil-720','chemical','Chlorothalonil 720','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-daconil-action','chemical','Daconil Action','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-fosetyl-al','chemical','Fosetyl-Al','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-fame-sc','chemical','Fame SC','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-manzate-max','chemical','Manzate Max','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-pendant-sc','chemical','Pendant SC','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-prothioconazole','chemical','Prothioconazole (generic Densicor)','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-segway','chemical','Segway','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-serata','chemical','Serata','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-tebuconazole-36f','chemical','Tebuconazole 3.6F','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-secure-action','chemical','Secure Action','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-contrado','chemical','Contrado','Fungicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-fipronil-0143g','chemical','Fipronil 0.0143G','Insecticide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('chem-nemamectin','chemical','Nemamectin','Nematicide',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-potassium-nitrate','fertilizer','Potassium Nitrate 13.5-0-46','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'13.5-0-46',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc','Potassium Nitrate');
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-calcium-nitrate','fertilizer','Calcium Nitrate 15.5-0-0','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'15.5-0-0',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc','Calcium Nitrate');
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-uan-32','fertilizer','UAN 32-0-0','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'32-0-0',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc','Urea Ammonium Nitrate (UAN)');
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-urea','fertilizer','Urea','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc','Urea');
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-kmag','fertilizer','KMag 0-0-22','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0-0-22',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-18-3-18-greens','fertilizer','18-3-18 Greens Grade','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'18-3-18',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-13-2-13','fertilizer','13-2-13','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'13-2-13',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-5-4-5-greens','fertilizer','5-4-5 Greens Grade','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'5-4-5',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-turf-royale-mini','fertilizer','Turf Royale Mini 28-7-14','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'28-7-14',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-rootnote','fertilizer','Rootnote 3-18-18','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'3-18-18',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-powerchord','fertilizer','PowerChord 0-0-26','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0-0-26',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-kickdrum','fertilizer','KickDrum 0-0-29','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'0-0-29',NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-verdecal-lime','fertilizer','VerdeCal Lime','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-verdecal-gypsum','fertilizer','VerdeCal Gypsum','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-epsom-salt','fertilizer','Epsom Salt','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('fert-redox-k','fertilizer','Redox K+','Fertilizer',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-sea-sugar','fertilizer','Sea Sugar','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-sweet-heat','fertilizer','Sweet Heat','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-double-bass','fertilizer','Double Bass (Kelp)','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-biorhythm','fertilizer','BioRhythm','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-ampliphy-18','fertilizer','Ampliphy 18','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-microtone','fertilizer','Microtone','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-triden-microbes','fertilizer','Triden Microbes','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-mycoreplenish','fertilizer','MycoReplenish','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-ecolite','fertilizer','Ecolite','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('bio-prize-phiter','fertilizer','Prize Phiter','Biostimulant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('surf-hydra-30','chemical','Hydra 30 Plus','Surfactant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('surf-excalibur','chemical','Excalibur','Surfactant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('surf-oars-ps','chemical','Oars PS','Surfactant',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('pig-rain-green','chemical','Rain Green Pigment','Pigment',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('pig-rain','chemical','Rain Pigment','Pigment',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-tm-45','chemical','TM 4.5','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-26-phite','chemical','26 PHite','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-dual-shield','chemical','Dual Shield','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-pedigree','chemical','Pedigree','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-resilia','chemical','Resilia','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-zelto','chemical','Zelto','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-crescendo','chemical','Crescendo','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-appear','chemical','Appear / Appear II','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-root-harmony','chemical','Root Harmony','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-veriphy-18','chemical','Veriphy 18','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
INSERT INTO "inventory_items" ("id","kind","name","category","unit","quantity","reorder_level","location","vendor","cost_per_unit","notes","manufacturer","epa_number","expiry_date","part_number","equipment","analysis","tank_capacity","current_level","last_fill","related_usage","created_at","updated_at","course_id","nitrogen_source") VALUES('verify-highnote','chemical','Highnote','Verification Needed',NULL,0,NULL,NULL,NULL,NULL,'Needs verification before operational use — confirm name, manufacturer, EPA number, analysis, active ingredient.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12 21:56:24','2026-05-12 21:56:24','crossroads-gc',NULL);
CREATE TABLE inventory_usage (
  id              TEXT PRIMARY KEY,
  product_name    TEXT NOT NULL,
  quantity_used   REAL NOT NULL,
  unit            TEXT,
  source_id       TEXT,                       -- e.g. spray record id (used for dedupe)
  date            TEXT,
  area            TEXT,
  applicator      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT, reverted_at TEXT);
INSERT INTO "inventory_usage" ("id","product_name","quantity_used","unit","source_id","date","area","applicator","created_at","course_id","reverted_at") VALUES('use-001a','Heritage G',2.25,'lbs','spray-001','2026-04-28','Greens','Sam Doyle','2026-05-11 21:36:57','crossroads-gc',NULL);
INSERT INTO "inventory_usage" ("id","product_name","quantity_used","unit","source_id","date","area","applicator","created_at","course_id","reverted_at") VALUES('use-001b','Daconil Ultrex',5.6,'lbs','spray-001','2026-04-28','Greens','Sam Doyle','2026-05-11 21:36:57','crossroads-gc',NULL);
INSERT INTO "inventory_usage" ("id","product_name","quantity_used","unit","source_id","date","area","applicator","created_at","course_id","reverted_at") VALUES('use-002a','Primo MAXX',0.1,'gal','spray-002','2026-04-22','Greens','Sam Doyle','2026-05-11 21:36:57','crossroads-gc',NULL);
INSERT INTO "inventory_usage" ("id","product_name","quantity_used","unit","source_id","date","area","applicator","created_at","course_id","reverted_at") VALUES('use-003a','Prodiamine 65 WDG',18.75,'lbs','spray-003','2026-03-15','Fairways','Marcus Webb','2026-05-11 21:36:57','crossroads-gc',NULL);
INSERT INTO "inventory_usage" ("id","product_name","quantity_used","unit","source_id","date","area","applicator","created_at","course_id","reverted_at") VALUES('use-438bfa6b','Primo MAXX',1,'oz','spray-941649f4','2026-05-11','Greens','Smoke Operator','2026-05-11 23:43:42','crossroads-gc','2026-05-11 23:43:42');
CREATE TABLE spray_records (
  id                TEXT PRIMARY KEY,
  application_name  TEXT,
  target            TEXT,                  -- target pest or use ("dollar spot", "weed pre-emergent", ...)
  operator          TEXT,                  -- applicator
  course            TEXT,
  spray_date        TEXT,
  start_time        TEXT,
  end_time          TEXT,
  status            TEXT NOT NULL DEFAULT 'planned',  -- planned | in-progress | pending-review | completed
  -- Conditions at application
  temperature       REAL,
  wind              TEXT,                  -- e.g. "5-8 mph SW"
  humidity          INTEGER,
  soil_temp         REAL,
  -- Application meta
  rei               INTEGER,
  phi               INTEGER,
  carrier_volume    TEXT,
  total_volume      REAL,
  holes             TEXT,                  -- JSON array of hole numbers
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT, deleted_at         TEXT, deleted_by         TEXT, inventory_reverted INTEGER NOT NULL DEFAULT 0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-001','Dollar Spot Preventive','Clarireedia jacksonii — preventive','Sam Doyle','Crossroads GC','2026-04-28','06:30 AM','08:45 AM','completed',68,'4-7 mph SW',72,62,12,0,'1.5 GPA',12,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Tank-mix Heritage G + Daconil Ultrex. Greens-only application.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-002','Spring PGR — Primo MAXX','Vegetative suppression — improve cut quality','Sam Doyle','Crossroads GC','2026-04-22','06:00 AM','07:30 AM','completed',65,'3-5 mph S',68,60,4,0,'1.0 GPA',8,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Standard 14-day PGR cycle. Following GDD model.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-003','Pre-emergent Herbicide','Crabgrass / goosegrass pre-emergent','Marcus Webb','Crossroads GC','2026-03-15','08:00 AM','11:30 AM','completed',52,'6-9 mph NW',55,48,24,0,'0.5 GPA',13,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Soil temp window hit. Single split-app this season.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-004','SDHI Rotation — Velista + Lexicon','Brown patch / dollar spot rotation','Sam Doyle','Crossroads GC','2026-05-06','06:15 AM','08:30 AM','pending-review',72,'5-8 mph SSW',78,65,12,0,'1.5 GPA',12,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Pending agronomist sign-off before next rotation cycle.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-005','Wetting Agent — Greens','LDS prevention + hydration','Sam Doyle','Crossroads GC','2026-05-08','08:00 AM',NULL,'in-progress',75,'4-6 mph W',65,67,0,0,'2.0 GPA',16,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Cycling watering schedule. Application in progress as of 09:30.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-006','Greens Foliar 12-0-12','Maintenance N + K foliar uptake','Sam Doyle','Crossroads GC','2026-05-12','06:00 AM',NULL,'planned',NULL,NULL,NULL,NULL,0,0,'1.5 GPA',NULL,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Mid-month foliar. Pending weather window.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-007','Poa Suppression — Fairway Mix','Poa annua suppression + PGR tank mix','Marcus Webb','Crossroads GC','2026-05-15','07:00 AM',NULL,'planned',NULL,NULL,NULL,NULL,24,0,'0.5 GPA',NULL,'[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]','Window after spring rain pattern stabilizes.','2026-05-11 21:36:57','2026-05-11 21:36:57','crossroads-gc',NULL,NULL,0);
INSERT INTO "spray_records" ("id","application_name","target","operator","course","spray_date","start_time","end_time","status","temperature","wind","humidity","soil_temp","rei","phi","carrier_volume","total_volume","holes","notes","created_at","updated_at","course_id","deleted_at","deleted_by","inventory_reverted") VALUES('spray-941649f4','5.9 commit smoke',NULL,'Smoke Operator','Crossroads GC','2026-05-11',NULL,NULL,'deleted',NULL,NULL,NULL,NULL,4,NULL,NULL,120,NULL,NULL,'2026-05-11 23:43:39','2026-05-11 23:43:42','crossroads-gc','2026-05-11 23:43:42','system',1);
CREATE TABLE spray_products (
  id                  TEXT PRIMARY KEY,
  spray_record_id     TEXT NOT NULL REFERENCES spray_records(id) ON DELETE CASCADE,
  inventory_item_id   TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  product_name        TEXT NOT NULL,
  product_type        TEXT,                -- Fungicide/Herbicide/PGR/Fertilizer
  rate                TEXT,                 -- e.g. "1.5 lbs / 1,000 sq ft"
  unit                TEXT,
  quantity_used       REAL,                 -- populated at completion time
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-001a','spray-001',NULL,'Heritage G','Fungicide','0.4 oz / 1,000 sq ft','lbs',2.25,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-001b','spray-001',NULL,'Daconil Ultrex','Fungicide','1.0 oz / 1,000 sq ft','lbs',5.6,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-002a','spray-002',NULL,'Primo MAXX','PGR','0.125 oz / 1,000 sq ft','gal',0.1,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-003a','spray-003',NULL,'Prodiamine 65 WDG','Herbicide','0.75 lb / acre','lbs',18.75,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-004a','spray-004',NULL,'Velista','Fungicide','0.5 oz / 1,000 sq ft','lbs',2.81,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-004b','spray-004',NULL,'Lexicon Intrinsic','Fungicide','0.5 oz / 1,000 sq ft','lbs',2.81,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-005a','spray-005',NULL,'Wetting Agent — Revolution','Surfactant','4 oz / 1,000 sq ft','gal',2.81,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-006a','spray-006',NULL,'Harrells MAX Liquid 12-0-12','Fertilizer','6 oz / 1,000 sq ft','gal',NULL,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-007a','spray-007',NULL,'Tribute Total','Herbicide','0.2 oz / 1,000 sq ft','gal',NULL,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-007b','spray-007',NULL,'Primo MAXX','PGR','0.06 oz / 1,000 sq ft','gal',NULL,'2026-05-11 21:36:57');
INSERT INTO "spray_products" ("id","spray_record_id","inventory_item_id","product_name","product_type","rate","unit","quantity_used","created_at") VALUES('sprod-4921377b','spray-941649f4',NULL,'Primo MAXX','PGR','1 oz / 1,000 sq ft','oz',1,'2026-05-11 23:43:39');
CREATE TABLE spray_areas (
  id                  TEXT PRIMARY KEY,
  spray_record_id     TEXT NOT NULL REFERENCES spray_records(id) ON DELETE CASCADE,
  area_name           TEXT NOT NULL,
  acreage             REAL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-001a','spray-001','Greens',3.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-002a','spray-002','Greens',3.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-003a','spray-003','Fairways',25,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-003b','spray-003','Approaches',1.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-004a','spray-004','Greens',3.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-005a','spray-005','Greens',3.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-006a','spray-006','Greens',3.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-006b','spray-006','Approaches',1.5,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-007a','spray-007','Fairways',25,'2026-05-11 21:36:57');
INSERT INTO "spray_areas" ("id","spray_record_id","area_name","acreage","created_at") VALUES('sarea-0bd157b4','spray-941649f4','Greens',NULL,'2026-05-11 23:43:39');
CREATE TABLE calendar_events (
  id             TEXT PRIMARY KEY,
  source_type    TEXT,                                -- 'spray' | 'maintenance' | 'irrigation' | 'manual' | ...
  source_id      TEXT,                                -- e.g. 'spray-001', 'ml-009', 'rep-002'
  title          TEXT NOT NULL,
  event_type     TEXT,                                -- 'spray' | 'crew' | 'maintenance' | 'agronomy' | 'irrigation'
  status         TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled | in-progress | completed | cancelled
  start_date     TEXT,
  start_time     TEXT,
  end_date       TEXT,
  end_time       TEXT,
  location       TEXT,
  description    TEXT,                                -- maps to legacy `notes`
  payload_json   TEXT,                                -- JSON: { priority, assignedStaff, equipment, tags, course, ... }
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT);
INSERT INTO "calendar_events" ("id","source_type","source_id","title","event_type","status","start_date","start_time","end_date","end_time","location","description","payload_json","created_at","updated_at","course_id") VALUES('cal-783bbbf9','operations-board','ct-1778596869336','Mow Greens','crew','scheduled','2026-05-09',NULL,NULL,NULL,'','','{"priority":"low","tags":[]}','2026-05-12 14:41:08','2026-05-12 14:41:08','crossroads-gc');
INSERT INTO "calendar_events" ("id","source_type","source_id","title","event_type","status","start_date","start_time","end_date","end_time","location","description","payload_json","created_at","updated_at","course_id") VALUES('cal-c8e0c6b6','operations-board','ct-1778627921585','Mow Greens','crew','scheduled','2026-05-09',NULL,NULL,NULL,'','','{"priority":"low","tags":[]}','2026-05-12 23:18:41','2026-05-12 23:18:41','crossroads-gc');
INSERT INTO "calendar_events" ("id","source_type","source_id","title","event_type","status","start_date","start_time","end_date","end_time","location","description","payload_json","created_at","updated_at","course_id") VALUES('cal-69115b6b','equipment','ml-008','Electrical Repair — Utility Cart #3','maintenance','scheduled','2026-04-20',NULL,NULL,NULL,'Maintenance Shop','Controller board failure. Replacement on order from vendor.','{"priority":"high","assignedStaff":[],"equipment":["Utility Cart #3"],"tags":["Electrical Repair","Utility"]}','2026-05-13 21:12:22','2026-05-13 21:12:22','crossroads-gc');
CREATE TABLE alerts (
  id              TEXT PRIMARY KEY,
  source_type     TEXT,                                -- 'spray' | 'irrigation' | 'inventory' | 'manual' | ...
  source_id       TEXT,                                -- originating record id (spray-001, rep-001, ...)
  module          TEXT,                                -- legacy module tag (spray | irrigation | inventory | disease | ...)
  priority        TEXT NOT NULL DEFAULT 'medium',      -- critical | high | medium | low | info
  status          TEXT NOT NULL DEFAULT 'new',         -- new | acknowledged | resolved
  title           TEXT NOT NULL,
  message         TEXT,
  course          TEXT,
  action_label    TEXT,
  action_target   TEXT,                                -- e.g. '/spray' or '/irrigation'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  dismissed_at    TEXT
, course_id TEXT);
CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO "_migrations" ("name","applied_at") VALUES('0009_alerts.sql','2026-05-11 22:03:00');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0010_assignments_reservations.sql','2026-05-11 22:11:17');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0011_crew.sql','2026-05-11 22:39:37');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0012_crew_seed.sql','2026-05-11 22:39:37');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0013_assignment_employee_id.sql','2026-05-11 22:45:43');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0014_courses.sql','2026-05-11 23:12:10');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0015_course_id_scoping.sql','2026-05-11 23:12:10');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0016_spray_soft_delete.sql','2026-05-11 23:42:46');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0017_course_acreage.sql','2026-05-12 20:43:34');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0018_inventory_nitrogen_source.sql','2026-05-12 21:00:45');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0019_crew_employee_management.sql','2026-05-12 21:18:42');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0020_operations_daily_notes.sql','2026-05-12 21:39:02');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0021_greens_program_inventory_refresh.sql','2026-05-12 21:56:31');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0022_operational_attachments.sql','2026-05-12 22:15:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0023_equipment_assignment_linkage.sql','2026-05-12 22:48:46');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0024_employee_schedules.sql','2026-05-13 20:58:59');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0025_schedule_templates.sql','2026-05-13 21:09:21');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0001_init.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0002_repairs.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0003_seed.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0004_inventory.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0005_inventory_seed.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0006_sprays.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0007_sprays_seed.sql','2026-05-14 22:04:05');
INSERT INTO "_migrations" ("name","applied_at") VALUES('0008_calendar_events.sql','2026-05-14 22:04:05');
CREATE TABLE crew_assignments (
  id                TEXT PRIMARY KEY,
  calendar_event_id TEXT,                                -- FK → calendar_events.id (soft)
  employee_name     TEXT NOT NULL,
  role              TEXT,
  status            TEXT NOT NULL DEFAULT 'assigned',    -- assigned | confirmed | cancelled
  notes             TEXT,
  assigned_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
, employee_id TEXT, course_id TEXT);
INSERT INTO "crew_assignments" ("id","calendar_event_id","employee_name","role","status","notes","assigned_at","created_at","updated_at","employee_id","course_id") VALUES('ca-e54ebc10','cal-c8e0c6b6','Carlos Mendoza','Equipment Tech / Lead','assigned',NULL,'2026-05-12 23:18:45','2026-05-12 23:18:45','2026-05-12 23:18:45','emp-001','crossroads-gc');
CREATE TABLE equipment_reservations (
  id                TEXT PRIMARY KEY,
  calendar_event_id TEXT,                                -- FK → calendar_events.id (soft)
  equipment_id      TEXT,                                -- FK → equipment.id (soft, optional)
  equipment_name    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'reserved',    -- reserved | in-use | released | cancelled
  notes             TEXT,
  reserved_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT, crew_assignment_id TEXT);
INSERT INTO "equipment_reservations" ("id","calendar_event_id","equipment_id","equipment_name","status","notes","reserved_at","created_at","updated_at","course_id","crew_assignment_id") VALUES('er-ce15dc7d','cal-783bbbf9','eq-greens-1','Greens Mower','reserved',NULL,'2026-05-12 14:41:09','2026-05-12 14:41:09','2026-05-12 14:41:09','crossroads-gc',NULL);
INSERT INTO "equipment_reservations" ("id","calendar_event_id","equipment_id","equipment_name","status","notes","reserved_at","created_at","updated_at","course_id","crew_assignment_id") VALUES('er-269e6533','cal-d7866875','eq-greens-1','Greens Mower #1','reserved',NULL,'2026-05-13 20:40:19','2026-05-13 20:40:19','2026-05-13 20:41:44','crossroads-gc',NULL);
INSERT INTO "equipment_reservations" ("id","calendar_event_id","equipment_id","equipment_name","status","notes","reserved_at","created_at","updated_at","course_id","crew_assignment_id") VALUES('er-f5d1d127','cal-69115b6b','eq-utility-3','Utility Cart #3','reserved','Electrical Repair service — 4,500 hrs','2026-05-13 21:12:22','2026-05-13 21:12:22','2026-05-13 21:12:22','crossroads-gc',NULL);
CREATE TABLE crew_employees (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  role                TEXT,
  department          TEXT,
  status              TEXT NOT NULL DEFAULT 'active',  -- active | inactive | on-leave
  phone               TEXT,
  email               TEXT,
  assigned_area       TEXT,                            -- preferred workspace (Greens, Spray, Maintenance...)
  skills_json         TEXT,                            -- JSON array of skill strings
  certifications_json TEXT,                            -- JSON array of certification strings
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
, course_id TEXT, pay_rate          REAL, hire_date         TEXT, pesticide_license TEXT, emergency_contact TEXT);
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-001','Carlos Mendoza','Equipment Tech / Lead','Maintenance','inactive','555-0114','carlos.m@crossroadsgc.example','Maintenance Shop','["Hydraulic systems","Reel grinding","Engine diagnostics"]','["Class A Mechanic","Pesticide Applicator"]','Crew lead for maintenance shop; primary on hydraulic / engine work.','2026-05-11 22:39:58','2026-05-14 22:33:43','crossroads-gc',24.5,'2023-04-12','GA-AP-44821','Maria Mendoza � (555) 010-2233');
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-002','Juan Ramirez','Spray Technician','Agronomy','inactive','555-0142','juan.r@crossroadsgc.example','Spray','["Tank mixing","Calibration","Pre/post-emerge applications"]','["Pesticide Applicator","CPR / First Aid"]','Primary applicator; certified for restricted-use chemicals.','2026-05-11 22:39:58','2026-05-14 22:33:45','crossroads-gc',NULL,NULL,NULL,NULL);
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-003','Miguel Santos','Irrigation Technician','Operations','inactive','555-0167','miguel.s@crossroadsgc.example','Irrigation','["Decoder troubleshooting","Pump station","Wire tracing"]','["Irrigation Auditor (CIA)"]','Decoder and pump station specialist; covers night-cycle on-call.','2026-05-11 22:39:58','2026-05-14 22:33:45','crossroads-gc',NULL,NULL,NULL,NULL);
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-004','Derek Lloyd','Greens Mower Operator / Lead','Operations','inactive','555-0188','derek.l@crossroadsgc.example','Greens','["Greens mowing","Roll patterns","Cup setting"]','["CPR / First Aid"]','Crew lead for AM greens routing; sets cup positions weekly.','2026-05-11 22:39:58','2026-05-14 22:33:44','crossroads-gc',NULL,NULL,NULL,NULL);
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-005','James Thompson','Grounds Crew','Operations','inactive','555-0203','james.t@crossroadsgc.example','Fairways','["Fairway mowing","Bunker raking","Divot repair"]','[]',NULL,'2026-05-11 22:39:58','2026-05-14 22:33:45','crossroads-gc',NULL,NULL,NULL,NULL);
INSERT INTO "crew_employees" ("id","name","role","department","status","phone","email","assigned_area","skills_json","certifications_json","notes","created_at","updated_at","course_id","pay_rate","hire_date","pesticide_license","emergency_contact") VALUES('emp-006','Tom Becker','Grounds Crew','Operations','inactive','555-0224','tom.b@crossroadsgc.example','Tees','["Tee mowing","Hand watering","String trimming"]','[]',NULL,'2026-05-11 22:39:58','2026-05-14 22:33:45','crossroads-gc',NULL,NULL,NULL,NULL);
CREATE TABLE courses (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  short_name  TEXT,
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
, acres_total      REAL, acres_greens     REAL, acres_tees       REAL, acres_fairways   REAL, acres_rough      REAL, acres_sprayable  REAL, acres_practice   REAL, custom_course_areas TEXT, default_spray_units TEXT);
INSERT INTO "courses" ("id","name","short_name","location","status","created_at","updated_at","acres_total","acres_greens","acres_tees","acres_fairways","acres_rough","acres_sprayable","acres_practice","custom_course_areas","default_spray_units") VALUES('crossroads-gc','Crossroads Golf Club','Crossroads GC','Savannah, GA','active','2026-05-11 23:12:06','2026-05-12 20:45:00',180.5,3.1,2.4,28,54,92,2.5,'[{"name":"Nursery","acres":1.5},{"name":"Bunker Sand","acres":0.6},{"name":"Native Areas","acres":12.4},{"name":"Event Lawn","acres":0.8}]','oz_per_acre');
CREATE TABLE operations_daily_notes (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL,
  note_date   TEXT NOT NULL,              -- ISO date 'YYYY-MM-DD'
  title       TEXT,                        -- optional headline
  body        TEXT NOT NULL,               -- briefing copy
  priority    TEXT NOT NULL DEFAULT 'routine',
    -- routine | important | urgent | weather | safety
  pinned      INTEGER NOT NULL DEFAULT 0,  -- 0/1 — pin to top of board
  created_by  TEXT,                        -- free-text author name
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "operations_daily_notes" ("id","course_id","note_date","title","body","priority","pinned","created_by","status","created_at","updated_at") VALUES('note-52d0110a','crossroads-gc','2026-05-12','Frost delay until 7:30','All mowers � hold until 7:30. Greens crew, start with hand-cutting after I clear. Carts on paths only until 9.','weather',1,'Super','active','2026-05-12 21:44:25','2026-05-12 21:44:25');
INSERT INTO "operations_daily_notes" ("id","course_id","note_date","title","body","priority","pinned","created_by","status","created_at","updated_at") VALUES('note-d3de1a3d','crossroads-gc','2026-05-12','Spray rig � be careful around 14','Tribute application went out yesterday � REI active through 8 AM. Keep crew off 14 fairway and approach.','safety',0,NULL,'active','2026-05-12 21:45:16','2026-05-12 21:45:16');
CREATE TABLE operational_attachments (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  parent_type   TEXT NOT NULL,                         -- 'daily_briefing' | 'operations_task' | …
  parent_id     TEXT NOT NULL,
  file_name     TEXT,                                  -- original client-side name
  content_type  TEXT NOT NULL,                         -- 'image/jpeg' | 'image/png' | …
  r2_key        TEXT NOT NULL UNIQUE,                  -- key inside env.PHOTOS bucket
  file_size     INTEGER,                               -- bytes; nullable when client doesn't report
  caption       TEXT,
  uploaded_by   TEXT,                                  -- free-text author name
  status        TEXT NOT NULL DEFAULT 'active',        -- active | deleted (soft)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "operational_attachments" ("id","course_id","parent_type","parent_id","file_name","content_type","r2_key","file_size","caption","uploaded_by","status","created_at") VALUES('attach-77639a8d','crossroads-gc','daily_briefing','note-52d0110a','test.png','image/png','attachments/crossroads-gc/daily_briefing/note-52d0110a/attach-77639a8d.png',78,'Test',NULL,'active','2026-05-12 22:20:31');
CREATE TABLE employee_schedules (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  day_of_week   INTEGER NOT NULL,                  -- 0=Sun … 6=Sat
  start_time    TEXT,                              -- 'HH:MM'
  end_time      TEXT,                              -- 'HH:MM'
  role          TEXT,                              -- optional per-day role override
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | off | vacation | sick
  is_recurring  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE schedule_templates (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'standard',
    -- standard | tournament | weather | spray | cultural_practice | …
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE schedule_template_rows (
  id            TEXT PRIMARY KEY,
  template_id   TEXT NOT NULL,
  employee_id   TEXT NOT NULL,
  day_of_week   INTEGER NOT NULL,                       -- 0=Sun … 6=Sat
  start_time    TEXT,
  end_time      TEXT,
  role          TEXT,                                   -- optional operational tag
  status        TEXT NOT NULL DEFAULT 'scheduled'       -- scheduled | off | vacation | sick
);
CREATE INDEX idx_maintenance_equipment ON maintenance_logs(equipment_id);
CREATE INDEX idx_maintenance_status    ON maintenance_logs(status);
CREATE INDEX idx_service_equipment     ON service_events(equipment_id);
CREATE INDEX idx_repairs_status   ON repairs(status);
CREATE INDEX idx_repairs_priority ON repairs(priority);
CREATE INDEX idx_repairs_area     ON repairs(area);
CREATE INDEX idx_inventory_kind     ON inventory_items(kind);
CREATE INDEX idx_inventory_name     ON inventory_items(name);
CREATE INDEX idx_inventory_quantity ON inventory_items(kind, quantity);
CREATE INDEX idx_usage_source       ON inventory_usage(source_id);
CREATE INDEX idx_spray_status     ON spray_records(status);
CREATE INDEX idx_spray_date       ON spray_records(spray_date);
CREATE INDEX idx_spray_products   ON spray_products(spray_record_id);
CREATE INDEX idx_spray_inv_link   ON spray_products(inventory_item_id);
CREATE INDEX idx_spray_areas      ON spray_areas(spray_record_id);
CREATE INDEX idx_cal_source_type  ON calendar_events(source_type);
CREATE INDEX idx_cal_source_id    ON calendar_events(source_id);
CREATE INDEX idx_cal_event_type   ON calendar_events(event_type);
CREATE INDEX idx_cal_status       ON calendar_events(status);
CREATE INDEX idx_cal_start_date   ON calendar_events(start_date);
CREATE INDEX idx_cal_dedupe       ON calendar_events(source_id, event_type, start_date);
CREATE INDEX idx_alerts_status      ON alerts(status);
CREATE INDEX idx_alerts_priority    ON alerts(priority);
CREATE INDEX idx_alerts_module      ON alerts(module);
CREATE INDEX idx_alerts_source_id   ON alerts(source_id);
CREATE INDEX idx_alerts_created_at  ON alerts(created_at);
CREATE UNIQUE INDEX idx_crew_assignments_event_person
  ON crew_assignments(calendar_event_id, employee_name);
CREATE INDEX idx_crew_assignments_event
  ON crew_assignments(calendar_event_id);
CREATE INDEX idx_crew_assignments_status
  ON crew_assignments(status);
CREATE UNIQUE INDEX idx_equipment_reservations_event_equipment
  ON equipment_reservations(calendar_event_id, equipment_name);
CREATE INDEX idx_equipment_reservations_event
  ON equipment_reservations(calendar_event_id);
CREATE INDEX idx_equipment_reservations_equipment_id
  ON equipment_reservations(equipment_id);
CREATE INDEX idx_equipment_reservations_status
  ON equipment_reservations(status);
CREATE INDEX idx_crew_employees_status     ON crew_employees(status);
CREATE INDEX idx_crew_employees_department ON crew_employees(department);
CREATE INDEX idx_crew_employees_role       ON crew_employees(role);
CREATE INDEX idx_crew_assignments_employee_id
  ON crew_assignments(employee_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_equipment_course_id ON equipment(course_id);
CREATE INDEX idx_maintenance_logs_course_id ON maintenance_logs(course_id);
CREATE INDEX idx_repairs_course_id ON repairs(course_id);
CREATE INDEX idx_inventory_items_course_id ON inventory_items(course_id);
CREATE INDEX idx_inventory_usage_course_id ON inventory_usage(course_id);
CREATE INDEX idx_spray_records_course_id ON spray_records(course_id);
CREATE INDEX idx_calendar_events_course_id ON calendar_events(course_id);
CREATE INDEX idx_alerts_course_id ON alerts(course_id);
CREATE INDEX idx_crew_employees_course_id ON crew_employees(course_id);
CREATE INDEX idx_crew_assignments_course_id ON crew_assignments(course_id);
CREATE INDEX idx_equipment_reservations_course_id ON equipment_reservations(course_id);
CREATE INDEX idx_spray_records_deleted_at ON spray_records(deleted_at);
CREATE INDEX idx_inventory_usage_reverted_at ON inventory_usage(reverted_at);
CREATE INDEX idx_ops_notes_course_date ON operations_daily_notes(course_id, note_date);
CREATE INDEX idx_ops_notes_status      ON operations_daily_notes(status);
CREATE INDEX idx_ops_notes_priority    ON operations_daily_notes(priority);
CREATE INDEX idx_attach_parent ON operational_attachments(parent_type, parent_id);
CREATE INDEX idx_attach_course ON operational_attachments(course_id);
CREATE INDEX idx_attach_status ON operational_attachments(status);
CREATE INDEX idx_eq_res_crew_assignment
  ON equipment_reservations(crew_assignment_id);
CREATE UNIQUE INDEX idx_emp_schedule_uniq
  ON employee_schedules(course_id, employee_id, day_of_week);
CREATE INDEX idx_emp_schedule_emp
  ON employee_schedules(employee_id);
CREATE INDEX idx_emp_schedule_day
  ON employee_schedules(day_of_week);
CREATE INDEX idx_emp_schedule_course
  ON employee_schedules(course_id);
CREATE INDEX idx_sched_tpl_course ON schedule_templates(course_id);
CREATE INDEX idx_sched_tpl_row_template ON schedule_template_rows(template_id);
CREATE INDEX idx_sched_tpl_row_employee ON schedule_template_rows(employee_id);
