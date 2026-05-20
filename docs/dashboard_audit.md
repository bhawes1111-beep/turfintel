# Dashboard Architecture & Responsive Issues Audit

**Date:** 2026-05-16  
**Current Commit:** `bc121e8` (Phase 26B: Mobile Field Workflow Pass)  
**Status:** Functional, minor responsive polish needed

---

## Dashboard Architecture

### Layout Hierarchy

```
Dashboard.jsx
├── Header (title + customize button placeholder)
├── Intelligence Row (2fr / 1fr grid)
│   ├── Left (2fr): WeatherSection
│   │   ├── Alert banners (if present)
│   │   ├── Error banner (if API fails)
│   │   └── Weather Insights Card (glass design)
│   │       ├── Header (icon, title, badges, timestamp, refresh button)
│   │       ├── Main display (emoji + temp + feels like | 6-metric grid)
│   │       ├── Status strip (disease pressure, irrigation tonight, ET today)
│   │       └── Embedded 7-day forecast (horizontal scroll)
│   └── Right (1fr): Stacked agronomy cards
│       ├── Growing Degree Days Card (zone-colored scales)
│       └── Application Effectiveness Card (SVG ring gauge)
├── Operations Calendar (Month/Week/List views + right panel)
└── Card Grid (3-col → 2-col @1100px → 1-col @768px)
    ├── Alerts (wide + tall)
    ├── Quick Actions (full-width)
    ├── Operations Command Section (full-width composite)
    │   ├── Today's Briefing (OperationalSummary)
    │   ├── Action Required (ActionQueue)
    │   └── Scheduling Awareness
    ├── Weather Intelligence (wide, advisory-only)
    ├── Irrigation Intelligence (wide, advisory-only)
    ├── Equipment Alerts
    ├── Recent Activity (full-width)
    ├── Upcoming Applications (wide)
    └── Recent Notes

```

### Core Components

| Component | File | Purpose | CSS Prefix |
|-----------|------|---------|------------|
| Dashboard Shell | `Dashboard.jsx` | Main layout orchestrator | `page`, `header`, `grid` |
| Intelligence Row | `Dashboard.module.css` | 2fr/1fr weather + agronomy grid | `intelligenceRow` |
| Weather Insights | `WeatherSection.jsx` | Unified weather card + 7-day forecast | `ws*` |
| GDD Card | `GDDCard.jsx` | Zone-colored GDD scales | `gdd*` |
| App Effectiveness | `AppEffectivenessCard.jsx` | SVG ring gauge + factors | `ae*` |
| Operations Calendar | `OperationsCalendar.jsx` | Month/Week/List calendar | `oc*` |
| Action Queue | `ActionQueue.jsx` | Priority-grouped action items | `aq*` |
| Operational Summary | `OperationalSummary.jsx` | Today's briefing | `os*` |
| Scheduling Awareness | `SchedulingAwareness.jsx` | Upcoming service/crew items | `sa*` |

### Scroll Model

- **Scroll owner:** `Layout.module.css` `.outlet` (NOT `.page` divs)
- Dashboard page is `display: flex; flex-direction: column; min-height: min-content`
- No `overflow-y: auto` on dashboard page itself
- Individual cards may have internal scroll (e.g., alert list, calendar views)

### Data Sources

**Live D1-backed:**
- Alerts → `useAlertsData()` (alerts store)
- Equipment → `useEquipmentData()` (equipment store)
- Maintenance → embedded in equipment store
- Repairs → `useRepairsData()` (repairs store)
- Sprays → `useSpraysData()` (sprays store)
- Calendar Events → `useCalendarData()` (calendar store)
- Activity Feed → `aggregateAll()` from activity builder

**Live API (no D1):**
- Weather → `useWeather()` hook (NWS/METAR with 15-min cache)

**Computed:**
- GDD → `computeGDDSummary(forecast)` from `gddEngine.js`
- Application Effectiveness → `computeApplicationEffectiveness(current, forecast)` from `applicationEffectiveness.js`
- Irrigation Tonight → `computeIrrigationSummary(current, forecast)` from `irrigationEngine.js`

---

## Current Responsive Issues

### 1. Intelligence Row Cramped at Wide Viewports (>1400px)

