ALTER TABLE turf_nutrient_samples ADD COLUMN previous_sample_id TEXT;
ALTER TABLE turf_nutrient_samples ADD COLUMN next_sample_date TEXT;

CREATE INDEX IF NOT EXISTS idx_turf_nutrient_samples_previous
  ON turf_nutrient_samples(previous_sample_id);

CREATE INDEX IF NOT EXISTS idx_turf_nutrient_samples_next_date
  ON turf_nutrient_samples(course_id, next_sample_date);
