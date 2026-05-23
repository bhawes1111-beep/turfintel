# Auth Phase 2 — Hardening Follow-ups

Status: **TRACKING DOC.** Open items surfaced while shipping Auth Phase 2
(P1–P4). None are blockers for the Phase-2 deploy; each is a candidate for a
later hardening pass. Cross-refs: [Invite/Reset Plan](AUTH_INVITE_RESET_PLAN.md),
[ADMIN_KEY Retirement Plan](ADMIN_KEY_RETIREMENT_PLAN.md).

## 1. Empty `courseAccess: []` is stored as NULL (= all access)
- **What:** `POST /api/users` / `PATCH /api/users/:id` treat an empty
  `courseAccess` array as `NULL`, and `NULL` means "all courses" in
  `actorCanAccessCourse` / `actorAccessibleCourses`. So you **cannot** restrict
  a user to zero courses by sending `[]`.
- **Impact:** low today — the only restricted users are ones explicitly given a
  non-empty allow-list. But "remove all course access" silently grants all.
- **FIXED in Phase 4 Step 4** ([8e21e14](#)): `encodeCourseAccess()` now
  distinguishes `undefined` (no change) / `null` (NULL = all) / `[]` (explicit
  no-access, stored as `'[]'`) / `['..']` (allow-list). Invalid types → 400.

## 2. Course-scope enforcement is read-side and partial
- **Enforced reads (P3):** condition-logs, moisture, sprays, inventory,
  equipment, nutrition, cultural-practices, disease, water-balance,
  weather/history, weather/current, crew-assignments, operations-notes,
  calendar-events, and `/api/courses` filtering.
- **Enforced by-id reads (Phase 4 Step 5):** `/api/attachments/:id` +
  `/api/attachments/:id/file` via `enforceRowCourseAccess()` — denied/missing
  return a uniform 404 (no existence leak; binary leak closed).
- **Still deferred endpoints:** `/api/weather/observations`, `/api/weather/capture`
  (automation/cron surfaces), `/api/users`, `/api/pilot-feedback`,
  `/api/schedule-templates`, `/api/employee-schedules`, `/api/crew-employees`,
  `/api/alerts`. Add as needed in a later pass.

## 3. By-id course-access reads are PARTIALLY guarded
- **Closed:** attachments (`/api/attachments/:id` + `/file`) — the
  highest-risk binary-leak path. Helper `enforceRowCourseAccess` in
  `worker/lib/courseScope.js` ready for re-use.
- **Still open:** every other operational `GET /api/<resource>/:id` (disease,
  nutrition, sprays, equipment, condition-logs, moisture, crew-assignments,
  calendar-events, etc.) fetches a single record by id without a
  course-access check. A restricted user who knows an id could read a record
  from a course they're not assigned to.
- **Impact:** low — ids are opaque and not enumerated to restricted users; the
  list endpoints (their normal discovery path) are scoped.
- **Fix later:** apply the existing `enforceRowCourseAccess` helper to each
  by-id GET (extending the table whitelist in `courseScope.js`).

## 4. Mutation-level course enforcement is deferred
- **What:** P2 enforces *permission* on mutations; it does **not** check that
  the mutated record belongs to a course the actor may access. A restricted
  user with, say, `canEditMoisture` could in principle write to another
  course's data by passing its `courseId`.
- **Impact:** low today — restricted roles (crew/crew_lead) have few edit
  permissions, and the only multi-course actors (owner/super) are unrestricted.
- **Fix later:** in the gate or handlers, validate the body/record `courseId`
  against `actorCanAccessCourse` for restricted actors on mutations.

## 5. Invite / password-reset — IMPLEMENTED (Phase 4 Step 3)
- **CLOSED.** Admin invite-link flow (Admin "+ Invite User" modal) replaces
  admin-typed passwords. Self-service "Forgot Password?" panel posts to
  enumeration-safe `/api/auth/reset-request`. Token table + helpers in
  [migration 0039](../worker/migrations/0039_auth_tokens.sql) +
  [worker/lib/inviteTokens.js](../worker/lib/inviteTokens.js); endpoints in
  `auth.js` + `users.js`; SPA pages in [src/pages/Auth/](../src/pages/Auth/);
  Admin UI in `Admin.jsx`. See [AUTH_INVITE_RESET_PLAN.md](AUTH_INVITE_RESET_PLAN.md)
  for the implementation status table.
- **Intentionally postponed:** email provider integration (links are returned
  in API responses for now — admin copy-link UI + admin-mode `debug.resetUrl`
  cover the operational gap). Per-user re-invite endpoint also postponed
  (decision 5 of Step 3.2 audit).

## 6. Password policy not configurable
- **What:** the only rule is min-length 8 (bootstrap, user-create,
  set-password). No complexity / rotation / breach-check, no per-org config.
- **Fix later:** a small `validatePassword()` helper with configurable rules;
  apply uniformly at every password entry point (`hashPassword`,
  `setPassword`, `bootstrapAdmin`, `createUser`, `updateUser`).

## 7. ADMIN_KEY removal not complete
- **CLIENT-SIDE: CLOSED** in Phase 3 — `mutationAuth.js` no longer exports the
  key; bundle scan confirms `dist/` has zero references. All 21 stores use
  session-cookie auth.
- **SERVER-SIDE: STILL ACCEPTED** as a fallback in `requireAdminKey` alongside
  `AUTOMATION_KEY` (Phase 3B dual key). Both rotated to fresh values in
  Phase 4 Step 2 (legacy `TurfAdmin2025!` literal is dead in production).
- **Final removal from the gate** is a later explicit phase per
  [ADMIN_KEY_RETIREMENT_PLAN.md](ADMIN_KEY_RETIREMENT_PLAN.md) §7.

## 8. Rate-limit scope
- **PARTIALLY EXTENDED** in Phase 4 Step 3.2: `/api/auth/reset-request` now
  shares the `auth_attempts` window with `/api/auth/login` (8 fails /
  15 min by email OR IP → generic 429). This blocks reset-as-enumeration-oracle.
- **Still open:** `accept-invite` + `reset-password` (token-redeem paths)
  rely on the underlying `auth_attempts` throttle only via volume — they do
  not write to `auth_attempts` themselves. A leaked link is mitigated by
  short TTL + one-time use + revoke-on-reissue rather than throttle.
- **Fix later:** a per-token-hash bucket if brute-force of token URLs becomes
  a real concern (256-bit entropy means it isn't today).

## 9. Timing-leak parity with login (NEW, Phase 4 Step 3.2)
- **What:** `setPassword` runs PBKDF2 only on the success path (after token
  is verified). A valid-token request is therefore measurably slower than a
  bogus-token one — an observer can probe "is this token real?" The same
  pattern exists in `/api/auth/login` (hash runs only on found user).
- **Decision:** accepted as Phase-4 parity. `TODO(hardening)` note in
  `worker/api/auth.js#setPassword`.
- **Fix later:** add a dummy constant-time PBKDF2 invocation on the reject
  path uniformly across auth surfaces.

---

### Suggested priority for the next hardening phase
1. **ADMIN_KEY gate removal** (Section 7) — per the retirement plan §7;
   requires AUTOMATION_KEY proven in production over several days first.
2. **Email provider** (Section 5 postponed item) — wire `MAIL_API_KEY` +
   `worker/lib/mail.js`; stop returning links in API responses.
3. **Per-user re-invite endpoint** (`POST /api/users/:id/invite`) — small;
   reuses `revokeActiveTokensFor` + `mintAuthToken`. Currently admins must
   disable + invite-new to re-issue.
4. **By-id + mutation course enforcement** (Sections 3, 4) — completes course
   isolation once multi-course usage grows.
5. **Configurable password policy** (Section 6) — small, removes a footgun
   if compliance ever requires it.
6. **Timing-leak hardening** (Section 9) — uniform constant-time across
   `login` + `setPassword`.
