# TurfIntel — Visual Operations Language

_Phase 34. The single source of truth for operational color, icon, and chip
meaning. Goal: a crew member understands assignment, routing, equipment,
delays, and weather/course impact **at a glance, without verbal
clarification.**_

This document **reconciles the color systems that already exist** rather than
inventing a new one. There are two palettes by design — indoor dashboard vs.
outdoor crew board — because contrast needs differ in sunlight.

---

## 1. Two contexts, two palettes

| Context | Where | Palette goal |
|---|---|---|
| **Indoor / dashboard** | Operational Command, intelligence cards, Settings | Muted, low-glare, dense-layout friendly |
| **Outdoor / crew board** | Display Board, mobile field views | Saturated, high-contrast, distance + sunlight readable |

The *meaning* of a severity is identical across both; only the saturation
changes. Never assign a color a different meaning between contexts.

## 2. Severity colors (canonical meaning)

| Meaning | Indoor (`severity.js`) | Outdoor (Display Board) | Use for |
|---|---|---|---|
| **Critical / blocked** | `#e07070` | `#ef4444` (bg) | Stop-work, blocked task, freeze, lightning |
| **Caution / warning / delayed** | `#d4883a` | `#fbbf24` | Delays, advisories, "confirm before proceeding" |
| **Good / complete / info** | `#4ecb4e` | `#4ade80` | Completed, all-clear, normal |
| **Neutral / assigned** | `--color-text-muted` | `rgba(255,255,255,.12)` outline | Default, not-yet-started |
| **Weather (informational)** | — | `#38bdf8` (sky blue) | Weather notices, irrigation-active |

Rules:
- **Red = stop / blocked / critical.** Never decorative.
- **Amber = caution / delayed / advisory.** The "pay attention" tier.
- **Green = good / done.** Also the brand accent — keep "done" unambiguous
  (we also strike-through completed crew rows so it doesn't rely on color
  alone; see §5 colorblind).
- **Sky blue = weather/water**, kept distinct from the red/amber/green
  severity ramp so it never reads as an alarm.

## 3. Operational state colors (assignment progress — Phase 33)

| State | Chip | Color | Row treatment |
|---|---|---|---|
| Assigned | `○` | neutral outline | normal |
| Completed | `✓` | green `#4ade80` | dim + strike-through |
| Delayed | `◷` | amber `#fbbf24` | name tinted amber |
| Blocked | `⚠` | red `#ef4444` | name tinted red |

## 4. Routing & mowing icons (Phase 34, P1)

Rendered from the existing `event.tags[]` array (no schema change). Tags are
matched case-insensitively; unknown tags are ignored (no clutter). Each tag
maps to a compact chip: an icon + minimal label, toned per §2.

| Tag (any of) | Icon | Label | Tone |
|---|---|---|---|
| `mow-ns`, `mow-northsouth` | `↕` | N–S | neutral |
| `mow-ew`, `mow-eastwest` | `↔` | E–W | neutral |
| `mow-diagonal`, `mow-diag` | `⤢` | Diagonal | neutral |
| `cleanup` | `↻` | Cleanup | neutral |
| `no-cleanup`, `nocleanup` | `⊘` | No cleanup | neutral |
| `double-cut`, `doublecut` | `⇈` | Double-cut | neutral |
| `roll`, `rolling` | `⛳` | Roll | neutral |
| `skip` | `⏭` | Skip | caution |
| `closed`, `hole-closed` | `⛔` | Closed | critical |
| `frost`, `frost-delay` | `❄` | Frost delay | caution |
| `handwater`, `hand-water` | `🖐💧` | Handwater | weather/blue |
| `irrigation`, `irrigation-active` | `💧` | Irrigation | weather/blue |

Rules:
- **Icon + 1–2 word label** — never a sentence. Replaces prose, doesn't add to it.
- **Cap visible chips** so a card never becomes an icon wall (overflow shown
  as `+N`).
