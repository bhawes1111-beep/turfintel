# Phase 4 — Deployment Checklist

Concise pre-/post-deploy checklist for the Phase 4 commits (Key Rotation,
courseAccess fix, attachment row-scope, invite/reset foundation). Run
through this when you're ready to push and deploy.

**Phase 4 commits on `master` (not yet pushed at time of writing):**

| Commit | Scope |
|---|---|
| `8e21e14` | Step 4 — `courseAccess: []` semantics fix |
| `cf59967` | Step 5 — attachment row-level course scoping |
| `ef3e156` | Step 3.1 — migration 0039 + auth_tokens helpers |
| `6e47766` | Step 3.2 — invite/reset endpoints |
| `bc4b5e5` | Step 3.3 — SPA accept/reset pages + Login forgot-password |
| `0457ebe` | Step 3.4 — Admin invite UI |
| **`<this>`** | Step 3.5 — wrap-up smokes + docs |

Phase 4 Step 1 + Step 2 were **secret rotations only** — no commits, no
deploy. ADMIN_KEY + AUTOMATION_KEY were rotated to fresh values; the legacy
`TurfAdmin2025!` literal is dead in production.

---

## 1. Migration state

**Local D1:** migrations 0014, 0017, 0020, 0022, 0033–0038, 0039 applied.
(0022 attachments + 0014 courses + 0017 course_acreage were applied during
test runs; the rest belong to the production schema.)

**Production D1:** migration **0039 (`auth_tokens`)** must be applied as part
of this deploy. Apply via:

```powershell
cd C:\Users\bhawe\turfintel
npx wrangler d1 execute turfintel-db --remote --file worker/migrations/0039_auth_tokens.sql
```

Expected output: 5 `"success": true` (1 CREATE TABLE + 4 CREATE INDEX),
`"changed_db": true`.

**Verify the remote table + indexes:**

```powershell
npx wrangler d1 execute turfintel-db --remote --command "SELECT name FROM pragma_table_info('auth_tokens');"
npx wrangler d1 execute turfintel-db --remote --command "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auth_tokens';"
```

Expected columns: `id, token_hash, token_type, user_id, email, status,
created_by_user_id, created_at, expires_at, used_at, metadata_json`.
Expected indexes: `idx_auth_tokens_hash` (UNIQUE), `idx_auth_tokens_user`,
`idx_auth_tokens_email`, `idx_auth_tokens_expiry` (+ PK autoindex).

**No `users` schema change** in Phase 4 (the `'invited'` status is a value-
level convention, no CHECK constraint added).

## 2. Smoke expectations (local, pre-push)

```powershell
cd C:\Users\bhawe\turfintel
npm run build
```

Expected: `built in <2s` with no errors.

```powershell
for ($f in 'routing-tags','operational-command','moisture-intel','water-balance','morning-brief-v2','display-board-privacy','nutrition-totals','cultural-practices','disease','auth','store-session') {
  Write-Host "$f`:" -NoNewline
  node "scripts/smoke-$f.mjs" 2>&1 | Select-Object -Last 1
}
```

Expected totals (Step 3.5 baseline):

| Smoke | Assertions |
|---|---|
| routing-tags | 16 |
| operational-command | 39 |
| moisture-intel | 16 |
| water-balance | 20 |
| morning-brief-v2 | 26 |
| display-board-privacy | 30 |
| nutrition-totals | 21 |
| cultural-practices | 15 |
| disease | 23 |
| **auth** | **413** |
| **store-session** | **107** |
| **TOTAL** | **726** |

All "0 failed."

## 3. Push + deploy sequence

```powershell
# 1. Push
git push origin master

# 2. Apply remote migration 0039
npx wrangler d1 execute turfintel-db --remote --file worker/migrations/0039_auth_tokens.sql

# 3. Verify schema (see §1 above)

