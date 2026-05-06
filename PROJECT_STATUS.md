# TurfIntel — Project Status

**Last checkpoint:** 2026-05-06
**Latest commit:** `768170a` — Chemical labels module shell

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

---

## How to Run Locally

```bash
cd turfintel
npm install          # first time only
npm run dev          # starts dev server at http://localhost:5173
```

Open `http://localhost:5173` in a browser. Hot reload is active.

---

## How to Deploy

1. Commit and push to `master`:
   ```bash
   git add <files>
   git commit -m "Description"
   git push origin master
   ```
2. Cloudflare Pages detects the push automatically and builds + deploys within ~1 minute.
3. Verify the live URL in the Cloudflare Pages dashboard under the TurfIntel project.

---

## App Structure

```
turfintel/
├── public/
│   └── _redirects                      ← SPA routing fix for Cloudflare Pages
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx              ← Shell: sidebar + main area + mobile hamburger
│   │   │   ├── Layout.module.css
│   │   │   ├── Sidebar.jsx             ← Left nav, collapsible, Settings pinned bottom
│   │   │   ├── Sidebar.module.css
│   │   │   ├── PageShell.jsx           ← Reusable: page title + tab bar + content area
│   │   │   └── PageShell.module.css
│   │   └── shared/
│   │       ├── icons.jsx               ← Central SVG icon registry (20×20 viewBox)
│   │       ├── DashboardCard.jsx       ← Reusable card (wide + tall variants)
│   │       ├── DashboardCard.module.css
│   │       ├── ChemicalCard.jsx        ← Chemical label card (pin, tags, More button)
│   │       ├── ChemicalCard.module.css
│   │       ├── ChemicalModal.jsx       ← Detail modal (React Portal, Escape/X/backdrop)
│   │       └── ChemicalModal.module.css
│   ├── data/
│   │   └── chemicals.js               ← 6 placeholder chemicals with full label fields
│   ├── pages/
│   │   ├── Dashboard/                 ← Weather bar + 6 placeholder cards
│   │   ├── Crew/                      ← Tasks, Schedule, Hours tabs (placeholder data)
│   │   ├── Chemical/                  ← Chemical Labels tab live; others stub
│   │   ├── Budget/                    ← Stub
│   │   ├── Inventory/                 ← Stub
│   │   ├── Equipment/                 ← Stub
│   │   └── Settings/                  ← Stub
│   ├── App.jsx                        ← Root router (all 7 sections)
│   ├── index.css                      ← Global CSS custom properties / theme tokens
│   └── main.jsx                       ← React entry point
├── index.html
├── package.json
└── vite.config.js
```

---

## Stack

| | |
|---|---|
| **Framework** | React 19 + Vite 8 |
| **Routing** | React Router DOM v7 |
| **Styling** | CSS Modules (per-component, no global overrides per feature) |
| **Icons** | Custom SVG registry (`src/components/shared/icons.jsx`) |
| **Modal** | React Portal (`createPortal`) — renders into `document.body` |
| **Backend** | None (local state + placeholder data files only) |
| **Auth** | None |

---

## GitHub Workflow

- Every feature is built on its own branch (`feature/<name>`)
- One commit per completed feature, fast-forward merged to `master`
- Push to `master` = auto-deploy to Cloudflare Pages
- Never commit to `master` directly during active development

---

## Completed Features

| Commit | Feature |
|---|---|
| `1224d35` | Vite + React scaffold, global dark green theme, CSS custom properties |
| `fe7fd4e` | `_redirects` for Cloudflare Pages SPA routing |
| `bf70c83` | Left sidebar navigation, active page highlight, Settings pinned bottom |
| `07d881a` | Sidebar collapse/expand, SVG icon registry, mobile slide-in overlay |
| `ee1ee6f` | Responsive dashboard grid (3-col → 2-col → 1-col), DashboardCard component, weather bar |
| `4ca462e` | Crew module shell — Tasks tab (assignment panel, display board toggle), Schedule tab (status groups), Hours tab (weekly table) |
| `768170a` | Chemical Labels module shell — searchable/filterable card grid, ChemicalCard, ChemicalModal (React Portal), 6 placeholder chemicals |

---

## Known Issues

- [ ] All data is placeholder — no backend or API connected
- [ ] Pin state on ChemicalCard is visual only (no persistence) — noted in code, ready for API hookup
- [ ] Chemical Labels `internalNotes` and `courseNotes` fields are empty on all placeholder chemicals
- [ ] Weather bar shows static placeholder text — no live weather API connected
- [ ] No authentication or user accounts
- [ ] Budget, Inventory, Equipment, Settings sections are full stubs (no tabs implemented)
- [ ] Spray Records, Mix Calculator, Application Rates, Weather Conditions, Reports tabs on Chemical page are stubs

---

## Next Planned Feature: Inventory Module Shell

Recommended scope (matching Crew and Chemical pattern):

1. Create `src/pages/Inventory/` with `Inventory.jsx` and tab components
2. Tabs: **Products**, **Chemicals**, **Parts**, **Orders**, **Reports**
3. Build a reusable `InventoryCard` or table row component for each category
4. Use `src/data/inventory.js` for placeholder data (same isolation pattern as `chemicals.js`)
5. Mobile-safe table or card grid layout

---

## Recommended Next Development Steps

1. **Inventory module shell** — same pattern as Chemical Labels: data file → card component → tab page → wire into section
2. **Equipment module shell** — Equipment list, Maintenance log tabs with placeholder data
3. **Budget module shell** — Overview and Expenses tabs with a summary card layout
4. **Settings shell** — Course info, employee list, user preferences tabs
5. **Real weather API** — Wire OpenWeatherMap or similar into the Dashboard weather bar
6. **Backend / persistence** — When ready: replace placeholder data files with API calls; pin state on ChemicalCard is pre-wired for a PATCH call

---

## Rollback Strategy

**Preferred — revert a single commit (safe, non-destructive):**
```bash
git revert <commit-hash>
git push
```
This creates a new commit that undoes the target commit. No force-push needed.

**Last-resort — hard reset (destructive, rewrites history):**
```bash
git reset --hard <commit-hash>
git push --force
```
Only use if the commit being removed was never reviewed or shared.

**Cloudflare rollback (no Git required):**
Open the Cloudflare Pages dashboard → TurfIntel project → Deployments → click any prior deployment → "Rollback to this deployment". Instant, zero Git involvement.

---

## Full Commit History

| Hash | Description |
|---|---|
| `768170a` | Chemical labels module shell |
| `4ca462e` | Crew module shell |
| `ee1ee6f` | Responsive dashboard grid system |
| `07d881a` | Sidebar polish and responsive navigation |
| `bf70c83` | Stable frontend foundation |
| `fe7fd4e` | Add _redirects for Cloudflare Pages SPA routing |
| `1224d35` | Initial scaffold: React + Vite app shell for TurfIntel |
