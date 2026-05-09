# TurfIntel Pro — Development Log

---

## Session 8 — 2026-05-08

**Commits:**
- `7869afc` — Wire Irrigation Intelligence into Dashboard
- `d671727` — Enforce advisory-only principle in intelligence cards
- `793da97` — Add irrigation tonight recommendation to Weather Insights status strip
- `b3cf136` — Refactor dashboard agronomy intelligence cards
- `6991df8` — Redesign dashboard weather and agronomy intelligence layout

**Build:** 172 modules, 0 errors · known warning: bundle chunk >500 kB (not blocking)  
**Backup:** `backup/end-session-2026-05-08` + tag `checkpoint-2026-05-08` (both pushed to origin)  
**Pre-redesign safety:** `backup/pre-dashboard-weather-redesign` + tag `pre-weather-dashboard-redesign`

---

### Wire Irrigation Intelligence (`7869afc`)

- `IrrigationIntelligence.jsx` was imported in `Dashboard.jsx` but positioned after stub widgets
- Fixed grid order: Alerts → Weather Intelligence → **Irrigation Intelligence** → Crew Status → Equipment Alerts → Upcoming Applications → Recent Notes

---

### Advisory-Only Principle (`d671727`)

**Principle established:** TurfIntel advises the superintendent — it never makes decisions for them.

**Changes:**
- Removed all `dispatch(createAlert(...))` calls from `WeatherIntelligence.jsx`
- Removed all `dispatch(createAlert(...))` calls from `IrrigationIntelligence.jsx`
- Removed "Push to Alerts" buttons from both components
- Removed the bulk "Push All High-Priority" button from `WeatherIntelligence.jsx`
- Removed `pushed` Set state and all related logic
- Both components are now pure read-only advisory displays
- No import of `createAlert` or `useOperations` remains in either component

---

### Irrigation Tonight in Weather Card (`793da97`)

- Added `computeIrrigationSummary(current, forecast)` call in `WeatherSection.jsx`
- Added "Irrigation Tonight" item to the weather card status strip (between Disease Pressure and ET Today)
- Blue value (`#3a8ad4`) when irrigation is recommended; green "Skip" when conditions are favorable
- `irrigationRec > 0 ? \`\${irrigationRec.toFixed(2)}"\` : 'Skip'`
- Recomputes via `useMemo`-equivalent whenever `current` or `forecast` changes

---

### Agronomy Intelligence Cards (`b3cf136`)

**New utility files:**

`src/utils/agronomy/gddEngine.js` — `computeGDDSummary(forecast, baseTempF=50)`
- Accumulates GDD from forecast using base temp (default 50°F)
- Returns: `{ todayGDD, sevenDayGDD, avgDailyGDD, baseTempF, statusMeta, windows, fungicide:{status,daysTo}, pgr:{status,daysTo}, nutrient:{status,daysTo} }`
- Thresholds: fungicide `{150, 250, 350}`, pgr `{100, 200, 280}`, nutrient `{200, 350, 500}`
- Status values: `early` · `optimal` · `late` · `expired`
- `statusMeta` maps status → `{ label, color, bg, border }` tokens

`src/utils/agronomy/applicationEffectiveness.js` — `computeApplicationEffectiveness(current, forecast)`
- 5 factors × 20pts each: wind, humidity, temp, rain, dew spread
- Returns: `{ score(0–100), rating:{label,color,bg,border}, factors[], positives[], negatives[] }`

**New components:**

`GDDCard.jsx` + `GDDCard.module.css` — flat progress bars with status badges and notes

`AppEffectivenessCard.jsx` + `AppEffectivenessCard.module.css` — score display + factor bars + positive/negative notes

**Dashboard layout:**
- `agronomySection`: `1fr 1fr` grid below the weather section (later replaced in the redesign)

**ETCard moved:**
- Removed `ETCard` from `Dashboard.jsx`
- Added `ETCard` to `IrrigationDashboard.jsx` at the top of the irrigation tab

---

### Dashboard Weather + Agronomy Redesign (`6991df8`)

**Pre-work:**
- Created and pushed backup branch `backup/pre-dashboard-weather-redesign`
- Created and pushed tag `pre-weather-dashboard-redesign`
- Verified clean tree and passing build before any changes

