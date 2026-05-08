# TurfIntel Pro — Development Log
**Last Updated:** 2026-05-07
**Stack:** React 19 + Vite 8 · Plain JavaScript · CSS Modules · React Router DOM v7
**Deployed:** Cloudflare Pages (auto-deploy on push to `master`)
**Repo:** https://github.com/bhawes1111-beep/turfintel

---

## 1. Session Summary

This session completed the sidebar visual overhaul, unified the dashboard scroll model, added a combined calendar widget to the main dashboard with a clickable event detail modal, added module-level Overview tabs to all 9 section pages, themed the custom scrollbars, and replaced the SVG icon system in the sidebar with user-supplied PNG image assets. The app is now functionally and visually solid as a scaffold — ready for real data wiring.

---

## 2. Features Completed This Session

### Sidebar Icon & Bubble System
- Replaced all SVG `<Icon>` components in nav items with `<img>` tags loading from `/public/sidebar-icons/[name].png`
- PNG icons sized at **34×34px** inside **42×42px** tiles (expanded), scaling to **38×38px** inside **48×48px** tiles (collapsed)
- Smooth `width` / `height` / `border-radius` CSS transitions animate the bubble size change on expand/collapse
- Glow filter (`drop-shadow`) applied to the `<img>` directly — traces PNG shape, not the tile box
- Collapse toggle chevron still uses the SVG `<Icon>` system — only nav items use PNG

### Sidebar Premium Visual Pass
- Sidebar background: `linear-gradient(180deg, #041204, #031003, #020a02)`
- Right border: `rgba(60,140,60,0.18)` green-tinted glow
- Icon tiles: dark gradient bg, multi-layer box-shadow, green-tinted border
- Hover: tile lifts with `translateY(-1px)` + ambient outer glow
- Active row: `rgba(18,55,18,0.95)` fill, `inset 4px 0 0 #4ecb4e` left accent, inner ambient glow
- Active icon: `drop-shadow(0 0 6px rgba(90,255,90,0.7))` traces PNG shape
- Label: 15px, font-weight 600, `rgba(210,230,210,0.72)` inactive · `#f4fff4` active
- Row min-height: 58px

### Dashboard — Unified Scroll
- Removed split-scroll architecture (weather section was `flex-shrink:0`, grid had `overflow-y:auto`)
- `Layout.module.css` `.outlet` is now the **single scroll container** (`overflow-y: auto`)
- `Dashboard.module.css` `.page` uses natural document flow — no height constraints
- Everything (header → weather → alerts grid → calendar) scrolls together as one page

### Dashboard — Combined Calendar Widget
- Full-width `DashboardCard` (new `full` prop, `grid-column: span 3`) at the bottom of the card grid
- `MonthNavigation` + `CalendarGrid` + `EventBadge` legend, all wired
- 17 placeholder events seeded in `src/data/dashboardCalendarEvents.js` covering all 7 module types for May 2026
- Color-coded event pills matching module colors from `EVENT_COLORS`

### Calendar Event Detail Modal
- Clicking any event pill or agenda card opens `CalendarEventDetail`
- Fixed overlay with blurred backdrop (`backdrop-filter: blur(3px)`)
- Close: click backdrop or press `Escape`
- Shows: colored accent bar (event type color), category, title, full weekday+date, status, course, severity, notes (fields shown only when present)
- `selectedEvent` state in `Dashboard.jsx`, passed via `onEventClick={setSelectedEvent}`

### Module Overview Tabs — All 9 Pages
Every module page now opens on an **Overview** tab showing a mini-dashboard of module-specific stats and status panels:

| Page | Stat Tiles | Info Panels |
|---|---|---|
| Crew | Total / Available / Off / Open Tasks | Crew status today · Week summary |
| Chemical | Products / Low Stock / Apps / REI violations | Low stock items · Recent activity |
| Spray | Apps / Planned / Acres / Today window | Upcoming apps · Month summary |
| Disease | Issues / Critical / Pressure / Last scouting | Active issues · Conditions & treatment |
| Plant Nutrition | pH / N Index / Pending Recs / Last test | Open recommendations · Schedule |
| Cultural Practices | Next aer. / Mow height / Topdressing / Orders | Upcoming practices · Current programs |
| Budget | YTD / Monthly budget / May spend / Remaining | Expense breakdown · Budget health |
| Inventory | SKUs / Low Stock / Critical / Pending orders | Critical items · Stock summary |
| Equipment | Total / Operational / In Service / Due | Service schedule · Fleet summary |

**Shared components used by all Overview tabs:**
- `ModuleOverview` — 4-col grid wrapper (→ 2-col tablet → 1-col mobile)
- `StatCard` — metric tile: large value + label + sub-text + optional accent color
- `InfoCard` — 2-col-span panel: title + key/value rows or children
- `Badge` — inline status pill: green / yellow / red / blue / gray

