-- Phase 6 — Operations Daily Notes (superintendent → crew briefing).
--
-- Persistent operational communication layer. Notes are crew-visible
-- by design — the Display Board consumes them as its primary Notices
-- source. This is NOT a chat / comments / disciplinary record system;
-- the UI explicitly labels notes as crew-visible briefing.
--
-- Course-scoped (Phase 5.7 contract). Additive only.

CREATE TABLE IF NOT EXISTS operations_daily_notes (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL,
  note_date   TEXT NOT NULL,              -- ISO date 'YYYY-MM-DD'
  title       TEXT,                        -- optional headline
  body        TEXT NOT NULL,               -- briefing copy
  priority    TEXT NOT NULL DEFAULT 'routine',
    -- routine | important | urgent | weather | safety
  pinned      INTEGER NOT NULL DEFAULT 0,  -- 0/1 — pin to top of board
  created_by  TEXT,                        -- free-text author name
  status      TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ops_notes_course_date ON operations_daily_notes(course_id, note_date);
CREATE INDEX IF NOT EXISTS idx_ops_notes_status      ON operations_daily_notes(status);
CREATE INDEX IF NOT EXISTS idx_ops_notes_priority    ON operations_daily_notes(priority);
