-- Phase 18 — Weather observation history.
--
-- Persists point-in-time weather snapshots so TurfIntel keeps an
-- operational weather record, not just a live display card. Rows are
-- written by the manual "Capture Current Weather" button (and, in a
-- future phase, a Cloudflare Cron trigger).
--
-- The frontend already holds the fully-normalized `current` object
-- from useWeather — it POSTs that snapshot and the worker just stores
-- it. raw_json keeps the entire normalized object so future fields
-- survive without a schema change.
--
-- Additive only. Course-scoped (Phase 5.7 contract).

CREATE TABLE IF NOT EXISTS weather_observations (
  id                TEXT PRIMARY KEY,
  course_id         TEXT NOT NULL,
  source            TEXT,                       -- 'ambient' | 'nws' | 'metar'
  observed_at       TEXT,                       -- ISO timestamp from the provider
  temp_f            REAL,
  feels_like_f      REAL,
  humidity          REAL,
  dew_point_f       REAL,
  wind_mph          REAL,
  wind_gust_mph     REAL,
  wind_dir          TEXT,
  rainfall_today_in REAL,
  hourly_rain_in    REAL,
  pressure_in       REAL,
  et_in             REAL,
  disease_pressure  TEXT,
  spray_window      TEXT,
  frost_risk        INTEGER NOT NULL DEFAULT 0, -- 0/1, derived from temp_f
  raw_json          TEXT,                       -- full normalized `current` object
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weather_obs_course   ON weather_observations(course_id);
CREATE INDEX IF NOT EXISTS idx_weather_obs_observed ON weather_observations(course_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_weather_obs_created  ON weather_observations(course_id, created_at);
