ALTER TABLE field_area_drafts ADD COLUMN gps_source TEXT NOT NULL DEFAULT 'tdr';
ALTER TABLE field_area_drafts ADD COLUMN accuracy_json TEXT;
