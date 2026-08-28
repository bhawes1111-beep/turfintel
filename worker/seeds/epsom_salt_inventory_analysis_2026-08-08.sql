UPDATE inventory_items
SET
  analysis = '0-0-0; Magnesium (Mg) 9.8% minimum, all water soluble; Sulfur (S) 12.9% minimum',
  nutrient_sources = '[{"id":"nutrient-epsom-mg","nutrient":"Mg","form":"magnesium_sulfate_mg","percent":"9.8","release":"quick"},{"id":"nutrient-epsom-s","nutrient":"S","form":"magnesium_sulfate_s","percent":"12.9","release":"quick"}]',
  product_catalog_id = 'pc-epsom-salt',
  notes = 'Guaranteed analysis: Mg 9.8% minimum (9.8% water soluble magnesium); S 12.9% minimum. Saturated solution: 5.5% Mg at 70 F and 4.7% Mg at 60 F. At 70 F per gallon of water: 8.5 lb product for 5% Mg, 5.7 lb for 4% Mg, 3.6 lb for 3% Mg, or 2.1 lb for 2% Mg. Other tank inputs reduce solubility. Sulfur concentration in solution is approximately 1.3 times magnesium concentration.',
  updated_at = datetime('now')
WHERE id = 'inv-3521ccd1'
  AND course_id = 'crossroads-gc';
