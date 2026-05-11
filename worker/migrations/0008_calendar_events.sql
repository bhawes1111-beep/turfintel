-- Phase 5.4a — Calendar events persistence
--
-- One table. source_type + source_id are the load-bearing pair: most
-- events are created from a vertical record (a completed spray, a
-- scheduled maintenance log, a planned repair) and need to link back
-- to that record for context. Manual events use source_type='manual'
-- and source_id=NULL.
--
-- payload_json holds the multi-valued fields that don't fit cleanly
-- into columns: assignedStaff[], equipment[], tags[], priority, course,
-- and anything else a future caller wants to stash. The Worker mapper
-- reassembles them into the nested shape the existing UI consumers
-- expect (assignedStaff array, equipment array, metadata.sourceId,
-- etc.) so frontend consumers need only swap the data source.

CREATE TABLE IF NOT EXISTS calendar_events (
  id             TEXT PRIMARY KEY,
  source_type    TEXT,                                -- 'spray' | 'maintenance' | 'irrigation' | 'manual' | ...
  source_id      TEXT,                                -- e.g. 'spray-001', 'ml-009', 'rep-002'
  title          TEXT NOT NULL,
  event_type     TEXT,                                -- 'spray' | 'crew' | 'maintenance' | 'agronomy' | 'irrigation'
  status         TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled | in-progress | completed | cancelled
  start_date     TEXT,
  start_time     TEXT,
  end_date       TEXT,
  end_time       TEXT,
  location       TEXT,
  description    TEXT,                                -- maps to legacy `notes`
  payload_json   TEXT,                                -- JSON: { priority, assignedStaff, equipment, tags, course, ... }
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cal_source_type  ON calendar_events(source_type);
CREATE INDEX IF NOT EXISTS idx_cal_source_id    ON calendar_events(source_id);
CREATE INDEX IF NOT EXISTS idx_cal_event_type   ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cal_status       ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_cal_start_date   ON calendar_events(start_date);

-- Composite index used by the dedupe guard (sourceId+category+date).
CREATE INDEX IF NOT EXISTS idx_cal_dedupe       ON calendar_events(source_id, event_type, start_date);
