# ADMIN_KEY Retirement Plan

Status: **PHASE 3 SHIPPED in-repo** (commits not yet pushed/deployed at the
time of this revision). The public `ADMIN_KEY` is **removed from the frontend
bundle**. ADMIN_KEY remains accepted server-side as a fallback; rotation +
gate removal are deliberately deferred to a later phase per the Phase-3 spec.

Cross-refs: [Invite/Reset Plan](AUTH_INVITE_RESET_PLAN.md),
[Phase 2 Hardening Notes](AUTH_PHASE2_HARDENING_NOTES.md).

---

## 1. Final state shipped by Phase 3

**Frontend (`src/`):**
- `src/utils/auth/mutationAuth.js` no longer exports `ADMIN_KEY`. The literal
  `TurfAdmin2025!` exists nowhere under `src/` (smoke-asserted).
- `adminKeyHeader()` is **removed**. Only `mutationHeaders()` (JSON-only) and
  `sessionInit()` remain.
- **All 21 browser stores** authenticate with the httpOnly `ti_session`
  cookie (`credentials: 'same-origin'`) and send **no `x-admin-key`** header.
  Multipart attachments use the same cookie; the browser sets the
  multipart/form-data boundary itself (no manual `Content-Type`).
- **Production `dist/` bundle scan** (smoke-store-session, Phase 3D): zero
  occurrences of `TurfAdmin2025!`, `x-admin-key`, or the `ADMIN_KEY`
  identifier in any `.js`/`.css`/`.html`.

**Server (`worker/`):**
- `worker/lib/auth.js#requireAdminKey` accepts `x-admin-key` matching EITHER
  `env.ADMIN_KEY` (legacy, fallback) OR `env.AUTOMATION_KEY` (server-only).
  Both resolve to the synthetic `owner_admin` automation actor.
- `worker/lib/actor.js` centralizes principal resolution; session cookies are
  the primary path, automation keys are the fallback.
- Cron is unaffected: `scheduled()` calls `captureWeatherForAllCourses(env)` /
  `rollupAllCourses(env)` **directly in-process** — no HTTP, no key.

## 2. What still uses ADMIN_KEY (and why it stays valid for now)

- **External / manual HTTP tooling** (remote verification, ad-hoc D1 ops via
  the API, the bootstrap endpoint) historically uses `x-admin-key:
  TurfAdmin2025!`. The Phase-3 spec explicitly says: do **not** remove the
  server-side ADMIN_KEY in this phase.
- **Rollback safety:** if a freshly-deployed session path has any issue, the
  key is the guaranteed bypass — the gate accepts either credential, so a
  reverted client (or curl with the key) keeps working with zero downtime.
- **Cron** never used the key (in-process), so it is independent of any
  rotation/removal decision.

The browser bundle no longer contains the key (3D), so the leak is closed for
the public attack surface. What remains is a strictly server-side credential.

## 3. Server-only automation/emergency key strategy

`AUTOMATION_KEY` is the **server-only** successor for any future HTTP
automation. Properties:

- Provisioned exclusively via `wrangler secret put` — never imported under
  `src/`, never in the bundle (smoke-asserted).
- Same authority as ADMIN_KEY (synthetic owner_admin). A later phase may
  optionally narrow it to specific routes (e.g. weather/capture,
  water-balance/rollup) so a leak is lower-impact.
- The gate accepts it in parallel with ADMIN_KEY, so we can stand it up
  before rotating, with no overlap risk.

Intended use:
- Manual remote verification scripts and emergency server-side ops.
- Any future external automation (CI smoke against production, etc.).
- Cron does **not** need it (in-process).

## 4. Cloudflare secret commands

> Run from the project root (`C:\Users\bhawe\turfintel`). Wrangler prompts
> interactively for the secret value — paste-once, never echoed. **Do not
> paste secret values into chat, commit messages, or logs.**

### Set / provision

```powershell
# Server-only automation key (provision once, before relying on it).
npx wrangler secret put AUTOMATION_KEY

# Legacy fallback key (already set in production; only re-run when ROTATING).
npx wrangler secret put ADMIN_KEY
```

### Rotation (when ready, AFTER production verification of session auth)

```powershell
# 1. Provision AUTOMATION_KEY (if not already done) and update tooling to use it.
npx wrangler secret put AUTOMATION_KEY

# 2. Rotate ADMIN_KEY to a fresh value (invalidates any previously-exposed copy).
npx wrangler secret put ADMIN_KEY
```

### Verify the Worker sees the keys

```powershell
# List configured secret NAMES (values are never printed).
npx wrangler secret list

# /api/health returns auth:true when ADMIN_KEY is set (does not reveal the value).
curl -s https://turfintel.bhawes1111.workers.dev/api/health
# Expect: {"ok":true,"db":true,"auth":true,"ambient":true,...}
```

### Delete (only when fully retiring a key)

```powershell
# DO NOT run during Phase 3. Reserved for a later, explicit removal phase.
npx wrangler secret delete ADMIN_KEY
```

## 5. Rollback plan

Phase 3 is intentionally double-safe: the gate accepts session cookies **and**
the legacy key, so any single layer can be rolled back without lock-out.

### Symptoms → response