### Scrollbar Theming
- Global CSS in `src/index.css`
- Track: `rgba(4,12,4,0.6)` near-black · Thumb: `rgba(60,140,60,0.38)` muted green, 6px rounded
- Thumb hover: `rgba(78,203,78,0.65)` brighter neon green
- Firefox: `scrollbar-width: thin` + `scrollbar-color`
- Applies to every scrollable area in the app

---

## 3. Files & Architecture

### New Files Created This Session
```
src/components/shared/ModuleOverview.jsx
src/components/shared/ModuleOverview.module.css
src/components/shared/calendar/CalendarEventDetail.jsx
src/data/dashboardCalendarEvents.js
src/pages/Crew/tabs/CrewOverview.jsx
src/pages/Chemical/tabs/ChemicalOverview.jsx
src/pages/Spray/tabs/SprayOverview.jsx
src/pages/Disease/tabs/DiseaseOverview.jsx
src/pages/PlantNutrition/tabs/PlantNutritionOverview.jsx
src/pages/CulturalPractices/tabs/CulturalPracticesOverview.jsx
src/pages/Budget/tabs/BudgetOverview.jsx
src/pages/Inventory/tabs/InventoryOverview.jsx
src/pages/Equipment/tabs/EquipmentOverview.jsx
```

### Modified Files This Session
```
src/components/layout/Layout.module.css        .outlet → overflow-y: auto (single scroll owner)
src/components/layout/Sidebar.jsx              PNG <img> icons, icon names updated to kebab-case
src/components/layout/Sidebar.module.css       Premium tiles, navIcon sizing, collapsed bubble sizes
src/components/shared/DashboardCard.jsx        Added `full` prop
src/components/shared/DashboardCard.module.css .full { grid-column: span 3 }
src/components/shared/calendar/Calendar.module.css  CalendarEventDetail modal styles
src/components/shared/calendar/index.js        Exports CalendarEventDetail
src/pages/Dashboard/Dashboard.jsx             Calendar, event modal, unified scroll
src/pages/Dashboard/Dashboard.module.css      Natural height, removed inner scroll locks
src/pages/Crew/Crew.jsx                       Overview tab + default
src/pages/Chemical/Chemical.jsx               Overview tab + default
src/pages/Spray/Spray.jsx                     Overview tab + default
src/pages/Disease/Disease.jsx                 Overview tab + default
src/pages/PlantNutrition/PlantNutrition.jsx   Overview tab + default
src/pages/CulturalPractices/CulturalPractices.jsx  Overview tab + default
src/pages/Budget/Budget.jsx                   Overview tab wired (was stub)
src/pages/Inventory/Inventory.jsx             Overview tab + default
src/pages/Equipment/Equipment.jsx             Overview tab + default
src/index.css                                 Scrollbar theming + Exo 2 font import
```

### Key Architecture Decisions
- **Single scroll model:** `.outlet` in `Layout.module.css` owns scroll. No page-level `height:100%` or inner `overflow-y:auto` on dashboard `.page`. PageShell tabs have their own `.content` scroll — that is correct and intentional.
- **DashboardCard `full` prop:** `grid-column: span 3` in the 3-col grid = full width. Collapses to `span 1` on mobile alongside `wide`.
- **PNG icon path convention:** `/sidebar-icons/[kebab-case].png`. Icon key in `NAV_ITEMS` IS the filename — no mapping object. `plant-nutrition` and `cultural-practices` are kebab-case.
- **Filter on `<img>` not `.iconWrap`:** `drop-shadow` on the img traces the PNG shape. On the wrapper div it glows the tile box.
- **ModuleOverview is a layout primitive only:** No business logic. Replace placeholder strings in each `[Page]Overview.jsx` when real data arrives.

---

## 4. UI / Branding

### Logo — DO NOT CHANGE
- `public/logo-full.png` — Full TurfIntel Pro logo, expanded sidebar (192px wide, `height: auto`)
- `public/logo-mark.png` — Compact TP mark, collapsed sidebar (44×44px, `mix-blend-mode: screen`)
- Confirmed correct. Significant prior effort to get sizing/display right. Do not modify.

### Sidebar PNG Icons Status
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

Drop missing files into `public/sidebar-icons/` and push — zero code changes needed.

### Color Tokens (`src/index.css`)
```
--color-bg:           #0d1a0d
--color-sidebar:      #0a130a
--color-accent:       #4a9e4a
--color-text:         #e8f0e8
--color-text-muted:   #7a9e7a
--color-border:       #1e341e
--color-card:         #111e11
--sidebar-width:      220px
--sidebar-collapsed:  64px
```

---

## 5. Current Working State

