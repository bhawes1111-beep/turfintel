-- Optional irrigation tracking captured with each application record.
--
-- Values are simple record-level fields so reports and print sheets can show
-- irrigation without parsing free-text observations.

ALTER TABLE spray_records ADD COLUMN irrigation_inches REAL;
ALTER TABLE spray_records ADD COLUMN irrigation_minutes REAL;
