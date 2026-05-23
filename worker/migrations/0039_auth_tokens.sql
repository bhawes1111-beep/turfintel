-- Phase 4 Step 3.1 — Invite + Password-Reset tokens.
--
-- Shared table for invite tokens (admin-created, 72h TTL) and
-- password-reset tokens (self-service or admin-issued, 30m TTL). The raw
-- token never enters the DB: only its SHA-256 hash is stored, in the same
-- pattern as the sessions table.
--
-- Status transitions:
--   active → used     (one-time consumption sets used_at)
--   active → expired  (lazy: set on the next verify after expires_at)
--   active → revoked  (admin re-issues; prior active token marked revoked)
--
-- Lookup is by token_hash (UNIQUE); user_id + email indexes cover admin
-- listing and re-invite paths. expires_at index supports opportunistic
-- pruning of stale rows on every verify (no cron needed).
--
-- metadata_json holds the snapshot of role / course_access / overrides that
-- the inviter chose, so accept-invite applies the intended state atomically
-- (defensive against drift if the admin edits the user row in the interim).
-- For password-reset rows it is NULL.

CREATE TABLE IF NOT EXISTS auth_tokens (
  id                   TEXT PRIMARY KEY,
  token_hash           TEXT NOT NULL,                       -- SHA-256(token); raw is never stored
  token_type           TEXT NOT NULL,                       -- 'invite' | 'password_reset'
  user_id              TEXT,                                -- nullable; for invites we always set it though
  email                TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'used' | 'expired' | 'revoked'
  created_by_user_id   TEXT,                                -- admin id for invites; NULL for self-service reset
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at           TEXT NOT NULL,
  used_at              TEXT,                                -- set when consumed; row stays for audit
  metadata_json        TEXT                                 -- JSON snapshot of intended role / course_access / overrides
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tokens_hash   ON auth_tokens(token_hash);
CREATE INDEX        IF NOT EXISTS idx_auth_tokens_user   ON auth_tokens(user_id, token_type);
CREATE INDEX        IF NOT EXISTS idx_auth_tokens_email  ON auth_tokens(email, token_type);
CREATE INDEX        IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens(expires_at);
