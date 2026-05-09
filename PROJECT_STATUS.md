# TurfIntel Pro — Project Status
**Last Updated:** 2026-05-08  
**Stack:** React 19 + Vite 8 · Plain JavaScript · CSS Modules · React Router DOM v7  
**Deployed:** Cloudflare Pages (auto-deploy on push to `master`)  
**Repo:** https://github.com/bhawes1111-beep/turfintel  
**Latest Commit:** (see DEVLOG Session 7)

---

## Checkpoint Summary (2026-05-08)

Working tree is clean. Build passes at 163 modules, 0 errors.
Known warning: bundle chunk-size >500 kB — not blocking.

Session 7: Weather stabilization pass — improved forecast rainfall estimation, icon resolution,
disease pressure (multi-day consecutive-wet escalation), ET solar factor, source diagnostics
(console.debug only), and manual refresh button in the Weather Insights card.

Session 6: Live NWS weather integration (4-source fallback chain + 15-min cache),
inventory ↔ spray automation, Operations Calendar metrics wired to live state,
OperationsContext localStorage persistence, and the Weather Intelligence Dashboard card.

Session 5: Spray Sheet tab + shared Operations Layer with localStorage persistence.

Fourteen+ full-data workflows across seven sessions. Dashboard/UX systems:
Operations Calendar · Crew Scheduling Board · Dashboard Weather Section (live data).

Every data workflow: real static dataset in `src/data/`, full-featured tab component
(stat row + search + filter chips + sortable list cards + detail modal), namespaced CSS prefix.

---

## Fully Functional Modules

### Dashboard (redesigned this session)

**Dashboard → Weather Section** (`src/pages/Dashboard/WeatherSection.jsx`)
- Replaces old WeatherCard / ETCard / ForecastStrip stack
- Top row: **Weather Insights** card (current temp, emoji, 6-metric grid, disease pressure badge, ET today) + **Evapotranspiration** card (ET rate + deficit, pure CSS flex bar chart for 7-day trend) — side by side, equal columns
- Bottom row: full-width scrollable **7-day forecast** (day, date, icon, high/low, rain, ET rate, condition badge)
- Dark glass card design: `linear-gradient(150deg, rgba(6,20,6,0.97), rgba(2,10,2,0.99))` + green accent borders
- Inline SVG icons only (no external icon library)
- Responsive: top row stacks to single column at ≤1000px; forecast row scrolls horizontally on mobile
- CSS prefix: `ws*` · Files: `WeatherSection.jsx`, `WeatherSection.module.css`

**Dashboard → Operations Calendar** (`src/pages/Dashboard/OperationsCalendar.jsx`)
- Replaces old combined CalendarGrid/EventBadge/CalendarEventDetail widget
- Three views: **Month** (42-cell Mon-start grid, up to 3 chips + overflow), **Week** (7-column Mon–Sun grid, full event cards), **List** (grouped by date, sticky date headers, Today pill)
- Right panel (240px sticky): mini calendar, upcoming events (next 5 filtered), weekly metrics (spray / crew / maintenance / open repairs), conditions strip from `PLACEHOLDER_CURRENT`
- Category filter chips: Spray · Crew · Maintenance · Agronomy · Irrigation (5 colors)
- Event detail modal: category accent bar, all fields, tags as chips, notes block
- Day overflow modal: lists all events when day has >3; click any to open event detail
- `eventsByDate` = `useMemo` Map for O(1) lookup; `weeklyMetrics` always anchored to TODAY's week
- Data: `src/data/dashboardCalendarEvents.js` — 36 events across 5 categories
- CSS prefix: `oc*` · Files: `OperationsCalendar.jsx`, `OperationsCalendar.module.css`

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
- **Rebuilt this session** as a full scheduling board with right-side edit panel
- Stat row (today): Scheduled Today · Off Today · Opening Crew · Scheduled Hours
- Dual view: **Week** (full board grid, 9 columns: name + Mon–Sun + weekly total) + **Day** (filtered card list for selected day)
- Color-coded shift cards by status: green (active/completed/scheduled) · gray (off) · yellow (half-day/late) · blue (special) · red (absent/call-out/unavailable)
- Clickable empty cells open add-shift panel pre-filled with employee + date
- Right-side edit panel (300px): full form — employee, date, start/end time, routing (None/Press/Hammer), area, task, shift type, status, notes; Save + Delete with toast notifications
- Crew Availability section below board: tabbed filter (All / Approved / Pending / Medical/Vacation / Call-Out), approval status badges
- O(1) lookup: `scheduleMap = useMemo(() => map by ${employeeId}-${date})`
- `Fragment` import (not `<>`) required for keyed rows in board grid
- CSS prefix: `csb*` · Appended to `src/pages/Crew/Crew.module.css`

