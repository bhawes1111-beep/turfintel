-- Phase: Course Condition Log + Daily Notes Integration.
--
-- The superintendent's structured daily field log — distinct from the
-- crew-visible operations_daily_notes briefing. One PRIMARY log per course
-- per date (UNIQUE index → upsert): re-saving the same date updates in place
-- ("save draft / update same daily record"). Section conditions are short
-- text ratings (excellent | good | fair | poor | critical). private_notes is
-- superintendent-only and must never surface on crew/display surfaces.
--
-- Auto-linked context (weather / water-balance / moisture / sprays / repairs)
-- is DISPLAYED live from its own tables — not duplicated here.
--
-- Additive only. Course-scoped.

CREATE TABLE IF NOT EXISTS course_condition_logs (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL,
  log_date            TEXT NOT NULL,        -- YYYY-MM-DD
  author              TEXT,                 -- free-text observer/author
  overall_rating      TEXT,                 -- excellent | good | fair | poor | critical
  greens_condition    TEXT,
  tees_condition      TEXT,
  fairways_condition  TEXT,
  bunkers_condition   TEXT,
  rough_condition     TEXT,
  moisture_summary    TEXT,
  disease_pest        TEXT,
  irrigation_concerns TEXT,
  playability_notes   TEXT,
  followup_notes      TEXT,                 -- crew/assistant follow-up
  private_notes       TEXT,                 -- superintendent-only
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccl_course_date ON course_condition_logs(course_id, log_date);
CREATE INDEX IF NOT EXISTS idx_ccl_course             ON course_condition_logs(course_id, log_date DESC);
