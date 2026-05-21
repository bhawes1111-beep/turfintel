-- Phase: Irrigation Intelligence Foundation.
--
-- Daily water-balance rollup: one row per course per day summarizing ET,
-- rainfall, and net (rainfall - ET). Built ON TOP of weather_observations
-- (which stays the raw 30-min snapshot table). Rolling 3/7/14-day deficits
-- are summed from these daily rows at read time.
--
-- ET provenance is explicit: et_source records whether the day's ET came
-- from the Georgia Weather Network reference value or a fallback estimate
-- derived from observations — so the UI never implies fake precision.
--
-- Additive only. Course-scoped. UNIQUE(course_id, date) makes the rollup
-- idempotent: re-running a day UPDATEs in place, never duplicates.

CREATE TABLE IF NOT EXISTS daily_water_balance (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL,
  date         TEXT NOT NULL,                 -- YYYY-MM-DD
  et_in        REAL,                          -- daily ET (inches)
  et_source    TEXT,                          -- 'georgia_weather_network' | 'estimated'
  rainfall_in  REAL,                          -- daily rainfall (inches)
  net_in       REAL,                          -- rainfall_in - et_in (+ surplus / - deficit)
  obs_count    INTEGER NOT NULL DEFAULT 0,    -- snapshots the day was rolled from
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dwb_course_date ON daily_water_balance(course_id, date);
CREATE INDEX IF NOT EXISTS idx_dwb_course             ON daily_water_balance(course_id, date DESC);
