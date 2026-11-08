-- Employee PIN access for the read-only work board.
--
-- A NULL hash means the employee uses the default PIN (2026). Custom PINs
-- are PBKDF2 hashes; plaintext PINs are never stored. Work-board sessions use
-- opaque cookie tokens whose SHA-256 hashes are persisted here.

ALTER TABLE crew_employees ADD COLUMN work_board_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS work_board_sessions (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL,
  employee_id  TEXT NOT NULL,
  course_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT,
  user_agent   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_board_sessions_token
  ON work_board_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_work_board_sessions_employee
  ON work_board_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_board_sessions_expires
  ON work_board_sessions(expires_at);

CREATE TABLE IF NOT EXISTS work_board_pin_attempts (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT,
  course_id    TEXT,
  ip           TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  success      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_work_board_pin_attempts_employee
  ON work_board_pin_attempts(employee_id, attempted_at);
CREATE INDEX IF NOT EXISTS idx_work_board_pin_attempts_ip
  ON work_board_pin_attempts(ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_work_board_pin_attempts_time
  ON work_board_pin_attempts(attempted_at);
