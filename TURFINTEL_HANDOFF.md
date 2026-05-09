# TurfIntel Pro — Complete Project Handoff

**Document Date:** 2026-05-08  
**Latest Commit:** `9d22f1e`  
**Build:** 172 modules · 0 errors · 1 known warning (chunk >500 kB — not blocking)  
**Branch:** `master` — clean, synced with `origin/master`  
**Repo:** https://github.com/bhawes1111-beep/turfintel  

---

## 1. Project Overview

### What TurfIntel Pro Is

TurfIntel Pro is a professional golf course turf management dashboard built for a golf course superintendent. It centralizes all turf operations into a single web application:

- Live weather monitoring (NWS/METAR integration)
- Spray program tracking and spray sheet generation
- Crew scheduling and hours tracking
- Equipment and maintenance log management
- Disease scouting and pressure tracking
- Irrigation advisory and ET tracking
- Inventory management with depletion tracking
- Agronomy intelligence (GDD-based reapplication windows, spray condition scoring)
- Shared operations calendar across all modules

### Core Design Principle

**TurfIntel advises the superintendent — it never makes decisions for them.** All intelligence cards display recommendations and data for review. The superintendent takes action manually. No auto-dispatching of alerts, tasks, or work orders.

### Hosting / Deployment

- **Host:** Cloudflare Pages
- **Auto-deploy:** Every push to `master` triggers an automatic Cloudflare build and deployment
- **Domain:** Configured in Cloudflare Pages dashboard (no code changes needed for domain updates)
- **Build command:** `npm run build`
- **Output directory:** `dist`

### GitHub Workflow

```
Local edit → npm run build (verify) → git add [files] → git commit → git push origin master
                                                                           ↓
                                                              Cloudflare auto-builds
```

---

## 2. Current Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 19 | Functional components + hooks only |
| Build tool | Vite 8 | Rolldown bundler |
| Routing | React Router DOM v7 | All routes in `src/App.jsx` |
| Styling | CSS Modules | Zero Tailwind, zero styled-components |
| Dynamic styles | Inline `style={{}}` | Only for values computed at runtime (colors, widths) |
| Language | Plain JavaScript | No TypeScript |
| State | React useState + useReducer | No Redux, no Zustand |
| Cross-module state | React Context (OperationsContext) | Single shared context for calendar/alerts/inventory |
| Persistence | localStorage | Two keys: operations state + weather cache |
| Weather | NWS API + AviationWeather METAR | Browser-direct fetch, no backend proxy |
| Icons | PNG files in `/public/sidebar-icons/` | Inline SVG only for cloud/collapse chevron |
| Logo | PNG files in `/public/` | logo-full.png + logo-mark.png — DO NOT CHANGE |
| Deploy | Cloudflare Pages | Auto-deploy on push to master |

### localStorage Keys
| Key | Contents | TTL |
|---|---|---|
| `turfintel-operations` | Calendar events, alerts, inventory state, crew assignments | Survives refresh — no expiry |
| `turfintel-weather-cache` | Latest weather bundle (current + forecast + etTrend + source + timestamp) | 15-minute TTL |

---

## 3. Folder Structure