**Problem:**
- 2fr/1fr grid works well at 1100px–1400px
- At >1400px, Weather Insights card becomes very wide
- 6-metric grid has excess whitespace
- Embedded forecast cards stretch too wide (min-width 84px doesn't scale up)

**Visual Symptoms:**
- Metrics grid looks sparse
- Forecast cards have large gaps between them
- Right column (GDD + AppEffectiveness) gets squished relative to left

**Recommended Fix:**
- Add `max-width: 900px` to `.intelligenceWeather` so it doesn't grow indefinitely
- Or switch to 3fr/2fr ratio at wide viewports
- Or add a third column at >1600px (Weather | GDD | AppEffectiveness)

### 2. Intelligence Row Collapse at Narrow Viewports (<1100px)

**Problem:**
- Intelligence row switches to 1-column at 1100px breakpoint
- This stacks Weather Insights on top of GDD/AppEffectiveness
- On tablets (768px–1100px), this creates a very tall first section
- User has to scroll past all intelligence cards to reach Operations Calendar

**Visual Symptoms:**
- Long vertical scroll before seeing calendar or action items
- GDD and AppEffectiveness cards sit below the fold on tablets

**Recommended Fix:**
- Keep 2fr/1fr layout down to 900px (not 1100px)
- Only collapse to 1-column at true mobile (<768px)
- Or make GDD/AppEffectiveness horizontally scrollable at tablet widths

### 3. Embedded Forecast Horizontal Scroll Not Obvious

**Problem:**
- 7-day forecast uses `overflow-x: auto` with `scroll-snap-type: x mandatory`
- On desktop, no visible scrollbar (hidden via `::-webkit-scrollbar`)
- Users may not realize they can scroll horizontally

**Visual Symptoms:**
- Only ~4 forecast cards visible at default viewport width
- No visual affordance (fade, arrow, shadow) to indicate more content

**Recommended Fix:**
- Add a fade-out gradient on the right edge when scrollable
- Or add subtle left/right arrow buttons
- Or show scrollbar on hover (`:hover::-webkit-scrollbar { display: block }`)

### 4. Card Grid "full" Modifier Not Truly Full-Width

**Problem:**
- `DashboardCard` accepts a `full` prop intended for full-width cards
- But `full` class applies `grid-column: span 3` (hard-coded)
- At tablet (2-col grid), this still spans 3 columns → breaks layout

**Current Code (Dashboard.module.css line ~230):**
```css
.grid :global(.card-full) {
  grid-column: span 3;
}
```

**Visual Symptoms:**
- Full-width cards (Quick Actions, Recent Activity) break at 2-col layouts

**Recommended Fix:**
```css
.grid :global(.card-full) {
  grid-column: 1 / -1; /* span all columns regardless of grid */
}
```

### 5. Operations Command Section Not Responsive

**Problem:**
- `.opsSection` is a composite container with 3 sub-cards (Briefing, Action Queue, Scheduling)
- At mobile (<768px), it spans 1 column but the internal cards don't stack
- Internal cards have no responsive layout

**Visual Symptoms:**
- Tiny cards side-by-side at mobile widths
- Text overflow, cramped spacing

**Recommended Fix:**
- Add internal flex-direction switch:
```css
@media (max-width: 768px) {
  .opsSection {
    flex-direction: column; /* already exists, but verify internal cards */
  }
  .opsSection > * {
    min-width: 100%; /* force stacking */
  }
}
```

### 6. Weather Insights Card: Metric Grid Breaks at Mobile

**Problem:**
- `.wsMetricsGrid` is a 3-column grid (3×2 layout)
- At mobile (<500px), 3 columns become unreadable
- Metric labels are 9px uppercase — too small on phones

**Visual Symptoms:**
- Squished metric values
- Horizontal overflow on narrow phones

**Recommended Fix:**
```css
@media (max-width: 500px) {
  .wsMetricsGrid {
    grid-template-columns: repeat(2, 1fr); /* 2×3 layout */
  }
  .wsMetricLabel {
    font-size: 10px; /* slightly larger */
  }
}
```

### 7. Embedded Forecast Cards Too Narrow at Mobile

**Problem:**
- `.wsEmbFcastCard` has `min-width: 84px`
- At mobile, cards become tiny
- Icon + high/low + rain text all crammed

**Visual Symptoms:**
- Unreadable forecast details
- User has to squint

**Recommended Fix:**
```css
@media (max-width: 768px) {
  .wsEmbFcastCard {
    min-width: 100px; /* wider at mobile */
  }
}
```

---

## Files Involved

### Primary Files (Editing Required)

| File | Lines | Recommended Changes |
|------|-------|---------------------|
| `src/pages/Dashboard/Dashboard.module.css` | ~200 | Fix `.intelligenceRow` breakpoint (1100px → 900px), fix `.grid :global(.card-full)` to `1 / -1` |
| `src/pages/Dashboard/WeatherSection.module.css` | ~450 | Add mobile breakpoints for `.wsMetricsGrid` (3-col → 2-col), `.wsEmbFcastCard` (84px → 100px), add horizontal scroll affordance |
| `src/pages/Dashboard/WeatherSection.jsx` | ~220 | Add fade gradient or scroll arrows for embedded forecast |

### Secondary Files (Validation)

| File | Lines | Check |
|------|-------|-------|
| `src/pages/Dashboard/GDDCard.module.css` | ~150 | Verify scales don't break at narrow widths |
| `src/pages/Dashboard/AppEffectivenessCard.module.css` | ~120 | Verify SVG gauge remains centered at mobile |
| `src/pages/Dashboard/OperationsCalendar.module.css` | ~600 | Already has mobile breakpoints; verify no conflicts |
| `src/components/shared/DashboardCard.module.css` | ~80 | Verify `wide`, `tall`, `full` modifiers work at all breakpoints |

### Untouched (Already Responsive)

- `ActionQueue.jsx` / `.module.css` — mobile-tested in Phase 26B
- `OperationalSummary.jsx` / `.module.css` — already responsive
- `SchedulingAwareness.jsx` / `.module.css` — already responsive
- `QuickActions.jsx` / `.module.css` — simple flex layout, works everywhere

---

## Recommended Fixes (Priority Order)

### Priority 1 — Functional Breakage (30 min)

1. **Fix `.card-full` grid span**
   - File: `Dashboard.module.css`
   - Change: `grid-column: span 3` → `grid-column: 1 / -1`
   - Impact: Fixes Quick Actions + Recent Activity at tablet widths

2. **Fix Weather Metrics Grid at mobile**
   - File: `WeatherSection.module.css`
   - Add: `@media (max-width: 500px) { .wsMetricsGrid { grid-template-columns: repeat(2, 1fr); } }`
   - Impact: Prevents squished metrics on phones

### Priority 2 — UX Polish (1 hour)

3. **Adjust intelligence row breakpoint**
   - File: `Dashboard.module.css`
   - Change: `.intelligenceRow` breakpoint from 1100px → 900px
   - Impact: Keeps side-by-side layout longer on tablets

4. **Add horizontal scroll affordance**
   - File: `WeatherSection.jsx` + `.module.css`
   - Add: Fade gradient on right edge when scrollable, or subtle arrow buttons
   - Impact: Users discover 7-day forecast scroll

5. **Widen embedded forecast cards at mobile**
   - File: `WeatherSection.module.css`
   - Add: `@media (max-width: 768px) { .wsEmbFcastCard { min-width: 100px; } }`
   - Impact: More readable forecast on phones

### Priority 3 — Wide Viewport Polish (30 min)

6. **Constrain Weather Insights max-width**
   - File: `Dashboard.module.css` or `WeatherSection.module.css`
   - Add: `.intelligenceWeather { max-width: 900px; }`
   - Impact: Prevents excessive whitespace at >1400px

7. **Consider 3-column intelligence row at ultra-wide**
   - File: `Dashboard.module.css`
   - Add: `@media (min-width: 1600px) { .intelligenceRow { grid-template-columns: 2fr 1fr 1fr; } }`
   - Impact: Better use of space on 4K monitors

---

## Testing Checklist

### Viewports to Test

- [ ] **4K / Ultra-wide (≥1600px)** — verify Weather Insights doesn't stretch excessively
- [ ] **Desktop (1200px–1600px)** — golden path, should look great
- [ ] **Laptop (1024px–1200px)** — verify intelligence row stays side-by-side
- [ ] **Tablet (768px–1024px)** — verify card grid switches to 2-col, full-width cards work
- [ ] **Large phone (500px–768px)** — verify intelligence row stacks, metrics grid readable
- [ ] **Small phone (375px–500px)** — verify all text readable, no horizontal overflow

### Interaction Tests

- [ ] Horizontal scroll embedded forecast (mouse drag, touch swipe)
- [ ] Refresh button on Weather Insights (loading state, error handling)
- [ ] Click forecast day card (does anything happen? should it?)
- [ ] Expand/collapse Operations Calendar views (Month/Week/List)
- [ ] Click action queue items (navigate to detail)
- [ ] Acknowledge/dismiss alerts

### Cross-Browser

- [ ] Chrome/Edge (primary)
- [ ] Firefox (verify flexbox edge cases)
- [ ] Safari (verify webkit-specific CSS)
- [ ] Mobile Safari (iPhone)
- [ ] Chrome Android

---

## Known Non-Issues (Intentional Design)

1. **Customize button is placeholder** — dashboard customization system was built, tested, then reverted (commits `1d40f22`, `2ab34a9`, `c9566aa`, `d7d48de`). Button kept as visual placeholder for future re-introduction.

2. **Weather alerts are placeholder** — `PLACEHOLDER_WEATHER_ALERTS` from `weatherTokens.js` used for static alerts. Live weather recommendations come from `useWeather()` hook but aren't wired into the alert banner flow yet.

3. **Intelligence cards are advisory-only** — by design (established in Phase 5.x). They advise the superintendent, never auto-dispatch actions or create tasks.

4. **No dashboard customization** — drag-resize, size presets, layout persistence were all removed. Dashboard is fixed layout for all users.

---

## Implementation Notes

### CSS Architecture

- **CSS Modules** — every component has a `.module.css` file with prefixed classes
- **Global tokens** — color variables in `src/index.css` (e.g., `--color-accent`, `--color-bg`)
- **Responsive patterns** — mobile-first with min-width media queries, or desktop-first with max-width (mixed)
- **Grid system** — CSS Grid for major layout, Flexbox for internal card layout
- **No Tailwind** — plain CSS Modules only per project constraints

### Breakpoint Conventions

| Breakpoint | Width | Target | Used In |
|------------|-------|--------|---------|
| Mobile | ≤768px | Phones | Most components |
| Tablet | 768px–1100px | iPads, small laptops | `.intelligenceRow`, `.grid` |
| Desktop | 1100px–1600px | Standard monitors | Default |
| Wide | ≥1600px | 4K, ultrawide | Not currently handled |

**Recommendation:** Standardize on these breakpoints across all Dashboard components. Currently some use 1100px, others 768px, with no consistent pattern for ultra-wide.

---

## Commit Strategy

### Recommended Approach

1. **Branch:** `fix/dashboard-responsive-polish`
2. **Commit 1:** Fix Priority 1 issues (`.card-full`, metrics grid)
3. **Commit 2:** Fix Priority 2 issues (breakpoint, scroll affordance, forecast width)
4. **Commit 3:** Fix Priority 3 issues (max-width constraint, ultra-wide layout)
5. **Deploy + Test:** Verify on live URL at all breakpoints
6. **Document:** Update `PROJECT_STATUS.md` → remove "Dashboard visual polish" from pending

### Commit Message Template

```
Fix dashboard responsive layout at [viewport range]

- Adjust .intelligenceRow breakpoint (1100px → 900px)
- Fix .card-full to span all columns (1 / -1)
- Add mobile metrics grid (3-col → 2-col @500px)
- Widen forecast cards at mobile (84px → 100px)

Resolves visual cramping on tablets and phones.
No functionality changes.
```

---

## References

- `PROJECT_STATUS.md` lines 23–24, 48–50 — Intelligence row architecture
- `HANDOVER.md` lines 241–244 — Dashboard layout summary
- `SESSION_REPORT.md` — Phase 26B mobile workflow pass (recent)
- Design system: `src/index.css` — global CSS tokens

---

**Verdict:** Dashboard architecture is sound, data flow is clean, all verticals wired to live D1 stores. Responsive issues are **cosmetic polish**, not functional breakage. All fixes are CSS-only; no JS changes needed. Estimated 2 hours for full polish pass.
