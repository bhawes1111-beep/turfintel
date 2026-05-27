# Crosswinds Pilot Onboarding

This checklist prepares TurfIntel for **daily operational use** at a
pilot course. Work top-to-bottom. Every step is read-mostly: nothing
here mutates the catalog, deducts inventory, or fabricates completed
spray records.

Use the in-app **Crosswinds Pilot Setup** panel on the Dashboard for
the same checklist with deep-links into each surface.

---

## 0. Before you start

- Confirm the user accounts that will be using TurfIntel exist.
- Confirm at least one user has the `superintendent` role (or
  equivalent) so the cost-basis editor + program planner are
  available.
- Confirm the course is selected in the course switcher.
- Run `node scripts/audit-operational-readiness.mjs` once and
  expect `Blockers: 0` in the console summary.

---

## 1. Inventory setup

**Goal:** load every product the course actually applies plus the
core operational kinds so cost awareness and intelligence have
something to chew on.

- Open **Inventory → Products**.
- Add or import:
  - Chemicals the course applies in the current season.
  - Fertilizers the course applies in the current season.
  - Any additional products (wetting agents, dyes, surfactants) that
    show up on a spray sheet.
- Per row, fill in:
  - Name + kind (`chemical` / `product` / `fertilizer` / etc.).
  - Unit + initial quantity.
  - Vendor + location (optional but recommended for the dashboard
    snapshot rows).
- Skip stock-deduction worries: planned spray items do **not**
  deduct inventory; only completed spray records do.

**Done when:** the Inventory Products tab lists every product the
course expects to apply this season.

---

## 2. Product Catalog linking

**Goal:** wire every applicable inventory row to its
`product_catalog` row so the Spray Intelligence resolver can find
FRAC / HRAC / IRAC / REI / RUP / Signal info.

- Open **Inventory → Catalog** to browse the read-only catalog.
- For each chemical / product:
  - Open the row in **Inventory → Products**.
  - Click the **Link Catalog** chip on the drawer, search by name
    or EPA number, and pick the matching catalog row.
- Open **Inventory → Link Review** to confirm the missing-link
  count drops to 0 for the products that need it.
- If a product genuinely has no catalog row, leave it unlinked;
  the dashboard Stewardship Alerts card will surface it.

**Done when:** every chemical / product the course applies is
either linked or intentionally listed in Link Review.

---

## 3. Cost basis setup

**Goal:** give the Spray Program cost-awareness layer enough to
estimate planned spray cost.

- For each inventory product the course will actually pay for:
  - Open the row drawer → **Cost basis stewardship**.
  - Click **Add cost basis** (or **Edit cost basis**).
  - Enter:
    - Cost per unit
    - Unit (defaults to the inventory unit when blank — keep them
      identical so the cost-awareness estimator can compare units
      exactly; the estimator refuses to invent unit conversions).
    - Source: `manual` for hand-entered, `imported` if pasting from
      a vendor sheet, `invoice` when keying from an invoice
      (description-only, not a real invoice ledger), `unknown`
      otherwise.
    - Optional notes (vendor, PO #, season).
- The audit row is written automatically on save. Open
  **Cost basis history** on the same drawer to confirm the row
  appears.
- Optional: use **Cost Import Review** (under Inventory → Products,
  scrolled below the product list) to paste a CSV-like sheet and
  apply ready rows one at a time. There is no Apply All — that's
  intentional for pilot.

**Done when:** the Spray Program Planner's **Cost Basis Review**
panel shows 0 issues for the products the course is actually using.

---

## 4. Spray Program entry

**Goal:** create a current-season program with planned items so the
planner, calendar, and dashboard snapshots all light up.

- Open **Spray → Program Planner**.
- Click **+ New program** and fill in:
  - Name (e.g. "Greens — Summer 2026")
  - Program type (`greens`, `tees`, `fairways`, etc.)
  - Season year
- For each planned application:
  - Click **+ Add item** under the selected program.
  - Pick the product via **Catalog picker** or **Inventory picker**
    (the planner does not auto-link inventory to the program; the
    picker just populates the form).
  - Set target area, planned window dates, rate value + unit,
    carrier volume if applicable, and application notes.
  - Status should stay `planned` until the spray is actually done.
- Confirm each row's **Intel** chips render (FRAC / HRAC / REI /
  Signal). If they don't, revisit the Product Catalog link.