**Crew → Employees** (`src/pages/Crew/tabs/CrewEmployees.jsx`)
- Data: `EMPLOYEES` in `src/data/crew.js` — 8 records (EMP-001 through EMP-008)
- Stat row: Active Employees · Supervisors · Certified Staff · Avg Hourly Rate
- Filters: Department chips + Status chips (Active / Absent / Vacation / Seasonal)
- Grid of profile cards: initials avatar with status-colored ring, role badge, supervisor badge, dept, area, rate, cert count
- `isSupervisor(emp)` = `emp.role.includes('Lead') || emp.department === 'Supervisory'`
- Detail modal: Employee Overview · Contact Information · Employment Details · Certifications & Training · Languages · Notes
- `fmtDate()` converts YYYY-MM-DD → "Mon DD, YYYY"; `yearsService()` computed from 2026-05-08
- CSS prefix: `ce*`

**Crew → Tasks** (`src/pages/Crew/tabs/CrewTasks.jsx`)
- Data: `TASKS` in `src/data/crew.js` — 12 records, all dueDate: 2026-05-08
- Stat row: Open/Blocked · In Progress · Completed Today · High Priority
- Triple filter: Department + Status (Open / In Progress / Completed / Blocked) + Priority (High / Medium / Routine)
- Priority left-accent cards: red (high) · amber (medium) · green (routine); `ctCard_completed` defined last to override to muted
- `empMap = useMemo(() => new Map(EMPLOYEES.map(e => [e.employeeId, e])))` — O(1) name lookup
- Assignment chips resolve IDs to "First L." format
- Equipment badges: first 2 visible + "+N more" overflow badge
- Progress bar: `completedHours / estimatedHours`, fill color matches priority accent
- Due Today badge on open/in-progress tasks where `dueDate === TODAY`
- Detail modal: Task Overview · Progress (bar + hours) · Assignment (name + role rows) · Equipment · Notes
- CSS prefix: `ct*`

**Crew → Notes** — stub (placeholder, no data)
**Crew → Overview** — stat tile summary, wired

---

### Equipment (2 of ~4 data tabs complete)

**Equipment → Equipment List** (`src/pages/Equipment/tabs/EquipmentList.jsx`)
- Data: `EQUIPMENT_LIST` in `src/data/equipment.js`
- Stat row: Fleet Total · Operational · In Service · Due for Service
- Filters: Category chips + Status chips
- Cards: equipment name, make/model, serial, hours, last/next service dates, status badge
- Detail modal with full spec sheet
- CSS prefix: `el*`

**Equipment → Maintenance Logs** (`src/pages/Equipment/tabs/MaintenanceLogs.jsx`)
- Data: `SERVICE_LOG` in `src/data/equipment.js` — 14 records
- Stat row: Logs This Month · Total Cost · Avg Cost · Open Work Orders
- Filters: Category chips + Service Type chips
- Cards: equipment, technician, service type, cost, date, status
- Detail modal: Equipment Info · Service Details · Labor & Cost · Notes
- CSS prefix: `ml*`

**Equipment → Overview** — wired  
**Equipment → remaining tabs** — stubs

---

### Spray (2 of ~4 data tabs complete)

