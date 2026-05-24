-- Phase 7B.1: Turf Health Observation Foundation.
--
-- Field observations of shade, airflow, weak turf, and chronic stress.
-- Distinct from disease (which is pathogen-specific) and moisture (which is
-- a point-in-time measurement) — Turf Health captures the long-running
-- conditions that explain WHY a location keeps having problems.
--
-- Schema mirrors disease_observations (0036) and moisture_observations
-- (0032) deliberately: same id/course/observed_at/observer triad, same
-- location vocabulary, same JSON-blob tags pattern, same capture-time
-- provenance columns (clientId / GPS) that 7A.1 added to moisture.
-- Replicating these shapes pays off — every existing pattern (optimistic
-- inserts, retry, photo attach, reports builder) reuses without
-- accommodation.
--
-- Additive only. Course-scoped. No FK to courses (other verticals don't
-- enforce one either; course_id is enforced at the application layer via
-- buildCourseFilter / resolveCourseId in worker/lib/scope.js).
--
-- Photos attach via the existing operational_attachments table; the
-- parent_type whitelist gets 'turf_health_observation' in the worker
-- in this same commit so the upload contract is stable from day one.

CREATE TABLE IF NOT EXISTS turf_health_observations (
  id                 TEXT PRIMARY KEY,
  course_id          TEXT NOT NULL,

  observed_at        TEXT NOT NULL,                  -- ISO timestamp
  observed_by        TEXT,                           -- free-text observer (optional)

  -- Location — same shape as moisture / disease (free-text + optional hole).
  location           TEXT NOT NULL,
  hole               INTEGER,
  area_type          TEXT,                           -- 'green' | 'tee' | 'fairway' | 'approach' | 'rough' | 'other'

  -- The taxonomy the observer recorded. UI presents these as preset pills:
  --   morning-shade | afternoon-shade | all-day-shade | poor-airflow |
  --   wet-pocket    | weak-bermuda   | slow-recovery | algae-moss   |
  --   chronic-wilt  | localized-dry-spot | traffic-stress | scalping-thin
  -- Worker validates against an ALLOWED set; new types ship by editing
  -- that set + the client preset list (no migration).
  health_type        TEXT NOT NULL,

  severity           TEXT,                           -- 'low' | 'moderate' | 'high' (Worker-validated)

  -- Free-text observer notes.
  surface_note       TEXT,
  notes              TEXT,

  -- Tags as a JSON array TEXT — same v1 shape moisture/disease left room for.
  -- Promotes to a join table only if/when tag analytics becomes a thing.
  tags_json          TEXT,

  -- Lifecycle: active = newly noted; monitoring = aware, watching; resolved.
  status             TEXT NOT NULL DEFAULT 'active',
  follow_up_date     TEXT,                           -- optional ISO date

  -- Phase 7A.1 capture-time provenance (offline-sync + GPS-ready from day one).
  client_id          TEXT,
  client_observed_at TEXT,
  lat                REAL,
  lng                REAL,
  gps_accuracy       REAL,

  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_turf_health_course_time
  ON turf_health_observations(course_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_turf_health_location
  ON turf_health_observations(course_id, location);
CREATE INDEX IF NOT EXISTS idx_turf_health_status
  ON turf_health_observations(course_id, status);

-- Partial unique so client-id retries dedupe at the DB level while legacy
-- (no clientId) rows stay unconstrained. Same shape as
-- idx_moisture_client_id from migration 0040.
CREATE UNIQUE INDEX IF NOT EXISTS idx_turf_health_client_id
  ON turf_health_observations(client_id)
  WHERE client_id IS NOT NULL;
