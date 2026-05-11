-- Phase 5.4b — Alerts persistence
--
-- Single table. source_type + source_id link each alert back to its
-- originating record (a spray-001 REI alert, a rep-001 high-priority
-- escalation, etc.) so dashboards can deep-link.
--
-- Soft-state semantics: dismiss → status='resolved' + dismissed_at,
-- acknowledge → status='acknowledged' + acknowledged_at. The audit
-- trail survives; consumers filter by status to hide resolved.

CREATE TABLE IF NOT EXISTS alerts (
  id              TEXT PRIMARY KEY,
  source_type     TEXT,                                -- 'spray' | 'irrigation' | 'inventory' | 'manual' | ...
  source_id       TEXT,                                -- originating record id (spray-001, rep-001, ...)
  module          TEXT,                                -- legacy module tag (spray | irrigation | inventory | disease | ...)
  priority        TEXT NOT NULL DEFAULT 'medium',      -- critical | high | medium | low | info
  status          TEXT NOT NULL DEFAULT 'new',         -- new | acknowledged | resolved
  title           TEXT NOT NULL,
  message         TEXT,
  course          TEXT,
  action_label    TEXT,
  action_target   TEXT,                                -- e.g. '/spray' or '/irrigation'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  dismissed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_status      ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_priority    ON alerts(priority);
CREATE INDEX IF NOT EXISTS idx_alerts_module      ON alerts(module);
CREATE INDEX IF NOT EXISTS idx_alerts_source_id   ON alerts(source_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at  ON alerts(created_at);
