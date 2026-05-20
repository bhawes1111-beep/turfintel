# TurfIntel — Offline / Weak-Signal Readiness

_Phase 32. **We are NOT implementing offline support yet.** This document
identifies which workflows degrade badly on weak signal, which stores will
need caching later, and which forms need optimistic buffering — so the
eventual offline phase has a ready map._

Reality at a golf course: dead zones behind tree lines, in low spots, in the
shop, and out at the far holes. A superintendent on a phone WILL hit weak or
no signal mid-task.

---

## How data flows today

- **D1-backed stores** (`assignmentsStore`, `spraysStore`, `equipmentStore`,
  `calendarStore`, `repairsStore`, `crewStore`, `feedbackStore`,
  `notesStore`, `schedulesStore`, …) all follow the same pattern:
  `useSyncExternalStore` + a single `fetch` on first subscribe, kept in a
  module-level cache **in memory only**. On fetch failure they set
  `{ error }` and keep whatever was last in memory (initially empty arrays).
  **Nothing is persisted to localStorage**, so a reload on weak signal =
  empty screen.
- **Mutations** are mostly optimistic-in-memory then confirmed against the
  server; on failure they re-fetch to recover truth. The optimistic update is
  **not durable** — a refresh before the network recovers loses it.
- **Persisted today** (localStorage): course scope, geo/KML imports, app
  prefs, and the weather cache (`weather/api.js`). Weather already has a
  stale-fallback path (`isStale`, `PLACEHOLDER_*`).

## Workflows that fail badly on weak signal

| Workflow | Failure mode | Severity |
|---|---|---|
| **Morning assignment** (assign operator/equipment) | Each create/patch is a live request; on weak signal the toast errors and the row reverts. Reload = empty board. | **High** |
| **Log feedback** (Phase 31) | POST fails → note lost (only an error toast). The whole point is capturing in the field, often the worst-signal place. | **High** |
| **Spray record commit** | Multi-product deduction is several live calls (`Promise.allSettled`); partial network loss = partial commit. | **High** |
| **Mark task / update assignment** | Live PATCH; silent revert on failure. | **Medium** |
| **Add moisture / irrigation reading** (if added) | Live POST; same loss risk as feedback. | **Medium** |
| **Display Board (crew view)** | Read-only; if it loads once it's fine, but a cold open in a dead zone shows nothing. | **Medium** |
| **Dashboard intelligence** | Recomputes from in-memory stores; degrades to `unknown` honestly, but a cold load with no network = empty. | **Low** (already degrades honestly) |

## Stores that need caching later (priority order)

1. **assignmentsStore** — the morning-critical one. Cache last good
   `crewAssignments` + `equipmentReservations` per course in localStorage so a
   reload in a dead zone still shows the board.
2. **calendarStore** — tasks drive the assignment board and Display Board;
   cache today's events.
3. **feedbackStore** — small, and the capture moment is often offline. Cheap
   to cache + buffer.
4. **spraysStore** — needed for spray intelligence + records.
5. **equipmentStore / crewStore** — slowly-changing reference data; ideal
   cache candidates (low churn, high read).

Pattern to adopt later: a tiny `localStorage` read-through layer keyed by
`courseId` (the `storageAdapter` / `persistence` helpers already exist in
`src/utils/` and could back this).

## Forms that need optimistic buffering later

These should queue the mutation locally and replay when the network returns,
rather than erroring and dropping the input:

- **Log Feedback** (Phase 31) — highest value; capture must never be lost.
- **Crew assignment create/patch/clear** — buffer the intent, reconcile on
  reconnect.
- **Spray record commit + inventory deduction** — needs care: deductions must
  not double-apply on replay (the Worker already dedupes some by
  `source_id`; lean on that).
- **Moisture / quick readings** (when added) — append-only, easy to buffer.

## What's intentionally out of scope right now

- No service worker / app-shell caching.
- No IndexedDB queue.
- No background sync.
- No conflict-resolution UI.

The eventual offline phase should start with **read-through localStorage
caching for assignments + calendar** (kills the "empty board on reload" cliff)
and **a durable buffer for Log Feedback** (cheap, high-value), then expand.
