-- Phase: Cultural Practices Intelligence Foundation.
--
-- One row per cultural-practice event. A single table with a practice_type
-- discriminator covers all practice types (aerification, topdressing,
-- verticutting, grooming, rolling, spiking, slicing, needle-tine, drill-fill,
-- fraze-mow, brushing, venting, sand, other). Multiple practices per day are
-- valid (no dedup index).
--
-- recovery_status is a STORED, user-set field — never auto-predicted. All
-- fields are operational / crew-relevant (no private superintendent field),
-- so Morning Brief exposure is safe by construction.
--
-- linked_calendar_event_id / linked_task_id are optional manual links (we do
-- NOT auto-create calendar events this phase). Additive only. Course-scoped.

CREATE TABLE IF NOT EXISTS cultural_practices (
  id                        TEXT PRIMARY KEY,
  course_id                 TEXT NOT NULL,
  practice_date             TEXT NOT NULL,          -- YYYY-MM-DD
  practice_type             TEXT NOT NULL,          -- aerification | topdressing | ...
  target_area               TEXT,                    -- free-text surface (e.g. "Greens")
  holes                     TEXT,                    -- free-text holes / location
  status                    TEXT NOT NULL DEFAULT 'planned',   -- planned | completed | skipped
  recovery_status           TEXT,                    -- not-started | in-progress | recovering | recovered | needs-attention
  equipment_used            TEXT,
  material_used             TEXT,
  material_rate             TEXT,
  depth                     TEXT,
  tine_spacing              TEXT,
  sand_amount               TEXT,
  labor_notes               TEXT,
  recovery_notes            TEXT,
  playability_impact        TEXT,
  weather_window_notes      TEXT,
  linked_calendar_event_id  TEXT,
  linked_task_id            TEXT,
  notes                     TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cp_course_date ON cultural_practices(course_id, practice_date DESC);
CREATE INDEX IF NOT EXISTS idx_cp_status      ON cultural_practices(course_id, status);
