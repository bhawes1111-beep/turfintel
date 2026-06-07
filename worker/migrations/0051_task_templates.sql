-- Phase 9C.11 — Task Templates (reusable task library).
--
-- Backs the Daily Assignment Board task dropdown. Before this phase the
-- DAB had two task sources: (1) per-day calendar_events authored via the
-- old TasksManagerModal — meaning every "Mow Greens" on a new date was a
-- fresh row; and (2) a hardcoded CROSSWINDS_TASK_LIST JS constant.
-- Neither was editable by a supervisor at runtime.
--
-- task_templates is the persistent, reusable library. Supervisors add /
-- rename / archive templates; the DAB dropdown reads active rows from
-- this table; selecting a template still goes through the existing
-- pickOrCreateEventForTask path (finds-or-creates a calendar_event for
-- selectedDate keyed off a deterministic sourceId so duplicates collapse
-- server-side).
--
-- Course-scoped (Phase 5.7 contract). Additive only.

CREATE TABLE IF NOT EXISTS task_templates (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL,
  name                TEXT NOT NULL,
  category            TEXT,                  -- crew | spray | maintenance | agronomy | irrigation | NULL
  default_start_time  TEXT,                  -- 'HH:MM' or NULL
  default_location    TEXT,
  default_notes       TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active',   -- active | archived
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Course + active templates are the hot read path (DAB dropdown).
CREATE INDEX IF NOT EXISTS idx_task_templates_course_status
  ON task_templates(course_id, status);

-- Uniqueness on (course_id, name) prevents "Mow Greens" being added
-- twice by accident. Archiving a template does NOT free the name —
-- supervisors should reactivate the archived one instead of recreating
-- (preserves history for assignments that linked to it).
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_templates_course_name
  ON task_templates(course_id, name);

-- ── Seed: migrate the existing hardcoded CROSSWINDS_TASK_LIST ───────────
-- The 14 names below match the JS constant the DAB used pre-9C.11. After
-- this seed the supervisor can rename / archive / extend the list from
-- the Tasks tab UI. Idempotent: ON CONFLICT does nothing if a row with
-- the same (course_id, name) already exists, so re-running this
-- migration is safe.
INSERT INTO task_templates (id, course_id, name, category, sort_order, status)
VALUES
  ('tt-crossroads-mow-greens',     'crossroads-gc', 'Mow Greens',    'crew',  10, 'active'),
  ('tt-crossroads-roll-greens',    'crossroads-gc', 'Roll Greens',   'crew',  20, 'active'),
  ('tt-crossroads-course-setup',   'crossroads-gc', 'Course Setup',  'crew',  30, 'active'),
  ('tt-crossroads-bunkers',        'crossroads-gc', 'Bunkers',       'crew',  40, 'active'),
  ('tt-crossroads-spray',          'crossroads-gc', 'Spray',         'spray', 50, 'active'),
  ('tt-crossroads-hand-water',     'crossroads-gc', 'Hand Water',    'crew',  60, 'active'),
  ('tt-crossroads-irrigation',     'crossroads-gc', 'Irrigation',    'irrigation', 70, 'active'),
  ('tt-crossroads-detail-work',    'crossroads-gc', 'Detail Work',   'crew',  80, 'active'),
  ('tt-crossroads-mow-tees',       'crossroads-gc', 'Mow Tees',      'crew',  90, 'active'),
  ('tt-crossroads-mow-fairways',   'crossroads-gc', 'Mow Fairways',  'crew', 100, 'active'),
  ('tt-crossroads-mow-rough',      'crossroads-gc', 'Mow Rough',     'crew', 110, 'active'),
  ('tt-crossroads-cups',           'crossroads-gc', 'Cups',          'crew', 120, 'active'),
  ('tt-crossroads-cleanup',        'crossroads-gc', 'Cleanup',       'crew', 130, 'active'),
  ('tt-crossroads-project-work',   'crossroads-gc', 'Project Work',  'crew', 140, 'active')
ON CONFLICT(course_id, name) DO NOTHING;
