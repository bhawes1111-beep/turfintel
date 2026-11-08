CREATE TABLE IF NOT EXISTS field_upload_devices (
  fingerprint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  linked_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