**`Dashboard.jsx` + `Dashboard.module.css`:**
- Replaced `agronomySection` with `intelligenceRow`: `grid-template-columns: 2fr 1fr`, `align-items: stretch`
- `intelligenceWeather` (left, 2fr): `display: flex; flex-direction: column`
- `intelligenceRight` (right, 1fr): `display: flex; flex-direction: column; gap` + `> * { flex: 1 }` to equally share height between GDD and AppEffectiveness cards
- Breakpoint: `grid-template-columns: 1fr` at ≤1100px

**`WeatherSection.jsx`** — full rewrite:
- `wsSection` set to `flex: 1` to fill `intelligenceWeather`
- `WeatherInsightsCard` now receives full `forecast` array (not just day 0)
- Header: spray condition badge moved to header right cluster (alongside timestamp + refresh)
- Main display: `.wsMainLeft` (emoji + temp + feels like) | `.wsMetricsGrid` (3×2 grid, left-border divider)
- Status strip: Disease Pressure | Irrigation Tonight | ET Today
- Embedded 7-day forecast: `wsEmbForecast` horizontal scroll (`overflow-x: auto; scroll-snap-type: x mandatory`) — compact cards `wsEmbFcastCard` (84px min-width, `flex-shrink: 0`)

**`WeatherSection.module.css`** — full rewrite:
- `wsSection { flex: 1 }` — fills intelligenceWeather
- `wsCard { flex: 1 }` — fills wsSection after banners
- `wsMainDisplay`: `display: flex; align-items: center; gap: 14px`
- `wsMetricsGrid`: `border-left` divider (not `border-top/border-bottom` as before)
- All standalone forecast row classes (`.wsForecastOuter`, `.wsForecastRow`, `.wsForecastCard`, etc.) removed
- All ET card classes (`.wsETBig`, `.wsETValues`, `.wsBarChart`, etc.) removed
- New embedded forecast classes: `wsEmbForecast`, `wsEmbFcastCard`, `wsEmbFcastCardToday`, and all sub-elements

**`GDDCard.jsx`** — redesigned:
- 4-stat row (GDD Today · 7-Day Accum. · Daily Avg · Base Temp) replaces 3-stat row
- `GDDScale` sub-component: zone-colored CSS gradient track (Early/blue → Optimal/green → Late/amber) with absolute-positioned fill bar, marker lines at threshold boundaries, zone label row below
- `GDDScale({ current, windows, color })`: `m1 = optimalStart/expired×100`, `m2 = optimalEnd/expired×100`; fill `width = Math.min(100, current/expired×100)%`

**`GDDCard.module.css`** — updated:
- New classes: `gddScaleWrap`, `gddScaleTrack` (relative, CSS gradient bg), `gddScaleFill` (absolute, fill bar), `gddScaleMarker` (absolute, 1px white line), `gddScaleLabels` (relative, 12px tall), `gddZoneLabel` (absolute, `transform: translateX(-50%)`)

**`AppEffectivenessCard.jsx`** — redesigned:
- `CircleGauge({ score, color })`: SVG, `r=30`, `circ=2π×30≈188.5`, `strokeDashoffset = circ × (1 - score/100)`, `rotate(-90 38 38)` to start at 12 o'clock
- Layout: `.aeBody` (flex row) — gauge left (76×76px relative wrap with absolute centered overlay) | factors right (flex col, positives ✓ green + negatives ✕ red)
- Bottom: `<p className={styles.aeRec}>` — italic recommendation text driven by `recText(score)` helper
- Factor bars removed; checklist pattern replaces them

