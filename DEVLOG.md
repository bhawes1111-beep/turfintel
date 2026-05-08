# TurfIntel Pro — Development Log

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
