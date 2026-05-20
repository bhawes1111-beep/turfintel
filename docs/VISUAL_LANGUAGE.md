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
