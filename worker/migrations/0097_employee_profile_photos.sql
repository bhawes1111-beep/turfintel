-- Employee profile photos reuse operational_attachments + R2. This course
-- setting controls whether those photos may be shown on the public Display
-- Board. Existing courses remain initials-only until a manager opts in.

ALTER TABLE courses
  ADD COLUMN display_board_show_profile_photos INTEGER NOT NULL DEFAULT 0;
