# Auth — Invite & Password Reset Plan

Status: **PLAN ONLY (not implemented).** Produced in Auth Phase 2, Commit 5.
Implementation is a future phase; nothing here is wired yet.

## Context

Today an admin creates a user with a **temporary password** typed directly
into the Admin page (`POST /api/users`). There is no self-service password
reset and no email-delivered invite. This document specifies how to add both
safely, reusing the existing primitives:

- PBKDF2 password hashing — `worker/lib/passwords.js`
- opaque-token + SHA-256-at-rest pattern — `worker/lib/sessions.js`
- centralized actor/permission helpers — `worker/lib/actor.js`,
  `worker/lib/permissions.js`
- the `users` table and the `canManageUsers` + `canManageRole` hierarchy

## Goals

1. Admin-created **invites** instead of admin-typed passwords.
2. **Self-service password reset** by email.
3. **Admin reset fallback** when email delivery is unavailable.
4. Reuse the security posture already in place (hashed-at-rest tokens, generic
   responses, no enumeration leaks).

---

## 1. Data model — migration 00XX `auth_tokens`

A single table serves both invites and resets (one `purpose` column), so we
don't duplicate token plumbing.

```
auth_tokens (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL,        -- SHA-256 of the opaque token (never raw)
  user_id     TEXT NOT NULL,        -- the target user
  purpose     TEXT NOT NULL,        -- 'invite' | 'reset'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT,                 -- non-null once consumed (one-time use)
  created_by  TEXT                  -- admin user id for invites; null for self-reset
)
-- indexes: (token_hash) UNIQUE, (user_id), (expires_at)
```

Reuse `mintToken()` / `hashToken()` from `sessions.js` verbatim — the raw
token only ever travels in the emailed link / one-time response; the DB stores
only its hash.

### Token lifetimes (short-lived)
- **Invite token:** 72 hours (a new hire may not act immediately).
- **Reset token:** 30 minutes (tighter — an account already exists).
- Both are **one-time use:** consuming sets `used_at`; a used or expired token
  is rejected with the same generic error.

---

## 2. Admin-created invites

**Flow**
1. Admin (with `canManageUsers`, and `canManageRole` for the target role)
   `POST /api/users/invite { email, role, displayName, courseAccess }`.
2. Server creates the `users` row with **no usable password** (e.g.
   `password_hash = 'invite-pending'`, `status = 'invited'`), mints an invite
   token, stores its hash in `auth_tokens` (`purpose='invite'`,
   `created_by=<admin>`).
3. Server returns the invite **link** (and, in future, emails it). During the
   no-email interim, the admin copies the link from the response (shown once).
4. Invitee opens `/accept-invite?token=…`, sets a password (validated against
   policy), server verifies the token, hashes the password, flips
   `status='active'`, sets `used_at`, and (optionally) logs them in.

**Authorization:** an admin may only invite roles **strictly below their own**
(reuse `canManageRole`). A superintendent cannot invite another superintendent
or an owner_admin.

---

## 3. Self-service password reset request

**Flow**
1. The login page "Forgot Password?" button (already present, currently a
   stub) `POST /api/auth/reset-request { email }`.
2. Server **always responds 200 with a generic message** ("If that email
   exists, a reset link has been sent") — *never* reveals whether the email
   exists. Rate-limited by the same `auth_attempts`/rateLimit machinery
   (treat reset-request like a login attempt for throttling).
3. If the email maps to an **active** user, mint a reset token
   (`purpose='reset'`, 30-min expiry, `created_by=null`), store its hash, and
   email the link. If not, do nothing (but still 200).
4. User opens `/reset-password?token=…`, sets a new password; server verifies
   the token (unused + unexpired), hashes the new password, sets `used_at`,
   and **invalidates all of that user's existing sessions** (delete from
   `sessions` — same as the admin password-change path already does).

---

## 4. Password setup / reset endpoint behavior

`POST /api/auth/set-password { token, password }` (shared by invite accept and
reset):
- Look up `sha256(token)` in `auth_tokens`; reject (generic 400) if missing,
  used, or expired.
- Validate password against policy (see hardening notes — policy not yet
  configurable; start with min-length 8, matching the current bootstrap rule).
- Hash via `hashPassword`, update the user, set `used_at`, delete the user's
  sessions, optionally issue a fresh session cookie.
- All failure modes return the **same generic** message.

---

## 5. Email delivery (placeholder / future provider)

- **Interim (no provider):** invite/reset endpoints return the link in the
  response so an admin can hand it to the user out-of-band. This keeps the
  feature usable without a mail dependency.
- **Future:** a thin `worker/lib/mail.js` abstraction with one `sendMail()`
  call, backed by a provider (Resend / SES / MailChannels) configured via a
  Worker **secret** (`MAIL_API_KEY`). Never log the token or the full link.
- Links point at the SPA routes `/accept-invite` and `/reset-password`, which
  read the `token` query param and call `set-password`.

---

## 6. Admin reset fallback

When email is unavailable or a user is locked out:
- The existing `PATCH /api/users/:id { password }` already lets an admin set a
  new password (and already deletes that user's sessions). Keep this as the
  guaranteed fallback — it requires `canManageUsers` + `canManageRole`.
- Optionally add `POST /api/users/:id/invite` to re-issue an invite link for a
  pending user.

---

## 7. Security considerations

- **Tokens hashed at rest** (SHA-256); raw token only in the link. A DB leak
  yields no usable tokens.
- **One-time use + short expiry**; used/expired tokens are indistinguishable
  from invalid ones in responses.
- **No account enumeration:** reset-request always 200; set-password failures
  are generic.
- **Throttling:** reset-request shares the login rate-limit window so it can't
  be used to spray-enumerate or to send mail-bombs.
- **Session invalidation on password change** (reset and admin reset) — closes
  hijacked sessions.
- **Authorization on invites** via `canManageRole` (no privilege escalation).
- **Token entropy:** 32 bytes CSPRNG (reuse `mintToken`).
- **Logging:** never log tokens, links, or passwords.

---

## Implementation outline (future phase, suggested commits)

1. Migration `auth_tokens` + `worker/lib/inviteTokens.js` (mint/verify/consume,
   reusing session-token primitives) + helper tests.
2. `POST /api/users/invite` + `POST /api/auth/set-password` + accept-invite SPA
   route.
3. `POST /api/auth/reset-request` + `/reset-password` SPA route + throttling.
4. `worker/lib/mail.js` abstraction + provider secret (separate, optional).
5. Admin UI: "Invite user" mode + "Re-send invite" + copy-link interim.
6. Smoke tests: token lifecycle (mint→verify→consume→reject-reused/expired),
   enumeration-safety, session invalidation, authorization.
