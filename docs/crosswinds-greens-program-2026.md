# Crosswinds Greens Program 2026 — Pilot Reference

Reference doc for the imported Crosswinds annual greens program.
Seeded into D1 by migration
[`worker/migrations/0047_crosswinds_greens_program_2026_seed.sql`](../worker/migrations/0047_crosswinds_greens_program_2026_seed.sql).

## Source document

- Title: **Crosswinds Greens Program Recommendations '26**
- Vendor: **Vereens Turf Products**
- Prepared by: **Paul Culclasure**
- Course: **Crosswinds Golf Club**

## Program assumptions

- Default greens acreage: **~4 acres** (assumption based on document
  totals — several rates show that 16 oz/A × 4 = 64 oz total,
  1.25 gal/A × 4 = 5 gal total, etc.).
- Stored as a single `spray_programs` row with id
  `sp-crosswinds-greens-2026`, `program_type = 'greens'`,
  `season_year = 2026`, `source = 'imported'`.
- Each dated product is one `spray_program_items` row with
  `target_area = 'Greens'`, `status = 'planned'`. Multi-product
  applications share `planned_start_date / planned_end_date`.
- The seed migration uses `INSERT OR IGNORE` on stable item ids so
  re-running the migration is a no-op.

## Architecture invariants preserved

This seed runs through the EXISTING Phase 7F.1 data model. No new
tables, no new columns, no new write routes, no new UI.

- Planned programs **do not deduct inventory**. Deduction happens
  only through completed Spray Records via the existing
  `recordInventoryUsage` route.
- `product_catalog` remains read-only. The seed does not write to
  it.
- `linked_spray_record_id` is always NULL on these rows. Only the
  user (via the Phase 7F.4 `/completed-link` route) can flip an
  item to `status='completed'`.
- The Phase 7N dashboard cards (Operations strip, Stewardship
  Alerts, Spray Program Snapshot) and the Phase 7I/7G reports
  (Spray Intelligence, Spray Program, Spray Program Cost) pick
  this program up automatically — no UI changes were made.

## Annual nutrient summary

- Total N: **4.85 lbs N**
- Total K: **6.33 lbs K**

(Source: document's published annual summary; per-application
nutrient summaries are recorded verbatim in each item's
`application_notes`.)

## Item count

The migration seeds **153** `spray_program_items` rows across the
following dated applications. The product list per date is in the
migration file; this section is a calendar overview.

| Date          | Type                  | Notes                                       |
|---------------|-----------------------|---------------------------------------------|
| Jan 3         | Spray                 | Standard                                    |
| Jan 13        | Spray                 | Standard                                    |
| Jan 24        | Spray                 | Water in app                                |
| Feb 3         | Spray                 | Standard                                    |
| Feb 14        | Spray                 | Standard                                    |
| Feb 28        | Spray + granular      | Water in app; granular VerdeCal             |
| Mar 14        | Spray                 | Standard                                    |
| Mid-Mar       | Granular only         | When watering or rain                       |
| Mar 28        | Spray + granular      | Water in app; granular KMag                 |
| Apr 5         | Spray                 | Standard                                    |
| Apr 11        | Spray                 | Standard                                    |
| Apr 15        | Granular only         | Vereens 13-2-13                             |
| Apr 25        | Spray + granular      | Water in app; granular VerdeCal G           |
| May 9         | Granular only         | Fipronil + 13-2-13                          |
| May 16        | Spray                 | One turn of heads at app                    |
| May 25        | Spray + granular      | Water in app; granular 18-3-18              |
| Jun 13        | Spray + granular      | One week prior to aeration                  |
| **Jun 23–25** | **Aeration window**   | Incorporated into holes / pre-sand / post-sand pre-drag / spray-on-sand items water-in-multiple-cycles-to-flush |
| Jun 30        | Spray + granular      | Following DryJect                           |
| Jul 16        | Spray                 | Standard                                    |
| Jul 25        | Spray + granular      | Water in app; granular 18-3-18              |
| Mid-Jul       | Granular only         | PUSH Aqua Aid VerdeCal G                    |
| Aug 8         | Spray                 | Standard                                    |
| Aug 22        | Spray + granular      | Water in app; granular 18-3-18              |
| Sep 19        | Spray + granular      | Water in app; granular KMag                 |
| Oct 3         | Spray                 | Standard                                    |
| Oct 17        | Spray                 | Standard                                    |
| Oct 24        | Spray                 | Water in app                                |
| Nov 14        | Spray                 | Standard                                    |
| Nov 28        | Spray                 | Water in app                                |
| Dec 12        | Spray                 | Standard                                    |
| Dec 26        | Spray                 | Water in app                                |