```
turfintel/
├── public/
│   ├── logo-full.png          ← Expanded sidebar logo (DO NOT CHANGE)
│   ├── logo-mark.png          ← Collapsed sidebar mark (DO NOT CHANGE)
│   ├── icons.svg              ← Committed but unused — can be deleted
│   └── sidebar-icons/         ← PNG nav icons (34×34px displayed in 42×42px tiles)
│       ├── dashboard.png      ✅
│       ├── crew.png           ✅
│       ├── chemical.png       ✅
│       ├── spray.png          ✅
│       ├── plant-nutrition.png ✅
│       ├── disease.png        ❌ MISSING
│       ├── cultural-practices.png ❌ MISSING
│       ├── budget.png         ❌ MISSING
│       ├── inventory.png      ❌ MISSING
│       ├── equipment.png      ❌ MISSING
│       └── settings.png       ❌ MISSING
│
├── src/
│   ├── index.css              ← Global CSS custom properties (color tokens, scrollbar)
│   ├── main.jsx               ← React root mount
│   ├── App.jsx                ← All React Router routes
│   │
│   ├── context/
│   │   └── CourseContext.jsx  ← Active course selector state (top-right UI element)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx/.module.css     ← Shell: sidebar + .outlet scroll owner
│   │   │   ├── Sidebar.jsx/.module.css    ← Nav + expand/collapse + PNG icons
│   │   │   ├── PageShell.jsx/.module.css  ← Per-page tab wrapper
│   │   │   └── CourseSelector.jsx/.module.css ← Course picker (top-right)
│   │   │
│   │   └── shared/
│   │       ├── ModuleOverview.jsx/.module.css ← StatCard, InfoCard, Badge primitives
│   │       ├── DashboardCard.jsx/.module.css  ← Card wrapper with wide/tall/full props
│   │       ├── ChemicalCard.jsx/.module.css   ← Chemical label cards
│   │       ├── ChemicalModal.jsx/.module.css  ← Chemical label detail modal
│   │       ├── icons.jsx                      ← Inline SVG components (minimal)
│   │       │
│   │       ├── alerts/
│   │       │   ├── AlertList.jsx          ← Priority-grouped alert list
│   │       │   ├── AlertCard.jsx          ← Individual alert with ack/dismiss buttons
│   │       │   ├── AlertBadge.jsx         ← Inline alert indicator
│   │       │   ├── alertTokens.js         ← Severity → color token map
│   │       │   └── index.js              ← Barrel export
│   │       │
│   │       ├── calendar/
│   │       │   ├── CalendarGrid.jsx       ← Legacy month calendar (still used in some modules)
│   │       │   ├── CalendarEventDetail.jsx← Legacy event detail modal
│   │       │   ├── CalendarEvent.jsx
│   │       │   ├── EventBadge.jsx
│   │       │   ├── MonthNavigation.jsx
│   │       │   ├── calendarTokens.js
│   │       │   └── index.js
│   │       │
│   │       ├── upload/
│   │       │   ├── UploadDropzone.jsx     ← Drag-and-drop file upload zone
│   │       │   ├── UploadedFileCard.jsx   ← Uploaded file display card
│   │       │   ├── UploadStatusBadge.jsx  ← Processing status badge
│   │       │   └── index.js
│   │       │
│   │       └── weather/
│   │           ├── weatherTokens.js       ← PLACEHOLDER_CURRENT/FORECAST/ET_TREND + token maps
│   │           ├── ETCard.jsx             ← Evapotranspiration card (used in Irrigation tab)
│   │           ├── WeatherCard.jsx        ← Legacy weather card (superseded by WeatherSection)
│   │           ├── ForecastStrip.jsx      ← Legacy forecast strip
│   │           ├── WeatherAlertBanner.jsx ← Alert banner component
│   │           ├── Weather.module.css
│   │           └── index.js
│   │
│   ├── utils/
│   │   ├── agronomy/
│   │   │   ├── gddEngine.js               ← GDD accumulation + reapplication windows
│   │   │   └── applicationEffectiveness.js ← 5-factor spray condition scorer
│   │   │
│   │   ├── operations/
│   │   │   ├── OperationsContext.jsx      ← React Context + useReducer + localStorage
│   │   │   ├── actions.js                 ← Action type constants + creator functions
│   │   │   └── schemas.js                 ← Factory functions for all entity types
│   │   │
│   │   └── weather/
│   │       ├── api.js                     ← Fetch layer: NWS → METAR → cache fallback
│   │       ├── normalize.js               ← NWS/METAR JSON → app-compatible shape
│   │       ├── evaluator.js               ← 6 pure weather evaluator functions
│   │       ├── recommendations.js         ← Orchestrates evaluators → recommendation list
│   │       ├── irrigationEngine.js        ← ET-based irrigation recommendation
│   │       └── useWeather.js              ← React hook: { current, forecast, etTrend, ... }
│   │
│   ├── data/
│   │   ├── crew.js                        ← HOURS_LOG, SCHEDULE, EMPLOYEES, TASKS
│   │   ├── equipment.js                   ← EQUIPMENT_LIST, SERVICE_LOG
│   │   ├── spray.js                       ← SPRAY_RECORDS
│   │   ├── disease.js                     ← ACTIVE_ISSUES
│   │   ├── inventory.js                   ← PRODUCTS (static seed; live state in localStorage)
│   │   ├── chemicals.js                   ← Chemical label data
│   │   ├── dashboardCalendarEvents.js     ← CALENDAR_EVENTS (36 events, 5 categories)
│   │   ├── dashboardAlerts.js             ← DASHBOARD_ALERTS (placeholder seed alerts)
│   │   ├── irrigation.js                  ← Irrigation stub data
│   │   ├── plantNutrition.js              ← Plant nutrition stub data
│   │   └── culturalPractices.js           ← Cultural practices stub data
│   │
│   └── pages/
│       ├── Dashboard/    ← Main dashboard (weather, calendar, alerts, agronomy)
│       ├── Crew/         ← Hours, Schedule, Employees, Tasks, Notes
│       ├── Spray/        ← Spray Records, Build Spray Sheet, + stubs
│       ├── Disease/      ← Active Issues + stubs
│       ├── Inventory/    ← Products + stubs
│       ├── Equipment/    ← Equipment List, Maintenance Logs + stubs
│       ├── Irrigation/   ← ET Dashboard, Repairs tab + stubs
│       ├── Chemical/     ← Chemical Labels + Overview
│       ├── PlantNutrition/ ← Overview + stubs
│       ├── CulturalPractices/ ← Overview + stubs
│       ├── Budget/       ← Overview stub only
│       ├── Settings/     ← Stub
│       └── Login/        ← Login page (no auth implemented yet)
```

---

## 4. Main Modules

### Dashboard

**Status:** Fully functional — core hub of the application  
**CSS prefix:** `ws*` (weather) · `oc*` (calendar) · `gdd*` (GDD) · `ae*` (app effectiveness)

**Key files:**
- `src/pages/Dashboard/Dashboard.jsx` — page shell; assembles all dashboard sections
- `src/pages/Dashboard/Dashboard.module.css` — intelligence row grid (2fr/1fr)
- `src/pages/Dashboard/WeatherSection.jsx` — unified Weather Insights card + embedded forecast
- `src/pages/Dashboard/WeatherSection.module.css`
- `src/pages/Dashboard/GDDCard.jsx` — Growing Degree Days zone-colored scale
- `src/pages/Dashboard/GDDCard.module.css`
- `src/pages/Dashboard/AppEffectivenessCard.jsx` — SVG ring gauge spray condition scorer
- `src/pages/Dashboard/AppEffectivenessCard.module.css`
- `src/pages/Dashboard/OperationsCalendar.jsx` — month/week/list calendar with right panel
- `src/pages/Dashboard/OperationsCalendar.module.css`
- `src/pages/Dashboard/WeatherIntelligence.jsx` — advisory-only weather recommendations card
- `src/pages/Dashboard/IrrigationIntelligence.jsx` — advisory-only irrigation recommendations card