- Direction arrows are the highest-value glance signal — they render first.

## 4b. Tag authoring (Phase 35)

Tags are added through the **TagPicker** (`src/components/routing/TagPicker.jsx`)
on the **Operations Board → Add Task** form. The picker writes canonical
values into the task's `tags[]`, which flow to the calendar event via
`ensureEventForTask` → Worker → Display Board. No schema change, no tag table.

**Single source of truth:** the picker options and presets are derived from
`TAG_DEFS` in `routingTags.js` (exported as `ROUTING_TAG_OPTIONS` and
`ROUTING_PRESETS`). Add a tag once in `TAG_DEFS` and it appears in both the
authoring picker and the board renderer automatically. The smoke test
(`scripts/smoke-routing-tags.mjs`) asserts every option round-trips through
the parser and every preset references a valid option.

### Allowed stored values (canonical)
The value written to `tags[]` is the first match alias of each def:
`mow-ns`, `mow-ew`, `mow-diagonal`, `double-cut`, `cleanup`, `no-cleanup`,
`roll`, `skip`, `closed`, `frost`, `handwater`, `irrigation`.
The parser also accepts case/separator variants on read (e.g. `Mow_NS`,
`MOW-EW`), but the picker always stores the canonical form.

### Presets (additive, never destructive)
Applying a preset **merges** its tags into the current selection (deduped);
it never clears existing tags. Direction-bearing presets default to N–S — the
user toggles to E–W after applying.

| Preset | Tags applied |
|---|---|
| Greens Mow | `mow-ns` + `cleanup` |
| No Cleanup | `mow-ns` + `no-cleanup` |
| Rolling | `roll` |
| Double-Cut | `double-cut` |
| Frost Delay | `frost` |
| Closed Area | `closed` |
| Handwater | `handwater` |
| Irrigation | `irrigation` |

### Preview
The picker shows a **live Board preview** rendered with the *same*
`routingChipsFromTags()` the Display Board uses — what the author sees is
exactly what the crew sees. No separate preview renderer to drift.

### Where tags appear
Authored on the Operations Board → persisted on the calendar event →
rendered as chips on **Display Board** task cards (Phase 34). Other event
views read the same `event.tags[]`; any future surface should reuse
`routingChipsFromTags()` rather than re-implement.

## 5. Chip patterns

- **Equipment chips**: machine name, status-tinted (reserved = amber, in-use =
  blue, normal = neutral). Existing.
- **Routing chips**: §4. New this phase.
- **Status chip**: §3. One per crew row, right-aligned.
- Chips are pills: rounded, bordered, high-contrast text. Min touch target
  ~36px on interactive chips (status); display-only chips can be smaller.

## 6. Colorblind & accessibility

~8% of male crew have red/green color vision deficiency — critical for a
crew-facing board. Therefore **color is never the only signal:**
- Completed = green **+ strike-through** (redundant encoding).
- Blocked = red **+ ⚠ glyph + tinted name**.
- Delayed = amber **+ ◷ glyph**.
- Routing tags = icon **+ text label**, never color alone.
- Closed hole = ⛔ **+ "Closed"** label.

## 7. What to avoid (P6)

- No decorative color. Every color carries operational meaning from this doc.
- No icon overload — cap chips per card.
- No tiny text on the board (board mode bumps base font to 16px).
- No new color outside this palette without adding it here first.

---

## Glanceability targets (P5)

These are the bars the visual language must clear:
- **Crew identifies their assignment in < 3 s** — name + equipment + routing
  chips, no prose scan.
- **Superintendent spots blocked tasks instantly** — red ⚠ + tinted name
  visible across a room.
- **Routing changes understood without explanation** — direction arrows +
  closed/skip icons replace verbal briefing.

Test on: phone outdoors, tablet landscape, at distance, under glare, and with
a colorblind-simulation check. Capture failures via the Phase 31 Pilot
Feedback flow (category `display board` or `confusing`).