"Water in app", "Granular only", "Spray on sand. Water in
multiple cycles to flush", and "Aeration window June 23–25.
Incorporated into holes pre-sand / post-sand pre-drag" are all
written into the relevant rows' `application_notes` — no new
schema fields.

## Product alias review (manual, not auto-merged)

The Phase 7C.1 catalog resolver does NOT auto-merge product names.
The migration carries the document's spelling verbatim and notes
likely aliases for the steward to resolve manually via the
existing Inventory → Link Review workflow.

| Document spelling | Alias / note |
|-------------------|--------------|
| Prize Phiter      | Prize Phyter (same product) |
| Harmony           | Root Harmony (likely same product — confirm via catalog) |
| Ampliphy 18 / Veriphy 18 | **Do not merge** — appear on different dates; confirm in catalog before linking |
| Daconil Action / Chlorothalonil / Chlorothalonil 720 | **Related, not the same** — keep separate inventory rows; FRAC group will match |
| Prothioconazole / Densicor | Prothioconazole is the generic equivalent of Densicor. Note in catalog; do NOT auto-merge |
| Rain Pigment / Rain Green Pigment | Same product; document uses both spellings |
| Appear / Appear II | Document uses both; treat as the same product unless catalog says otherwise |
| Push * / PUSH * | Same brand prefix |

## Products needing manual inventory + catalog review

These products from the program may need a manual inventory row
created via Inventory → Products → **+ Add product manually**
(Phase 7Q.1). After the row is created, link to the read-only
Product Catalog if a matching row exists; the manual-add flow
prompts for this via the Phase 7Q.2 "Next step" banner.

Cost basis (Phase 7J.1) should be set per product after the row
exists; the audit trail (Phase 7M.1) will record `'manual'`.

**Syngenta**
- Daconil Action
- Secure Action
- Appear / Appear II
- Ascernity

**Qualipro**
- Tebuconazole 3.6F
- Contrado
- Fosetyl Al
- Chlorothalonil 720
- Pendant SC
- Manzate Max
- Fipronil 0.0143G
- TM 4.5

**PBI Gordon**
- Pedigree
- Segway

**Albaugh**
- Zelto
- Crescendo
- Prothioconazole

**Molasses Kings**
- Sea Sugar
- Sweet Heat

**Aqua Aid**
- Hydra 30 Plus
- Excalibur
- Oars PS

**Rightline**
- Nemamectin

**Vereens / PUSH granular**
- VerdeCal Gypsum
- VerdeCal Lime
- KMag Greens Grade
- 18-3-8 Greens Grade
- Vereens 13-2-13
- Ecolite
- MycoReplenish
- 5-4-5 Greens Grade
- Turf Royale Mini 28-7-14

**Soluble**
- Potassium Nitrate 13.5-0-46
- Epsom Salt
- Calcium Nitrate 15.5-0-0
- Redox K+
- Triden Microbes

**Liquid (Vereens / Mixed)**
- Harmony / Root Harmony
- Ampliphy 18
- Veriphy 18
- Microtone
- PowerChord 0-0-26
- Highnote
- BioRhythym
- Double Bass Kelp
- Dual Shield
- Prize Phiter
- KickDrum 0-0-29 K Acetate
- Rootnote 3-18-18
- Rain Pigment / Rain Green Pigment
- 26 PHite
- Fame / Fame SC
- UAN 32-0-0
- Urea
- Hi Cal / PUSH VerdeCal Lime
- PUSH VerdeCal G
- Veriphy 18
- Resilia
- Indemnify

## Vendor spend + rebate reference (NOT stored in D1)

This is reference data only. There is no budget ledger or invoice
table in TurfIntel; these figures are not seeded into the database.
They live here so Bryan can cross-check with vendors during pilot
ordering.

