# TurfIntel Pro — Project Status

**Last checkpoint:** 2026-05-07
**Latest commit:** `a695745` — Wire shared weather into Dashboard
**Build status:** ✓ Clean — 126 modules, 0 errors
**Working tree:** Clean (untracked: README.md, eslint.config.js, public/ — intentionally untracked)

---

## Deployment

| | |
|---|---|
| **Frontend** | Cloudflare Pages |
| **Repo** | github.com/bhawes1111-beep/turfintel |
| **Branch** | `master` |
| **Build command** | `npm run build` |
| **Output directory** | `dist` |
| **Deploy trigger** | Every push to `master` auto-deploys via Cloudflare Pages |
| **Status** | Auto-deploying — commit `a695745` should be live within ~1 min of push |

---

## How to Run Locally

```bash
cd turfintel
npm install          # first time only
npm run dev          # starts dev server at http://localhost:5173
```

---

## Stack

| | |
|---|---|
| **Framework** | React 19 + Vite 8 |
| **Language** | Plain JavaScript (no TypeScript) |
| **Routing** | React Router DOM v7 |
| **Styling** | CSS Modules — per-component, scoped class names |
| **Token system** | CSS custom properties (`--pr-color`, `--cond-color`, etc.) set on parent class, consumed by shared rules |
| **State** | React `useState` — local only, no global store |
| **Context** | `CourseContext` / `useCourse()` — active course across all pages |
| **Backend** | None — placeholder data files only |
| **Auth** | None |

---

## Current Shared Systems

Four reusable systems live in `src/components/shared/`. Each is a barrel-exported directory consumed via `import { X } from '../../components/shared/<system>'`.

### 1. Upload System — `src/components/shared/upload/`

| Component | Purpose |
|---|---|
| `UploadDropzone` | Drag-and-drop or click-to-browse file picker |
| `UploadedFileCard` | Displays uploaded file with status badge, remove button, progress bar |
| `UploadStatusBadge` | Inline badge: uploading / complete / error / processing |
| `Upload.module.css` | Shared CSS for all upload components |
| `index.js` | Barrel export |

**Currently wired into:** Plant Nutrition → Upload Center tab

---

### 2. Calendar System — `src/components/shared/calendar/`

| Component | Purpose |
|---|---|
| `CalendarGrid` | Month grid (Monday-first) + agenda view toggle |
| `CalendarEvent` | Dual-mode: compact pill (grid) or full card (agenda) |
| `MonthNavigation` | Prev/next month controls with title |
| `EventBadge` | Small colored category badge |
| `calendarTokens.js` | `EVENT_COLORS`, `EVENT_STATUS`, helpers (`toDateStr`, `todayStr`, `resolveEventColor`) |
| `Calendar.module.css` | Shared CSS |
| `index.js` | Barrel export |

**Date parsing:** `ev.date.split('-').map(Number)` — avoids UTC timezone shift.
**Currently wired into:** Spray → Spray Calendar tab; Cultural Practices → Practice Calendar tab

---

### 3. Alert / Notification System — `src/components/shared/alerts/`

| Component | Purpose |
|---|---|
| `AlertCard` | Full card or compact single-line row (`compact` prop) |
| `AlertBadge` | Priority or status badge (uses CSS custom property token classes) |
| `AlertList` | Renders alert array with optional `groupBy` ('priority' / 'status' / 'module') and empty state |
| `alertTokens.js` | `ALERT_PRIORITY`, `ALERT_STATUS`, `MODULE_LABELS`, `PRIORITY_ORDER`, `STATUS_ORDER`, `resolvePriority`, `resolveStatus` |
| `Alerts.module.css` | Shared CSS |
| `index.js` | Barrel export |

**Priority levels:** critical → high → medium → low → info
**Status levels:** new → acknowledged → snoozed → resolved
**Currently wired into:** Dashboard → Alerts widget (compact, groupBy="priority", local acknowledge/dismiss state)

---

### 4. Weather + ET System — `src/components/shared/weather/`

| Component | Purpose |
|---|---|
| `WeatherCard` | Current conditions: temp, spray badge, 6-stat grid, disease pressure badge |
| `ETCard` | ET rate + deficit display + 7-day bar trend chart |
| `ForecastStrip` | Horizontally scrollable 7-day forecast with icons, temps, ET rate, spray badge per day |
| `WeatherAlertBanner` | Dismissible inline alert banner with left-border severity accent |
| `weatherTokens.js` | Token maps (`CONDITION_TOKENS`, `SPRAY_WINDOW_TOKENS`, `DISEASE_PRESSURE_TOKENS`, `WEATHER_ICONS`), placeholder data, helpers |
| `Weather.module.css` | Shared CSS — condition / spray / disease token classes + all component styles |
| `index.js` | Barrel export |

