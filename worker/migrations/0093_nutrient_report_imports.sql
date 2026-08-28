ALTER TABLE turf_nutrient_samples ADD COLUMN source_attachment_id TEXT;

CREATE TABLE IF NOT EXISTS turf_nutrient_report_imports (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('soil', 'tissue')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  file_name TEXT,
  pdf_attachment_id TEXT NOT NULL,
  raw_text TEXT,
  draft_json TEXT NOT NULL DEFAULT '{}',
  extraction_note TEXT,
  approved_sample_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_nutrient_report_imports_course_status
  ON turf_nutrient_report_imports(course_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrient_report_imports_sample
  ON turf_nutrient_report_imports(approved_sample_id);