# 4. Deploy
npx wrangler deploy
```

Note the version id from the deploy output (`Current Version ID: …`).

## 4. Production verification

### 4a. Invite-flow verification (admin)

Sign in to https://turfintel.bhawes1111.workers.dev as the Owner/Admin.
Open the Admin page → "+ Invite User":

- [ ] Form has **email, displayName, role, override checkboxes** — **no
      password field**.
- [ ] Submit creates a user with `status: 'invited'` (badge is amber).
- [ ] Modal switches to LINK phase showing the invite URL.
- [ ] "Copy Invite Link" button copies the URL (toast confirms).
- [ ] Closing the modal clears the URL from view (no lingering state).

Open the invite URL in a private/incognito window:

- [ ] `/accept-invite?token=…` renders the "Set your password" form with
      the invitee's email.
- [ ] Submitting a ≥8-char password succeeds → auto-login → `/dashboard`.
- [ ] Back in the Admin page, the user now shows `status: active` (green).
- [ ] Re-opening the invite URL after redemption shows the "invalid or
      expired" state.

### 4b. Reset-flow verification

On the live `/login` page:

- [ ] "Forgot Password?" opens the inline panel.
- [ ] Submitting any email returns the generic "If that email is
      registered…" message (same response for known + unknown emails).

As the Owner/Admin, exercise the admin-mode debug path to get a real reset
link for any active user (curl with your session cookie):

```bash
curl -s -X POST https://turfintel.bhawes1111.workers.dev/api/auth/reset-request \
  -H "Content-Type: application/json" \
  -H "Cookie: ti_session=<your session>" \
  -d '{"email":"<active user>"}'
