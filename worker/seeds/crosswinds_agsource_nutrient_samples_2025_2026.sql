-- AgSource Laboratories reports supplied by Crosswinds Golf Club.
-- Stable ids + INSERT OR IGNORE make this import safe to repeat.

INSERT OR IGNORE INTO turf_nutrient_samples (
  id, course_id, sample_type, sample_date, location, area_type,
  lab_name, lab_sample_id, depth_inches, results_json, recommendations_json, notes
) VALUES (
  'ns-agsource-dm14698', 'crossroads-gc', 'tissue', '2026-06-12',
  'Coursewide Bermudagrass Turf', 'bermudagrass-leaf',
  'AgSource Laboratories', 'DM14698 / 100414', NULL,
  '[{"nutrient":"N","value":3.39,"unit":"%","rating":"adequate"},{"nutrient":"P","value":0.38,"unit":"%","rating":"adequate"},{"nutrient":"K","value":1.32,"unit":"%","rating":"adequate"},{"nutrient":"Mg","value":0.11,"unit":"%","rating":"low"},{"nutrient":"Ca","value":0.32,"unit":"%","rating":"low"},{"nutrient":"S","value":0.31,"unit":"%","rating":"adequate"},{"nutrient":"Zn","value":26.77,"unit":"ppm","rating":"adequate"},{"nutrient":"Mn","value":88.1,"unit":"ppm","rating":"adequate"},{"nutrient":"Cu","value":32.9,"unit":"ppm","rating":"high"},{"nutrient":"Fe","value":374.6,"unit":"ppm","rating":"high"},{"nutrient":"B","value":7.9,"unit":"ppm","rating":"adequate"}]',
  '[]',
  'Plant analysis. Sample marked CRRSWND; crop Bermudagrass Turf; plant part leaf. Received 2026-06-10 and reported 2026-06-12. Aluminum was 107.9 ppm. Nitrate, chloride, and molybdenum were not reported. The report contains no application-rate recommendation.'
);

