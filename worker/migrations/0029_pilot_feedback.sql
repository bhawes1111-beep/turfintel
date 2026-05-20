-- Phase 31 — Crosswinds Live Pilot Feedback Loop.
--
-- Lightweight operational feedback capture for the live pilot. The
-- superintendent jots quick friction notes while using the app; a simple
-- review surface in Settings triages them. This is intentionally NOT a
-- ticketing system — no assignees, no threads, no SLAs.
--
-- Course-scoped (Phase 5.7 contract). Additive only.

CREATE TABLE IF NOT EXISTS pilot_feedback (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'workflow',
    -- bug | workflow | confusing | mobile | display-board |
    -- assignment | spray | irrigation | weather | equipment
  note        TEXT NOT NULL,                 -- the feedback copy
  context     TEXT,                          -- optional page / route hint
  status      TEXT NOT NULL DEFAULT 'new',   -- new | reviewed | fixed | ignored
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pilot_feedback_course   ON pilot_feedback(course_id, datetime(created_at));
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_status   ON pilot_feedback(status);
CREATE INDEX IF NOT EXISTS idx_pilot_feedback_category ON pilot_feedback(category);