**Completed workflows:**
- Live weather display (temp, humidity, wind, dew point, soil temp, 24h rain, solar rad)
- Embedded 7-day forecast inside weather card (scrollable)
- Disease pressure badge, Irrigation Tonight recommendation, ET Today
- Spray condition badge (Ideal / Caution / Poor)
- Growing Degree Days — per application type (Fungicide, PGR, Nutrient) with zone-colored scale
- Application Effectiveness — 5-factor ring gauge score + checklist
- Operations Calendar (Month / Week / List views, 5 category filter chips, event modals)
- Alert list (priority-grouped, acknowledge + dismiss from OperationsContext)
- Weather Intelligence advisory card (read-only recommendations)
- Irrigation Intelligence advisory card (read-only ET-based advisory)
- Auto weather refresh (every 10 minutes) + manual refresh button

**Pending:**
- Visual polish pass on weather card and agronomy cards
- Wire real course-specific data when backend exists
- Dashboard layout may need responsive refinement on narrow viewports

**Data files:**
- `src/data/dashboardCalendarEvents.js` — 36 static calendar events (seed data)
- `src/data/dashboardAlerts.js` — placeholder seed alerts
- Live weather from NWS/METAR (see Weather System section)
- OperationsContext (`localStorage['turfintel-operations']`) for live calendar/alerts

---

### Crew

**Status:** All 5 data tabs fully built  
**CSS prefix:** `ch*` (hours) · `csb*` (schedule board) · `ce*` (employees) · `ct*` (tasks)

**Key files:**
- `src/pages/Crew/Crew.jsx` — tab router
- `src/pages/Crew/Crew.module.css` — contains `ch*`, `csb*`, `ce*`, `ct*` styles
- `src/pages/Crew/tabs/CrewHours.jsx`
- `src/pages/Crew/tabs/CrewSchedule.jsx`
- `src/pages/Crew/tabs/CrewEmployees.jsx`
- `src/pages/Crew/tabs/CrewTasks.jsx`
- `src/pages/Crew/tabs/CrewNotes.jsx` — stub

**Completed workflows:**
- **Hours:** 14-record log, stat row (total hours/OT/present/labor cost), OT badge, detail modal with conditional overtime breakdown
- **Schedule:** Full scheduling board — Week grid (8 employees × 7 days) + Day card view; right-side edit panel with save/delete/toast; Crew Availability section with tabbed filter; O(1) `scheduleMap` lookup
- **Employees:** 8 employee records, profile grid cards, cert + language tags, detail modal
- **Tasks:** 12 tasks, triple filter (department/status/priority), progress bars, Due Today badge, assignment chips resolved from employee IDs

**Data file:** `src/data/crew.js` — exports `HOURS_LOG` (14), `SCHEDULE` (40), `EMPLOYEES` (8), `TASKS` (12)

---

### Spray

**Status:** 2 of ~5 tabs fully built  
**CSS prefix:** `sr*` (records) · `ss*` (spray sheet)

**Key files:**
- `src/pages/Spray/Spray.jsx` — tab router
- `src/pages/Spray/Spray.module.css`
- `src/pages/Spray/tabs/SprayRecords.jsx`
- `src/pages/Spray/tabs/BuildSpraySheet.jsx`
- Stubs: `MixCalculator.jsx`, `PlannedPrograms.jsx`, `SprayCalendar.jsx`, `SprayReports.jsx`

**Completed workflows:**
- **Spray Records:** Full record list — stat row (records/area/product/REI violations), filters, REI countdown badge, detail modal
- **Build Spray Sheet:** Multi-select application cards → generated spray sheet document with weather window, product table (deduped), PPE requirements, safety notes, signature block; "Add to Operations Calendar" dispatches events; print via `window.print()`

**Pending:** Mix Calculator, Planned Programs, Spray Calendar, Spray Reports

**Data file:** `src/data/spray.js` — exports `SPRAY_RECORDS`

---

### Disease

**Status:** 1 of ~4 tabs fully built  
**CSS prefix:** `di*`

**Key files:**
- `src/pages/Disease/Disease.jsx` — tab router
- `src/pages/Disease/tabs/ActiveIssues.jsx` — full implementation
- Stubs: `DiseaseAlerts.jsx`, `DiseaseLibrary.jsx`, `DiseaseReports.jsx`, `CourseMap.jsx`, `PhotoGallery.jsx`

**Completed workflows:**
- Active Issues: stat row (issues/critical/avg pressure/days since scouting), severity badges, detail modal with treatment plan

**Pending:** Disease Alerts, Library, Reports, Course Map, Photo Gallery

**Data file:** `src/data/disease.js` — exports `ACTIVE_ISSUES`

---

### Plant Nutrition

**Status:** Overview stub only; tab files created but not populated  
**CSS prefix:** none assigned yet

**Key files:**
- `src/pages/PlantNutrition/PlantNutrition.jsx`
- Stubs: `SoilReports.jsx`, `TissueReports.jsx`, `WaterReports.jsx`, `Recommendations.jsx`, `NutrientTrends.jsx`, `UploadCenter.jsx`

**Data file:** `src/data/plantNutrition.js`

---

### Cultural Practices

**Status:** Overview stub only; tab files created but not populated  
**CSS prefix:** none assigned yet

**Key files:**
- `src/pages/CulturalPractices/CulturalPractices.jsx`
- Stubs: `Aerification.jsx`, `Mowing.jsx`, `Verticutting.jsx`, `Rolling.jsx`, `Topdressing.jsx`, `PracticeCalendar.jsx`, `CPReports.jsx`

**Data file:** `src/data/culturalPractices.js`

---

### Budget

**Status:** Overview stub only; no data file  
**CSS prefix:** none assigned yet

**Key files:**
- `src/pages/Budget/Budget.jsx`
- `src/pages/Budget/tabs/BudgetOverview.jsx` — stub

---

### Inventory

**Status:** 1 of ~5 tabs fully built; live depletion wired to OperationsContext  
**CSS prefix:** `ip*`

