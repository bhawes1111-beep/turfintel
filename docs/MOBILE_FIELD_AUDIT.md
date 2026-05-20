# TurfIntel — Mobile Field Workflow Audit

_Phase 32. On-course, phone-first usability audit. Goal: get the
superintendent through morning review → assign crew → check risk → log a
problem in under 5 minutes on a phone. This is the findings half of the
phase; the code changes are scoped separately._

Audited surfaces: Dashboard, Operational Command, Daily Assignment Board,
Display Board, Spray, Irrigation, Feedback capture.

---

## What's already good (don't touch)

- **Operational Command** is the right morning anchor — readiness strip,
  priorities, 12h timeline all above the fold. Phase 31 added one-tap Log
  Feedback here.
- **Assignment Board already reflows to cards** at ≤760px (`thead` hides,
  rows become single-column grids). It is NOT a raw table on mobile.
- **Copy Yesterday** already exists — the big duplicate-assignment win is
  done.
- **Quick-assign category chips** (Greens/Tees/Fairways/…) already filter the
  task dropdown to cut scrolling.

## High-friction findings

### F1 — Assignment is a per-row dropdown, reopened for every operator
Each operator row has its own `<select>`. Assigning 12 operators = 12 dropdown
opens, each scrolling the full day's task list (the category chips help but
don't eliminate it). **Taps to assign one operator + equipment: ~5**
(open dropdown → scroll → pick → tap Equipment → pick in modal → close).
- _Opportunity:_ "recently used task" shortcuts per row, or tap-to-assign the
  most-likely task without opening the select.

### F2 — Equipment is always a separate modal
Equipment is a second step behind a modal for every operator
([DailyAssignmentBoard.jsx:679-690](../src/pages/Crew/tabs/DailyAssignmentBoard.jsx#L679)).
Modal stacking on a phone = lost context + extra taps.
- _Opportunity:_ "recently used equipment" quick-chips inline on the row so
  common machines attach without opening the modal.

### F3 — Dashboard Quick Actions are navigation, not actions
[QuickActions.jsx](../src/pages/Dashboard/QuickActions.jsx) mostly does
`navigate('/x')` ("New Spray Record" just opens the Spray page). On a phone
that means: scroll to the card → tap → land on a full page → find the real
control. Real quick actions (add note, log issue, mark task complete) should
happen in place.
- _Opportunity:_ a small in-place quick-actions layer (the Log Feedback
  button is the proof-of-pattern).

### F4 — Display Board has no crew-language support
No i18n / translation anywhere on the board. "Translation readability" can't
exist yet because there's no translation. Breakpoints stop at 600px and there
is **no landscape-orientation handling** — a shop screen mounted landscape on
a phone/tablet isn't specifically optimized.
- _Opportunity (later):_ a simple per-board language toggle (EN/ES) for the
  fixed labels; landscape CSS. Not this phase unless explicitly scoped.

### F5 — Outdoor readability
Theme is dark-green on near-black (`--color-bg: #0d1a0d`). Great indoors,
**low contrast in direct sun**. Muted text (`--color-text-muted: #7a9e7a`)
on dark is the worst offender for glance-reading outside.
- _Opportunity (later):_ a high-contrast / "sunlight" mode. Larger change —
  flagged, not done here.

### F6 — Scroll depth to reach secondary intelligence
On a phone the intelligence row stacks, so Spray Window / Irrigation cards sit
well below the fold. The Operational Command priorities already surface the
important bits, so this is minor — but "open spray window" / "open irrigation
detail" are good candidates for the quick-actions layer (F3).

## Slow morning actions (ranked)

1. **Assigning each operator** (F1+F2) — the dominant time sink. ~5 taps ×
   N operators.
2. **Logging a problem mid-round** — pre-Phase-31 required navigating to a
   page; now one tap on the dashboard. Still page-bound elsewhere in the app.
3. **Checking spray/weather risk** — requires scrolling past the fold (F6).

## Tap-count snapshot (phone, today)

| Workflow | Taps today | Target |
|---|---|---|
| Review morning priorities | 1 (open dashboard) | 1 ✓ |
| Assign one operator + equipment | ~5 | ≤3 |
| Check spray risk | 2–3 (scroll + read) | ≤2 |
| Check irrigation pressure | 2–3 (scroll + read) | ≤2 |
| Log a problem | 1 (Phase 31) | 1 ✓ |

## Recommended code work for this phase (tap-reduction first)

- **P2 in-place quick actions** (addresses F3/F6): a small mobile-only action
  row — add note, log issue (reuse feedback), open spray window, open
  irrigation. No floating clutter; one-handed reach.
- **P3 assignment speed** (addresses F1/F2): recently-used task + equipment
  shortcuts so the common case skips the dropdown/modal.
- **P6 lightweight metrics**: record page visits + feedback-category counts
  locally so we can see most-used pages / repeated friction without an
  analytics platform.

Deliberately deferred (too large for an additive mobile pass): F4 translation,
F5 sunlight mode, full landscape redesign.
