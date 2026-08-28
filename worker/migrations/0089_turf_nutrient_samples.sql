CREATE TABLE IF NOT EXISTS turf_nutrient_samples (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('soil', 'tissue')),
  sample_date TEXT NOT NULL,
  location TEXT NOT NULL,
  area_type TEXT,
  lab_name TEXT,
  lab_sample_id TEXT,
  depth_inches REAL,
  results_json TEXT,
  recommendations_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_turf_nutrient_samples_course_date
  ON turf_nutrient_samples(course_id, sample_date DESC);

CREATE INDEX IF NOT EXISTS idx_turf_nutrient_samples_course_type
  ON turf_nutrient_samples(course_id, sample_type);