**Key files:**
- `src/pages/Inventory/Inventory.jsx`
- `src/pages/Inventory/tabs/InventoryProducts.jsx` — full implementation
- Stubs: `InventoryChemicals.jsx`, `InventoryFertilizer.jsx`, `InventoryFuel.jsx`, `InventoryParts.jsx`, `InventoryLowStock.jsx`, `InventoryPurchaseHistory.jsx`

**Completed workflows:**
- Products: stat row (SKUs/low stock/critical/pending orders), low-stock badge, detail modal
- Live inventory reads from `state.inventoryProducts` in OperationsContext (survives refresh)
- Spray Sheet auto-deducts inventory via `DEDUCT_INVENTORY` action

**Data file:** `src/data/inventory.js` — exports `PRODUCTS` (used as seed for OperationsContext)

---

### Equipment

**Status:** 2 of ~4 tabs fully built  
**CSS prefix:** `el*` (list) · `ml*` (maintenance logs)

**Key files:**
- `src/pages/Equipment/Equipment.jsx`
- `src/pages/Equipment/tabs/EquipmentList.jsx`
- `src/pages/Equipment/tabs/MaintenanceLogs.jsx`
- Stub: `EquipmentOverview.jsx`

**Completed workflows:**
- Equipment List: fleet stat row (total/operational/in-service/due service), filters, cards, full spec sheet modal
- Maintenance Logs: 14-record service log, stat row (logs/cost/avg/open work orders), service type filter chips, detail modal

**Pending:** Work Orders tab, Parts/Inventory link, Equipment Calendar

**Data file:** `src/data/equipment.js` — exports `EQUIPMENT_LIST`, `SERVICE_LOG`

---

### Irrigation

**Status:** ET Dashboard built; remaining tabs are stubs  
**CSS prefix:** none assigned yet for Irrigation-specific cards

**Key files:**
- `src/pages/Irrigation/Irrigation.jsx`
- `src/pages/Irrigation/tabs/IrrigationDashboard.jsx` — ETCard + stub grid
- `src/pages/Irrigation/tabs/Repairs.jsx` — wired to OperationsContext for repair events

**Completed workflows:**
- ETCard: ET Rate Today + ET Deficit (big numbers), 7-day ET trend bar chart (pure CSS)
- Irrigation Intelligence advisory card on main Dashboard (read-only ET-based recommendations)

**Pending:** Zone mapping, system status, last cycle summary, pump station, wet/dry map, Toro Lynx integration, ET adjustment tool

**Data file:** `src/data/irrigation.js`

---

### Chemical

**Status:** Labels tab fully built; Overview wired  
**CSS prefix:** `cl*`

**Key files:**
- `src/pages/Chemical/Chemical.jsx`
- `src/pages/Chemical/tabs/ChemicalLabels.jsx`

---

### Settings

**Status:** Stub only  
**Key files:** `src/pages/Settings/Settings.jsx`

---

## 5. Shared Systems

### OperationsContext (`src/utils/operations/`)

The cross-module operational state manager. All calendar events, alerts, inventory deductions, crew assignments, and equipment reservations live here.

**Files:**

`OperationsContext.jsx` — React Context + `useReducer` + localStorage persistence
- `STORAGE_KEY = 'turfintel-operations'`
- Lazy initializer: `() => loadState() ?? seedState` — reads localStorage once on mount
- `useEffect([state])` writes full state on every reducer change
- `mergeWithSeed(loaded)` — for rolling upgrades; new keys get seed defaults, existing keys preserved
- `loadState()` / `saveState()` — isolated adapter functions; swap for Cloudflare D1 / Supabase / Firebase without touching reducer

`actions.js` — Six action type constants + pure action creator functions:
- `CREATE_CALENDAR_EVENT` / `createCalendarEvent(payload)`
- `CREATE_ALERT` / `createAlert(payload)`
- `ACKNOWLEDGE_ALERT` / `acknowledgeAlert(id)`
- `DISMISS_ALERT` / `dismissAlert(id)`
- `DEDUCT_INVENTORY` / `deductInventory(productId, amount)`
- `CREATE_CREW_ASSIGNMENT` / `createCrewAssignment(payload)`

`schemas.js` — Factory functions that produce entity shapes:
- `makeCalendarEvent({ title, category, date, ... })`
- `makeAlert({ title, message, severity, priority, ... })`
- `makeCrewAssignment({ employeeId, ... })`
- `makeEquipmentReservation({ equipmentId, ... })`

**Deduplication guard:** `CREATE_CALENDAR_EVENT` rejects payloads where `sourceId + category + date` already exists. Events without a `sourceId` always go through.

---

### Weather Engine (`src/utils/weather/`)

Five-file pipeline. Each file has a single responsibility. Evaluators never know the data source.

**`api.js`** — Fetch layer with 4-source fallback chain:
1. Fresh localStorage cache (< 15 minutes old)
2. NWS KSAV current observation + gridpoint forecast
3. AviationWeather METAR for KSAV (if NWS fails)
4. Stale localStorage cache (any age — last resort)
- If all fail: returns null → hook uses PLACEHOLDER_* data, shows error banner
- Source and timestamp attached to every bundle for the LIVE/STALE badge

**`normalize.js`** — Converts raw NWS/METAR JSON → app-compatible object shape:
- Celsius → Fahrenheit, km/h → mph, wind degrees → compass
- `estimateRainfallIn(pop, shortForecast)` — combines PoP with NWS text keywords (heavy ×1.8, scattered ×0.5, drizzle ×0.15, etc.)
- `computeDiseasePressure()` — humidity + dew point spread + temp range + consecutive wet-day streak
- `estimateET(tempF, humidity, windMph, solarFactor)` — empirical ET approximation
- `computeForecastSprayWindow(windMph, pop, highF, shortForecast)` — ideal / caution / poor

