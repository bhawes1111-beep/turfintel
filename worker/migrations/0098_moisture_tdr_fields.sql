-- Structured Spectrum TDR fields for moisture maps and diagnostics.
-- Additive and nullable so manual observations and historical rows remain valid.

ALTER TABLE moisture_observations ADD COLUMN bulk_ec         REAL;
ALTER TABLE moisture_observations ADD COLUMN soil_temp_c     REAL;
ALTER TABLE moisture_observations ADD COLUMN ir_temp_c       REAL;
ALTER TABLE moisture_observations ADD COLUMN tdr_period_us   REAL;
ALTER TABLE moisture_observations ADD COLUMN satellite_total INTEGER;
ALTER TABLE moisture_observations ADD COLUMN gps_hdop        REAL;
ALTER TABLE moisture_observations ADD COLUMN gps_fix         TEXT;
ALTER TABLE moisture_observations ADD COLUMN rod_length      TEXT;
ALTER TABLE moisture_observations ADD COLUMN soil_type       TEXT;
ALTER TABLE moisture_observations ADD COLUMN meter_id        TEXT;
