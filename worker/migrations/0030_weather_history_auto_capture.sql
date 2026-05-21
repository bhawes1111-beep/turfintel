-- Phase: Automatic Weather History capture.
--
-- Builds on 0026_weather_observations. Additive only.
--
--   1. Two new optional sensor columns (solar radiation + UV) so trend
--      queries can read them directly instead of digging into raw_json.
--      Older rows simply have NULLs.
--   2. A partial UNIQUE index on (course_id, observed_at) so the same
--      station reading can never be stored twice — the scheduled capture
--      uses INSERT OR IGNORE against it. Partial (observed_at NOT NULL)
--      because legacy/manual rows may lack an observed_at.

ALTER TABLE weather_observations ADD COLUMN solar_radiation REAL;
ALTER TABLE weather_observations ADD COLUMN uv REAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_obs_dedupe
  ON weather_observations(course_id, observed_at)
  WHERE observed_at IS NOT NULL;