**`evaluator.js`** — 6 pure evaluator functions (accept plain JS objects, no React):
- `evaluateSprayWindow(current)` → `{ window, label, reason }`
- `evaluateDiseasePressure(current, forecast)` → `{ pressure, label, reason }`
- `evaluateETDemand(current)` → `{ demand, label, reason }`
- `evaluateFrostRisk(forecast)` → `{ risk, label, reason }`
- `evaluateRainDelay(forecast)` → `{ delay, label, reason }`
- `evaluateHeatStress(current)` → `{ stress, label, reason }`

**`recommendations.js`** — `generateWeatherRecommendations(current, forecast)`:
- Runs all 6 evaluators
- Stamps each recommendation with unique ID, severity, category
- Sorts by severity (critical → high → medium → low)
- Returns array consumed by WeatherIntelligence advisory card

**`irrigationEngine.js`** — `computeIrrigationSummary(current, forecast)`:
- Pure function: `(current, forecast) → { recApplication, skip, reason }`
- Considers ET rate, recent rainfall, forecast rain, soil temp
- Result displayed in Weather Insights status strip ("Irrigation Tonight")

**`useWeather.js`** — React hook:
```js
const { current, forecast, etTrend, loading, error, isLive, isStale, refresh } = useWeather()
```
- Fetches on mount, auto-refreshes every 10 minutes
- `refresh()` clears cache and re-fetches immediately
- Resolves to `PLACEHOLDER_*` on any error — UI never hard-fails
- Exposes `isLive` (fresh NWS/METAR data) and `isStale` (stale cache fallback) for badges

---

### Agronomy Engine (`src/utils/agronomy/`)

**`gddEngine.js`** — `computeGDDSummary(forecast, baseTempF = 50)`:
- Accumulates Growing Degree Days from forecast data
- Returns: `{ todayGDD, sevenDayGDD, avgDailyGDD, baseTempF, statusMeta, windows, fungicide, pgr, nutrient }`
- Each application type: `{ status: 'early'|'optimal'|'late'|'expired', daysTo }` 
- Thresholds: fungicide `{150, 250, 350}` · pgr `{100, 200, 280}` · nutrient `{200, 350, 500}`
- `statusMeta` maps status → `{ label, color, bg, border }` tokens for UI rendering

**`applicationEffectiveness.js`** — `computeApplicationEffectiveness(current, forecast)`:
- 5 factors × 20 points each: wind, humidity, temperature, rain, dew point spread
- Returns: `{ score(0–100), rating:{label,color,bg,border}, factors[], positives[], negatives[] }`
- `positives[]` = human-readable strings for favorable conditions (shown with ✓ green)
- `negatives[]` = human-readable strings for unfavorable conditions (shown with ✕ red)

---

### Shared Upload System (`src/components/shared/upload/`)

- `UploadDropzone` — drag-and-drop file drop zone
- `UploadedFileCard` — displays uploaded file info
- `UploadStatusBadge` — processing status (pending/processing/complete/error)
- Used in Plant Nutrition → Upload Center (and available for any future upload UI)

---

### Shared Calendar System (`src/components/shared/calendar/`)

Legacy calendar primitives — used by some module pages, partially superseded by the new OperationsCalendar on the Dashboard.

- `CalendarGrid` — month calendar grid
- `CalendarEventDetail` — event detail modal
- `EventBadge` — compact event chip
- `MonthNavigation` — prev/next month header
- `calendarTokens.js` — category → color token map

---

### Shared Alerts System (`src/components/shared/alerts/`)

- `AlertList` — priority-grouped alert list with ack/dismiss handlers
- `AlertCard` — individual alert card (priority color accent, acknowledge + dismiss buttons)
- `AlertBadge` — inline badge indicator
- `alertTokens.js` — severity/priority → color token map
- Wired to OperationsContext on Dashboard — `state.alerts`, dispatches `acknowledgeAlert` / `dismissAlert`

---

## 6. Data Storage

### Static JS Data Files (`src/data/`)

Hardcoded demonstration data. These are imported at build time and do not change at runtime (except where explicitly seeded into OperationsContext).

| File | Exports | Record Count | Notes |
|---|---|---|---|
| `crew.js` | `HOURS_LOG`, `SCHEDULE`, `EMPLOYEES`, `TASKS` | 14+40+8+12 | All dates relative to 2026-05-08 |
| `equipment.js` | `EQUIPMENT_LIST`, `SERVICE_LOG` | ~12+14 | |
| `spray.js` | `SPRAY_RECORDS` | — | |
| `disease.js` | `ACTIVE_ISSUES` | — | |
| `inventory.js` | `PRODUCTS` | — | Seed data — live state lives in localStorage |
| `chemicals.js` | (chemical label data) | — | |
| `dashboardCalendarEvents.js` | `CALENDAR_EVENTS` | 36 | 5 categories, May 2026 |
| `dashboardAlerts.js` | `DASHBOARD_ALERTS` | — | Seed alerts for OperationsContext |
| `irrigation.js` | (stub) | — | |
| `plantNutrition.js` | (stub) | — | |
| `culturalPractices.js` | (stub) | — | |

### localStorage: `turfintel-operations`

Persists operational state across browser sessions. Written on every state change.

**What survives refresh:**
- Calendar events (created via Spray Sheet → "Add to Operations Calendar")
- Alerts (created via OperationsContext; ack/dismiss state)
- Inventory product quantities (after deduction via Spray Sheet)
- Crew assignments (if created via OperationsContext actions)

**What does NOT survive refresh:**
- Current weather data (has its own separate cache key with 15-min TTL)
- Component-local UI state (selected tabs, open modals, search text, filter chips)
- Schedule board edits (CrewSchedule uses local useState — not persisted)

### localStorage: `turfintel-weather-cache`

Weather bundle cache. Expires after 15 minutes. If expired or missing, app re-fetches from NWS/METAR. On all-source failure, stale cache of any age is used as last resort.

