# TurfIntel — Crosswinds Pilot Workflow

_Phase 30. A simple daily loop to use TurfIntel for real at Crosswinds and
capture honest friction. The goal is trust and usability feedback, not
feature validation._

---

## Phase 31 update — in-app feedback capture

Friction notes no longer need a paper table. A **Log Feedback** button now
lives in the Dashboard → Operational Command panel (top-right of the Morning
Readiness strip). One tap → pick a category → type a note → Save. It
auto-captures the page context and timestamp, and is scoped to the active
course.

Triage what you captured in **Settings → Pilot Feedback**: filter by status
and move each item through `new → reviewed → fixed / ignored`.

The four-column paper table further down still works if you prefer it, but the
in-app capture is faster on mobile and feeds the review screen directly.

### Pilot day checklist

**Morning**
- [ ] Check Operational Command (readiness → priorities → next 12h).
- [ ] Verify weather + intelligence cards show live data (not placeholder).
- [ ] Build crew assignments.
- [ ] Assign equipment.
- [ ] Review the display board on the shop screen.
- [ ] Log any friction as you go (don't wait until you forget).

**Midday**
- [ ] Note irrigation / wilt issues vs. what you see on the course.
- [ ] Check spray + weather intelligence if a spray is planned.
- [ ] Log friction.

**End of day**
- [ ] Review what helped (which priorities caught something real?).
- [ ] Review what you ignored (and why — that's signal too).
- [ ] Log follow-up notes.
- [ ] Skim Settings → Pilot Feedback; mark anything already addressed as `fixed`.

---

## The daily loop

### 1. Morning command review (5 min, before crew arrives)
- Open **Dashboard → Operational Command** (top panel).
- Read top to bottom: Morning Readiness strip → Top Priorities → Next 12 Hours.
- Decide the day's top 1–3 calls (delay mowing? hold irrigation? move a spray?).
- Cross-check **Spray Window** and **Irrigation Intelligence** cards only if a
  priority points you there.

### 2. Assignment board (10 min)
- Assign crew to today's tasks.
- Watch for Operational Command flags: heavy load (≥4 tasks/person), equipment
  double-booking, routing conflicts (spray vs mow on same area).

### 3. Display board (set once, leave up)
- Put the display board on the shop screen for the crew.
- Confirm it's readable at a glance from across the room.

### 4. Spray import (as needed)
- Import a label / planned spray.
- Confirm it shows up in Spray Window Intelligence and (if planned today) in
  Operational Command priorities.

### 5. Irrigation intelligence (midday check)
- Glance at wilt risk + tonight's recommendation.
- Confirm it matches what you actually see on the course.

### 6. Operational notes (end of day)
- Log what happened, what changed, what you overrode.

---

## What to capture each day

Keep it to four columns. One line each is fine.

| Date | What slowed me down | What was confusing | What saved time | Crew couldn't understand |
|------|---------------------|--------------------|-----------------|--------------------------|
|      |                     |                    |                 |                          |

### Prompts to make the notes useful
- **Slowed me down**: clicks that felt like too many, data I had to re-enter,
  anything I waited on.
- **Confusing**: a warning I didn't trust, a severity label that didn't match
  my gut, an "unknown" that annoyed instead of helped.
- **Saved time**: a priority that caught something I'd have missed, a conflict
  flagged before it bit me.
- **Crew couldn't understand**: anything on the display board or assignment
  board that needed me to explain it.

---

## Specifically watch for (ties back to the audits)

- **Duplicate warnings**: does the same risk appear in both the compact card
  AND Operational Command in a way that feels redundant? Note which.
- **Noise vs. signal**: did urgent items stay at the top, or did low-value info
  crowd them out?
- **Why-clarity**: every warning should say *why*. Flag any that don't.
- **Severity wording**: did "caution / warning / critical" map to how urgent it
  actually felt? (Known: irrigation card uses its own `high/elevated/caution`
  wording internally — see audit notes. Watch whether that wording confuses.)
- **Honest unknowns**: when data was missing (no calendar, no crew assignments,
  weather down), did the dashboard stay calm or throw false alarms?

---

## After the pilot (1–2 weeks)

- Roll the four-column notes into a short list: top 3 friction points, top 3
  wins, anything the crew flat-out couldn't use.
- Decide which are quick clarity fixes (Phase 30-style) vs. real feature work
  (a later phase). Don't expand scope mid-pilot.
