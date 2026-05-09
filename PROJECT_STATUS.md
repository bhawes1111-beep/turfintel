# TurfIntel Pro — Project Status
**Last Updated:** 2026-05-08  
**Stack:** React 19 + Vite 8 · Plain JavaScript · CSS Modules · React Router DOM v7  
**Deployed:** Cloudflare Pages (auto-deploy on push to `master`)  
**Repo:** https://github.com/bhawes1111-beep/turfintel  
**Latest Commit:** `6991df8` — Redesign dashboard weather and agronomy intelligence layout

---

## Checkpoint Summary (2026-05-08 — End of Session 8)

Working tree is clean. Build passes at **172 modules**, 0 errors.  
Known warning: bundle chunk-size >500 kB — not blocking.  
Backup branch: `backup/end-session-2026-05-08` (pushed to origin)  
Recovery tag: `checkpoint-2026-05-08` (pushed to origin)  
Pre-redesign backup branch: `backup/pre-dashboard-weather-redesign` (pushed to origin)  
Pre-redesign tag: `pre-weather-dashboard-redesign` (pushed to origin)

Session 8: Dashboard intelligence layer — added GDD + Application Effectiveness agronomy cards,
moved ETCard to Irrigation Dashboard, enforced advisory-only principle across all intelligence
cards, added Irrigation Tonight recommendation to Weather Insights status strip, then fully
redesigned the dashboard top section: unified Weather Insights card with embedded 7-day
forecast, zone-colored GDD scale track, SVG ring gauge for Application Effectiveness, and
2fr/1fr intelligence row with height-matched right column.

Session 7: Weather stabilization pass — improved forecast rainfall estimation, icon resolution,
disease pressure (multi-day consecutive-wet escalation), ET solar factor, source diagnostics
(console.debug only), and manual refresh button in the Weather Insights card.

Session 6: Live NWS weather integration (4-source fallback chain + 15-min cache),
inventory ↔ spray automation, Operations Calendar metrics wired to live state,
OperationsContext localStorage persistence, and the Weather Intelligence Dashboard card.

Session 5: Spray Sheet tab + shared Operations Layer with localStorage persistence.

Fourteen+ full-data workflows across eight sessions. Dashboard/UX systems:
Operations Calendar · Crew Scheduling Board · Dashboard Weather Section (live data).

Every data workflow: real static dataset in `src/data/`, full-featured tab component
(stat row + search + filter chips + sortable list cards + detail modal), namespaced CSS prefix.

---

## Fully Functional Modules

### Dashboard (current architecture — Session 8)

**Intelligence Row** — `2fr / 1fr` CSS grid, `align-items: stretch`

**LEFT (2fr) — Weather Insights card** (`src/pages/Dashboard/WeatherSection.jsx`)
- Single unified premium glass card; fills column height via `flex: 1` chain
- **Header**: cloud SVG icon + location + live/stale badge + spray condition badge + "Updated" timestamp + refresh button (↻)
- **Main display**: weather emoji (54px) + current temp (54px) + feels like (flex left) | 6-metric grid 3×2 (Humidity · Wind · Dew Point · Soil Temp · 24h Rain · Solar) (flex right, `border-left` divider)
- **Status strip**: Disease Pressure badge | Irrigation Tonight recommendation | ET Today value
- **Embedded 7-day forecast**: horizontal scroll strip at card bottom — compact cards (84px min, `scroll-snap-type x mandatory`), per card: day label · date · icon · high/low · rain or "No rain" · condition badge (Wet / Monitor / Good / Marginal / Poor)
- `computeIrrigationSummary(current, forecast)` from `irrigationEngine.js` drives Irrigation Tonight
- Glass design: `linear-gradient(150deg, rgba(6,20,6,0.97), rgba(2,10,2,0.99))` + green borders
- CSS prefix: `ws*` · Files: `WeatherSection.jsx`, `WeatherSection.module.css`

**RIGHT (1fr) — Stacked agronomy cards** (both `flex: 1` inside `intelligenceRight`)