### What Will Move to a Backend

When a real backend is added, the `loadState()` / `saveState()` functions in `OperationsContext.jsx` are the only layer that needs to change. Everything else (reducer, actions, schemas, all UI components) stays identical.

Priority order for backend migration:
1. `turfintel-operations` → API + database (calendar events, alerts, inventory)
2. `turfintel-weather-cache` → server-side weather proxy (avoid CORS issues)
3. Crew schedule → database (currently only in local useState)
4. Spray records → database (currently static `src/data/spray.js`)
5. Equipment service log → database (currently static `src/data/equipment.js`)

---

## 7. Weather System

### Data Flow

```
Browser
  │
  ├─ Step 1: Check localStorage['turfintel-weather-cache']
  │    └─ If < 15 min old → use cached bundle, skip fetch
  │
  ├─ Step 2: Fetch NWS current observation
  │    └─ https://api.weather.gov/stations/KSAV/observations/latest
  │         ├─ Success → normalize → proceed to forecast
  │         └─ Fail → try METAR
  │
  ├─ Step 3: Fetch NWS gridpoint forecast
  │    └─ https://api.weather.gov/points/32.1274,-81.2014
  │         └─ → returns forecastUrl → fetch forecast periods
  │
  ├─ Step 4: METAR fallback (if NWS fails)
  │    └─ https://aviationweather.gov/api/data/metar?ids=KSAV&format=json
  │
  ├─ Step 5: Stale cache fallback (any age)
  │
  └─ Step 6: All fail → null → hook shows PLACEHOLDER_* + error banner
```

### NWS Integration Details

- **Station:** KSAV (Savannah/Hilton Head International Airport)
- **Coordinates:** 32.1274, -81.2014 (used for gridpoint lookup)
- **Current observation fields used:** temperature (°C → °F), humidity, windSpeed (km/h → mph), windDirection (degrees → compass), dewpoint, precipitation
- **Forecast:** paired day/night periods, PoP (probability of precipitation), shortForecast text, windSpeed, temperature

### Normalization

`normalize.js` converts raw API responses into a consistent object shape used by all evaluators and UI components:

```js
// current object shape
{
  currentTemp: 78,         // °F
  feelsLike: 82,           // heat index or wind chill
  humidity: 74,            // %
  wind: 12,                // mph
  windDir: 'SSW',          // compass
  dewPoint: 69,            // °F
  soilTemp: null,          // °F (not available from NWS — future sensor data)
  rainfall24h: 0.12,       // inches
  solarRadiation: null,    // W/m² (not available from NWS — future sensor data)
  etRate: 0.18,            // inches (estimated)
  sprayWindow: 'ideal',    // 'ideal' | 'caution' | 'poor'
  diseasePressure: 'medium', // 'low' | 'medium' | 'high' | 'critical'
  location: 'KSAV',
  timestamp: 1746710400000,
  source: 'nws'            // 'nws' | 'metar' | 'cache'
}

// forecast array (7 days)
[{
  day: 'Today',
  date: 'May 8',
  high: 84,
  low: 66,
  rainfall: 0.0,
  etRate: 0.22,
  sprayWindow: 'ideal',
  icon: 'Mostly Sunny',
  shortForecast: 'Mostly Sunny'
}, ...]
```

### Evaluators and Recommendations

`evaluator.js` functions are completely pure — they accept the normalized shape above and return recommendation objects. They are never imported by `api.js` or `normalize.js`.

`recommendations.js` collects all evaluator outputs, stamps unique IDs, and sorts by severity. The result is an array consumed by the WeatherIntelligence advisory card on the Dashboard.

### Refresh Behavior

- **Auto-refresh:** `useWeather` hook sets `setInterval(refresh, 10 * 60 * 1000)` — fetches every 10 minutes
- **Manual refresh:** `↻` button in the Weather Insights card header calls `refresh()` immediately
- **Refresh clears cache:** `refresh()` deletes `turfintel-weather-cache` from localStorage, then re-fetches
- **Loading state:** `loading: true` while fetch in progress; refresh button shows `…` and is disabled

---

## 8. Operations Intelligence

### Calendar Events

Created by:
1. **Spray Sheet → "Add to Operations Calendar"** — dispatches `createCalendarEvent` for each selected spray record. Checks `sourceId + category + date` dedup guard before inserting.
2. **Equipment Maintenance** — future: will dispatch `createCalendarEvent` for scheduled maintenance
3. **Irrigation Repairs** — wired to dispatch `createCalendarEvent` for repair tickets

Schema (`makeCalendarEvent()`):
```js
{
  id: 'evt-[timestamp]-[random]',
  category: 'spray' | 'crew' | 'maintenance' | 'agronomy' | 'irrigation',
  priority: 'high' | 'medium' | 'low',
  status: 'scheduled' | 'completed' | 'cancelled',
  title: '...',
  date: 'YYYY-MM-DD',
  startTime: 'HH:MM',
  endTime: 'HH:MM',
  location: '...',
  assignedStaff: [],
  equipment: [],
  tags: [],
  notes: '...',
  sourceId: null  // ID of the originating record (spray record ID, repair ID, etc.)
}
```

### Alerts

Created by:
1. **Spray Sheet** — creates REI alerts when `maxREI > 0` for selected spray records
2. **Inventory deduction** — creates low-stock / critical-stock / out-of-stock alerts before deducting

Schema (`makeAlert()`):
```js
{
  id: 'alert-[timestamp]-[random]',
  title: '...',
  message: '...',
  severity: 'info' | 'warning' | 'critical',
  priority: 'low' | 'medium' | 'high',
  category: '...',
  status: 'active' | 'acknowledged' | 'resolved',
  createdAt: ISO timestamp,
  sourceId: null
}
```

### Inventory Deductions