- Confirm the planner's Cost Basis Review panel + per-item cost
  chips reflect the cost basis you entered in step 3.

**Done when:** the program has every planned application for the
next 30 days entered as a planned-status row.

---

## 5. Completed spray record linking

**Goal:** stitch already-completed sprays to their corresponding
planned items so the plan-vs-actual comparison + dashboard linked
counts work.

- Open **Spray → Spray Records** and confirm the completed sprays
  the course has already logged are listed.
- Back in **Program Planner**, on each completed item:
  - Click **Link completed spray**.
  - Pick the matching spray record from the picker.
  - The link is one-way: it never edits the completed record, never
    deducts inventory, never creates a calendar event.
- Verify the **Plan vs Actual** chips on the linked planned item
  carry the neutral-language summary (`inside planned window`,
  `matches recorded`, etc.).

**Done when:** every completed planned item is linked to its spray
record, and the dashboard Spray Program Snapshot "Linked completed"
tile reflects that count.

---

## 6. Dashboard review

**Goal:** confirm the at-a-glance surfaces light up with live data.

- Open **Dashboard** and scroll through:
  - **Operations** strip: Today / This week / Overdue /
    Unscheduled / Est. week cost should all show real values.
  - **Stewardship Alerts**: should be ≤ 0 rows (or a clean
    "No stewardship alerts right now." chip).
  - **Spray Program Snapshot**: upcoming list should show items
    from the next 7 days with linked-completed chips where
    appropriate.
- Click each tile's **Review →** link to verify the deep-link
  routes work (Calendar / Planner / Link Review).

**Done when:** the dashboard reads like a working day at the
course — no obvious zeros, no obvious data gaps.

---

## 7. Report generation

**Goal:** confirm all three Phase 7 reports build and preview
correctly.

- Open **Reports**.
- Generate each Spray-category report at least once:
  - Spray Intelligence
  - Spray Program
  - Spray Program Cost
- For each, open the preview, confirm:
  - The custom preview renders (not the generic table fallback).
  - The disclaimer section shows the Phase-7 stewardship copy.
  - The print button opens a clean white print HTML with the
    summary tile block, sections, and footer.
- Optionally export each to JSON and confirm the file round-trips
  cleanly.

**Done when:** every report renders with the live data and the
print HTML opens without errors.

---

## 8. Mobile field test

**Goal:** confirm the most operational surfaces work from a phone.

- Open the app on the phone the field crew will actually use.
- Verify:
  - **Dashboard** Operations strip stacks 2-up on mobile.
  - **Inventory → Products** drawer scrolls cleanly; cost basis
    editor stays usable.
  - **Spray → Program Calendar** agenda view renders below 700px
    (the desktop grid is hidden by design on phones).
  - **Cost Import Review** tiles stack vertically and the row
    cards still show the Apply / Applied state.
- The Phase 7A mobile-capture invariants (sub-10s, one-handed,
  low-typing) apply to field-capture workflows specifically — this
  step covers the stewardship surfaces, not those flows.

**Done when:** the field user can read every dashboard tile and
open every drawer without horizontal scrolling.

---

## 9. Backup / export test

**Goal:** confirm a snapshot of the course's data can be exported
locally without the worker.

- From **Reports**, generate each report and download the JSON.
- Save the three JSON files into a course-specific folder.
- Confirm each file opens cleanly in a text editor and the
  `metadata.exportVersion`, `metadata.reportKind`, and
  `metadata.printExtras` fields are present.

**Done when:** the course has a local copy of the current
Intelligence / Program / Cost reports.

---

## Pilot acceptance gate

Before declaring "pilot ready", every section above should be
checked. Then:

- Run `node scripts/audit-operational-readiness.mjs` again.
  Expect `Blockers: 0` and `Warnings: 0`.
- Run `npm run smoke`. Expect all scripts to pass.

If both pass and the dashboard reads like a normal operational
day, the course is ready to use TurfIntel as the primary
spray-program system.