**Spray → Build Spray Sheet** (`src/pages/Spray/tabs/BuildSpraySheet.jsx`)
- Multi-select application cards from `SPRAY_RECORDS`; each card has separate checkbox + body button
- Generated right-panel spray sheet: header, weather window, summary row, product table, PPE, safety, signature block
- `buildProductTable()` deduplicates products across selected records via `Map` keyed by product name
- `buildPPE()` collects unique PPE from `PRODUCT_META` lookup
- "Add to Operations Calendar" button dispatches `createCalendarEvent` per selected record; REI alert auto-created when `maxREI > 0`
- Print via `window.print()` with `@media print` isolating only the sheet panel
- CSS prefix: `ss*` · Files: `BuildSpraySheet.jsx`, `Spray.module.css`

**Spray → Spray Records** (`src/pages/Spray/tabs/SprayRecords.jsx`)
- Data: `SPRAY_RECORDS` in `src/data/spray.js`
- Stat row: Records This Month · Total Area · Total Product · Active REI Violations
- Filters: Department/Status/Type chips
- Cards: product, area, applicator, rate, volume, status, REI countdown
- Detail modal: Application Details · Product Info · Application Parameters · Compliance · Notes
- CSS prefix: `sr*`

**Spray → Overview** — wired  
**Spray → remaining tabs** — stubs

---

### Disease (1 of ~3 data tabs complete)

**Disease → Active Issues** (`src/pages/Disease/tabs/DiseaseActiveIssues.jsx`)
- Data: `ACTIVE_ISSUES` in `src/data/disease.js`
- Stat row: Active Issues · Critical · Avg Pressure · Days Since Scouting
- Filters: Area/Severity/Status chips
- Cards: disease name, location, severity badge (Critical/High/Moderate/Low), pressure rating, treatment status
- Detail modal: Issue Overview · Scouting Data · Treatment Plan · Notes
- CSS prefix: `di*`

**Disease → Overview** — wired  
**Disease → remaining tabs** — stubs

---

### Inventory (1 of ~3 data tabs complete)

**Inventory → Products** (`src/pages/Inventory/tabs/InventoryProducts.jsx`)
- Data: `PRODUCTS` in `src/data/inventory.js`
- Stat row: Total SKUs · Low Stock Items · Critical Stock · Pending Orders
- Filters: Category/Status chips
- Cards: product name, SKU, stock level, unit, low-stock warning badge
- Detail modal: Product Info · Stock Levels · Supplier Info · Notes
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

- Spray · Disease · Plant Nutrition · Cultural Practices · Budget

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

**NWS Integration:**
- Observation: `https://api.weather.gov/stations/KSAV/observations/latest` — temperature, humidity, wind, dew point, precipitation
- Grid resolution: `https://api.weather.gov/points/32.1274,-81.2014` → forecast URL
- Forecast: NWS gridpoint forecast — paired day/night periods, PoP, wind, temperature

**METAR Fallback:** `https://aviationweather.gov/api/data/metar?ids=KSAV&format=json`

**Cache:** `localStorage['turfintel-weather-cache']` — 15-min TTL. Stale cache used if all live sources fail. Bundle includes `source` label (nws/metar) and `timestamp`.

**Normalization details:**
- Celsius → Fahrenheit, km/h → mph, wind degrees → compass direction
- Rainfall from PoP + NWS text keywords (heavy/scattered/light/drizzle multipliers)
- Disease pressure: humidity + dew point spread + temperature range + consecutive-wet-day streak
- ET: empirical formula (0.024 × VPD × wind factor × solar factor); solar factor from PoP
- Spray window: wind + PoP + temperature + forecast rain keywords
- Feels-like: heat index (≥80°F) or wind chill (≤50°F)

**Source priority chain (fetchWeatherBundle):**
1. Fresh localStorage cache (< 15 min)
2. NWS KSAV observation (normalized)
3. AviationWeather METAR (if NWS fails)
4. Stale localStorage cache (any age)
5. Hook resolves to `PLACEHOLDER_*` — no UI hard failures

**Evaluator decoupling:** `evaluator.js` and `recommendations.js` accept plain JS objects matching the normalized shape. They are never aware of NWS, METAR, or cache — only `normalize.js` and `api.js` change when the data source changes.

---

### Operations Layer (`src/utils/operations/`)

Cross-module operational state — shared across all pages via React Context.