**Growing Degree Days card** (`src/pages/Dashboard/GDDCard.jsx`)
- 4-stat row: GDD Today · 7-Day Accum. · Daily Avg · Base Temp
- 3 application types: Fungicide · PGR · Nutrient
- Per type: status badge + zone-colored scale track (Early/blue → Optimal/green → Late/amber) with marker lines + zone labels + status note
- `GDDScale` sub-component: CSS gradient background + absolute positioned fill bar + marker lines
- Powered by `computeGDDSummary(forecast)` from `src/utils/agronomy/gddEngine.js`
- CSS prefix: `gdd*` · Files: `GDDCard.jsx`, `GDDCard.module.css`

**Application Effectiveness card** (`src/pages/Dashboard/AppEffectivenessCard.jsx`)
- Left: SVG circular ring gauge (r=30, circ≈188.5), score + rating label centered in ring
- Right: positives (✓ green) + negatives (✕ red) factor checklist
- Bottom: italic recommendation paragraph (border-top divider)
- `CircleGauge`: `stroke-dasharray/stroke-dashoffset` technique, `rotate(-90)` to start at 12 o'clock
- Powered by `computeApplicationEffectiveness(current, forecast)` from `src/utils/agronomy/applicationEffectiveness.js`
- CSS prefix: `ae*` · Files: `AppEffectivenessCard.jsx`, `AppEffectivenessCard.module.css`

**Operations Calendar** (`src/pages/Dashboard/OperationsCalendar.jsx`) — below intelligence row
- Three views: Month · Week · List
- Right panel: mini calendar, upcoming events, weekly metrics, conditions strip
- Category filter chips: Spray · Crew · Maintenance · Agronomy · Irrigation
- CSS prefix: `oc*`

**Dashboard grid** (below calendar)
- Alerts (wired to OperationsContext, active filter, priority grouping)
- Weather Intelligence (advisory-only recommendations — read-only, no push buttons)
- Irrigation Intelligence (advisory-only — read-only, no push buttons)
- Crew Status / Equipment Alerts / Upcoming Applications / Recent Notes (stubs)

---

### Irrigation Dashboard

**ETCard** (`src/components/shared/weather/ETCard.jsx`) — at top of Irrigation Dashboard
- Moved from main Dashboard in Session 8
- ET Rate Today (36px green) + ET Deficit (36px amber) in 2-col grid
- Pure CSS flex bar chart: 7-day ET trend
- CSS prefix: `ws*` (shared WeatherSection styles)

---

### Crew (all 5 data tabs complete)

**Crew → Hours** (`src/pages/Crew/tabs/CrewHours.jsx`)
- Data: `HOURS_LOG` in `src/data/crew.js` — 14 records (8 today 2026-05-08, 6 yesterday)
- Stat row: Total Hours Today · Overtime Hours · Crew Present · Labor Cost Est.
- Filters: Department chips + Status chips (Clocked In / Completed / Absent / Late)
- Full-width list cards with OT badge when overtimeHours > 0
- Detail modal: Employee Overview · Shift Timeline · Task Assignment · Labor Summary · Overtime Breakdown (conditional — only shown when OT > 0)
- `shiftCost(log)` = `(totalHours - overtimeHours) × rate + overtimeHours × rate × 1.5`
- CSS prefix: `ch*`

**Crew → Schedule** (`src/pages/Crew/tabs/CrewSchedule.jsx`)
- Data: `SCHEDULE` in `src/data/crew.js` — 40 records (8 employees × 5 days Mon–Fri 2026-05-04 to 2026-05-08)
- Stat row (today): Scheduled Today · Off Today · Opening Crew · Scheduled Hours
- Dual view: **Week** (full board grid, 9 columns: name + Mon–Sun + weekly total) + **Day** (filtered card list)
- Color-coded shift cards by status; clickable empty cells open add-shift panel
- Right-side edit panel (300px): full form — employee, date, start/end, routing, area, task, shift type, status, notes
- Crew Availability section with tabbed filter
- CSS prefix: `csb*`

**Crew → Employees** (`src/pages/Crew/tabs/CrewEmployees.jsx`)
- Data: `EMPLOYEES` in `src/data/crew.js` — 8 records
- Grid of profile cards; detail modal with full employment info + certifications
- CSS prefix: `ce*`