INSERT OR IGNORE INTO turf_nutrient_samples (
  id, course_id, sample_type, sample_date, location, area_type,
  lab_name, lab_sample_id, depth_inches, results_json, recommendations_json, notes
) VALUES
(
  'ns-agsource-df91601', 'crossroads-gc', 'soil', '2025-09-25', 'Green 8', 'green',
  'AgSource Laboratories', 'DF91601 / 605937', NULL,
  '[{"nutrient":"P","value":64,"unit":"ppm","rating":"high"},{"nutrient":"K","value":52,"unit":"ppm","rating":"low"},{"nutrient":"Ca","value":311,"unit":"ppm","rating":"low"},{"nutrient":"Mg","value":44,"unit":"ppm","rating":"low"},{"nutrient":"Zn","value":5.6,"unit":"ppm","rating":"high"},{"nutrient":"Mn","value":5.7,"unit":"ppm","rating":"adequate"},{"nutrient":"Cu","value":1,"unit":"ppm","rating":"adequate"},{"nutrient":"Fe","value":108.7,"unit":"ppm","rating":"high"},{"nutrient":"B","value":0.1,"unit":"ppm","rating":"low"},{"nutrient":"S","value":5.1,"unit":"ppm","rating":"low"},{"nutrient":"N","value":16.2,"unit":"ppm","rating":"adequate"}]',
  '[{"nutrient":"N","rateLbPer1000":3.5,"note":"AgSource seasonal recommendation"},{"nutrient":"K","rateLbPer1000":4.4,"note":"K2O basis; AgSource seasonal recommendation"},{"nutrient":"Mg","rateLbPer1000":0.5,"note":"AgSource seasonal recommendation"}]',
  'Received 2025-09-22 and reported 2025-09-25. N result is nitrate, not total N. Soil pH 5.6; sodium 7.0 ppm; soluble salts 0.2 mmhos/cm; organic matter 1.4%; CEC 3.0 meq/100g. Base saturation: H 30.8%, Na 1.0%, K 4.4%, Ca 51.7%, Mg 12.1%. P2O5 recommendation 0.0 lb/1,000 sq ft. Amendment: 1.8 lb/1,000 sq ft calcitic limestone. Per-acre recommendation: S 0.3 lb; Zn, Mn, Cu, Fe, and B 0.0 lb.'
),
(
  'ns-agsource-df91602', 'crossroads-gc', 'soil', '2025-09-25', 'Green 3', 'green',
  'AgSource Laboratories', 'DF91602 / 605937', NULL,
  '[{"nutrient":"P","value":57,"unit":"ppm","rating":"high"},{"nutrient":"K","value":37,"unit":"ppm","rating":"low"},{"nutrient":"Ca","value":315,"unit":"ppm","rating":"low"},{"nutrient":"Mg","value":63,"unit":"ppm","rating":"low"},{"nutrient":"Zn","value":3.3,"unit":"ppm","rating":"high"},{"nutrient":"Mn","value":3,"unit":"ppm","rating":"low"},{"nutrient":"Cu","value":0.7,"unit":"ppm","rating":"adequate"},{"nutrient":"Fe","value":93.6,"unit":"ppm","rating":"high"},{"nutrient":"B","value":0.1,"unit":"ppm","rating":"low"},{"nutrient":"S","value":5.2,"unit":"ppm","rating":"low"},{"nutrient":"N","value":11.8,"unit":"ppm","rating":"adequate"}]',
  '[{"nutrient":"N","rateLbPer1000":3.7,"note":"AgSource seasonal recommendation"},{"nutrient":"K","rateLbPer1000":4.6,"note":"K2O basis; AgSource seasonal recommendation"},{"nutrient":"Mg","rateLbPer1000":0.3,"note":"AgSource seasonal recommendation"}]',
  'Received 2025-09-22 and reported 2025-09-25. N result is nitrate, not total N. Soil pH 5.9; sodium 7.0 ppm; soluble salts 0.1 mmhos/cm; organic matter 1.6%; CEC 2.9 meq/100g. Base saturation: H 24.4%, Na 1.1%, K 3.2%, Ca 53.6%, Mg 17.7%. P2O5 recommendation 0.0 lb/1,000 sq ft. Amendment: 1.3 lb/1,000 sq ft calcitic limestone. Per-acre recommendations: Mn 0.1 lb and S 0.3 lb; Zn, Cu, Fe, and B 0.0 lb.'
),
(
  'ns-agsource-df91603', 'crossroads-gc', 'soil', '2025-09-25', 'Green 15', 'green',
  'AgSource Laboratories', 'DF91603 / 605937', NULL,
  '[{"nutrient":"P","value":63,"unit":"ppm","rating":"high"},{"nutrient":"K","value":63,"unit":"ppm","rating":"low"},{"nutrient":"Ca","value":473,"unit":"ppm","rating":"high"},{"nutrient":"Mg","value":37,"unit":"ppm","rating":"low"},{"nutrient":"Zn","value":2.8,"unit":"ppm","rating":"adequate"},{"nutrient":"Mn","value":7.1,"unit":"ppm","rating":"adequate"},{"nutrient":"Cu","value":1.1,"unit":"ppm","rating":"adequate"},{"nutrient":"Fe","value":57.4,"unit":"ppm","rating":"high"},{"nutrient":"B","value":0.1,"unit":"ppm","rating":"low"},{"nutrient":"S","value":4.3,"unit":"ppm","rating":"low"},{"nutrient":"N","value":14.3,"unit":"ppm","rating":"adequate"}]',
  '[{"nutrient":"N","rateLbPer1000":3.7,"note":"AgSource seasonal recommendation"},{"nutrient":"K","rateLbPer1000":4.3,"note":"K2O basis; AgSource seasonal recommendation"},{"nutrient":"Mg","rateLbPer1000":0.5,"note":"AgSource seasonal recommendation"}]',
  'Received 2025-09-22 and reported 2025-09-25. N result is nitrate, not total N. Soil pH 6.1; sodium 8.0 ppm; soluble salts 0.1 mmhos/cm; organic matter 0.9%; CEC 3.2 meq/100g. Base saturation: H 10.8%, Na 1.0%, K 5.0%, Ca 73.6%, Mg 9.5%. P2O5 recommendation 0.0 lb/1,000 sq ft. No limestone or gypsum recommended. Per-acre recommendation: S 0.3 lb; Zn, Mn, Cu, Fe, and B 0.0 lb.'
),
(
  'ns-agsource-df91604', 'crossroads-gc', 'soil', '2025-09-25', 'Practice Green', 'practice-green',
  'AgSource Laboratories', 'DF91604 / 605937', NULL,
  '[{"nutrient":"P","value":41,"unit":"ppm","rating":"adequate"},{"nutrient":"K","value":50,"unit":"ppm","rating":"low"},{"nutrient":"Ca","value":325,"unit":"ppm","rating":"low"},{"nutrient":"Mg","value":63,"unit":"ppm","rating":"low"},{"nutrient":"Zn","value":5.5,"unit":"ppm","rating":"high"},{"nutrient":"Mn","value":3.4,"unit":"ppm","rating":"low"},{"nutrient":"Cu","value":0.8,"unit":"ppm","rating":"adequate"},{"nutrient":"Fe","value":77.9,"unit":"ppm","rating":"high"},{"nutrient":"B","value":0.1,"unit":"ppm","rating":"low"},{"nutrient":"S","value":5.7,"unit":"ppm","rating":"low"},{"nutrient":"N","value":10.4,"unit":"ppm","rating":"adequate"}]',
  '[{"nutrient":"N","rateLbPer1000":3.7,"note":"AgSource seasonal recommendation"},{"nutrient":"K","rateLbPer1000":4.4,"note":"K2O basis; AgSource seasonal recommendation"},{"nutrient":"Mg","rateLbPer1000":0.3,"note":"AgSource seasonal recommendation"}]',
  'Received 2025-09-22 and reported 2025-09-25. N result is nitrate, not total N. Soil pH 5.8; sodium 7.0 ppm; soluble salts 0.1 mmhos/cm; organic matter 1.6%; CEC 3.2 meq/100g. Base saturation: H 27.5%, Na 0.9%, K 4.0%, Ca 51.0%, Mg 16.5%. P2O5 recommendation 0.0 lb/1,000 sq ft. Amendments: 1.7 lb/1,000 sq ft calcitic limestone and 2.5 lb/1,000 sq ft gypsum. Per-acre recommendations: Mn 0.1 lb and S 0.3 lb; Zn, Cu, Fe, and B 0.0 lb.'
),
(
  'ns-agsource-df91605', 'crossroads-gc', 'soil', '2025-09-25', 'Green 11', 'green',
  'AgSource Laboratories', 'DF91605 / 605937', NULL,
  '[{"nutrient":"P","value":61,"unit":"ppm","rating":"high"},{"nutrient":"K","value":38,"unit":"ppm","rating":"low"},{"nutrient":"Ca","value":354,"unit":"ppm","rating":"low"},{"nutrient":"Mg","value":44,"unit":"ppm","rating":"low"},{"nutrient":"Zn","value":7.2,"unit":"ppm","rating":"high"},{"nutrient":"Mn","value":6.7,"unit":"ppm","rating":"adequate"},{"nutrient":"Cu","value":1.3,"unit":"ppm","rating":"adequate"},{"nutrient":"Fe","value":93.4,"unit":"ppm","rating":"high"},{"nutrient":"B","value":0.1,"unit":"ppm","rating":"low"},{"nutrient":"S","value":5.1,"unit":"ppm","rating":"low"},{"nutrient":"N","value":14.8,"unit":"ppm","rating":"adequate"}]',
  '[{"nutrient":"N","rateLbPer1000":3.6,"note":"AgSource seasonal recommendation"},{"nutrient":"K","rateLbPer1000":4.5,"note":"K2O basis; AgSource seasonal recommendation"},{"nutrient":"Mg","rateLbPer1000":0.5,"note":"AgSource seasonal recommendation"}]',
  'Received 2025-09-22 and reported 2025-09-25. N result is nitrate, not total N. Soil pH 5.6; sodium 6.0 ppm; soluble salts 0.1 mmhos/cm; organic matter 1.3%; CEC 3.1 meq/100g. Base saturation: H 28.0%, Na 0.8%, K 3.1%, Ca 56.4%, Mg 11.7%. P2O5 recommendation 0.0 lb/1,000 sq ft. Amendment: 1.7 lb/1,000 sq ft calcitic limestone. Per-acre recommendation: S 0.3 lb; Zn, Mn, Cu, Fe, and B 0.0 lb. Separate salinity analysis: ammonium N 7.5 ppm, bicarbonate 21.97 ppm, B 0.02 ppm, Ca 1.54 meq/L, chloride 9.4 ppm, Cu 0.03 ppm, ECE 0.43 mmhos/cm, Fe 0.4 ppm, Mg 0.84 meq/L, Mn 0.16 ppm, moisture 62.23%, nitrate N 57.7 ppm, PO4 7.62 ppm, K 0.74 meq/L, SAR 0.12, silicon 2.3 ppm, SO4 20.2 ppm, sodium 0.1 meq/L, Zn 0.07 ppm.'
);
