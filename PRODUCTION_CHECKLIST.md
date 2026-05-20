# TurfIntel — Production Readiness Checklist

_Phase 30 stabilization pass. Last reviewed: 2026-05-20._

This is an operational pre-flight list, not a feature spec. Run through it
before relying on TurfIntel for a live day at the course, and after any
deploy that touches data, weather, or the Worker.

---

## 1. D1 database (`turfintel-db`)

- **Binding**: `env.DB` → `turfintel-db` (id `43aafc7e-…589b9e`), declared in `wrangler.jsonc`.
- **Migrations**: live migrations run through `0028_inventory_product_labels_reapplication.sql` (see `worker/migrations/`).
- **After any schema change**: `npm run db:migrate:remote`.
- **Verify status**: `npm run db:status:remote`.
  - ⚠️ **Known caveat (Windows)**: the status/runner command can crash with
    `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — a wrangler/libuv
    bug on Windows, **not** a migration failure. If this happens, verify
    migrations from a non-Windows shell or check the `_migrations` table
    directly: `npx wrangler d1 execute turfintel-db --remote --command "SELECT name FROM _migrations ORDER BY name"`.
- [ ] Confirm the latest migration in `worker/migrations/` appears in remote `_migrations`.

## 2. R2 bucket (`turfintel-photos`)

- **Binding**: `env.PHOTOS` → `turfintel-photos`, declared in `wrangler.jsonc`.
- **Used by**: `worker/api/attachments.js` (operational photo attachments, Phase 8).
- **Health check**: upload one photo via the app, confirm it renders, then delete it.
- [ ] Confirm `env.PHOTOS` binding shows in `wrangler deploy` output (it lists bindings on every deploy).

## 3. Weather fallback

- **Mechanism** (`src/utils/weather/useWeather.js`): live fetch every 10 min;
  on error or empty bundle, falls back to `PLACEHOLDER_*` and sets `error`.
  Exposes `isStale` and `isLive` so the UI can mark non-live data.
- **Degrades safely**: intelligence utils treat missing weather as `unknown`
  rather than fabricating values — no false alarms when the feed is down.
- [ ] Confirm the weather card shows a live timestamp / source label, not placeholder, on a normal day.
- [ ] Confirm a forced failure (offline) still renders the dashboard with placeholder + an "unavailable" note.

## 4. Ambient / API keys

- **Admin key (mutations)**: `x-admin-key` header must match `env.ADMIN_KEY` secret.
  - Set via `npx wrangler secret put ADMIN_KEY` (value: `TurfAdmin2025!`).
  - Same value is hardcoded in `src/utils/equipment/equipmentStore.js` so the SPA
    carries it automatically. **This is obscurity, not security** — the key ships
    in the public bundle. Real per-user auth is a future phase.
  - Until the secret is set, every mutation route returns **503** (reads stay public).
- [ ] Confirm `ADMIN_KEY` secret is set in the deployed environment (a mutation succeeds, not 503).
- **Rotation**: update `equipmentStore.js` AND re-run `wrangler secret put ADMIN_KEY`.

## 5. Empty-state behavior

- Intelligence cards degrade to `unknown` / honest empty messages, not blank or error.
- Dashboard placeholder cards (Crew Status, Equipment Alerts, Upcoming Applications,
  Recent Notes) are **hidden on mobile** (`.placeholderCard { display: none }` ≤768px).
- [ ] Confirm a brand-new course (no data) renders a calm dashboard, not a wall of warnings.

## 6. Delete / cascade cleanup

- Sprays use **soft delete** (migration `0016_spray_soft_delete.sql`).
- Spray child rows (`spray_products`, `spray_areas`) cascade — verify a deleted
  spray's products/areas don't linger in intelligence outputs.
- [ ] Delete a test spray; confirm it disappears from Spray Window / Agronomic / Operational Command.

## 7. Build / test / deploy workflow

```
npm run build                              # vite production build
node scripts/smoke-operational-command.mjs # engine smoke test (39 assertions)
npx eslint <changed files>                 # lint touched files only
git add <specific files> && git commit
git push origin master
npx wrangler deploy                        # only if behavior/UI changed
curl -fsS -o /dev/null -w "%{http_code}" https://turfintel.bhawes1111.workers.dev/
```

- [ ] Build green, smoke 39/39, lint clean on touched files before deploy.
- [ ] After deploy: confirm live URL returns 200 and the new bundle hash is served.

## 8. Git clean state

- [ ] `git status` shows no unexpected modified files.
- [ ] No unpushed commits left behind unintentionally (`git log origin/master..master`).
- Note: untracked `dashboard_audit.md` and `Inventory-Validation-Report.html` exist in
  the working tree — confirm whether they should be committed, ignored, or removed.

## 9. Backup / export plan

- **D1**: `npx wrangler d1 export turfintel-db --remote --output backup-YYYY-MM-DD.sql`
  before any risky migration.
- **R2**: photos are the only binary asset; list with `npx wrangler r2 object get`/bucket tooling.
- [ ] Take a D1 export before any destructive schema change.
- [ ] Document where exports are stored (currently: `backups/` directory in repo root).
