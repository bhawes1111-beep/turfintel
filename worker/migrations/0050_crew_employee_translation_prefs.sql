-- Phase 9C.5c1 — Crew employee translation preferences.
--
-- Per-employee display preferences that drive automatic board
-- translation in later phases. Public-safe by classification — these
-- are kiosk-rendering hints, not HR / management data. They do NOT
-- affect the existing pay rate / emergency contact / pesticide license
-- privacy gate from Phase 9C.5a.5; those columns stay gated behind
-- canViewPrivate in worker/api/crew.js.
--
-- Field semantics:
--   auto_translate_board_notes   0 = off (default), 1 = on
--   board_language               'en' (default) | 'es' | future codes
--
-- Both fields are required for translation to be requested: the switch
-- AND a non-English language. When the switch is off OR the language is
-- 'en' or NULL, no translation is requested for that employee.
--
-- Phase 9C.5c1 only adds storage + UI; it does NOT add a translation
-- provider, does NOT bind Workers AI, and does NOT gate any kiosk
-- render on these preferences. Those land in 9C.5c2 / 9C.5c3 / 9C.5c4.

ALTER TABLE crew_employees ADD COLUMN auto_translate_board_notes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crew_employees ADD COLUMN board_language             TEXT DEFAULT 'en';
