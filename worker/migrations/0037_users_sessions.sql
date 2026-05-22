-- Phase: Login, Admin Users + Permissions Foundation — Commit 1.
--
-- Adds authentication primitives: `users` (email + hashed password + role)
-- and `sessions` (opaque cookie tokens, stored only as SHA-256 hashes).
--
-- SECURITY:
--   - password_hash is PBKDF2 (WebCrypto), never plaintext. Format:
--     pbkdf2$<iterations>$<salt_b64>$<hash_b64> (see worker/lib/passwords.js).
--   - sessions.token_hash is the SHA-256 of the opaque cookie token; the raw
--     token only ever lives in the httpOnly cookie, never in the DB or logs.
--   - role drives permissions via the shared matrix (worker/lib/permissions.js
--     + src/utils/auth/permissions.js). Superintendent has full operational
--     access; only platform/system-owner functions are owner_admin-only.
--   - course_access: JSON array of course ids the user may see; NULL = all
--     courses (the default for owner_admin / superintendent).
--
-- This migration is additive and idempotent. It does NOT touch ADMIN_KEY,
-- the mutation gate, the cron path, or any existing table — Phase 1 layers
-- session auth alongside the existing key, it does not replace it.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  display_name   TEXT,
  role           TEXT NOT NULL DEFAULT 'crew',   -- owner_admin | superintendent | assistant_super | crew_lead | crew | read_only
  status         TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  course_access  TEXT,                            -- JSON array of course ids; NULL = all courses
  view_private_notes INTEGER NOT NULL DEFAULT 0,  -- per-user override (0/1); role may already grant it
  send_crew_notes    INTEGER NOT NULL DEFAULT 0,  -- per-user override (0/1)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

-- Case-insensitive unique email (login is case-insensitive). Stored lowercased
-- by the API, but the index guarantees uniqueness regardless.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL,                      -- SHA-256 of the opaque cookie token
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT,
  user_agent  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