**Crew → Tasks** (`src/pages/Crew/tabs/CrewTasks.jsx`)
- Data: `TASKS` in `src/data/crew.js` — 12 records
- Triple filter: Department + Status + Priority
- Priority left-accent cards; progress bar per task; Due Today badge
- CSS prefix: `ct*`

**Crew → Notes** — stub  
**Crew → Overview** — wired

---

### Equipment (2 of ~4 data tabs complete)

**Equipment → Equipment List** (`src/pages/Equipment/tabs/EquipmentList.jsx`)
- Data: `EQUIPMENT_LIST` in `src/data/equipment.js`
- CSS prefix: `el*`

**Equipment → Maintenance Logs** (`src/pages/Equipment/tabs/MaintenanceLogs.jsx`)
- Data: `SERVICE_LOG` in `src/data/equipment.js` — 14 records
- CSS prefix: `ml*`

**Equipment → Overview** — wired  
**Equipment → remaining tabs** — stubs

---

### Spray (2 of ~4 data tabs complete)

**Spray → Build Spray Sheet** (`src/pages/Spray/tabs/BuildSpraySheet.jsx`)
- Multi-select application cards; generated right-panel spray sheet; print via `window.print()`
- CSS prefix: `ss*`

**Spray → Spray Records** (`src/pages/Spray/tabs/SprayRecords.jsx`)
- Data: `SPRAY_RECORDS` in `src/data/spray.js`
- CSS prefix: `sr*`

**Spray → Overview** — wired  
**Spray → remaining tabs** — stubs

---

### Disease (1 of ~3 data tabs complete)

**Disease → Active Issues** (`src/pages/Disease/tabs/DiseaseActiveIssues.jsx`)
- Data: `ACTIVE_ISSUES` in `src/data/disease.js`
- CSS prefix: `di*`

**Disease → Overview** — wired  
**Disease → remaining tabs** — stubs

---

### Inventory (1 of ~3 data tabs complete)

**Inventory → Products** (`src/pages/Inventory/tabs/InventoryProducts.jsx`)
- Data: `PRODUCTS` in `src/data/inventory.js`
- CSS prefix: `ip*`

**Inventory → Overview** — wired  
**Inventory → remaining tabs** — stubs

---

### Chemical

**Chemical → Labels** — fully built  
**Chemical → Overview** — wired  
**Chemical → remaining tabs** — stubs

---

### All Other Modules (Overview wired, data tabs are stubs)

- Plant Nutrition · Cultural Practices · Budget

---

## Architecture Reference

### Weather Layer (`src/utils/weather/`)

Live weather pipeline decoupled from all UI and operations layers. Evaluators and recommendations are pure functions — never modified when data sources change.

| File | Purpose |
|---|---|
| `evaluator.js` | 6 pure evaluator functions — spray window, disease pressure, ET demand, frost risk, rain delay, heat stress. No React, no side effects. |
| `recommendations.js` | `generateWeatherRecommendations(current, forecast)` — runs all evaluators, stamps IDs, sorts by severity. |
| `normalize.js` | Converts raw NWS observation + METAR JSON → evaluator-compatible shapes. ET estimation, disease pressure heuristics, spray window, feels-like. |
| `api.js` | Fetch layer: NWS KSAV → METAR → stale cache fallback chain. 15-min localStorage TTL. Source diagnostics via `console.debug`. |
| `useWeather.js` | React hook: `{ current, forecast, etTrend, loading, error, isLive, isStale, refresh }`. Resolves to `PLACEHOLDER_*` on error — never blank. |
| `irrigationEngine.js` | `computeIrrigationSummary(current, forecast)` — pure function, returns `{ recApplication, skip, reason }` |

**NWS Integration:**
- Observation: `https://api.weather.gov/stations/KSAV/observations/latest`
- Grid resolution: `https://api.weather.gov/points/32.1274,-81.2014` → forecast URL
- Forecast: NWS gridpoint forecast — paired day/night periods, PoP, wind, temperature

**METAR Fallback:** `https://aviationweather.gov/api/data/metar?ids=KSAV&format=json`

**Cache:** `localStorage['turfintel-weather-cache']` — 15-min TTL. Stale cache used if all live sources fail.

---