`BuildSpraySheet.handleAddToCalendar()` flow:
1. For each selected spray record, compute product quantities
2. Cross-reference against `state.inventoryProducts`
3. Compute threshold crossings (low / critical / out) BEFORE deducting
4. Dispatch threshold alerts first (pure reducer constraint — no side effects in dispatch)
5. Dispatch `deductInventory(productId, amount)` per product
6. Dispatch `createCalendarEvent` per spray record

`InventoryProducts` reads from `state.inventoryProducts` (live, post-deduction) — not from the static `src/data/inventory.js` seed.

### Irrigation Recommendation

`computeIrrigationSummary(current, forecast)` in `irrigationEngine.js`:
- Considers: ET rate, 24h rainfall, next 24h PoP, soil temp
- Returns: `{ recApplication: number (inches), skip: boolean, reason: string }`
- Result shown in Weather Insights status strip as "Irrigation Tonight"
- Blue value when irrigation recommended, green "Skip" when conditions are favorable
- Advisory only — no auto-dispatch

### Dashboard Recommendations

`WeatherIntelligence.jsx` — calls `generateWeatherRecommendations(current, forecast)` from `recommendations.js`:
- Displays a prioritized list of advisory cards
- Each card: severity badge, category icon, recommendation text, reason
- Read-only — no buttons, no dispatch calls
- Superintendent reads and decides independently

---

## 9. Current Dashboard State

### Top Section Layout (Intelligence Row)

```
┌─────────────────────────────────────────────┬─────────────────────┐
│  WEATHER INSIGHTS                    [badge] │  GROWING DEGREE DAYS│
│  Cloud icon  Location     Spray badge Upd ↻ │  4-stat row         │
│  ─────────────────────────────────────────  │  Fungicide ══╪══════│
│  🌤 78°   │ Humidity  Wind   Dew Pt         │  PGR       ══╪══════│
│  Feels 82°│ Soil Temp 24hRain Solar         │  Nutrient  ══╪══════│
│  ─────────────────────────────────────────  ├─────────────────────┤
│  Disease: Medium │ Irr: 0.15" │ ET: 0.18"   │ APP EFFECTIVENESS   │
│  ─────────────────────────────────────────  │  ⬤ 72    ✓ Wind OK │
│  TODAY  Thu  Fri  Sat  Sun  Mon  Tue  │←→│  │  Good    ✕ High hum │
│  [card][card][card][card][card][card][card] │  ─────────────────  │
│                                             │  Acceptable window. │
└─────────────────────────────────────────────┴─────────────────────┘
```

**Left column (2fr):** Single unified Weather Insights card — header + main display + status strip + embedded 7-day forecast (horizontal scroll).

**Right column (1fr):** GDD card (top half) + Application Effectiveness card (bottom half). Both `flex: 1` inside the right column so they share height equally.

**Height matching:** `align-items: stretch` on the CSS grid + `flex: 1` chain through `intelligenceWeather → wsSection → wsCard`.

### Known Visual Issues / Pending Polish

1. **Forecast card widths on wide screens** — when the card is very wide (>1400px), forecast cards stretch excessively. May need a `max-width` cap on the forecast strip.
2. **GDD scale label overlap** — on narrow viewports (<480px), zone labels ("Early" / "Optimal" / "Late") may overlap. Consider hiding on mobile.
3. **AppEffectiveness ring gauge on very small cards** — if the right column is compressed, the 76px SVG gauge may feel tight. May benefit from a smaller breakpoint variant.
4. **Responsive behavior of intelligenceRow at 1100px** — grid collapses to 1fr/stacked; verify both cards still look good on tablet.

### Next Planned Task

**Dashboard Visual Polish Pass:**
- Review all spacing, font sizing, and proportions across the weather card and agronomy cards
- Ensure the 7-day embedded forecast scrolls gracefully and cards look consistent
- Responsive review at tablet (1100px) and mobile (768px, 480px)
- Possible: add a "spray window forecast" summary line above the 7-day cards

---

## 10. Git / Build Status

### Current State

| Item | Value |
|---|---|
| Branch | `master` |
| Latest commit | `9d22f1e` — End-of-session checkpoint docs — 2026-05-08 |
| Working tree | Clean |
| Remote sync | Up to date with `origin/master` |
| Build status | ✅ PASSING |
| Module count | 172 |
| Build time | ~860ms |
| Known warnings | Chunk size >500 kB (non-blocking — code-split later) |

### Last 10 Commits

```
9d22f1e End-of-session checkpoint docs — 2026-05-08
6991df8 Redesign dashboard weather and agronomy intelligence layout
b3cf136 Refactor dashboard agronomy intelligence cards
793da97 Add irrigation tonight recommendation to Weather Insights status strip
d671727 Enforce advisory-only principle in intelligence cards
7869afc Wire Irrigation Intelligence into Dashboard
c2c158f Irrigation Intelligence Phase 1 — ET-driven dashboard recommendations
32d7221 Fix forecast labeling today's date correctly
89203e2 Move dashboard calendar below weather and default mobile to list view
c3d7d34 Auto-refresh weather data every 10 minutes
```

### Backup / Recovery Points

| Type | Name | Commit |
|---|---|---|
| Branch | `backup/end-session-2026-05-08` | `9d22f1e` |
| Tag | `checkpoint-2026-05-08` | `9d22f1e` |
| Branch | `backup/pre-dashboard-weather-redesign` | pre-`6991df8` |
| Tag | `pre-weather-dashboard-redesign` | pre-`6991df8` |

---

## 11. Backup / Restore Notes

### Clone the Repo

```bash
git clone https://github.com/bhawes1111-beep/turfintel.git
cd turfintel
```

### Install Dependencies

```bash
npm install
```

Node.js v18+ required. Uses Node.js built-in fetch — no polyfills needed.

