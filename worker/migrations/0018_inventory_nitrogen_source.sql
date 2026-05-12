-- Phase 2 — Inventory: nitrogen source field.
--
-- Adds a dedicated column for the form of nitrogen in fertilizer products
-- (e.g. "Urea", "SCU", "Methylene Urea", "IBDU", "Ammonium Sulfate",
-- "Calcium Nitrate"). Used by the Spray Application Builder to expose
-- N source alongside N-P-K analysis in the tank summary.
--
-- Additive only. NULL is treated as "Data unavailable" by the client —
-- no seed values, no inferred values, no rewrites to existing rows.

ALTER TABLE inventory_items ADD COLUMN nitrogen_source TEXT;
