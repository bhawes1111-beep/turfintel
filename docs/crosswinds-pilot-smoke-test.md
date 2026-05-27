# Crosswinds Pilot Smoke Test

A single-sitting, click-by-click test you run **inside the running
TurfIntel app at Crosswinds**. The goal is to exercise one full
end-to-end workflow against real course data before declaring the
pilot operational.

This is a **human-run** checklist. Nothing here is automated.

---

## 1. Purpose

Confirm that one real chemical / fertilizer can be:

- Added to inventory
- Linked to the Product Catalog
- Given a cost basis with an audit history row
- Used as a planned item on a real Crosswinds spray program
- Surfaced on the calendar with intel + cost chips
- Linked to a completed spray record with a working
  plan-vs-actual comparison
- Reflected on the dashboard's operations / stewardship / snapshot
  cards
- Included in all three Phase-7 reports (Spray Intelligence,
  Spray Program, Spray Program Cost)
- Used acceptably from a phone in the field

If every checkbox in section 6 (pass/fail) passes, the system is
ready for daily operational use. If any fail, log them in section
7 and decide whether they are blockers.

---

## 2. Before you start

Plan on 30–45 minutes uninterrupted at a computer + a working
phone with a data connection.

- Sign in to TurfIntel with a user that has the `superintendent`
  role.
- Confirm the course switcher is set to **Crosswinds**.
- Open the browser dev tools (Console tab). Leave them open for
  the duration of the test — a single red error is something you
  want to know about.
- From a terminal, run:

  ```
  node scripts/audit-operational-readiness.mjs
  ```

  Expect `Blockers: 0` and `Warnings: 0` in the console output.
  If not, abort and fix the audit first.

- From a terminal, run:

  ```
  npm run smoke
  ```

  Expect every script to pass. If not, abort and fix.

---

## 3. Test data to prepare

You only need ONE real product to drive the smoke test. Pick a
chemical or fertilizer that Crosswinds will actually apply within
the next 30 days, ideally one with a known Product Catalog match.

Have these values ready before you start:

- Product name
- Kind: `chemical` or `product` (or `fertilizer`)
- Unit (e.g. `oz/1000 sq ft`, `lb/acre`, `gal/acre`)
- Initial quantity on hand
- Vendor + location (optional)
- EPA number (for the catalog link, if known)
- Real per-unit cost (e.g. $4.25)
- One realistic planned application window in the next 30 days
- Target area (e.g. `Greens`, `Tees`, `Fairways`)
- Rate value + rate unit (matching the cost-basis unit)
- One completed spray record for the same product, with a date
  close to the planned window. If you don't have one yet, create
  one as part of step 4.7 below.

---

## 4. Step-by-step workflow

Click through these in order. Each numbered step ends with a
specific thing to observe.

### 4.1 Dashboard — initial render

1. Open the app at `/dashboard`.
2. Observe the page loads with no red console error.
3. Observe the **Today's Priorities**, **Action Required**,
   **Operations**, **Stewardship Alerts**, and **Spray Program
   Snapshot** cards all render. Counters may be zero — that's
   fine.

### 4.2 Inventory — add the product