### Run Locally

```bash
npm run dev
# → http://localhost:5173
```

Live reload enabled. Vite HMR handles all file changes.

### Build for Production

```bash
npm run build
# Output: dist/
```

Cloudflare Pages auto-runs this command on every push to `master`.

### Deploy to Cloudflare

No manual deploy step needed. Push to `master` → Cloudflare auto-deploys.  
To deploy manually: Cloudflare Pages dashboard → Project → Deployments → Trigger Deployment.

### Revert a Bad Commit

```powershell
# Option 1: Restore to a known checkpoint tag
git checkout checkpoint-2026-05-08

# Option 2: Restore to backup branch
git checkout backup/end-session-2026-05-08

# Option 3: Hard reset master to a specific commit (DESTRUCTIVE — only if sure)
git reset --hard [commit-hash]
git push origin master --force
```

### PowerShell Git Commit Syntax

The project uses Windows PowerShell. Bash heredoc syntax (`<<'EOF'`) does NOT work. Use:

```powershell
git commit -m @'
Commit message here

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

### CSS Module Naming Convention

Always create a new CSS prefix for each new component/tab:
- `ws*` — Weather Section
- `oc*` — Operations Calendar
- `gdd*` — GDD Card
- `ae*` — App Effectiveness Card
- `ch*` — Crew Hours
- `csb*` — Crew Schedule Board
- `ce*` — Crew Employees
- `ct*` — Crew Tasks
- `el*` — Equipment List
- `ml*` — Maintenance Logs
- `ip*` — Inventory Products
- `di*` — Disease Active Issues
- `sr*` — Spray Records
- `ss*` — Spray Sheet

---

## 12. Next Recommended Tasks (Priority Order)

### 1. Dashboard Visual Polish Pass
- Review all proportions, spacing, and responsive behavior on the new weather + agronomy cards
- Fix any forecast card stretch issues at wide viewports
- Verify tablet (1100px) and mobile (768px) stack looks correct
- Consider spray window summary line above forecast strip

### 2. Continue Irrigation Intelligence
- `IrrigationIntelligence.jsx` currently shows advisory-only placeholder content
- Wire real zone data, runtimes, and pump status when data exists
- Connect irrigation recommendation directly to zone-level runtime suggestions

### 3. Complete Missing Module Tabs (pick order based on superintendent priority)
- Spray → Mix Calculator, Planned Programs, Spray Calendar
- Disease → Disease Alerts, Disease Library
- Inventory → Chemicals, Fertilizer, Low Stock
- Equipment → Work Orders (linked to `SERVICE_LOG`)
- Plant Nutrition → Soil/Tissue/Water Reports, Recommendations
- Cultural Practices → Aerification, Mowing, Topdressing logs
- Budget → Expense log, monthly tracker

### 4. Backend / Database Planning
- Choose persistence layer: Cloudflare D1 (SQLite at edge) recommended for Cloudflare Pages
- Design schema for: calendar events, alerts, spray records, crew schedules, equipment logs
- `loadState()` / `saveState()` in `OperationsContext.jsx` are the only files that need to change
- All reducers, actions, schemas, and UI components are already API-ready

### 5. Weather Station Integration
- NWS currently fills: temperature, humidity, wind, dew point, rainfall
- **Not available from NWS:** soil temperature, solar radiation
- Future: connect on-course weather station (Davis, Vaisala, or Rain Bird) via direct API or Cloudflare worker proxy to add real soil temp + solar radiation
- `current.soilTemp` and `current.solarRadiation` fields already exist in the normalized shape — they display `—` when null

### 6. Offline / Desktop Strategy
- Options: PWA (Progressive Web App) — add service worker for offline caching
- Or: Electron wrapper for true desktop app
- Current Vite setup makes PWA addition straightforward (`vite-plugin-pwa`)

### 7. Authentication / Multi-User
- `src/pages/Login/Login.jsx` exists but has no auth logic
- Options: Cloudflare Access (SSO), Clerk, Auth0, or custom JWT
- `CourseContext` already supports multiple courses — multi-user would extend this pattern
- Add protected route wrapper in `src/App.jsx` when auth is ready

### 8. Real Report / Export Generation
- Spray sheets currently print via `window.print()` (browser print dialog)
- Future: generate real PDFs via `@react-pdf/renderer` or a Cloudflare Worker + Puppeteer
- Export targets: spray records, maintenance logs, crew hours, GDD reports
- Printing model is intentional and works well for the spray sheet — extend for other reports

---

## Color Tokens Reference

```css
--color-bg:       #0d1a0d   /* Page background */
--color-sidebar:  #0a130a   /* Sidebar background */
--color-accent:   #4a9e4a   /* Primary green */
--color-text:     #e8f0e8   /* Primary text */
--color-muted:    #7a9e7a   /* Secondary/muted text */
--color-border:   #1e341e   /* Border color */
--color-surface:  #111e11   /* Card surface */
--sidebar-width:  220px
--sidebar-collapsed: 64px
```

## Hard Constraints (Do Not Change)

- **Logo files are final:** `public/logo-full.png` and `public/logo-mark.png` — never modify
- **Plain JavaScript only** — no TypeScript now or in the future
- **CSS Modules only** — no Tailwind, no styled-components
- **Inline `style={{}}` only for dynamic values** (colors, calculated widths, etc.)
- **Sidebar icons are PNG files** — do not convert to SVG components
- **Scroll model:** `.outlet` in `Layout.module.css` is the single scroll owner — never add `overflow-y: auto` to `.page` divs
- **Advisory-only principle:** intelligence cards must never auto-dispatch actions — advisory display only
- **Workflow rule:** inspect → explain architecture → get approval → build (3 files max per new module)
- **Admin API key:** `x-admin-key: TurfAdmin2025!`
