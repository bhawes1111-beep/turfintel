-- Phase: Disease Intelligence Foundation.
--
-- Field disease observations — what's present/suspected, where, when, the
-- conditions, treatment, and whether it's improving. One row per observation.
--
-- Environmental "disease pressure awareness" is computed live from weather
-- (explainable, NOT prediction) — it is NOT stored here. Treatment links to
-- a fungicide spray via linked_spray_id keep the source clear. Photos may
-- attach later via the attachments table (photo_attachment_id).
--
-- All fields are operational / crew-relevant (no private superintendent
-- field), so Morning Brief exposure is safe by construction (with neutral
-- wording). Additive only. Course-scoped.

CREATE TABLE IF NOT EXISTS disease_observations (
  id                   TEXT PRIMARY KEY,
  course_id            TEXT NOT NULL,
  observed_at          TEXT NOT NULL,          -- ISO timestamp
  disease_name         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'suspected',  -- suspected | confirmed | treated | monitoring | resolved
  severity             TEXT,                    -- low | moderate | high
  location             TEXT,                    -- free-text surface
  hole                 INTEGER,                 -- optional hole number
  affected_area        TEXT,
  symptoms             TEXT,
  turf_species         TEXT,
  treatment_notes      TEXT,
  linked_spray_id      TEXT,                    -- fungicide spray link (source clarity)
  photo_attachment_id  TEXT,                    -- optional (UI later)
  follow_up_date       TEXT,                    -- YYYY-MM-DD
  recovery_notes       TEXT,
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disease_course_time ON disease_observations(course_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_disease_status      ON disease_observations(course_id, status);