1. Open **Inventory → Products**.
2. Add the product from section 3 (or pick an existing one if
   it's already on file).
3. Save and confirm it appears in the products list with the
   right kind, unit, and quantity.

### 4.3 Product Catalog link

1. From the products list, open the row you just added /
   selected.
2. In the drawer, click the **Link Catalog** chip.
3. Search by name or EPA number and pick the matching catalog
   row.
4. Confirm the chip on the row drawer now reads `📋 Catalog: …`
   instead of "Link Catalog".
5. Open **Inventory → Link Review** and confirm the row no
   longer appears as unlinked.

### 4.4 Cost basis

1. Back on the row drawer in **Products**, scroll to **Cost
   basis stewardship**.
2. Click **Add cost basis** (or **Edit cost basis**).
3. Enter:
   - Cost per unit (real value)
   - Unit (same as the rate unit on your planned item)
   - Source: `manual`
   - Notes (vendor or PO reference)
4. Save. Confirm the read view now shows the cost + Last updated
   timestamp.

### 4.5 Cost basis history

1. On the same drawer, click **Cost basis history**.
2. Confirm exactly one row appears with:
   - The timestamp you just saved
   - A "Manual edit" source chip
   - Previous cost = "—" / "—"
   - New cost = the value you entered
3. If the panel shows the spec'd audit-failure banner ("Cost
   basis was updated, but audit history could not be
   recorded."), record it under section 7 — the cost basis is
   correct but the audit trail has a gap.

### 4.6 Spray Program — create + plan

1. Open **Spray → Program Planner**.
2. Click **+ New program** and fill in:
   - Name: `Crosswinds — Pilot`
   - Program type: appropriate for the course area
   - Season year: the current year
3. Save. The new program should appear in the program list
   and open in the detail panel on the right.
4. Click **+ Add item**.
5. Use either the **Catalog picker** or the **Inventory picker**
   to populate the product on the form.
6. Fill in:
   - Target area
   - Planned start + end dates (a real window in the next 30
     days)
   - Rate value + rate unit (matching the cost-basis unit)
   - Carrier volume + unit if relevant
7. Save and confirm the planned item appears in the program's
   item list with intel chips (FRAC / HRAC / IRAC / REI / RUP /
   Signal as applicable) AND a green `Est. cost` chip.

### 4.7 Completed spray record (optional but recommended)

1. Open **Spray → Spray Records**.
2. Either:
   - Confirm an existing completed spray record for the same
     product already exists, OR
   - Create one for the matching date + area + product so
     section 4.8 has something to link.
3. Note the spray record's ID or application name for the next
   step.

### 4.8 Plan-vs-actual link

1. Back in **Program Planner**, on the planned item from 4.6,
   click **Link completed spray**.
2. Pick the spray record from 4.7.
3. Confirm a green `Linked completed record` summary appears on
   the planned item card AND a **Plan vs Actual** chip row
   renders below it with `Date`, `Product`, `Area`, `Rate`
   labels using the neutral helper language.

### 4.9 Calendar surface

1. Open **Spray → Program Calendar**.
2. Confirm the planned item from 4.6 appears on the month grid
   on its planned-start date.
3. Click the chip on that date to open the read-only
   **Calendar item detail drawer**.
4. In the drawer, confirm:
   - Planned details (program, target area, planned window,
     rate, carrier, status, notes if any)
   - **Linked completed record** card (green) showing the
     application name + date + product count
   - **Plan vs Actual** chip row with the same labels as 4.8
   - **Catalog intelligence** card with the FRAC/HRAC/etc.
     chips
   - **Cost awareness** card with the formatted currency value
   - **Inventory link** card if the planned item carries an
     `inventoryItemId`

### 4.10 Dashboard — reflects the data

1. Open `/dashboard`.
2. Confirm:
   - **Operations** strip: Today / This week counts now
     reflect the planned item (or `0` if the window is more
     than 7 days out). Est. week cost reflects the cost basis
     if the window is within 7 days.
   - **Stewardship Alerts**: should not list the new product as
     missing-catalog-link or missing-cost-basis (you just fixed
     both).
   - **Spray Program Snapshot**: lists the planned item in the
     Upcoming list with the green `✓ Linked` chip and the
     per-row cost chip.
3. Click each card's `Review →` link and confirm the deep-link
   lands on the right tab.

### 4.11 Reports

1. Open **Reports**.
2. Generate each of:
   - **Spray Intelligence**
   - **Spray Program**
   - **Spray Program Cost**
3. For each, confirm:
   - The custom preview renders (not the generic fallback
     table)
   - The disclaimer section shows the Phase-7 stewardship copy
     (each report has slightly different copy; all three
     mention "read-only")
   - The new planned item appears somewhere in the preview
     (Spray Program → Plan vs Actual section, Spray Program
     Cost → Estimated Items section)
4. From the action strip on any one report, hit **Print** and
   confirm a new browser tab opens with white-background HTML.
5. From the same strip, hit **JSON** and confirm a file downloads
   with `metadata.exportVersion`, `metadata.reportKind`, and
   `metadata.printExtras` present.

### 4.12 Mobile field check

1. Open the app on your phone outside (or in a course shed —
   somewhere closer to actual conditions than a desk).
2. Sign in with the same user.
3. Confirm on the phone:
   - **Dashboard** loads and the **Operations** strip stacks
     2-up
   - **Inventory → Products** drawer opens cleanly with no
     horizontal scrolling
   - **Spray → Program Calendar** shows the agenda view (the
     month grid is hidden below 700px by design)
   - Tapping a planned-item row opens the detail drawer
   - **Cost Import Review** (under Inventory → Products,
     scrolled below the product list) tiles stack and the
     Apply button stays full-width
4. Take screenshots of anything that feels off.

---

## 5. Expected results

If everything in section 4 worked:

- One product is now in inventory with a catalog link, a cost
  basis, and an audit-history row.
- One active spray program exists with at least one planned
  item carrying intel + cost chips.
- One completed spray record is linked to that planned item
  with a Plan vs Actual chip row.
- The calendar shows the planned item AND the linked-completed
  indicator.
- The dashboard surfaces (Operations / Stewardship / Snapshot)
  reflect the planned item.
- All three Phase-7 reports build and preview without crashing.
- The print HTML opens cleanly. The JSON export round-trips.
- The phone view is usable for the dashboard, inventory drawer,
  and calendar agenda.

---

## 6. Pass / fail checklist

Mark each item as **pass** or **fail**. Anything marked fail
goes in section 7.

- [ ] No console-breaking crash during the full test.
- [ ] Dashboard cards render with no missing-component errors.
- [ ] Inventory product saves and appears in the list.
- [ ] Cost basis saves and is reflected on the drawer.
- [ ] Cost basis history records the change with the right
      timestamp + source chip.
- [ ] Catalog link saves and Link Review confirms it.
- [ ] Spray program saves.
- [ ] Planned item saves and shows intel + cost chips.
- [ ] Planned item appears on the Program Calendar.
- [ ] Calendar item detail drawer opens and renders every
      expected section.
- [ ] Completed spray record links to the planned item.
- [ ] Plan vs Actual chips render with neutral language.
- [ ] Dashboard Operations strip reflects the planned item.
- [ ] Stewardship Alerts does NOT flag the product as missing
      catalog / cost basis.
- [ ] Spray Program Snapshot lists the planned item in
      Upcoming.
- [ ] Spray Intelligence report generates with custom preview.
- [ ] Spray Program report generates with custom preview.
- [ ] Spray Program Cost report generates with custom preview.
- [ ] Print HTML opens cleanly.
- [ ] JSON export downloads with the spec'd metadata keys.
- [ ] Phone use is acceptable (dashboard, drawer, calendar
      agenda, import review).

---

## 7. Issues to record

Use this table for anything that failed or felt rough. Keep one
row per distinct issue. Screenshots help.

| Area | What happened | Expected behavior | Device / browser | Screenshot taken? | Priority |
|------|---------------|-------------------|------------------|--------------------|----------|
|      |               |                   |                  |                    |          |
|      |               |                   |                  |                    |          |
|      |               |                   |                  |                    |          |
|      |               |                   |                  |                    |          |

**Priority** values:

- `blocker` — Crosswinds can't use the pilot until this is fixed.
- `warning` — Pilot can continue, but file an issue / commit a
  fix soon.
- `nit` — Polish item; not pilot-blocking.

---

## 8. Exit criteria

The pilot smoke test is **complete** when:

- Every line in section 6 is marked pass, AND
- The Phase 7O.1 audit (`node scripts/audit-operational-readiness.mjs`)
  still reports `Blockers: 0` and `Warnings: 0`, AND
- `npm run smoke` still passes every script with no assertion
  failures.

If any line in section 6 fails, do NOT declare the pilot
operational. Log each failure in section 7, decide priorities,
and re-run the smoke test after fixes land.
