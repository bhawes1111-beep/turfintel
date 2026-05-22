-- Phase 2 P4 — login rate limiting.
--
-- Records login attempts so /api/auth/login can throttle brute-force attempts
-- by email OR IP within a sliding window. Failed attempts are counted; a
-- successful login clears that email's recent failures. Old rows outside the
-- window are deleted opportunistically, so this table stays small.
--
-- No secrets are stored — only the email (already known to the attacker),
-- the source IP, a timestamp, and a success flag. Never the password/hash.

CREATE TABLE IF NOT EXISTS auth_attempts (
  id           TEXT PRIMARY KEY,
  email        TEXT,
  ip           TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  success      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip    ON auth_attempts(ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_time  ON auth_attempts(attempted_at);
