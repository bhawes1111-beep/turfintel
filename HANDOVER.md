# TurfIntel — Full Handover Document

**Date:** 2026-05-10  **Live URL:** https://turfintel.bhawes1111.workers.dev  **Repo:** https://github.com/bhawes1111-beep/turfintel  **HEAD:** `2914226`

---

## 1. Project Overview

TurfIntel Pro is a golf course turf management web app for a superintendent to manage daily crew operations, agronomic data, spray programs, equipment, irrigation, and course mapping.

**Stack:** React 19 + Vite 8, plain JavaScript, CSS Modules, React Router DOM v7, zero runtime UI libraries.
**Deploy:** Cloudflare Workers via `npx wrangler deploy` — uploads `dist/` after `npm run build`.
**Admin API key:** `x-admin-key: TurfAdmin2025!`

---

## 2. Non-Negotiable Project Rules

- **Logo is final** — do not touch `public/logo-full.png` or `public/logo-mark.png`
- **Plain JavaScript only** — no TypeScript
- **CSS Modules only** — no Tailwind, no styled-components, no Framer Motion, no Lucide React
- **Sidebar icons** — inline SVG (in `Sidebar.jsx`'s `ICONS` map). PNG icons in `public/sidebar-icons/` exist for sidebar collapse fallback only
- **Scroll model** — `.outlet` in `Layout.module.css` owns `overflow-y: auto`. Never add it to `.page` divs
- **No new dependencies** — every shared component is internal CSS Modules + inline SVG
- **Inspect → explain → approve → edit** — no app-wide rewrites; build features incrementally with isolated commits
- **Git** — PowerShell here-string `@'...'@` for multiline commit messages on Windows; never `--no-verify`, never `--no-edit` on rebases
- **Deploy workflow every time:** `npm run build` → `git commit` → `git push origin master` → `npx wrangler deploy` → verify live URL

---

## 3. File Structure

```
turfintel/
├── public/
│   ├── logo-full.png                 ← FINAL — do not touch
│   ├── logo-mark.png                 ← FINAL — do not touch
│   ├── sidebar-icons/                ← Legacy PNG fallback; SVG icons drive sidebar
│   └── courses/
│       └── crosswinds-aerial.png     ← Optional aerial backdrop for Course Map (drop-in)
├── src/
│   ├── index.css                     ← CSS token system (global vars)
│   ├── App.jsx                       ← Router + provider stack
│   ├── context/
│   │   └── CourseContext.jsx         ← activeCourse + bounds/center/aerialUrl
│   ├── utils/
│   │   ├── persistence/persistence.js  ← loadSync/save (localStorage + IDB dual-write)
│   │   ├── prefs/useAppPrefs.js        ← turfintel-app-prefs (Phase 2 hook)
│   │   ├── geo/                        ← Mapping foundation
│   │   │   ├── projection.js           ← lat/lng ↔ SVG x/y (equirectangular)
│   │   │   ├── geo.js                  ← GeoJSON helpers, FeatureProperties type
│   │   │   ├── featureRegistry.js      ← Layer specs (greens/fairways/.../telemetry)
│   │   │   ├── geoStore.js             ← useCourseGeoStore — merges static + KML imports
│   │   │   └── imports.js              ← KML parser + Emlid/Toro stubs
│   │   ├── operations/OperationsContext.jsx  ← alerts / repair / equipment overrides
│   │   ├── weather/                    ← NOAA fetch + evaluators + recommendations
│   │   ├── activity/activityBuilder.js
│   │   └── intelligence/...
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx, Layout.module.css
│   │   │   ├── Sidebar.jsx              ← Recursive NAV_TREE, tooltip, mobile drawer
│   │   │   ├── PageShell.jsx            ← Renders dropdown OR button nav per pref
│   │   │   └── CourseSelector.jsx
│   │   └── shared/
│   │       ├── EmptyState/              ← NEW — reusable empty-state UI
│   │       ├── DashboardCard.jsx        ← wide / tall / full size variants
│   │       ├── courseMap/               ← NEW — SVG mapping renderer
│   │       │   ├── CourseMap.jsx
│   │       │   ├── MapLayer.jsx
│   │       │   ├── AerialBackground.jsx
│   │       │   ├── LayerToggle.jsx
│   │       │   ├── MapLegend.jsx
│   │       │   └── ImportPanel.jsx      ← KML import UI
│   │       ├── alerts/, calendar/, weather/, upload/
│   │       └── icons.jsx                ← SVG icon system
│   ├── data/                            ← All 12 files emptied (Phase 1)
│   └── pages/
│       ├── Dashboard/                   ← Cards stay; data sources empty → EmptyState
│       ├── Operations/                  ← OperationsBoard.jsx (DnD + Add Task)
│       ├── Crew/, Chemical/, Spray/, Disease/, PlantNutrition/, CulturalPractices/
│       ├── Budget/, Inventory/, Equipment/, Irrigation/, Activity/
│       ├── CourseMapPreview/            ← /course-map standalone preview
│       └── Settings/
│           ├── Settings.jsx             ← Search + section switcher
│           ├── Settings.module.css
│           └── sections/
│               ├── ProfileSection.jsx
│               ├── CourseSection.jsx
│               ├── AppPreferencesSection.jsx
│               ├── WeatherDataSection.jsx
│               ├── TeamSection.jsx
│               ├── DataManagementSection.jsx
│               ├── IntegrationsSection.jsx
│               └── SystemInfoSection.jsx
```

---

## 4. CSS Token System (`src/index.css`)

```
--color-bg:          #0d1a0d
--color-sidebar:     #0a130a
--color-accent:      #4a9e4a
--color-text:        #e8f0e8
--color-text-muted:  #7a9e7a
--color-border:      #1e341e
--color-card:        #111e11
--sidebar-width:     220px
--sidebar-collapsed: 64px
```

Density-driven CSS variables (set on `.page[data-density='X']`):
- `--grid-gap` `--grid-padding` `--card-padding` `--card-min-height` `--card-tall-height`

---

## 5. Sidebar (`src/components/layout/Sidebar.jsx`)

**Recursive nested navigation.** Single `NAV_TREE` constant drives the entire sidebar. Each node is either a leaf (`{ id, label, icon, to }`) or a group (`{ id, label, icon, children: [...] }`). Recursive `NavGroup` / `NavLeaf` components render any depth.

| Feature | How |
|---|---|
| Collapsed by default for first-time users | `loadInitialPrefs()` returns `collapsed: true` when no saved state |
| Expand/collapse with rotating chevrons | Single `▶` glyph rotated 90° via `transform: rotate(90deg)` on `.chevronOpen` |
| Active route propagation | `nodeContainsActive(node, pathname)` — recursive prefix match; parent group highlights when descendant active |
| Custom CSS tooltips when collapsed | `:hover` on `.collapsed .link` shows absolute-positioned `.tooltip` element |
| Mobile slide-out drawer | `.mobileOpen` class on sidebar; `.mobileBackdrop` with `backdrop-filter: blur(2px)` |
| Persistence | `turfintel-sidebar-prefs` localStorage key — `{ collapsed, expanded: { groupId: bool } }` |
| Click group icon while collapsed | Expands sidebar AND opens that group in one action |

**NAV_TREE sections:**
Dashboard · Operations (Operations Board, Activity Feed) · Agronomy (Disease, Plant Nutrition, Cultural Practices) · Sprays (Applications, Chemical Labels) · Irrigation (Irrigation, Course Map) · Inventory · Equipment · Reports (Budget) · Administration (Settings)

Weather is intentionally omitted — no routes exist yet.

---

## 6. PageShell (`src/components/layout/PageShell.jsx`)

Shared wrapper for every tabbed module page. **Reads `useAppPrefs().pageNavStyle` and renders one of two switchers:**

| Mode | UI |
|---|---|
| `'dropdown'` (default) | Dropdown menu with active section + ▾ trigger |
| `'buttons'` | Pill-row of section buttons across the top |

Every tabbed page (Crew, Spray, Disease, Plant Nutrition, Cultural Practices, Inventory, Equipment, Irrigation, Activity, Settings) picks up the new switcher with zero per-page changes — they pass `tabs`, `activeTab`, `onTabChange` and PageShell does the rest.

Mobile button row scrolls horizontally with hidden scrollbar.

---

## 7. Settings Center (`src/pages/Settings/`)

A full control center for the app — replaced the original 14-line stub.

**8 sections** (small files in `sections/`):
1. **Profile** — backend-pending fields (Name, Role, Email, Phone, Course)
2. **Course** — live read of Crosswinds from CourseContext (coords, bounds, zoom, aerial URL, time zone)
3. **App Preferences** — Page Navigation Style toggle (`dropdown` / `buttons`), Theme (Dark active; Light disabled "Coming soon"), Sidebar default behavior
4. **Weather & Data** — NOAA KSAV status pill (Live/Cached/Connecting), last sync, ET/rainfall sources
5. **Team & Permissions** — backend-pending preview
6. **Data Management** — 4 scoped per-key clear actions: Reset Sidebar Preferences · Clear Weather Cache · Clear KML/Course Imports · Clear Local Operations State (each requires confirmation)
7. **Integrations** — status pills for Cloudflare Workers (Connected), Google Earth/KML (Connected), NOAA (Connected), Toro Lynx (Stub), Emlid Reach RS2+ (Stub), QGIS GeoJSON (Stub)
8. **System Info** — App name, environment (Production · Cloudflare Workers), live URL, last weather sync, local-storage usage estimate, browser

**Search bar at the top of Settings.** Filters sections by title + curated `keywords[]` (lowercase tokens that mirror what each section actually renders — no DOM scraping). Behavior:
- `useMemo` recomputes `visibleSections` on every keystroke
- `useEffect` auto-switches the active section to the first match if it drops out of the filter
- "X of Y sections" match-count chip appears while typing
- × button clears the query
- Zero matches → `<EmptyState title="No settings found." description="Try a different search term." />`

**Switcher placement matches Settings's spec:**
- Dropdown mode → search inside PageShell content area, above the active section
- Button mode → Settings renders its own custom shell so the search sits *between* the page header and the button-row nav (not below it)

PageShell is unchanged; Settings's button-mode shell is local to `Settings.jsx`.

---

## 8. Course Mapping Foundation (`src/utils/geo/`, `src/components/shared/courseMap/`)

**SVG-based renderer with GeoJSON data layer.** Designed so a future swap to MapLibre/Leaflet requires zero data-layer changes.

**Anchor:** Crosswinds Golf Club, `32.129856, -81.235231` (32°07'47.48"N 81°14'06.83"W) — wired in `CourseContext.jsx` with `geo: { center, bounds, defaultZoom, aerialUrl }`.

### Architecture
- `projection.js` — `makeProjector({ bounds, viewWidth, viewHeight })` returns equirectangular `project()` / `unproject()`. Aspect-correct via `cos(centerLat)` factor in `viewBoxForBounds`.
- `geo.js` — RFC 7946 GeoJSON conformance, helpers, `FeatureProperties` JSDoc type.
- `featureRegistry.js` — Single source of truth for 10 layers and their dark-tactical styling: greens, fairways, tees, rough, bunkers, irrigationHeads, sprinklerRoutes, gpsTracks, sprayCoverage, equipmentTelemetry. Z-index drives render order; glow filter on greens + irrigation + telemetry.
- `geoStore.js` — `useCourseGeoStore(courseId)` hook merges static base from `src/data/courseGeo.js` (now empty) with KML-imported features in localStorage. Same hook the renderer reads.
- `imports.js` — `importKML(xmlText, layerKey)` (DOMParser, no deps) handles plain `.kml` Placemarks with Point/LineString/Polygon (outer ring). Emlid Reach RS2+ and Toro Lynx IRX are scaffolded stubs.

### Renderer
- `CourseMap.jsx` — top-level. Composes `<AerialBackground>` (PNG fallback at `public/courses/crosswinds-aerial.png` OR dark gradient placeholder), then SVG overlay with all enabled layers.
- `MapLayer.jsx` — converts a FeatureCollection into SVG primitives: Polygon → `<path d=... Z>`, LineString → `<path>`, Point → `<circle>`. Soft glow via `feGaussianBlur` for layers with `glow: true`.
- `LayerToggle.jsx` — per-layer toggles with unicode glyph icons + dot indicators.
- `MapLegend.jsx` — color-coded legend for visible layers.
- `ImportPanel.jsx` — KML file picker + layer dropdown + inline status (Imported N features / Cleared layer / etc.) + Clear-layer / Clear-all buttons.

### Standalone preview
`/course-map` mounts `CourseMapPreview` for validation. Not wired into Disease / Operations / etc. yet.

### Phase deferred
- Pan/zoom (Leaflet/MapLibre swap)
- KMZ (zipped KML)
- Real Emlid/Toro adapters (stubs throw `'not implemented'`)
- Backend persistence for imports

---

## 9. EmptyState Component (`src/components/shared/EmptyState/`)

Premium dark / turf-green styled component. Props: `icon`, `title`, `description`, `actionLabel`, `onAction`, `compact`.

**Wired into ~30 surfaces** across Phase 2A/B/C. Module-specific copy:
- Operations Board: "No active tasks scheduled." + "+ Add Task" CTA · "No crew added" (compact)
- Crew tabs: per-source empty states ("No employees added yet.", "No hours logged.", "No active tasks scheduled.", "No crew schedule created.", "No crew notes yet.")
- Equipment: "No equipment tracked yet.", "No maintenance records yet."
- Spray: "No spray records available.", "No spray programs planned.", "No spray records to build from."
- Inventory: per-category copy ("No parts inventoried yet.", "No chemical inventory yet.", "No fuel tanks tracked yet.", etc.)
- Disease: "No active disease issues.", "No disease library entries yet.", "No disease alerts.", "No photos uploaded yet.", "No disease locations mapped."
- Plant Nutrition: per-report-type copy
- Cultural Practices: per-event-type copy
- Irrigation: "No irrigation repairs logged."
- Dashboard cards: compact "No recent activity.", "No briefing items today.", "No action required."
- Settings search no-match

Distinguishes "no data exists yet" (EmptyState) from "no matches for current filter" (existing inline `<p>` text).

---

## 10. Dashboard

Single-scroll dashboard. Cards stay visible; their internals show `<EmptyState>` when source data is empty.

**Layout:**
- Page header (Dashboard title + Customize button)
- Intelligence row (WeatherSection · GDDCard · AppEffectivenessCard)
- Operations Calendar
- Card grid (3 cols → 2 cols @1100px → 1 col @768px)
  - Alerts (wide+tall via `<DashboardCard wide tall>`)
  - Quick Actions (full)
  - Operations Command (composite: OperationalSummary, ActionQueue, SchedulingAwareness — full-width)
  - Weather Intelligence (wide), Irrigation Intelligence (wide), Equipment Alerts
  - Recent Activity (full), Upcoming Applications (wide), Recent Notes

**No customization system.** The dashboard customization + drag-resize features were built and reverted (commits `1d40f22`, `2ab34a9`, `c9566aa`, `d7d48de` all reverted). Reverts kept history clean. Customize button currently does nothing — kept as visual placeholder for a future re-introduction.

**Hotfix in this session:** `OperationsCalendar.jsx` line 183 was crashing the entire Dashboard after Phase 1 emptied `PLACEHOLDER_CURRENT.sprayWindow` to `null` — it was directly looking up `SPRAY_WINDOW_TOKENS[null]` and reading `.color` on undefined. Now uses `resolveSprayWindow()` helper which has a fallback. Commit `567f96a`.

---

## 11. Operations Board (`src/pages/Operations/OperationsBoard.jsx`)

The most-built module in this session. Lives at `/crew`.

**Features:**
- Date selector with prev/next chevrons + native date picker (visually-hidden `<input type="date">` inside `<label>`)
- Routing dropdown (Press & Roll / Hammer / Normal / Modified / Event Prep)
- Live clock (1s interval)
- Density modes (compact / comfortable / expanded) drive `data-density` attribute on `.obCenterScroll`
- Schedule Overview timeline — 5AM–4PM, status-colored blocks per employee, current-time marker at `nowPercent`
- **Add Task form** below timeline — title dropdown (10 presets), hours, priority, status, equipment chips, notes textarea. Created tasks merge into `allSourceTasks = [...TASKS, ...createdTasks]` so DnD/delete/timeline all work on new tasks
- **Drag-and-drop crew assignment** — native HTML5 DnD; drag employees from Crew Today roster onto task cards. Pill-shaped chips with × remove. `dataTransfer.setData('text/plain', empId)`. dragLeave flicker fixed via `e.currentTarget.contains(e.relatedTarget)` guard
- **Delete tasks** — red outline button on each card (hidden in compact density), confirmation modal, `deletedTaskIds` Set cascades through `effectiveTasks`
- Settings button (⚙ Settings) opens placeholder modal (4 sections, "Coming soon")
- Right panel — simplified static Turf Operations info display + Notes section with 5 tabs

**Data state architecture (session-local):**
- `taskOverrides` `{id: {status}}` — status changes
- `taskAssignments` `{id: [empId]}` — DnD assignments
- `deletedTaskIds` Set — cascades everywhere
- `createdTasks` array — Add Task additions
- `allSourceTasks = [...TASKS, ...createdTasks]` (TASKS now empty)
- `effectiveTasks` = `allSourceTasks.filter(!deleted).map(applyOverrides + assignments)`

All session-local — no persistence yet. EmptyState renders for empty roster + empty task list.

---

## 12. Persistence Layer (`src/utils/persistence/persistence.js`)

Sync-bootstrap + dual-write:
- `loadSync(key)` — synchronous localStorage read for `useState` initializers
- `load(key)` — async, IDB primary with localStorage fallback
- `save(key, value)` — localStorage sync first, then IDB async
- `clear(key)` — removes from both
- `migrate(key)` — one-time copy localStorage → IDB

**localStorage keys in active use:**

| Key | Owner | Purpose |
|---|---|---|
| `turfintel-sidebar-prefs` | Sidebar.jsx | `{ collapsed, expanded: { groupId: bool } }` |
| `turfintel-app-prefs` | useAppPrefs | `{ pageNavStyle: 'dropdown' \| 'buttons' }` |
| `turfintel-geo-imports-<courseId>` | useCourseGeoStore | KML-imported FeatureCollections per course |
| `turfintel-operations` | OperationsContext | alerts / repair overrides / equipment overrides |
| `turfintel-weather-cache` | weather/api.js | NOAA fetch cache with stale flag |

Settings > Data Management exposes scoped per-key clears for the first 4. Each clear requires a confirm step.

---

## 13. Phase 1: Placeholder Data Removal

Commit `9e92683` emptied **12 data files** under `src/data/` (~3,438 deletions). Display-config maps preserved (TYPE_COLORS, PRACTICE_COLORS, weather token maps, helper functions). Every named export still exists — just with empty arrays / null-shaped objects.

**Files emptied:**
crew · equipment · dashboardCalendarEvents · culturalPractices · plantNutrition · disease · irrigation · courseGeo (Hole 1 sample geometry removed) · inventory · spray · chemicals · dashboardAlerts.

Plus:
- `weatherTokens.js` — `PLACEHOLDER_CURRENT` shape preserved with null values; `PLACEHOLDER_FORECAST/_ET_TREND/_WEATHER_ALERTS` emptied to `[]`
- `OperationsBoard.jsx` `INITIAL_NOTES` strings → `''`
- `CrewNotes.jsx PLACEHOLDER_NOTES` → `[]`
- `CrewSchedule.jsx AVAILABILITY` (6 fake records) → `[]`
- `CourseContext.jsx` — dropped 3 demo courses; only Crosswinds remains

**Bundle impact:** JS dropped 837KB → 726KB (~13% smaller after Phase 1).

---

## 14. Recent Commit History (last 25)

```
2914226  Move Settings search above button-row in button mode
847bf57  Apply Page Navigation Style preference to all tabbed pages
2d75b77  Add search to Settings page
719d4d3  Build Settings control center with switchable navigation
567f96a  Fix blank Dashboard: guard SPRAY_WINDOW_TOKENS lookup against null
1a69559  Wire EmptyState into remaining module tabs (Phase 2C)
1e7dd91  Wire EmptyState into module tabs (Phase 2B)
3facbca  Add EmptyState component and wire into key surfaces (Phase 2A)
9e92683  Remove placeholder/demo/sample data (Phase 1)
828a96b  Default sidebar to collapsed on first load
5c253a7  Modernize sidebar with recursive nested navigation
8b58d87  Add KML import for course map layers
6ff020c  Add foundational GeoJSON course mapping system
fe7fb8e  Revert "Add dashboard customization system"
7771ec6  Revert "Add responsive dashboard sizing system"
0930402  Revert "Add drag-resize dashboard customization"
9bd6399  Revert "Fix dashboard resize handle usability"
d7d48de  Fix dashboard resize handle usability                  (neutralized)
c9566aa  Add drag-resize dashboard customization                (neutralized)
2ab34a9  Add responsive dashboard sizing system                 (neutralized)
09ef90d  Add operational task creation workflow
b5e7805  Polish operations board date selector and delete flow
2aadea5  Add drag-and-drop crew assignment workflow
e2f54dc  Fix page dropdown navigation layering
1d40f22  Add dashboard customization system                     (neutralized)
```

---

## 15. Pending Work / Future Phases

### Highest priority (visible to users)
1. **6 missing sidebar PNG icons** — drop into `public/sidebar-icons/`. Sidebar uses inline SVG today, so this is cosmetic only for any future fallback path.
2. **Backend wiring** — every `src/data/*.js` consumer is ready to swap from static array imports to a hook (`useTasks()`, `useEmployees()`, etc.). EmptyState handles the loading/empty state already.
3. **Course Map adoption** — wire the new `<CourseMap>` standalone preview into Disease / Spray / Irrigation flows when ready.

### Backend-dependent (blocked on auth/data layer)
- Profile, Team & Permissions, Notifications
- Custom weather station configuration
- Soil temperature integration
- Data export, Backup settings
- Multi-course support (CourseContext currently has 1 course)

### Stub adapters in place (need real sample files)
- Emlid Reach RS2+ JSON imports (`importEmlidReachJSON` in `imports.js`)
- Toro Lynx IRX imports (`importToroLynxIRX`)
- QGIS GeoJSON passthrough (`importQgisGeoJSON`)
- KMZ unzip (currently plain `.kml` only)

### Mapping (Phase 2+)
- Real aerial tiles (Esri / Mapbox / MapLibre — needs API key)
- Pan / zoom / drag (Leaflet or MapLibre swap; data layer stays the same)
- Drawing tools
- Polygon authoring UI

### Settings expansion candidates
- Persist search query (currently resets on reload)
- Highlighted match terms in section labels
- Light theme implementation (toggle exists, disabled)
- Per-mobile sidebar/dashboard density

---

## 16. Known Constraints / Things to Avoid

- **PowerShell `&&`** is not valid in 5.1 — chain commands with `;` or one-line with `if ($?) { ... }`
- **Bash on Windows path corruption** — use PowerShell for `npm`/`git`/`wrangler`. Use Bash only for POSIX scripts.
- **Heredoc syntax** — `@'...'@` for multiline; closing `'@` must be at column 0
- **Never `--no-verify`** on commits
- **Never force-push to master** without explicit ask
- The **drag-resize dashboard system is neutralized** via Reverts (4 commits). If a future feature needs to revisit this area, branch from `fe7fb8e` or earlier and review the reverts first.

---

## 17. How to Test Major Features

Open https://turfintel.bhawes1111.workers.dev:

| Feature | Path |
|---|---|
| Sidebar collapse/expand + tooltips | Click ⟨ at top of sidebar; collapsed mode shows tooltips on hover |
| Sidebar mobile drawer | Resize browser ≤768px; click hamburger; backdrop-blur dimmer |
| Operations Board DnD | `/crew` → drag crew from left panel to task cards |
| Operations Board Add Task | `/crew` → click + Task header button → fill form → Add |
| Operations Board delete | `/crew` → 🗑 button on any task card → confirm |
| Course Map preview + KML import | `/course-map` → ImportPanel sidebar → upload `.kml` |
| Settings search | `/settings` → type "kml" / "sidebar" / "noaa" |
| Page Navigation Style toggle | `/settings` → App Preferences → Dropdown ↔ Button |
| EmptyState per-module copy | Visit any module — empty list renders module-specific copy |
| Data clear (scoped) | `/settings` → Data Management → Clear button → Confirm |

---

## 18. Generation note

This document was rendered to PDF by `C:\Users\bhawe\md2pdf.mjs` — a one-shot Markdown → HTML → PDF converter using Chrome headless. To re-render:

```
node C:\Users\bhawe\md2pdf.mjs C:\Users\bhawe\turfintel\HANDOVER.md
```

Outputs: `HANDOVER.html` (intermediate) and `HANDOVER.pdf` next to the input. PDF style is white-background / dark-text for print legibility; code blocks stay dark for readability.

---

*Generated 2026-05-10. Live: https://turfintel.bhawes1111.workers.dev · HEAD: `2914226` · Cloudflare Version: `b5f2eea5-2dcb-483d-8bc3-120d216e5721`*