# Expect: { ok, message, debug: { resetUrl, expiresAt } }
```

Open the resetUrl in a private window:

- [ ] `/reset-password?token=…` renders the form.
- [ ] Submitting a new password redirects to `/login` with the "Password
      updated. Sign in with your new password." notice.
- [ ] Logging in with the new password works.
- [ ] Any prior browser session for that user (if open in another tab) is
      now invalid — GET `/api/auth/me` returns `{ user: null }`.

### 4c. Session verification

- [ ] Owner/Admin login still works (run from a fresh browser).
- [ ] `GET /api/auth/me` returns the owner_admin user with `permissions`.
- [ ] Session mutation (e.g. create a disease observation from the app)
      works without `x-admin-key`.
- [ ] Logout clears the cookie and `GET /api/auth/me` then returns
      `{ user: null }`.

### 4d. Bundle scan

Fetch the live JS bundle and confirm zero invite-token leaks:

```bash
asset=$(curl -s https://turfintel.bhawes1111.workers.dev/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s https://turfintel.bhawes1111.workers.dev$asset > /tmp/live.js
grep -c "TurfAdmin2025!\|x-admin-key\|ADMIN_KEY\|invite-pending" /tmp/live.js
rm /tmp/live.js
```

Expected: `0` (or `1` for `invite-pending` *only if* the literal landed in
the bundle — it shouldn't, since it's a worker-side constant; verify by
breaking out each search and confirming TurfAdmin2025! + x-admin-key + the
ADMIN_KEY identifier are all 0).

### 4e. Cron verification

The cron schedule (`*/30 * * * *`) was untouched by Phase 4. After
deploy, wait for the next 30-minute boundary and verify a new
`weather_observations` row landed:

```powershell
npx wrangler d1 execute turfintel-db --remote --command "SELECT observed_at FROM weather_observations ORDER BY observed_at DESC LIMIT 3;"
```

Expected: the most recent timestamp is within ~30 min of "now".

### 4f. Display Board verification

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://turfintel.bhawes1111.workers.dev/display-board/board
```

Expected: `200` (public route, untouched by Phase 4).

### 4g. courseAccess + attachment scope (Steps 4 + 5 regression)

- [ ] Owner course list (`GET /api/courses` with session cookie) shows all
      courses (NULL course_access = all).
- [ ] Creating a restricted user via Admin with `courseAccess: ["crossroads-gc"]`
      and logging in as them shows ONLY `crossroads-gc` on `/api/courses`.
- [ ] That restricted user gets `404` for an attachment id from a different
      course (no existence leak — `GET /api/attachments/<other-course-id>`
      and `GET /api/attachments/<other-course-id>/file`).

### 4h. Production cleanup

After verification, clean up any test users + their sessions/tokens:

```powershell
# Disable test users via API (preserves the audit trail)
# OR hard-delete via D1 if you want a clean state:
npx wrangler d1 execute turfintel-db --remote --command "
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'verify-%' OR email LIKE 'test-%');
  DELETE FROM auth_tokens WHERE email LIKE 'verify-%' OR email LIKE 'test-%';
  DELETE FROM users WHERE email LIKE 'verify-%' OR email LIKE 'test-%';
  DELETE FROM auth_attempts;
"
```

Confirm production is back to owner-only:

```powershell
npx wrangler d1 execute turfintel-db --remote --command "SELECT COUNT(*) AS n FROM users; SELECT COUNT(*) AS n FROM auth_tokens; SELECT COUNT(*) AS n FROM auth_attempts;"
```

Expected: `users.n = 1`, `auth_tokens.n = 0` (or whatever real outstanding
invites exist), `auth_attempts.n = 0`.

## 5. Rollback sequence

If verification surfaces a blocker, roll back the deploy + commits in this
order:

### 5a. Per-commit revert (preferred — surgical)

Each Phase 4 commit is independently revertible. Identify the smallest
failing scope and revert just that commit:

```powershell
# Example: SPA pages misbehave
git revert bc4b5e5   # reverts 3.3 only
git push origin master
npx wrangler deploy
```

Per-commit notes:
- **`8e21e14` (Step 4)** — reverts the `courseAccess` write semantics.
  Existing rows unaffected (we never wrote `'[]'` in production yet).
- **`cf59967` (Step 5)** — reverts attachment row-scope. Restricted users
  fall back to the pre-3.4 behavior (could read by-id from other courses).
- **`ef3e156` (Step 3.1)** — reverting **removes the helpers** but leaves
  migration 0039 in place. The `auth_tokens` table is harmless if no code
  references it.
- **`6e47766` (Step 3.2)** — reverting removes the 4 endpoints. Any
  outstanding invite/reset tokens become unreachable from the API; they
  expire naturally (≤72h). Admin can still set passwords directly via
  `PATCH /api/users/:id { password }`.
- **`bc4b5e5` (Step 3.3)** — reverting removes the 2 SPA routes; admins
  must curl `/api/auth/set-password` directly for any in-flight invite.
- **`0457ebe` (Step 3.4)** — reverting restores the password-on-create
  Admin modal. Existing invited users remain invited; admins can set
  their passwords directly.
- **`<3.5>`** — docs + smokes only; revert has no runtime effect.

### 5b. Full Phase-4 rollback (worst case)

Revert all commits, then drop the new table:

```powershell
# Revert in reverse order to avoid cascading conflicts
git revert <3.5> 0457ebe bc4b5e5 6e47766 ef3e156 cf59967 8e21e14
git push origin master
npx wrangler deploy

# Optional: drop auth_tokens (safe — only Phase-4 code touched it)
npx wrangler d1 execute turfintel-db --remote --command "DROP TABLE IF EXISTS auth_tokens;"
```

### 5c. Key safety during rollback

ADMIN_KEY + AUTOMATION_KEY remain accepted server-side throughout. Any
operator with either key can:

- Set any user's password via `PATCH /api/users/:id { password }` (the
  Phase 1 admin-fallback path, never touched).
- Disable a user via `PATCH /api/users/:id { status: 'disabled' }`.
- List users via `GET /api/users`.

So no Phase 4 rollback can lock out an operator with the keys.

### 5d. Browser session safety

A revert does NOT invalidate existing `ti_session` cookies. Users with live
sessions continue to work; the rolled-back UI just hides some flows.

---

## 6. Post-deploy housekeeping

Once Phase 4 is stable in production for a few days:

- [ ] Update memory note `project_turfintel_auth.md` with the deployed
      version id.
- [ ] Consider provisioning the email provider (see
      [AUTH_INVITE_RESET_PLAN.md](AUTH_INVITE_RESET_PLAN.md) §"Email
      delivery") — this would stop returning links in API responses.
- [ ] Schedule the ADMIN_KEY gate-removal phase per
      [ADMIN_KEY_RETIREMENT_PLAN.md](ADMIN_KEY_RETIREMENT_PLAN.md) §7.