**Spray window levels:** ideal → caution → poor
**Disease pressure levels:** low → moderate → high → critical
**Planned source:** https://www.weather.gov/wrh/timeseries?site=KSAV (NOAA / Weather.gov)
**Currently wired into:** Dashboard → command-center weather section (above card grid)

---

## App Structure

```
turfintel/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx / .module.css       ← Shell: sidebar + main + mobile hamburger
│   │   │   ├── Sidebar.jsx / .module.css       ← Left nav, collapsible, Settings pinned bottom
│   │   │   └── PageShell.jsx / .module.css     ← Reusable: page title + tab bar + content area
│   │   └── shared/
│   │       ├── icons.jsx                       ← SVG icon registry (20×20)
│   │       ├── DashboardCard.jsx               ← Reusable card (wide + tall variants)
│   │       ├── ChemicalCard.jsx                ← Chemical label card
│   │       ├── ChemicalModal.jsx               ← Detail modal (React Portal)
│   │       ├── upload/                         ← Shared upload system
│   │       ├── calendar/                       ← Shared calendar engine
│   │       ├── alerts/                         ← Shared alert/notification system
│   │       └── weather/                        ← Shared weather + ET system
│   ├── context/
│   │   └── CourseContext.jsx                   ← Active course across all pages
│   ├── data/
│   │   ├── chemicals.js                        ← 6 placeholder chemicals
│   │   ├── disease.js                          ← Active issues, library, alerts, map, photos
│   │   ├── plantNutrition.js                   ← Soil/tissue/water reports, trends, recs
│   │   ├── culturalPractices.js                ← Aerification/topdress/verticut/rolling/mowing/calendar
│   │   ├── dashboardAlerts.js                  ← 8 cross-module placeholder alerts
│   │   └── spray.js                            ← Spray records and events
│   ├── pages/
│   │   ├── Dashboard/                          ← Weather section + alert widget + placeholder cards
│   │   ├── Spray/                              ← 6 tabs; Spray Calendar wired to shared calendar
│   │   ├── Disease/                            ← 6 tabs: Active Issues, Library, Map, Gallery, Alerts, Reports
│   │   ├── PlantNutrition/                     ← 6 tabs: Soil, Tissue, Water, Trends, Recs, Upload
│   │   ├── CulturalPractices/                  ← 7 tabs; Practice Calendar wired to shared calendar
│   │   ├── Inventory/                          ← Shell (tabs stubbed)
│   │   ├── Crew/                               ← Tasks, Schedule, Hours tabs
│   │   ├── Chemical/                           ← Chemical Labels tab live; others stub
│   │   ├── Budget/                             ← Full stub
│   │   ├── Equipment/                          ← Full stub
│   │   └── Settings/                           ← Full stub
│   ├── App.jsx                                 ← Root router
│   ├── index.css                               ← Global CSS tokens / dark green theme
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

---

## Completed Features

| Commit | Feature |
|---|---|
| `1224d35` | Initial scaffold — React + Vite, global dark green theme, CSS custom properties |
| `fe7fd4e` | `_redirects` for Cloudflare Pages SPA routing |
| `bf70c83` | Left sidebar navigation, active page highlight, Settings pinned bottom |
| `07d881a` | Sidebar collapse/expand, SVG icon registry, mobile slide-in overlay |
| `ee1ee6f` | Responsive dashboard grid (3-col → 2-col → 1-col), DashboardCard, weather bar placeholder |
| `4ca462e` | Crew module shell — Tasks, Schedule, Hours tabs |
| `768170a` | Chemical Labels module shell — searchable card grid, ChemicalCard, ChemicalModal (React Portal) |
| `896a4e1` | Project status checkpoint (prior session end) |
| `882ef0b` | Stub modules — Spray, Disease, Plant Nutrition, Cultural Practices |
| `fab8427` | Remove conflicting `_redirects` file |
| `8e98bd5` | Inventory module shell |
| `de8c9d9` | Login page shell |
| `f658075` | Spray module shell — 6 tabs with records, programs, calculator |
| `f8da311` | Multi-course selector system shell — CourseContext, course switcher in sidebar |
| `e28a74a` | Disease module shell — 6 tabs: Active Issues, Library, Course Map, Photo Gallery, Alerts, Reports |
| `2956f9c` | Plant Nutrition module shell — 6 tabs: Soil, Tissue, Water, Trends, Recommendations, Upload |
| `5b9a7e5` | Cultural Practices module shell — 7 tabs including aerification, topdressing, verticutting, rolling, mowing |
| `1cd502a` | Shared upload system shell — UploadDropzone, UploadedFileCard, UploadStatusBadge |
| `b99d26f` | Shared calendar engine shell — CalendarGrid (Monday-first), CalendarEvent, MonthNavigation, EventBadge |
| `f4b676e` | Wire shared calendar into Spray — replaced local calendar, removed ~158 lines dead CSS |
| `e213dca` | Wire shared calendar into Cultural Practices — replaced local calendar, removed ~127 lines dead CSS |
| `230eb0c` | Shared alert/notification system shell — AlertCard, AlertBadge, AlertList, alertTokens |
| `58e7f74` | Wire shared alerts into Dashboard — 8 cross-module alerts, compact groupBy="priority", local state |
| `970153d` | Shared Weather + ET Engine shell — WeatherCard, ETCard, ForecastStrip, WeatherAlertBanner, weatherTokens |
| `a695745` | Wire shared weather into Dashboard — command-center weather section above card grid |

---

## Known Issues

- All data is placeholder — no backend or API connected
- No live weather data — all weather fields are static placeholder values
- `PLACEHOLDER_WEATHER_ALERTS` contains hardcoded messages (not dynamic)
- Pin state on ChemicalCard is visual only — not persisted
- `internalNotes` and `courseNotes` on chemical placeholder data are empty
- No authentication or user accounts
- Budget, Equipment, Settings pages are full stubs (no tabs or data)
- Inventory module shell exists but tabs are stubbed
- Spray, Disease, Plant Nutrition, Cultural Practices: data is placeholder only
- Shared weather components display `PLACEHOLDER_CURRENT` — future: replace with `useFetch` from NOAA

---

## Next Planned Feature

**Budget module shell** — following the same pattern as Disease / Plant Nutrition / Cultural Practices:

1. Create `src/data/budget.js` — placeholder summary cards, expense line items, category breakdowns
2. Create `src/pages/Budget/` with tabs: **Overview**, **Expenses**, **Labor**, **Materials**, **Forecast**, **Reports**
3. Build summary cards (YTD spend vs. budget, by category)
4. Simple expense table with status badges
5. Wire into existing Budget route in `App.jsx`

Alternative next features (discuss at session start):
- **Equipment module shell** — same pattern, tabs: Equipment List, Maintenance Log, Service Due, Parts
- **Wire weather into Spray** — use `WeatherCard`, `ForecastStrip`, `WeatherAlertBanner` for spray timing in the Spray module
- **Wire weather into Disease** — use disease pressure tokens in Disease module Alerts tab

---

## Recommended Build Order

### Remaining module shells (any order)
1. Budget module shell
2. Equipment module shell
3. Settings shell — Course info, user preferences

### Shared system wiring (when module shells exist)
4. Wire weather into Spray — spray timing + condition badges
5. Wire weather into Disease — disease pressure indicators
6. Wire alerts into Spray / Disease / other modules

### Future integrations (requires external setup)
7. NOAA / Weather.gov API — replace `PLACEHOLDER_CURRENT` with live fetch
8. Real authentication — hook Login page to an auth provider
9. Backend / persistence — replace placeholder data files with API calls

---

## Rollback Strategy

**Preferred — revert a single commit (safe, non-destructive):**
```bash
git revert <commit-hash> --no-edit
git push origin master
```
Creates a new revert commit. No force-push needed. Cloudflare redeploys automatically.

**Last resort — hard reset (destructive, rewrites history):**
```bash
git reset --hard <commit-hash>
git push --force
```
Only if the commit was never reviewed or shared outside the repo.

**Cloudflare rollback (no Git required):**
Open Cloudflare Pages dashboard → TurfIntel project → Deployments → click any prior deployment → "Rollback to this deployment". Instant, no Git involvement.

---

## How to Resume Next Session

1. Open terminal in `C:\Users\bhawe\turfintel`
2. Confirm clean state:
   ```
   git status          → should show "nothing to commit"
   git branch          → should be on master
   git log --oneline -3
   ```
3. Start the dev server if testing locally:
   ```
   npm run dev
   ```
4. Confirm latest commit is `a695745` (Wire shared weather into Dashboard)
5. Pick the next feature from **Next Planned Feature** above
6. Branch: `git checkout -b feature/<name>`
7. Follow the pattern: data file → component(s) → page wiring → `npm run build` → commit → ff-merge → push

**Current module state to keep in mind:**
- Dashboard is the most built-out page — weather + alerts are both wired
- Spray and Cultural Practices have the shared calendar wired
- Disease, Plant Nutrition have full tab shells but no shared systems wired yet
- Budget, Equipment, Settings are completely empty stubs
