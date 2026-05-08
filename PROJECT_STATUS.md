# TurfIntel Pro — Project Status
**Last Updated:** 2026-05-08  
**Stack:** React 19 + Vite 8 · Plain JavaScript · CSS Modules · React Router DOM v7  
**Deployed:** Cloudflare Pages (auto-deploy on push to `master`)  
**Repo:** https://github.com/bhawes1111-beep/turfintel  
**Latest Commit:** `53412d1` — Build functional Crew Tasks workflow

---

## Checkpoint Summary (2026-05-08)

Working tree is clean. Master is pushed. Build passes at 144 modules, 0 errors.

Nine full-data workflows were shipped across two sessions (2026-05-07 and 2026-05-08):
Spray Records → Disease Active Issues → Inventory Products → Equipment List →
Equipment Maintenance Logs → Crew Hours → Crew Schedule → Crew Employees → Crew Tasks.

Every workflow follows the same pattern: real static dataset in `src/data/`, full-featured
tab component with stat row + search + filter chips + sortable list cards + detail modal,
and a namespaced CSS block in the module's `.module.css`.

---

## Fully Functional Modules

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
- Dual view: **Daily** (filtered card list) + **Weekly** (CSS Grid table — 7 columns: name + 5 days + weekly total)
- O(1) lookup: `scheduleMap = useMemo(() => map by ${employeeId}-${date})` 
- Weekly grid: container `border-top + border-left + overflow:hidden`, cells `border-bottom + border-right` — border-collapse equivalent in CSS Grid
- Clickable shift blocks in weekly view open the same detail modal
- Shift filter chips visible in daily view only
- `Fragment` import (not `<>`) required for keyed rows in weekly grid
- CSS prefix: `cs*`

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

### Spray (1 of ~4 data tabs complete)

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

### Data Files
| File | Exports | Records |
|---|---|---|
| `src/data/crew.js` | `HOURS_LOG`, `SCHEDULE`, `EMPLOYEES`, `TASKS` | 14 + 40 + 8 + 12 |
| `src/data/equipment.js` | `EQUIPMENT_LIST`, `SERVICE_LOG` | — |
| `src/data/spray.js` | `SPRAY_RECORDS` | — |
| `src/data/disease.js` | `ACTIVE_ISSUES` | — |
| `src/data/inventory.js` | `PRODUCTS` | — |
| `src/data/dashboardCalendarEvents.js` | — | 17 events |
| `src/data/dashboardAlerts.js` | — | placeholder alerts |

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
| Crew Hours | `ch*` |
| Crew Schedule | `cs*` |
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
| High | 6 sidebar icons missing | Drop PNGs into `public/sidebar-icons/`, push |
| Low | `public/icons.svg` committed but unused | Delete file, push |
| Low | Chunk size warning on build (>500kb) | Not blocking — code-split when app grows |
| Low | Calendar events hardcoded to May 2026 | Resolves with real data |
| Low | No auth route guard | Add protected route wrapper when backend ready |

---

## Recommended Next Features (Priority Order)

1. **Upload 6 missing sidebar icons** — `disease`, `cultural-practices`, `budget`, `inventory`, `equipment`, `settings` (drop into `public/sidebar-icons/`, no code change)
2. **Spray → Build Spray Sheet** — printable/PDF application worksheet built from SPRAY_RECORDS
3. **Spray → Planned Programs** — scheduled spray program list with calendar integration
4. **Disease → Disease Alerts** — threshold-based alert feed; shares ACTIVE_ISSUES shape
5. **Inventory → Chemicals tab** — chemical inventory parallel to Products, `CHEMICALS` export in inventory.js
6. **Plant Nutrition tabs** — soil test data, recommendations, application log
7. **Cultural Practices tabs** — aeration schedule, mowing height log, topdressing program
8. **Budget tabs** — expense log, monthly budget tracker, category breakdown charts
9. **Equipment → Work Orders tab** — open/closed work order list linked to SERVICE_LOG
10. **Wire CourseContext** — filter all module data by `activeCourse.id` when multi-course support is needed
11. **Collapsed sidebar tooltips** — show label on hover when nav is collapsed
12. **Dashboard calendar — real data** — replace `dashboardCalendarEvents.js` with API fetch

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
| `src/pages/Dashboard/Dashboard.jsx` | Weather, alerts, card grid, calendar, event modal |
| `src/components/shared/ModuleOverview.jsx` | StatCard, InfoCard, Badge |
| `src/data/crew.js` | HOURS_LOG, SCHEDULE, EMPLOYEES, TASKS |
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