### Fully Functional
- All routing (React Router v7)
- Sidebar: expand/collapse with smooth animation, PNG icons (5/11 loaded), active highlighting, mobile slide-in
- Course selector (top-right, CourseContext)
- Dashboard: weather section, dismissible banners, alert list, card grid, combined calendar, unified page scroll
- Calendar: grid + agenda views, month navigation, clickable event detail modal
- All 9 module pages with Overview tab as landing tab
- Shared weather components: WeatherCard, ETCard, ForecastStrip, WeatherAlertBanner
- Alert system: AlertList with priority grouping, acknowledge, dismiss
- Shared upload: UploadDropzone, UploadedFileCard, UploadStatusBadge
- Chemical: ChemicalLabels tab fully built
- Crew: all 5 tabs built (Tasks, Hours, Schedule, Employees, Notes)
- Spray: SprayCalendar tab built
- Cloudflare Pages auto-deploy
- Custom scrollbars

### Placeholder / Stub
All data is hardcoded. No backend, no API calls, no real auth. Most tabs outside Crew/Chemical/Spray are stubs showing "coming soon."

---

## 6. Known Issues / Cleanup

| Priority | Issue | Fix |
|---|---|---|
| High | 6 sidebar icons missing | Drop PNGs into `public/sidebar-icons/`, push |
| Low | `public/icons.svg` committed but unused | Delete file, push |
| Low | `mix-blend-mode: screen` on `logo-mark.png` unverified in collapsed state | Check visually |
| Low | Calendar events hardcoded to May 2026 | Will resolve with real data |
| Low | No auth route guard | Add protected route wrapper when auth is ready |

---

## 7. Recommended Next Tasks (Priority Order)

1. **Upload missing 6 sidebar icons** — `disease`, `cultural-practices`, `budget`, `inventory`, `equipment`, `settings`
2. **Delete `public/icons.svg`** — dead file
3. **Verify collapsed sidebar logo-mark** — confirm `mix-blend-mode: screen` looks right
4. **Wire CourseContext to module data** — filter all content by `activeCourse.id`
5. **Build Spray tabs** — SprayRecords, BuildSpraySheet, PlannedPrograms are clear stubs
6. **Build Disease tabs** — ActiveIssues + DiseaseAlerts share the alert data shape
7. **Inventory data model** — define schema, wire InventoryProducts / InventoryChemicals
8. **Add auth guard** — route protection wrapper, check login state
9. **Real calendar data** — replace `dashboardCalendarEvents.js` with API fetch
10. **Equipment page** — most stub-heavy; Equipment List + Maintenance Logs need schemas
11. **Budget charts** — add bar/line charts to BudgetOverview expense breakdown
12. **Collapsed sidebar tooltips** — show label on hover when collapsed (browser default `title` exists but is unstyled)

---

## 8. Startup Instructions For Next Session

### Run dev server
```powershell
cd C:\Users\bhawe\turfintel
npm run dev
# → http://localhost:5173
```

### Build for production
```powershell
cd C:\Users\bhawe\turfintel
npm run build
# Cloudflare Pages auto-deploys on git push to master
```

### Git commit (PowerShell syntax — NOT bash heredoc)
```powershell
git add .
git commit -m @'
Your commit message here
'@
git push origin master
```

### Key files for orientation
| File | Purpose |
|---|---|
| `src/App.jsx` | All routes |
| `src/index.css` | Global CSS tokens + scrollbar styles |
| `src/components/layout/Sidebar.jsx` | Nav items, PNG icon paths, collapse logic |
| `src/components/layout/Sidebar.module.css` | All sidebar visual styles |
| `src/components/layout/Layout.module.css` | Shell layout — `.outlet` is the scroll owner |
| `src/pages/Dashboard/Dashboard.jsx` | Weather, alerts, card grid, calendar, event modal |
| `src/components/shared/ModuleOverview.jsx` | StatCard, InfoCard, Badge — all Overview tabs use this |
| `src/components/shared/weather/weatherTokens.js` | All weather placeholder data + helpers |
| `src/data/dashboardAlerts.js` | Placeholder cross-module alerts |
| `src/data/dashboardCalendarEvents.js` | Placeholder combined calendar events |
| `public/sidebar-icons/` | PNG icon assets — drop new files here, no code change needed |

### Constraints to preserve
- **Logo is final** — Do not change `public/logo-full.png` or `public/logo-mark.png`
- **Plain JavaScript only** — No TypeScript
- **CSS Modules only** — No Tailwind, no styled-components; inline `style={{}}` only for dynamic values
- **Sidebar icons are PNG** — The `<Icon>` SVG component remains only for the collapse toggle chevrons
- **Scroll model** — `.outlet` owns scroll; do not add `overflow-y: auto` to `.page` divs
- **Admin API key** — `x-admin-key: TurfAdmin2025!` for backend endpoints

### Shared component quick reference
```
<StatCard label="..." value="..." sub="..." color="#hex" />
<InfoCard title="..." rows={[{ label, value }]} />
<InfoCard title="...">custom children</InfoCard>
<Badge variant="green|yellow|red|blue|gray">text</Badge>
<ModuleOverview>  ← 4-col grid wrapper, all the above go inside
<DashboardCard wide tall full>  ← span 2 / min-height 300 / span 3
<CalendarGrid events={[]} year={n} month={n} onEventClick={fn} />
<CalendarEventDetail event={obj} onClose={fn} />
```