| File | Purpose |
|---|---|
| `schemas.js` | `makeCalendarEvent()`, `makeAlert()`, `makeCrewAssignment()`, `makeEquipmentReservation()` factory functions |
| `actions.js` | Six action type constants + six pure action creator functions |
| `OperationsContext.jsx` | React Context + useReducer + localStorage persistence |

**Persistence:** State is loaded from `localStorage['turfintel-operations']` on mount, written back on every reducer change. Falls back to static seed datasets when storage is absent or corrupt. `loadState()` / `saveState()` are isolated adapter functions — swap for API / D1 / Supabase / Firebase without touching reducers or consumers.

**Deduplication:** `CREATE_CALENDAR_EVENT` rejects payloads where `sourceId + category + date` already exists in state. Events without a `sourceId` are always allowed.

**Integration targets:** Spray → Build Spray Sheet · Irrigation → Repairs · Equipment → Maintenance Logs · Dashboard (reads `state.alerts`) · Operations Calendar (reads `state.calendarEvents`)

**API-ready pattern:** Each action creator returns `{ type, payload }`. When a backend exists, wrap in async thunks: dispatch optimistically → POST to API → UPDATE with server ID on success → REVERT on failure.

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
<CalendarGrid events={[]} year={n} month={n} onEventClick={fn} />
<CalendarEventDetail event={obj} onClose={fn} />
```

### CSS Prefix Convention
| Module / Tab | Prefix |
|---|---|
| Dashboard Weather Section | `ws*` |
| Dashboard Operations Calendar | `oc*` |
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

**Missing sidebar icons** (drop into `public/sidebar-icons/` when available — zero code changes needed):
`disease.png` · `cultural-practices.png` · `budget.png` · `inventory.png` · `equipment.png` · `settings.png`

---

## Recommended Next Features (Priority Order)

1. **Spray → Planned Programs** — scheduled spray program list with calendar integration
3. **Disease → Disease Alerts** — threshold-based alert feed; shares `ACTIVE_ISSUES` shape
4. **Inventory → Chemicals tab** — chemical inventory parallel to Products, `CHEMICALS` export in `inventory.js`
5. **Plant Nutrition tabs** — soil test data, recommendations, application log
6. **Cultural Practices tabs** — aeration schedule, mowing height log, topdressing program
7. **Budget tabs** — expense log, monthly budget tracker, category breakdown charts
8. **Equipment → Work Orders tab** — open/closed work order list linked to `SERVICE_LOG`
9. **Wire CourseContext** — filter all module data by `activeCourse.id` when multi-course support is needed
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

### Key files
| File | Purpose |
|---|---|
| `src/App.jsx` | All routes |
| `src/index.css` | Global CSS tokens + scrollbar styles |
| `src/components/layout/Sidebar.jsx` | Nav items, PNG icon paths, collapse logic |
| `src/components/layout/Layout.module.css` | `.outlet` is the single scroll owner |
| `src/pages/Dashboard/Dashboard.jsx` | Weather, alerts, card grid, calendar |
| `src/pages/Dashboard/WeatherSection.jsx` | Weather Insights + ET + 7-day forecast |
| `src/pages/Dashboard/WeatherSection.module.css` | `ws*` styles |
| `src/pages/Dashboard/OperationsCalendar.jsx` | Month/Week/List calendar + right panel + modals |
| `src/pages/Dashboard/OperationsCalendar.module.css` | `oc*` styles |
| `src/pages/Crew/tabs/CrewSchedule.jsx` | Scheduling board + edit panel + availability |
| `src/components/shared/ModuleOverview.jsx` | StatCard, InfoCard, Badge |
| `src/components/shared/weather/weatherTokens.js` | Placeholder weather data + token maps (used as fallback when API unavailable) |
| `src/utils/weather/evaluator.js` | 6 pure weather evaluator functions |
| `src/utils/weather/recommendations.js` | `generateWeatherRecommendations()` orchestrator |
| `src/utils/weather/normalize.js` | NWS + METAR normalization pipeline |
| `src/utils/weather/api.js` | Fetch layer + cache + 4-source fallback chain |
| `src/utils/weather/useWeather.js` | React hook — resolves to placeholder on error |
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
