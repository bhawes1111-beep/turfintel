# TurfIntel — Project Status

## Deployment

| | |
|---|---|
| **Frontend** | Cloudflare Pages |
| **Repo** | github.com/bhawes1111-beep/turfintel |
| **Branch** | `master` |
| **Build command** | `npm run build` |
| **Output directory** | `dist` |

Every push to `master` triggers an automatic Cloudflare Pages build and deploy.

---

## App Structure

```
turfintel/
├── public/
│   └── _redirects              ← SPA routing fix for Cloudflare Pages
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.jsx      ← Shell: sidebar + main area + mobile hamburger
│   │   │   ├── Layout.module.css
│   │   │   ├── Sidebar.jsx     ← Left nav, Settings pinned at bottom
│   │   │   ├── Sidebar.module.css
│   │   │   ├── PageShell.jsx   ← Reusable: page title + tab bar + content area
│   │   │   └── PageShell.module.css
│   │   └── shared/             ← Reserved for future reusable components
│   ├── pages/
│   │   ├── Dashboard/          ← Weather bar + placeholder cards
│   │   ├── Crew/               ← Stub (Tasks, Hours, Schedule, Employees, Notes)
│   │   ├── Chemical/           ← Stub (Spray Records, Labels, Mix Calc, etc.)
│   │   ├── Budget/             ← Stub (Overview, Expenses, Labor, etc.)
│   │   ├── Inventory/          ← Stub (Products, Chemicals, Parts, etc.)
│   │   ├── Equipment/          ← Stub (List, Maintenance, Repairs, etc.)
│   │   └── Settings/           ← Stub (User, Course, Employees, etc.)
│   ├── App.jsx                 ← Root router (all 7 sections)
│   ├── index.css               ← Global CSS custom properties / theme
│   └── main.jsx                ← React entry point
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
| **Styling** | CSS Modules (per component, no global overrides) |
| **Icons** | None yet (placeholder text) |
| **Backend** | None yet (local state only) |

---

## GitHub Workflow

- Every feature is built on its own branch
- One commit per completed feature
- Merge to `master` = auto-deploy to Cloudflare Pages
- Keep commits small and traceable for easy rollback

---

## Completed Features

- [x] Vite + React scaffold
- [x] Global dark green theme with CSS custom properties
- [x] Left sidebar navigation (Dashboard → Settings pinned at bottom)
- [x] Active page highlight on sidebar
- [x] Mobile-responsive sidebar (slide-in with overlay at < 768px)
- [x] Reusable `PageShell` component (title + horizontal tabs + content area)
- [x] React Router — all 7 sections routed
- [x] Dashboard page with blue weather bar and placeholder cards
- [x] Stub pages for Crew, Chemical, Budget, Inventory, Equipment, Settings
- [x] `_redirects` for Cloudflare Pages SPA routing
- [x] Deployed to Cloudflare Pages via GitHub

---

## Known Issues / Pending Work

- [ ] Sidebar collapse/expand not yet built (approved, pending implementation)
- [ ] Sidebar uses text abbreviations instead of real icons
- [ ] All sections are stubs — no real content or data
- [ ] No backend or API connected (all data is local state)
- [ ] No authentication
- [ ] Weather bar shows placeholder text only

---

## Rollback Strategy

**Revert last commit:**
```bash
git revert HEAD
git push
```

**Revert to a specific commit:**
```bash
git reset --hard <commit-hash>
git push --force
```

**Commit history:**
| Hash | Description |
|---|---|
| `fe7fd4e` | Add _redirects for Cloudflare Pages SPA routing |
| `1224d35` | Initial scaffold: React + Vite app shell for TurfIntel |

Cloudflare Pages keeps a deployment history — you can also roll back to any prior deployment directly from the Cloudflare dashboard without touching Git.