### Agronomy Layer (`src/utils/agronomy/`)

Pure evaluator functions — no React, no side effects. Accept plain JS objects.

| File | Purpose |
|---|---|
| `gddEngine.js` | `computeGDDSummary(forecast, baseTempF=50)` — returns `{ todayGDD, sevenDayGDD, avgDailyGDD, baseTempF, statusMeta, windows, fungicide, pgr, nutrient }` |
| `applicationEffectiveness.js` | `computeApplicationEffectiveness(current, forecast)` — 5-factor scorer (wind, humidity, temp, rain, dew spread) × 20pts each → `{ score, rating, factors, positives, negatives }` |

**GDD thresholds:**
- Fungicide: `{ optimalStart: 150, optimalEnd: 250, expired: 350 }`
- PGR: `{ optimalStart: 100, optimalEnd: 200, expired: 280 }`
- Nutrient: `{ optimalStart: 200, optimalEnd: 350, expired: 500 }`

---

### Operations Layer (`src/utils/operations/`)

Cross-module operational state — shared across all pages via React Context.

| File | Purpose |
|---|---|
| `schemas.js` | `makeCalendarEvent()`, `makeAlert()`, `makeCrewAssignment()`, `makeEquipmentReservation()` factory functions |
| `actions.js` | Six action type constants + six pure action creator functions |
| `OperationsContext.jsx` | React Context + useReducer + localStorage persistence |

**Persistence:** `localStorage['turfintel-operations']` — loaded on mount, written on every reducer change.

**Advisory-only principle:** Intelligence cards (WeatherIntelligence, IrrigationIntelligence) are read-only advisory displays. They never dispatch actions, push alerts, or create tasks. The superintendent makes all decisions.

---

### Data Files
| File | Exports | Records |
|---|---|---|
| `src/data/crew.js` | `HOURS_LOG`, `SCHEDULE`, `EMPLOYEES`, `TASKS` | 14 + 40 + 8 + 12 |
| `src/data/equipment.js` | `EQUIPMENT_LIST`, `SERVICE_LOG` | — |
| `src/data/spray.js` | `SPRAY_RECORDS` | — |
| `src/data/disease.js` | `ACTIVE_ISSUES` | — |
| `src/data/inventory.js` | `PRODUCTS` | — |
| `src/data/dashboardCalendarEvents.js` | `CALENDAR_EVENTS` | 36 events (5 categories) |
| `src/data/dashboardAlerts.js` | `DASHBOARD_ALERTS` | placeholder alerts |
| `src/components/shared/weather/weatherTokens.js` | `PLACEHOLDER_CURRENT`, `PLACEHOLDER_ET_TREND`, `PLACEHOLDER_FORECAST`, `SPRAY_WINDOW_TOKENS`, `DISEASE_PRESSURE_TOKENS`, `WEATHER_ICONS`, `formatTimestamp` | — |

### Shared Components
```
<StatCard label="..." value="..." sub="..." color="#hex" />
<InfoCard title="..." rows={[{ label, value }]} />
<Badge variant="green|yellow|red|blue|gray">text</Badge>
<ModuleOverview>   ← 4-col grid wrapper
<DashboardCard wide tall full>
<ETCard current={...} trend={[...]} />
```

### CSS Prefix Convention
| Module / Tab | Prefix |
|---|---|
| Dashboard Weather Section | `ws*` |
| Dashboard Operations Calendar | `oc*` |
| Dashboard GDD Card | `gdd*` |
| Dashboard AppEffectiveness Card | `ae*` |
| Crew Hours | `ch*` |
| Crew Schedule Board | `csb*` |
| Crew Employees | `ce*` |
| Crew Tasks | `ct*` |
| Equipment List | `el*` |
| Maintenance Logs | `ml*` |
| Inventory Products | `ip*` |
| Disease Active Issues | `di*` |
| Spray Records | `sr*` |

