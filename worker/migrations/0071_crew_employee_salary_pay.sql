-- Phase 9C.5d - Employee salary pay support.
--
-- Existing employees remain hourly by default. Salary amount is private
-- management data and is only used when pay_type is 'salary'.

ALTER TABLE crew_employees ADD COLUMN pay_type      TEXT DEFAULT 'hourly';
ALTER TABLE crew_employees ADD COLUMN salary_amount REAL;
