-- Phase 7B.2: Turf Health orientation column.
--
-- Adds the only schema change of the 7B.2 phase — an optional `orientation`
-- column on turf_health_observations. Used by the capture sheet's new
-- Orientation chip row (N/S/E/W). Worker-side a small ALLOWED_ORIENTATIONS
-- Set validates incoming values; anything else is rejected with a 400 so
-- the column stays clean for future analytic queries (sun angle, prevailing
-- wind, GPS overlays) when those layers eventually land.
--
-- Additive only. Optional everywhere — the existing zero-typing capture
-- flow (FAB → location → type → severity → Save) does NOT require
-- orientation; it sits below severity as a fourth chip row the user can
-- skip.
--
-- No index. Orientation is a filter dimension users will pick on, not a
-- primary sort key; the existing (course_id, observed_at DESC) and
-- (course_id, status) indexes cover hot paths. Promote to indexed when a
-- real query proves the need.

ALTER TABLE turf_health_observations ADD COLUMN orientation TEXT;
