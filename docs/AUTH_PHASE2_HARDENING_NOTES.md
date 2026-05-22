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
- **Fix later:** distinguish "unset/NULL = all" from "explicit empty = none" at
  the API layer (e.g. store `[]` literally, or add an `all_courses` boolean).

## 2. Course-scope enforcement is read-side and partial
- **Enforced reads (P3):** condition-logs, moisture, sprays, inventory,
  equipment, nutrition, cultural-practices, disease, water-balance,
  weather/history, weather/current, crew-assignments, operations-notes,
  calendar-events, and `/api/courses` filtering.
- **Deferred endpoints:** `/api/weather/observations`, `/api/weather/capture`
  (automation/cron surfaces), `/api/users`, `/api/attachments`,
  `/api/pilot-feedback`, `/api/schedule-templates`, `/api/employee-schedules`,
  `/api/crew-employees`, `/api/alerts`. Add as needed in a later pass.

## 3. By-id course-access reads are not guarded
- **What:** `GET /api/<resource>/:id` fetches a single record by id without a
  course-access check. A restricted user who knows an id could read a record
  from a course they're not assigned to.
- **Impact:** low — ids are opaque and not enumerated to restricted users; the
  list endpoints (their normal discovery path) are scoped.
- **Fix later:** load the row, compare `row.course_id` via
  `actorCanAccessCourse`, return 404/empty if denied. Apply per-resource.

## 4. Mutation-level course enforcement is deferred
- **What:** P2 enforces *permission* on mutations; it does **not** check that
  the mutated record belongs to a course the actor may access. A restricted
  user with, say, `canEditMoisture` could in principle write to another
  course's data by passing its `courseId`.
- **Impact:** low today — restricted roles (crew/crew_lead) have few edit
  permissions, and the only multi-course actors (owner/super) are unrestricted.
- **Fix later:** in the gate or handlers, validate the body/record `courseId`
  against `actorCanAccessCourse` for restricted actors on mutations.

## 5. Invite / password-reset not implemented
- Admin still types a temporary password on user creation; no self-service
  reset. Full design in [AUTH_INVITE_RESET_PLAN.md](AUTH_INVITE_RESET_PLAN.md).

## 6. Password policy not configurable
- **What:** the only rule is min-length 8 (bootstrap, user-create, set-password
  would share it). No complexity/rotation/breach-check, no per-org config.
- **Fix later:** a small `validatePassword()` helper with configurable rules;
  apply uniformly at every password entry point.

## 7. ADMIN_KEY removal not complete
- The client still ships `ADMIN_KEY` and the 16 stores mutate with it, capping
  the value of P1–P4. Retirement is staged in
  [ADMIN_KEY_RETIREMENT_PLAN.md](ADMIN_KEY_RETIREMENT_PLAN.md).

## 8. Rate-limit scope is login-only
- **What:** `auth_attempts` throttles `/api/auth/login`. Reset-request (when
  built) should share it; other endpoints have no rate limiting.
- **Fix later:** extend the same window/threshold helper to reset-request and
  any future high-abuse endpoints.

---

### Suggested priority for the next hardening phase
1. ADMIN_KEY retirement (Sections 7 / retirement plan) — unlocks the full
   value of the Phase-2 server enforcement.
2. Invite/reset (Section 5) — removes admin-typed passwords; needed before
   ADMIN_KEY can be the sole path.
3. Empty-`courseAccess` semantics (Section 1) — small, removes a footgun.
4. By-id + mutation course enforcement (Sections 3, 4) — completes course
   isolation once multi-course usage grows.