| Symptom after deploy | First response | Confidence | Next |
|---|---|---|---|
| A single store's mutations return 403 unexpectedly | Verify the user's role has the right permission ([worker/lib/permissions.js](../worker/lib/permissions.js)); fix via Admin page if needed | Likely a real perms gap, not a Phase-3 bug | If role is correct, revert that store's 3C commit |
| One vertical's mutations fail with 401 | Check the user is actually logged in (`/api/auth/me`); session cookie may have expired | Cookie issue, not the cutover | Re-login; if persistent, revert that 3C group |
| All session mutations fail | ADMIN_KEY still works server-side — manual ops keep flowing via curl | High | Investigate; in the worst case `git revert` 3C-1…3C-5 |
| Public-bundle leak suspected | `grep -r TurfAdmin2025! dist/` should be empty (3D smoke) | Hard guarantee | If literal returns, revert 3D |

### `git revert` path

Phase-3 commits are isolated and revertible:

- `3D` removed the client constant + `adminKeyHeader`. Revert restores them
  (but stores still send no key — pure no-op for runtime).
- `3C-1…3C-5` each migrated 3–5 stores. Reverting a single group reintroduces
  the (now keyless) `mutationHeaders()` call for those stores; they continue
  to authenticate via the browser's default same-origin credentials.
- `3B` (dual-key gate) is purely additive — reverting reduces the gate to
  ADMIN_KEY-only.

### Temporary restoration of the old client-key behavior

Not recommended — but if absolutely required for one-off triage, the client
**stays working** without restoring it: stores already send the session
cookie. The only way a logged-in browser would fail is if the user has no
session, which is a login problem, not a key problem. A curl with the key
still works against the server.

### Why key rotation should wait until production verification passes

If ADMIN_KEY is rotated **before** the session path is fully verified, any
manual operator carrying the old key is locked out simultaneously with any
bug a session-path issue might surface. Keeping the key valid until session
auth is proven preserves the safety net.

## 6. Deploy verification checklist (run AFTER `wrangler deploy`)

For Phase 3, after pushing the commits and deploying:

- [ ] **Owner/Admin browser login works** — visit `/login`, sign in as the
      bootstrapped Owner/Admin, land on dashboard.
- [ ] **A session mutation works** — e.g. create/edit a disease observation
      or a moisture note from the UI; confirm 2xx in DevTools.
- [ ] **No `x-admin-key` in browser requests** — DevTools → Network →
      inspect a mutation's request headers; the header must be **absent**.
- [ ] **Bundle scan has no key** — `curl -s
      https://turfintel.bhawes1111.workers.dev/assets/index-*.js | grep
      TurfAdmin2025!` returns nothing (or run the store-session smoke
      locally after build).
- [ ] **ADMIN_KEY fallback still works server-side** —
      `curl -s -X POST -H "x-admin-key: <key>" -H "content-type:
      application/json" https://.../api/disease -d '{"diseaseName":"smoke"}'`
      returns 2xx; clean up the row afterwards.
- [ ] **AUTOMATION_KEY works** (only after `wrangler secret put
      AUTOMATION_KEY`) — same curl with `-H "x-admin-key: <automation>"`
      returns 2xx.
- [ ] **Display Board public route** — `curl -s -o /dev/null -w "%{http_code}"
      https://.../display-board/board` returns 200.
- [ ] **Weather cron** — `npx wrangler d1 execute turfintel-db --remote
      --command "SELECT observed_at FROM weather_observations ORDER BY
      observed_at DESC LIMIT 1;"` shows a timestamp within the last ~30 min.
- [ ] **Full smoke suite passes locally** — `node scripts/smoke-*.mjs`.

If every box is checked, the Phase-3 deploy is safe to leave in place.

## 7. Final removal criteria (for a LATER phase)

ADMIN_KEY may be fully retired from the gate when **all** hold:

- [x] No client file references the key (Phase 3D).
- [x] All client mutations succeed via session cookie (Phases 3C-1…5).
- [x] AUTOMATION_KEY support exists in the gate (Phase 3B).
- [ ] AUTOMATION_KEY is **provisioned in production** and proven for all
      external/manual tooling.
- [ ] ADMIN_KEY has been **rotated** to a fresh value (invalidating any
      previously-exposed copy) **and** production has run on session auth
      cleanly for at least a few days.
- [ ] Invite/password-reset flow is in place (so admins never type passwords
      and session auth is the complete path —
      [AUTH_INVITE_RESET_PLAN.md](AUTH_INVITE_RESET_PLAN.md)).
- [ ] Login rate limiting in place (already shipped in Phase 2 P4).

Then a separate, explicit "ADMIN_KEY gate removal" commit can drop
`env.ADMIN_KEY` from the gate and `wrangler secret delete ADMIN_KEY`.

## 8. Next phase recommendation

After a successful Phase-3 deploy:

1. **Provision `AUTOMATION_KEY`** in production (`wrangler secret put`).
2. **Verify the deploy checklist** above (every box).
3. **Rotate `ADMIN_KEY`** to a fresh value once session auth has run cleanly
   in production. Update any local tooling notes accordingly.
4. **Build invite / password-reset** flow per [AUTH_INVITE_RESET_PLAN.md](AUTH_INVITE_RESET_PLAN.md).
5. **Fix the empty-`courseAccess` semantics** ([] currently stored as NULL =
   all-access; see Phase 2 hardening notes Section 1).
6. **Expand course scoping**: by-id reads and mutation-level course
   enforcement (Phase 2 hardening notes Sections 3, 4).
7. **When all of the above hold**, schedule the explicit "ADMIN_KEY gate
   removal" phase using the criteria in Section 7.
