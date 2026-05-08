# TurfIntel Pro — Development Log

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
