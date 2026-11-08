CREATE TABLE IF NOT EXISTS course_moisture_scale (
 course_id TEXT PRIMARY KEY,
 scale_json TEXT NOT NULL,
 revision INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
