ALTER TABLE spray_records ADD COLUMN nutrient_sample_id TEXT;

CREATE INDEX IF NOT EXISTS idx_spray_records_nutrient_sample
  ON spray_records(nutrient_sample_id, spray_date DESC);
