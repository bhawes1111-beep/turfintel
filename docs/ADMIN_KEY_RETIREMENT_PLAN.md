# ADMIN_KEY Retirement Plan

Status: **PLAN ONLY (not started).** Produced in Auth Phase 2, Commit 5.
ADMIN_KEY remains fully valid today and is NOT removed by this document.

## 1. Current role of ADMIN_KEY

`ADMIN_KEY` (value tracked in project memory; sent as the `x-admin-key`
header) is the original mutation credential:

- **Client:** `src/utils/auth/mutationAuth.js` exports `ADMIN_KEY` and the
  `mutationHeaders()` / `adminKeyHeader()` helpers used by ~16 stores on every
  POST/PATCH/DELETE.
- **Server:** `worker/lib/auth.js#requireAdminKey` validates it against
  `env.ADMIN_KEY`. In the Phase-2 gate it resolves to a **synthetic
  owner_admin automation actor** (`worker/lib/actor.js`) that passes every
  permission and course check.
- **Cron / internal:** the scheduled weather capture + water-balance rollup
  and any internal tooling rely on it.

## 2. Why it still exists

Phase 1 and Phase 2 deliberately layered session auth **alongside** the key so
nothing broke:

- The 16 client stores still authenticate with the key — they have **not**
  been migrated to session-cookie mutations yet.
- It is the guaranteed **fallback** that prevents Owner/Admin lock-out while
  the session/permission system is proven in production.
- Cron and internal automation have no session cookie and need a credential.

## 3. Risks of the hardcoded client ADMIN_KEY

- **It ships in the public bundle.** The key is readable by anyone who opens
  the deployed JS — "obscurity, not security" (the file itself says so).
- Any visitor can therefore craft owner_admin-equivalent mutations directly
  against the API, fully bypassing the new per-permission and course-scope
  enforcement.
- It cannot be rotated without redeploying the frontend.
- It is a single shared secret with no per-user attribution (audit/blame is
  impossible).

**Net:** the Phase-2 server-side hardening (P1–P4) is real, but its benefit is
capped while a public master key exists. Retiring the *client* key is the
payoff step.

## 4. Phased removal from frontend stores

Migrate the ~16 stores from `x-admin-key` to **session-cookie** mutations
(`credentials: 'same-origin'`, no key header). Do it incrementally so a
regression is isolated to one vertical at a time.

1. **Pre-req:** confirm production users exist for everyone who mutates, with
   correct roles/permissions (so session mutations actually pass the gate).
2. **One store at a time:** drop `mutationHeaders()` → send credentials only.
   Verify that vertical end-to-end against a logged-in session of the intended
   role. Order from lowest-risk (e.g. pilot-feedback, disease) to highest
   (sprays, inventory, condition-logs).
3. Keep `ADMIN_KEY` accepted server-side throughout this stage — a half-migrated
   app still works because the gate accepts **either** credential.
4. When all stores are migrated, the client no longer references `ADMIN_KEY`.

## 5. Migration to session-cookie mutations

- The gate already accepts a session cookie for mutations and enforces
  per-route permissions (Phase 2 P2) + course scope (P3). No server change is
  needed to *accept* session mutations — only the client must stop sending the
  key.
- `mutationAuth.js` shrinks to nothing (or a no-op `credentials` helper).
  Remove the exported `ADMIN_KEY` constant from the client entirely.
- Multipart/attachment uploads (`adminKeyHeader()`) switch to relying on the
  session cookie too.

## 6. Server-only automation key

**IMPLEMENTED in Phase 3B.** `worker/lib/auth.js#requireAdminKey` now accepts
the `x-admin-key` header matching EITHER `env.ADMIN_KEY` OR `env.AUTOMATION_KEY`;
both resolve to the synthetic owner_admin automation actor.

- `AUTOMATION_KEY` is a Worker **secret only** — never imported under `src/`,
  never in the browser bundle. For internal / manual server-side tooling
  (remote verification scripts, maintenance ops).
- **Provision (server-side, run when deploying Phase 3):**

  ```
  npx wrangler secret put AUTOMATION_KEY
  ```

- Clarification (corrected from the original draft): **cron does NOT use any
  key.** The `scheduled()` handler calls `captureWeatherForAllCourses(env)` /
  `rollupAllCourses(env)` directly in-process — no HTTP request, no
  `x-admin-key`. So cron is unaffected by ADMIN_KEY retirement entirely; the
  automation key exists for *external* HTTP tooling, not the scheduled job.
- Future option: narrow `AUTOMATION_KEY` authority to specific routes rather
  than full owner_admin, so a leak is lower-impact.

## 7. Key rotation plan

1. Provision the new server-only `AUTOMATION_KEY` (`wrangler secret put`).
2. Point cron/internal tooling at it; verify capture + rollup still run.
3. Once the frontend no longer sends the old `ADMIN_KEY` (Section 4 complete)
   **and** automation uses the new key, **rotate** (set a fresh value) so any
   previously-exposed value is dead.
4. Keep both valid only for the brief overlap; then drop the old one.

## 8. Final removal criteria

ADMIN_KEY (the public/client one) may be fully retired when **all** hold:

- [ ] Every client store mutates via session cookie; no `ADMIN_KEY` reference
      remains in `src/`.
- [ ] All production users who need to mutate have correct roles/permissions.
- [ ] Cron + internal automation run on the separate server-only
      `AUTOMATION_KEY`.
- [ ] A full smoke + production verification of every vertical passes using
      session auth only.
- [ ] The old key has been rotated to a new value (invalidating the exposed
      one) and then removed from the gate's accepted credentials.
- [ ] Login rate limiting + (ideally) invite/reset are in place so session
      auth is the sole, complete path.

Until every box is checked, ADMIN_KEY stays — removing it early risks locking
out the app or breaking cron.
