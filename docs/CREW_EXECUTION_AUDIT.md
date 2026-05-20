# TurfIntel — Crew Execution & Display Board Audit

_Phase 33. Moving TurfIntel from superintendent-facing toward crew-facing
daily execution. Findings half of the phase; the built change is scoped
separately (see end)._

Success target: a crew member sees their assignment + equipment, understands
routing and weather/course impacts, and can mark progress — with minimal
explanation from management.

---

## Display Board today (what's there)

A 3-column briefing wall ([DisplayBoard.jsx](../src/pages/DisplayBoard/DisplayBoard.jsx)):
sidebar (brand / clock / conditions / equipment status) · task-card grid ·
notes column. Read-only, auto-refreshes every 3 min, has a board (TV) mode.
Sources real verticals: calendar events, crew assignments, equipment
reservations, sprays, daily notes, attachments.

## Crew usability findings (P1)

### What works
- Task cards already show title, time, location, equipment chips, and crew
  rows with per-operator equipment — the core "who / what / where / which
  machine" is present.
- Daily notes already support `urgent / safety / weather / important` tones.
- Auto-refresh + a "Synced HH:MM" line already address basic staleness.

### Gaps (ranked by crew impact)
1. **No progress visibility/marking.** `crew_assignments.status` exists but the
   board never shows or lets anyone set done/delayed/blocked. Crew can't
   communicate progress; supervisors can't see it at a glance. → **Built this
   phase (P2).**
2. **Urgent comms are buried** in the right-hand notes column, not a top
   banner. A frost delay or hole closure isn't glanceable across a shop.
   → Deferred (P3): elevate urgent/weather/safety notes to a dismissable
   banner. Schema-free (reuses daily notes).
3. **Routing/direction is prose.** Mowing direction, cleanup, rolling, hole
   closures live in `event.description` text. `event.tags[]` exists in the data
   model but **nothing renders it.** → Deferred (P4): render tags as compact
   icons/chips (↕ direction, cleanup, roll, closed). Schema-free.
4. **Wordiness.** Cards lean on description paragraphs; crew scan for name +
   equipment + location. Tightening follows naturally from P4 (icons replace
   prose).
5. **Outdoor readability.** Dark theme is low-contrast in direct sun; muted
   crew text is the worst offender. → Larger change; deferred. (P2's status
   colors were chosen high-contrast as a down payment.)

## Reliability notes (P6 — audited, not built)
- Assignment saves are optimistic with re-fetch-on-failure (good), but no
  per-row "saving/saved" confirmation. Accidental double-taps possible.
- The board has a sync timestamp; individual cards don't show last-updated.
- See [OFFLINE_READINESS.md](../OFFLINE_READINESS.md) for weak-signal risks
  (in-memory-only stores, lost mutations on reload).

## P5 — crew pilot capture
No new system needed: friction goes into the **Phase 31 Pilot Feedback**
flow (Log Feedback button on the dashboard → Settings → Pilot Feedback).
Recommend tagging crew-pilot notes with the `display board`, `assignment`,
`confusing`, or `mobile` categories so they cluster for review.

---

## Built this phase: P2 — Assignment completion flow

On each Display Board task card, every real crew row now has a **status chip**
(○ assigned / ✓ complete / ◷ delayed / ⚠ blocked). Tap it → a small picker
sets the status in one more tap (two taps total) and accepts an optional quick
note. Optimistic via the existing `patchCrewAssignment(id, { status, notes })`
— **no schema change**. Completed rows dim + strike through; blocked/delayed
tint the name. Colors are high-contrast for sunlight.

Fallback rows sourced from `event.assignedStaff[]` (no DB row) intentionally
don't get the control — there's nothing to patch.

### Deferred (documented, not built), per "additive only / no giant redesign"
- **P3** urgent/weather/condition banner (reuses daily notes).
- **P4** routing/direction icons from `event.tags[]`.
- **P6** per-row last-updated + saving confirmation; sunlight mode.

These are clean, schema-free follow-ups. The real crew pilot (P5) should tell
us which matters most before we build more.