### Patterns Used Everywhere
- **Modal:** IIFE pattern `{selected && (() => { const computed = ...; return <JSX /> })()} `
- **Escape key:** `useEffect` with `window.addEventListener('keydown', onKey)` + cleanup
- **Filter + sort:** `useMemo` chain — filter by search + chips → sort by status then alpha
- **Stat row:** `grid-template-columns: repeat(4, 1fr)` → `1fr 1fr` at 900px
- **Card left accent:** `border-left: 4px solid [priority/status color]`
- **Modal accent bar:** 4px `<div>` with `style={{ background: accent }}`
- **O(1) lookups:** `useMemo` Map or object keyed by composite string
- **Git commits:** PowerShell here-string `@'...'@` — never bash heredoc
- **Height matching:** `align-items: stretch` on CSS grid + `flex: 1` chain through wrapper divs

---

## UI / Branding Status

### Logo — DO NOT CHANGE
- `public/logo-full.png` — Full logo, expanded sidebar (192px wide)
- `public/logo-mark.png` — Compact mark, collapsed sidebar (44×44px, `mix-blend-mode: screen`)

### Sidebar PNG Icons
| Nav Item | Filename | Status |
|---|---|---|
| Dashboard | `dashboard.png` | ✅ |
| Crew | `crew.png` | ✅ |
| Chemical | `chemical.png` | ✅ |
| Spray | `spray.png` | ✅ |
| Plant Nutrition | `plant-nutrition.png` | ✅ |
| Disease | `disease.png` | ❌ Missing |
| Cultural Practices | `cultural-practices.png` | ❌ Missing |
| Budget | `budget.png` | ❌ Missing |
| Inventory | `inventory.png` | ❌ Missing |
| Equipment | `equipment.png` | ❌ Missing |
| Settings | `settings.png` | ❌ Missing |

Drop missing files into `public/sidebar-icons/` — no code changes needed.

### Color Tokens (`src/index.css`)
```
--color-bg:      #0d1a0d
--color-sidebar: #0a130a
--color-accent:  #4a9e4a
--color-text:    #e8f0e8
--color-muted:   #7a9e7a
--color-border:  #1e341e
--color-surface: #111e11
--sidebar-width: 220px
--sidebar-collapsed: 64px
```

---

## Known Issues

| Priority | Issue | Fix |
|---|---|---|
| Medium | 6 sidebar icons missing | Drop PNGs into `public/sidebar-icons/`, push — no code change |
| Low | `public/icons.svg` committed but unused | Delete file, push |
| Low | Chunk size warning on build (>500 kB) | Not blocking — code-split when app grows |
| Low | Calendar events hardcoded to May 2026 | Resolves with real data |
| Low | No auth route guard | Add protected route wrapper when backend ready |
| Low | NWS CORS policy may block browser-direct fetch in some environments | Covered by METAR + stale cache fallback chain |

**Missing sidebar icons** (drop into `public/sidebar-icons/` — zero code changes needed):
`disease.png` · `cultural-practices.png` · `budget.png` · `inventory.png` · `equipment.png` · `settings.png`

---

## Recommended Next Features (Priority Order)

1. **Irrigation Intelligence tab data** — wire real zone data, runtimes, and pump status into IrrigationIntelligence.jsx
2. **Spray → Planned Programs** — scheduled spray program list with calendar integration
3. **Disease → Disease Alerts** — threshold-based alert feed; shares `ACTIVE_ISSUES` shape
4. **Inventory → Chemicals tab** — chemical inventory parallel to Products
5. **Plant Nutrition tabs** — soil test data, recommendations, application log
6. **Cultural Practices tabs** — aeration schedule, mowing height log, topdressing program
7. **Budget tabs** — expense log, monthly budget tracker, category breakdown charts
8. **Equipment → Work Orders tab** — open/closed work order list linked to `SERVICE_LOG`
9. **Wire CourseContext** — filter all module data by `activeCourse.id` for multi-course support
10. **Collapsed sidebar tooltips** — show label on hover when nav is collapsed
11. **Upload 6 missing sidebar icons** — no code change, drop PNGs into `public/sidebar-icons/`
12. **Dashboard — real data** — replace placeholder weather + calendar data with API fetch

---

## Startup Instructions

### Dev server
```powershell
cd C:\Users\bhawe\turfintel
npm run dev
# → http://localhost:5173
```

### Production build
```powershell
cd C:\Users\bhawe\turfintel
npm run build
# Cloudflare Pages auto-deploys on push to master
```

