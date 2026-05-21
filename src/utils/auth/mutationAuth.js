// Shared mutation auth (audit R3).
//
// Centralizes the admin key + mutation headers that were previously
// duplicated verbatim across 16 stores. Behavior is preserved exactly:
//
//   - ADMIN_KEY        — the single shared key, sent as the x-admin-key
//     header on every POST/PATCH/DELETE. This is "obscurity, not security"
//     (the key ships in the public bundle); the Worker's central auth gate
//     rejects mutations without it. To rotate, change it HERE and run
//     `wrangler secret put ADMIN_KEY` — previously this meant editing 16
//     files.
//
//   - mutationHeaders() — JSON mutation headers (Content-Type +
//     x-admin-key). The standard variant used by 15 stores.
//
//   - adminKeyHeader()  — key only, NO Content-Type. Used for multipart
//     uploads (attachments) where the browser must set the
//     multipart/form-data boundary itself.
//
// No state, no fetching — pure header construction. Importing this does not
// create a new state layer.

export const ADMIN_KEY = 'TurfAdmin2025!'

export function mutationHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key':  ADMIN_KEY,
  }
}

export function adminKeyHeader() {
  return { 'x-admin-key': ADMIN_KEY }
}
