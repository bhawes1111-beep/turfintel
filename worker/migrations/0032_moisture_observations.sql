-- Phase: Moisture + Handwatering Intelligence Foundation.
--
-- Field moisture observations — the on-the-ground half of irrigation
-- intelligence. Crew/superintendent log conditions while walking greens;
-- these combine with the weather/water-balance layer to surface handwater
-- priorities and drying trends.
--
-- Location is free-text (e.g. "Green 7") + an optional hole number, mirroring
-- the existing spray-area pattern — no new course-config dependency.
-- moisture_pct is optional (not every crew has a meter). The handwater /
-- syringe / wilt / dry-spot flags are the OBSERVER's field call, captured as
-- facts; weather-derived syringe awareness is computed separately in the UI.
--
-- Multiple observations per location/day are valid (that's the historical
-- record), so there is intentionally no dedup unique index.
--
-- Additive only. Course-scoped. Photos may attach later via the existing
-- attachments table keyed to the observation id (parent_type added then).

CREATE TABLE IF NOT EXISTS moisture_observations (
  id             TEXT PRIMARY KEY,
  course_id      TEXT NOT NULL,
  observed_at    TEXT NOT NULL,                 -- ISO timestamp
  observed_by    TEXT,                          -- free-text observer (optional)
  location       TEXT NOT NULL,                 -- e.g. "Green 7" (free-text)
  hole           INTEGER,                       -- optional hole number
  moisture_pct   REAL,                          -- VWC % if measured (optional)
  surface_note   TEXT,                          -- short condition note
  wilt_stress    INTEGER NOT NULL DEFAULT 0,    -- 0/1 observer flag
  dry_spot       INTEGER NOT NULL DEFAULT 0,    -- 0/1 localized dry spot
  handwater_rec  INTEGER NOT NULL DEFAULT 0,    -- 0/1 handwater recommended (observer)
  syringe_rec    INTEGER NOT NULL DEFAULT 0,    -- 0/1 syringe recommended (observer)
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_moisture_course_time ON moisture_observations(course_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_moisture_location    ON moisture_observations(course_id, location);