**`AppEffectivenessCard.module.css`** — full rewrite:
- New classes: `aeBody`, `aeGaugeWrap` (76×76 relative), `aeGaugeCenter` (absolute inset, flex col center), `aeScoreNum`, `aeRatingTag`, `aeFactors`, `aeFactorRow`, `aeFactorIcon`, `aeFactorText`, `aePos` (green), `aeNeg` (#e07070), `aeRec` (italic, border-top)
- Old classes removed: `aeScore`, `aeScoreNumber`, `aeScoreRight`, `aeRatingBadge`, `aeRatingLabel`, `aeTrack`, `aeFill`, `aeFactorPts`, `aeNotes`, `aeNote`, `aeNoteIcon`, `aePositive`, `aeNegative`

---

## Session 7 — 2026-05-08

**Commit:** `5609f60` — Refine and stabilize live weather operations layer  
**Build:** 163 modules, 0 errors · known warning: bundle chunk >500 kB (not blocking)

### Weather System Stabilization + Operational Accuracy Pass

#### Source Diagnostics (`src/utils/weather/api.js`)
- Added internal `fetchCurrentWithSource()` returning `{ data, source }` — distinguishes NWS vs METAR without exposing the detail externally
- `fetchWeatherBundle()` now logs to `console.debug` at each resolution step:
  - `source=cache age=Xmin cached-at=<ISO>` on fresh cache hit
  - `source=nws|metar forecastDays=N fetched-at=<ISO>` on live fetch
  - `source=stale-cache age=Xmin stale=true cached-at=<ISO>` on stale fallback
  - `all sources failed — no data available` when everything is down
- `readCache()` now attaches `_cacheAgeMs` to return value for diagnostics; stripped before any external return or write

#### Forecast Accuracy Improvements (`src/utils/weather/normalize.js`)
- **Rainfall estimation**: replaced PoP-only formula with `estimateRainfallIn(pop, shortForecast)` — combines probability with NWS text keywords: `heavy` (×1.8), `thunder/storm` (×1.2), `scattered/isolated` (×0.5), `slight/light` (×0.3), `drizzle` (×0.15), default (×0.8). Capped at 3.0 in.
- **Forecast spray window**: new `computeForecastSprayWindow(windMph, pop, highF, shortForecast)` — marks poor when PoP > 60% or rain keywords present; caution when PoP > 25% or temp > 88°F; otherwise ideal
- **Icon matching**: `ICON_MAP` reordered most-specific-first to prevent substring shadowing (e.g. "Mostly Cloudy" must precede bare "Cloudy"). Added: `T-Storm`, `Rain And`, `Showers And`, `Wintry Mix`, `Sleet`, `Haze`, `Smoke`, `Breezy`, `Mostly Sunny`, `Mostly Clear`. Case-insensitive fallback catches non-standard NWS strings.

#### Disease Pressure Refinement (`src/utils/weather/normalize.js`)
- **Observation**: `computeDiseasePressure()` extended with `inActiveRange` (65–88°F — dollar spot / pythium sweet spot). Same humidity + spread thresholds now escalate one level when temps are in active range. Near-saturation guard: spread ≤ 3°F OR humidity ≥ 92% → critical regardless.
- **Forecast multi-day escalation**: `baseForecastDisease()` scores single-day risk; a second pass over the `days` array tracks `wetStreak` (consecutive days with rainfall > 0.1 in) and escalates: streak ≥ 3 + rainfall > 0.2 in → critical; streak ≥ 2 + warm overnight low (≥ 62°F) → high; streak ≥ 2 → medium floor. Reflects real fungal pressure accumulation across wet windows.

#### ET Approximation Refinement (`src/utils/weather/normalize.js`)
- `estimateET()` gains `solarFactor` parameter (default 1.0 = clear sky, 0.55 = fully overcast)
- `solarFactorFromPoP(pop)` computes factor: `1.0 − (pop/100) × 0.45` — linear interpolation
- Forecast ET now passes `sf = solarFactorFromPoP(pop)` per day: sunny days get full solar contribution; rainy days reduced by 45%
- Observation ET unchanged (no PoP available for current conditions) — uses solarFactor=1.0

#### Weather Failure Handling
- If forecast fails but current succeeds: `forecast: []` written to cache; hook falls back to `PLACEHOLDER_FORECAST` via `resolvedForecast` guard
- If current fails but stale cache exists: stale bundle returned with `stale: true`; hook sets `isStale=true`, STALE badge shown on card
- If all sources fail: returns null; hook sets error, UI shows placeholder data with error banner; no hard failures anywhere in the render tree

#### Refresh Controls (`src/pages/Dashboard/WeatherSection.jsx`)
- `useWeather()` now destructures `refresh` and passes it to `WeatherInsightsCard`
- `WeatherInsightsCard` receives `loading` + `onRefresh` props
- Refresh button (↻) added to card header right of "Updated" timestamp; disabled + shows `…` while loading; hover shows green accent color
- CSS: `.wsHeaderRight` flex wrapper + `.wsRefreshBtn` styles added to `WeatherSection.module.css`

---

## Session 6 — 2026-05-08

**Commits:** `2259037` (persistence) · `7d58f3d` (metrics fix) · `95edf6e` (inventory automation) · `f3f4d43` (weather engine) · `23890f6` (live weather)  
**Build:** 163 modules, 0 errors

### OperationsContext Persistence Layer
- `STORAGE_KEY = 'turfintel-operations'`; lazy `useReducer` initializer reads localStorage once on mount
- `mergeWithSeed(loaded)` for rolling upgrades — iterates seedState keys, preserves loaded values when not undefined; new keys get seed defaults
- `loadState()` / `saveState()` isolated adapter functions — swap for API/D1/Supabase without touching reducer
- `useEffect([state])` write-back on every reducer change
- Dedup guard in `CREATE_CALENDAR_EVENT`: rejects `sourceId + category + date` duplicates

### Operations Calendar Metrics Fix
- Weekly metrics (`spray`, `crew`, `maintenance`, `openRepairs`) now derived from `state.calendarEvents` via `useMemo` — no more static dataset imports; survives refresh

### Inventory ↔ Spray Automation
- `inventoryProducts` and `inventoryUsage` added to seedState; `DEDUCT_INVENTORY` reducer action
- `toInventoryProduct(p, prefix)` normalizes PRODUCTS (`p-` prefix) + CHEMICALS (`c-` prefix) to unified shape
- `BuildSpraySheet.handleAddToCalendar()` pre-computes threshold crossings (low/critical/out) and dispatches alerts before `deductInventory`; pure reducer constraint maintained
- `InventoryProducts.jsx` reads live `state.inventoryProducts`; stores `selectedId` not object to avoid stale modal

### Weather Operations Engine Phase 1
- `src/utils/weather/evaluator.js` — 6 pure evaluator functions (spray window, disease pressure, ET demand, frost risk, rain delay, heat stress)
- `src/utils/weather/recommendations.js` — `generateWeatherRecommendations()` orchestrates all evaluators, stamps IDs, sorts by severity
- `WeatherIntelligence.jsx` — Dashboard card; push-to-alerts pattern; `pushed` Set prevents double-dispatch

### Live Weather Integration Phase 2
- `src/utils/weather/normalize.js` — NWS observation + METAR normalization; ET estimation; disease pressure; spray window; feels-like
- `src/utils/weather/api.js` — 4-source fallback chain; 15-min localStorage cache
- `src/utils/weather/useWeather.js` — React hook; resolves to placeholders on error; exposes `isLive`, `isStale`, `refresh`

---

## Session 5 — 2026-05-08

**Commits:** Spray Sheet tab · Operations Layer · Persistence + dedup  
**Build:** 156 modules, 0 errors · known warning: bundle chunk >500 kB (not blocking)

### Spray → Build Spray Sheet (new tab)
- Left panel: multi-select application cards pulled from `SPRAY_RECORDS`; each card has a separate checkbox button (top-right) and a clickable body for detail; selected cards show `ssAppCardSelected` green border
- Right panel: sticky 420px `ssPanelWrap`; empty state or generated `ssSheet` document
- Sheet sections: header (course + date + sheet ID), weather window (wind/temp/humidity/spray window), summary (areas + total product + REI + applicator), product table (`ssSheetTable`, border-collapse, deduped via `Map`), PPE block (unique from `PRODUCT_META`), safety notes, signature block
- `buildProductTable()`: deduplicates products across all selected records by product name — merges area and volume
- `buildPPE()`: collects unique PPE requirements across all selected records via `PRODUCT_META` lookup
- "Add to Operations Calendar" dispatches `createCalendarEvent` per selected record; if `maxREI > 0` dispatches `createAlert` with priority based on REI hours
- Print: `@media print` hides `.ssList`, makes `.ssPanelWrap` full-width static, sheet white on white
- CSS prefix: `ss*` · File: `src/pages/Spray/tabs/BuildSpraySheet.jsx`

### Shared Operations Layer (`src/utils/operations/`)
- `schemas.js`: factory functions `makeCalendarEvent()`, `makeAlert()`, `makeCrewAssignment()`, `makeEquipmentReservation()` — output matches existing static dataset shapes exactly
- `actions.js`: six action type constants + six pure action creators returning `{ type, payload }`; API-ready pattern documented in comments
- `OperationsContext.jsx`: React Context + `useReducer`; initial state seeded from static datasets
- Integration targets wired: Spray Sheet → calendar events + REI alerts; Irrigation Repairs → calendar events + high-priority alerts; Equipment Maintenance → calendar events + equipment reservations (two-dispatch pattern using `makeCalendarEvent()` directly to capture ID)
- Dashboard wired: reads `state.alerts`, dispatches `acknowledgeAlert` / `dismissAlert`
- Operations Calendar wired: reads `state.calendarEvents`; `calendarEvents` added to `filteredEvents` useMemo dep array
- Global utility classes appended to `src/index.css`: `.opActionBtn`, `.opActionRow`, `.opToast`, `@keyframes opToastIn`

### OperationsContext Persistence Layer
- `STORAGE_KEY = 'turfintel-operations'`
- Lazy `useReducer` initializer: `() => loadState() ?? seedState` — reads localStorage once on mount
- `loadState()`: `JSON.parse` inside try/catch; on failure clears corrupt key, `console.warn`, returns `null`
- `saveState()`: `JSON.stringify` inside try/catch; quota/private-browsing failures are silent
- `useEffect([state])`: writes full state on every reducer change
- `loadState` / `saveState` are isolated adapter functions — swap for API / Cloudflare D1 / Supabase / Firebase without touching reducer or any consumer
- **Deduplication guard in `CREATE_CALENDAR_EVENT`**: checks `sourceId + category + date` uniqueness; returns existing state unchanged if match found; events without `sourceId` are always allowed

---

## Session 4 — 2026-05-08

**Commit range:** `1956bf0` → `0126ab9`  
**Features shipped:** Operations Calendar · Crew Scheduling Board · Dashboard Weather Redesign  
**Build:** 153 modules, 0 errors · known warning: bundle chunk >500 kB (not blocking)

### Dashboard → Operations Calendar
- Replaces old `CalendarGrid` / `MonthNavigation` / `EventBadge` / `CalendarEventDetail` widget
- Data: `src/data/dashboardCalendarEvents.js` — 36 events, 5 categories (spray, crew, maintenance, agronomy, irrigation), forward-compatible schema: `{ id, category, priority, status, title, date, startTime, endTime, location, assignedStaff[], equipment[], tags[], notes, recurrence, externalId, metadata }`
- Three views: **Month** (42-cell Mon-start grid, up to 3 chips + "+N more" overflow) · **Week** (Mon–Sun 7-column grid, full event cards) · **List** (date-grouped, sticky date headers, Today pill)
- Right panel (240px, position: sticky): mini calendar (always TODAY's month), upcoming events (next 5 after today filtered by active categories), weekly metrics grid (spray / crew / maintenance / open repairs anchored to TODAY's week), conditions strip from `PLACEHOLDER_CURRENT`
- Category filter chips (5 colors); event cards use `--chip-color` CSS custom property + `::before` pseudoelement for 10% tinted background
- Event detail modal (IIFE): category-colored accent bar, all event fields, tags as chips, notes block
- Day overflow modal (IIFE): lists all events for a day; click any to close overflow and open event detail
- `eventsByDate = useMemo(() => Map)` for O(1) lookup; `weeklyMetrics` stable — never changes on nav
- `buildMonthGrid(year, month)` returns 42 cells Mon-start; `getWeekDates(refDateStr)` returns Mon–Sun array
- CSS prefix: `oc*` · Files: `OperationsCalendar.jsx`, `OperationsCalendar.module.css`
- Commit: `1956bf0`

### Crew → Schedule (full rebuild)
- Previous version was a read-only schedule viewer — replaced with a full live scheduling board
- Data: `SCHEDULE` in `src/data/crew.js` — 40 records (8 employees × 5 days Mon–Fri 2026-05-04–2026-05-08)
- Inline `AVAILABILITY` constant (6 records): medical leave, vacation, call-out, time-off, unavailable
- **Week view**: 9-column CSS Grid (`150px repeat(7, minmax(106px, 1fr)) 46px`) — employee name · Mon–Sun · weekly total; `Fragment` with `key` for multi-cell rows
- **Day view**: filtered card list for selected day
- Shift card colors by status group: green (active/completed/scheduled) · gray (off) · yellow (half-day/late) · blue (special) · red (absent/call-out/unavailable)
- Empty week cells: dashed add button (opacity:0, shown on `.csbDayCell:hover`)
- Right-side edit panel (300px, `max-height: 680px, overflow-y: auto`): full form — employee select, date, start/end time, routing toggle (None/Press/Hammer), assignedArea select (11 options), task text, shift type, status select (10 options), notes textarea; Save + Delete buttons
- `handleSave()`: upsert by `form.id`; `handleDelete()`: filter out; both call `showToast()` + `closePanel()`
- Toast auto-dismisses via `setTimeout` 2500ms
- Crew Availability section: tabbed filter (All / Approved / Pending / Medical|Vacation / Call-Out); type + status badges using `styles[\`csbAvailT_${type.replace(/-/g,'_')}\`]` pattern
- `scheduleMap = useMemo(() => map keyed by ${employeeId}-${date})` for O(1) shift lookup
- CSS prefix: `csb*` · Appended to `src/pages/Crew/Crew.module.css`
- Commit: `63382a3`

### Dashboard → Weather Section (full redesign)
- Replaces old `WeatherCard` / `ETCard` / `ForecastStrip` / `WeatherAlertBanner` stack
- New component: `WeatherSection.jsx` — self-contained, receives `{ alerts, onDismissAlert }` props
- **Weather Insights card**: cloud SVG icon, location + updated timestamp, large weather emoji (54px) + current temp (54px) + feels like, 6-metric grid (Humidity, Wind, Dew Point, Soil Temp, 24h Rain, Solar Rad), bottom strip with Disease Pressure badge + ET Today value
- **Evapotranspiration card**: droplet SVG icon, 7-day total in header, ET Rate Today (36px green) + ET Deficit (36px amber) in 2-col grid, pure CSS flex bar chart (7 bars, `wsBarTrack / wsBar / wsBarCol` pattern, inline `style={{ height: \`${heightPct}%\` }}`)
- **7-day forecast row**: scrollable outer (`overflow-x: auto`), `min-width: 700px` inner grid (`repeat(7, minmax(110px, 1fr))`), per-card: day label, date, weather icon emoji, high/low temps, rain or "No rain", ET rate, condition badge (Wet Conditions / Monitor / Good Conditions / Marginal / Poor Conditions)
- `forecastCondition(day)` helper: rainfall ≥0.5 → Wet; rainfall >0.1 → Monitor; else based on sprayWindow token
- Inline SVG icons: `IconCloud`, `IconDroplet`, `IconWind` (no external icon library)
- Glass card design: `linear-gradient(150deg, rgba(6,20,6,0.97), rgba(2,10,2,0.99))` + `border: 1px solid rgba(74,158,74,0.22)` + `box-shadow: 0 4px 24px rgba(0,0,0,0.45)`
- Responsive: top row stacks to 1 column at ≤1000px; forecast scrolls horizontally on mobile
- CSS prefix: `ws*` · Files: `WeatherSection.jsx`, `WeatherSection.module.css`
- `Dashboard.jsx` changes: removed old weather component imports, added `import WeatherSection from './WeatherSection'`, replaced weather JSX block
- Commit: `0126ab9`

---

## Session 3 — 2026-05-08

**Commit range:** `e051267` → `53412d1`  
**Modules shipped:** Crew Hours · Crew Schedule · Crew Employees · Crew Tasks  
**Build:** 144 modules, 0 errors

### Crew → Hours
- `HOURS_LOG` appended to `src/data/crew.js` — 14 records (8 today, 6 yesterday)
- Schema: `{ id, employeeId, employeeName, department, role, date, startTime, endTime, totalHours, overtimeHours, hourlyRate, assignedTask, assignedArea, status, notes }`
- Status values: `clocked-in` · `completed` · `absent` · `late`
- `shiftCost(log)` = `(totalHours - overtimeHours) × rate + overtimeHours × rate × 1.5`
- Stat row: Total Hours Today (48h) · Overtime Hours (1.5h) · Crew Present (7) · Labor Cost Est. ($1,034)
- Card class uses `.replace('-', '_')` for hyphenated status: `chCard_clocked_in`
- Overtime Breakdown section in modal only renders when `overtimeHours > 0`
- CSS prefix: `ch*` · File: `src/pages/Crew/tabs/CrewHours.jsx`

### Crew → Schedule
- `SCHEDULE` appended to `src/data/crew.js` — 40 records (8 employees × 5 days)
- Week: Mon 2026-05-04 through Fri 2026-05-08; TODAY = Friday
- James Thompson has Wed 5/6 off; Brandon Willis has Tue 5/5 off
- Status values: `active` · `completed` · `absent` · `late` · `off`
- O(1) lookup: `scheduleMap[${employeeId}-${date}]` via useMemo
- Dual view toggle: **Daily** (filtered card list) + **Weekly** (CSS Grid table)
- Weekly grid: `grid-template-columns: 150px repeat(5, 1fr) 52px` — 7 columns (name · Mon–Fri · Wk total)
- Border trick: container has `border-top + border-left + overflow:hidden`, cells have `border-bottom + border-right`
- `Fragment` import required (not `<>`) for `key` prop on employee rows
- `weeklyTotal(employeeId)` sums scheduledHours, skipping off/absent entries
- Today (Fri 5/8): 7 scheduled, 1 off/absent, 3 opening crew, 56h scheduled
- CSS prefix: `cs*` · File: `src/pages/Crew/tabs/CrewSchedule.jsx`

### Crew → Employees
- `EMPLOYEES` appended to `src/data/crew.js` — 8 records (EMP-001 through EMP-008)
- Key employees: EMP-004 Derek Lawson (Crew Lead, $28/hr, 4 certs), EMP-003 Miguel Santos (Lead Spray Tech, $24/hr, 3 certs), EMP-008 Tommy Chen (Seasonal)
- Stat row computed: 6 active, 2 supervisors, 6 certified, $21.00/hr avg
- `isSupervisor(emp)` = `emp.role.includes('Lead') || emp.department === 'Supervisory'`
- `initials(name)` = first letter of each word, max 2 chars
- `fmtDate(s)` converts YYYY-MM-DD → "Mon DD, YYYY" via MONTHS array
- `yearsService(hireDate)` computed relative to 2026-05-08
- Avatar ring color driven by `ceAvatar_${emp.status}` CSS class
- Cert tags (green), language tags (teal), "No certifications on file" italic when empty
- CSS prefix: `ce*` · File: `src/pages/Crew/tabs/CrewEmployees.jsx`

### Crew → Tasks
- `TASKS` appended to `src/data/crew.js` — 12 records, all dueDate: 2026-05-08
- Stat row: Open/Blocked (5) · In Progress (3) · Completed Today (4) · High Priority (3)
- Triple filter: Department + Status + Priority
- Priority left-accent: `#c0392b` high · `#dca032` medium · `#4a9e4a` routine
- `ctCard_completed` defined AFTER priority classes — overrides left-accent to muted (#555) via CSS cascade
- `empMap = useMemo(() => new Map(EMPLOYEES.map(e => [e.employeeId, e])))` — O(1) name resolution
- Assignment chips: "First L." format from resolved employee names
- Equipment: first 2 items visible, "+N more" badge when overflow
- `pct(task)`: `estimatedHours === 0 ? (status === 'completed' ? 100 : 0) : Math.min(100, Math.round(completedHours / estimatedHours * 100))`
- Progress bar fill uses priority accent color
- Due Today badge on open/in-progress tasks where `dueDate === TODAY`
- CSS prefix: `ct*` · File: `src/pages/Crew/tabs/CrewTasks.jsx`

---

## Session 2 — 2026-05-07

**Commit range:** `3b7ecb5` → `9ceb892`  
**Modules shipped:** Spray Records · Disease Active Issues · Inventory Products · Equipment List · Equipment Maintenance Logs  
**Build:** 144 modules, 0 errors

### Spray → Spray Records
- `SPRAY_RECORDS` in `src/data/spray.js`
- Stat row: Records This Month · Total Area · Total Product · Active REI Violations
- REI countdown badge on cards still within re-entry interval
- Detail modal: Application Details · Product Info · Application Parameters · Compliance · Notes
- CSS prefix: `sr*` · File: `src/pages/Spray/tabs/SprayRecords.jsx`

### Disease → Active Issues
- `ACTIVE_ISSUES` in `src/data/disease.js`
- Stat row: Active Issues · Critical · Avg Pressure · Days Since Scouting
- Severity badges: Critical · High · Moderate · Low
- Pressure rating displayed per issue
- Detail modal: Issue Overview · Scouting Data · Treatment Plan · Notes
- CSS prefix: `di*` · File: `src/pages/Disease/tabs/DiseaseActiveIssues.jsx`

### Inventory → Products
- `PRODUCTS` in `src/data/inventory.js`
- Stat row: Total SKUs · Low Stock Items · Critical Stock · Pending Orders
- Low-stock warning badge when stock at or below threshold
- Detail modal: Product Info · Stock Levels · Supplier Info · Notes
- CSS prefix: `ip*` · File: `src/pages/Inventory/tabs/InventoryProducts.jsx`

### Equipment → Equipment List
- `EQUIPMENT_LIST` in `src/data/equipment.js`
- Stat row: Fleet Total · Operational · In Service · Due for Service
- Cards: equipment name, make/model, serial, hours, last/next service, status
- Detail modal with full spec sheet
- CSS prefix: `el*` · File: `src/pages/Equipment/tabs/EquipmentList.jsx`

### Equipment → Maintenance Logs
- `SERVICE_LOG` in `src/data/equipment.js` — 14 records
- Stat row: Logs This Month · Total Cost · Avg Cost · Open Work Orders
- Service type chips: PM · Repair · Inspection · Oil Change · Blade Service · etc.
- Detail modal: Equipment Info · Service Details · Labor & Cost · Notes
- CSS prefix: `ml*` · File: `src/pages/Equipment/tabs/MaintenanceLogs.jsx`
- Wired into `Equipment.jsx` alongside Equipment List

---

## Session 1 — 2026-05-06 / 2026-05-07

**Commit range:** (initial setup) → `86c8963`  
**Work completed:**

### Foundation
- React 19 + Vite 8 project scaffold
- React Router DOM v7 routing (all 10 module pages)
- CSS Modules throughout — no Tailwind, no styled-components
- Global CSS tokens in `src/index.css`
- Custom scrollbars (dark track, green thumb)

### Layout & Sidebar
- `Layout.jsx` / `Layout.module.css` — shell, `.outlet` is single scroll owner
- `Sidebar.jsx` — expand/collapse with smooth animation
- PNG icon system: `public/sidebar-icons/[name].png`, 34×34px in 42×42px tiles
- Active row: left inset accent + ambient glow
- Collapse toggle: SVG chevron (only remaining SVG component)
- Logo: `logo-full.png` (expanded) / `logo-mark.png` (collapsed, `mix-blend-mode: screen`)
- 5 of 11 icons provided: dashboard, crew, chemical, spray, plant-nutrition

### Dashboard
- Weather section: WeatherCard, ETCard, ForecastStrip, WeatherAlertBanner
- Alert system: AlertList with priority grouping, acknowledge, dismiss
- Card grid: DashboardCard with `wide` / `tall` / `full` props
- Combined calendar widget: MonthNavigation + CalendarGrid + EventBadge legend
- 17 placeholder calendar events in `src/data/dashboardCalendarEvents.js`
- CalendarEventDetail modal: color accent bar, all fields conditional
- Unified scroll model: `.outlet` owns scroll, no dashboard-level overflow lock

### Module Overview Tabs
- All 9 module pages default to Overview tab
- Shared primitives: `ModuleOverview`, `StatCard`, `InfoCard`, `Badge`
- Each page has a `[Page]Overview.jsx` with placeholder stats and info panels

### Chemical → Labels
- Fully built label lookup tab
- CSS prefix: `cl*`

### Crew → Notes
- Stub placeholder

### Infrastructure
- `CourseContext` — active course selector (top-right)
- `UploadDropzone`, `UploadedFileCard`, `UploadStatusBadge` shared components
- Cloudflare Pages auto-deploy on push to master configured