### Git commit (PowerShell — NOT bash heredoc)
```powershell
git add src/path/to/file.jsx src/path/to/file.css
git commit -m @'
Commit message here

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
git push origin master
```

### Recovery (restore to this checkpoint)
```powershell
# Option A — branch
git checkout backup/end-session-2026-05-08

# Option B — tag
git checkout checkpoint-2026-05-08
```

### Key files
| File | Purpose |
|---|---|
| `src/App.jsx` | All routes |
| `src/index.css` | Global CSS tokens + scrollbar styles |
| `src/components/layout/Sidebar.jsx` | Nav items, PNG icon paths, collapse logic |
| `src/components/layout/Layout.module.css` | `.outlet` is the single scroll owner |
| `src/pages/Dashboard/Dashboard.jsx` | Intelligence row, alerts, calendar, card grid |
| `src/pages/Dashboard/Dashboard.module.css` | `intelligenceRow` 2fr/1fr grid layout |
| `src/pages/Dashboard/WeatherSection.jsx` | Unified Weather Insights card + embedded forecast |
| `src/pages/Dashboard/WeatherSection.module.css` | `ws*` styles |
| `src/pages/Dashboard/GDDCard.jsx` | Zone-colored GDD scale + 4-stat row |
| `src/pages/Dashboard/GDDCard.module.css` | `gdd*` styles |
| `src/pages/Dashboard/AppEffectivenessCard.jsx` | SVG ring gauge + factors checklist |
| `src/pages/Dashboard/AppEffectivenessCard.module.css` | `ae*` styles |
| `src/pages/Dashboard/OperationsCalendar.jsx` | Month/Week/List calendar + right panel + modals |
| `src/pages/Dashboard/OperationsCalendar.module.css` | `oc*` styles |
| `src/pages/Crew/tabs/CrewSchedule.jsx` | Scheduling board + edit panel + availability |
| `src/components/shared/ModuleOverview.jsx` | StatCard, InfoCard, Badge |
| `src/components/shared/weather/weatherTokens.js` | Placeholder weather data + token maps |
| `src/utils/weather/evaluator.js` | 6 pure weather evaluator functions |
| `src/utils/weather/recommendations.js` | `generateWeatherRecommendations()` orchestrator |
| `src/utils/weather/normalize.js` | NWS + METAR normalization pipeline |
| `src/utils/weather/api.js` | Fetch layer + cache + 4-source fallback chain |
| `src/utils/weather/useWeather.js` | React hook — resolves to placeholder on error |
| `src/utils/weather/irrigationEngine.js` | `computeIrrigationSummary()` — irrigation recommendation |
| `src/utils/agronomy/gddEngine.js` | `computeGDDSummary()` — GDD accumulation + thresholds |
| `src/utils/agronomy/applicationEffectiveness.js` | `computeApplicationEffectiveness()` — 5-factor scorer |
| `src/data/crew.js` | HOURS_LOG, SCHEDULE, EMPLOYEES, TASKS |
| `src/data/dashboardCalendarEvents.js` | CALENDAR_EVENTS — 36 events, 5 categories |
| `src/data/equipment.js` | EQUIPMENT_LIST, SERVICE_LOG |
| `src/data/spray.js` | SPRAY_RECORDS |
| `src/data/disease.js` | ACTIVE_ISSUES |
| `src/data/inventory.js` | PRODUCTS |
| `public/sidebar-icons/` | PNG icon assets — drop files here, no code change |

### Hard constraints
- **Logo is final** — do not change `public/logo-full.png` or `public/logo-mark.png`
- **Plain JavaScript only** — no TypeScript
- **CSS Modules only** — no Tailwind, no styled-components; inline `style={{}}` for dynamic values only
- **Sidebar icons are PNG** — `<Icon>` SVG component remains only for collapse chevron
- **Scroll model** — `.outlet` owns scroll; do not add `overflow-y: auto` to `.page` divs
- **Admin API key** — `x-admin-key: TurfAdmin2025!`
- **Workflow rule** — inspect → explain architecture → get approval → build (3 files max per module)
- **Advisory-only** — intelligence cards advise, they never auto-dispatch actions or create tasks