### Syngenta
- Greens Foundation Solution: 15 gal Daconil Action, 2 gal Secure Action, 24 gal Appear
- Appear II — 8 bottles / 16 gal
- Ascernity — 3 gal
- Secure Action — 1 gal
- **Total Syngenta spend: $13,530**
- Estimated rebate: $1,082.40 (Club Check)

### Qualipro
- Tebuconazole — 1 gal, $92.50
- Contrado — 0.75 gal, $1,100.00
- Fosetyl Al — 27 bottles, $2,868.75
- Chlorothalonil 720 — 5 gal, $240.00
- Pendant SC — 5 gal, $2,873.00
- Manzate Max — 48 lb, $379.00
- Fipronil 0.0143G — 12 bags, $576.00
- TM 4.5 — 5 gal, $325.00
- **QP total: $8,454.25**
- Estimated rebate: $408.60 (electronic gift card)

### PBI Gordon
- Pedigree — 10 gal, $3,690.00
- Segway — 8 bottles, $3,600.00
- **PBI spend: $7,290.00**
- Rebate: $1,325.00 (company check)

### Albaugh
- Zelto — 4 gal, $1,060.00
- Crescendo — 16 lb, $1,760.00
- Prothioconazole — 1 gal, $1,320.00
- **Albaugh total: $4,140.00**

### Molasses Kings
- Sea Sugar — 3 cases @ $200/case, $600.00
- Sweet Heat — 4 cases @ $200/case, $800.00
- **Molasses Kings total: $1,400.00**

### Aqua Aid
- Hydra 30 — 4 cases @ $372.00, $1,488.00
- Excalibur — 5.5 cases @ $750.00, $4,125.00
- Oars PS — 1.5 cases @ $567.00, $850.50
- **Aqua Aid total: $6,463.50**

### Rightline
- Nemamectin — 1 gal, $1,600.00
- Note: rebate part of Vereens EOP rebate

### Granular
- VerdeCal Gypsum — 30 bags @ $29.80, $894.00
- VerdeCal Lime — 40 bags @ $28.60, $1,144.00
- KMag Greens Grade — 12 bags @ $35.00, $420.00
- 18-3-8 Greens Grade — 40 bags @ $49.00, $1,960.00
- Vereens 13-2-13 — 30 bags @ $39.00, $1,170.00
- Ecolite — 40 bags @ $21.00, $840.00
- MycoReplenish — 30 bags @ $40.75, $1,222.50
- 5-4-5 Greens Grade — 30 bags @ $41.00, $1,230.00
- Turf Royale Mini — 10 bags @ $34.00, $340.00
- **Granular total: $9,220.00**

### Soluble
- Potassium Nitrate Soluble — 12 bags @ $60.30, $723.60
- Epsom Salt — 1 @ $35.00, $35.00
- Calcium Nitrate — 6 @ $27.25, $163.50
- Redox K+ — 20 lb @ $22.50, $450.00
- Triden Microbes — 10 packs @ $37.50, $375.00
- **Soluble total: $1,583.60**

### Liquid
- Harmony — 5 cases @ $168.42, $842.10
- Ampliphy 18 — 4 cases @ $152.05, $608.20
- Microtone — 2 cases @ $97.08, $194.16
- PowerChord — 3 cases @ $239.77, $719.31
- Highnote — 1 case @ $98.68, $98.68
- BioRhythym — 6 cases @ $184.21, $1,105.26
- Double Bass — 3 cases @ $407.89, $1,223.67
- Dual Shield — 2.5 gal @ $95.00, $237.50
- Prize Phiter — 2 cases @ $353.57, $530.35
- KickDrum — 3 cases @ $182.46, $547.38
- Rootnote — 2 cases @ $160.82, $321.64
- Rain — 2 gal @ $125.00, $250.00
- **Liquid total: $6,678.25**

## Re-running the seed

The seed is idempotent: it uses `INSERT OR IGNORE` on stable IDs
(`sp-crosswinds-greens-2026` for the program, `spi-cw26-…` for
items). Running migration 0047 a second time is a no-op.

If you need to wipe and re-seed during pilot setup:

1. Delete the program from the planner UI (the existing Phase
   7F.1 delete flow cascades to items; archived = soft-delete).
2. Run `wrangler d1 migrations apply` so the seed re-runs.

Do not edit this migration to "fix" data after it has been
applied — let migration 0048+ correct anything by writing UPDATE
statements scoped to the affected ids.
