-- Phase 9C.5b1 — Bilingual kiosk fields.
--
-- Manual Spanish translations for the crew-visible kiosk content
-- surfaces that /display-board/board renders:
--   1. crew_assignments.notes        → notes_es
--   2. operations_daily_notes.title  → title_es
--   2. operations_daily_notes.body   → body_es
--   3. alerts.title                  → title_es
--   3. alerts.message                → message_es
--
-- All columns are nullable so existing English-only rows continue to
-- work without backfill. Blank Spanish means English-only display on
-- the kiosk. No external translation service, no Workers AI binding,
-- no generic translations table — authors fill the matching *_es field
-- by hand when they want Spanish to appear on the shop TV.
--
-- Privacy: these columns hold crew-broadcast content, identical
-- privacy class to the English source field. No new private-fields
-- gating required; the Phase 9C.5a.5 employee serializer privacy
-- gate (on a separate table) is unaffected.
--
-- Rollback: D1 does not support ALTER TABLE DROP COLUMN. To back out,
-- stop reading/writing the *_es fields client-side; the NULL columns
-- are inert and impose no runtime cost.

ALTER TABLE crew_assignments       ADD COLUMN notes_es   TEXT;
ALTER TABLE operations_daily_notes ADD COLUMN title_es   TEXT;
ALTER TABLE operations_daily_notes ADD COLUMN body_es    TEXT;
ALTER TABLE alerts                 ADD COLUMN title_es   TEXT;
ALTER TABLE alerts                 ADD COLUMN message_es TEXT;
