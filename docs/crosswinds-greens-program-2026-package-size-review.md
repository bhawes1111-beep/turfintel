# Crosswinds Greens Program 2026 — Package-Size Review

Worksheet for the remaining program products that have **vendor pricing
but need a package size** (gallons per case, pounds per bag, or bottle
size) before a cost basis can be safely derived and applied.

**This is review/reporting only. Nothing here is applied.** Fill in the
missing package sizes, then a later phase can compute and apply
`cost_per_unit`.

Generated from
[`crosswinds-greens-program-2026-cost-basis-draft.json`](crosswinds-greens-program-2026-cost-basis-draft.json)
by
[`scripts/prepare-crosswinds-package-size-review.mjs`](../scripts/prepare-crosswinds-package-size-review.mjs);
data lives in
[`crosswinds-greens-program-2026-package-size-review.json`](crosswinds-greens-program-2026-package-size-review.json);
validated by
[`scripts/check-crosswinds-package-size-review.mjs`](../scripts/check-crosswinds-package-size-review.mjs).

## Summary

- **25** products need a package size (gallons-per-case or pounds-per-bag)
- **7** products need a standalone vendor price (currently bundled / by-bottle)
- **1** product needs a name reconciliation only (Prothioconazole — price is already clean)
- **2** products are flagged **DO NOT MERGE** (Ampliphy 18 / Veriphy 18)
- **13** products are already costed (Phase 7U.3) — listed for reference

> Cost basis is a per-inventory-row reference price only. Filling these
> in does **not** deduct inventory or create usage. Inventory stock is
> not deducted from planned spray programs.

## Formulas

- **Liquids (by case):** `cost per gal = totalCost / (cases × gallons-per-case)`
- **Granulars/solubles (by bag):** `cost per lb = totalCost / (bags × pounds-per-bag)`
- **Packs:** `cost per lb = totalCost / (packs × pounds-per-pack)`
- **Bottles:** confirm bottle size + (ideally) a standalone price, then use the matching volume/weight formula.

No formula crosses volume↔weight.

## Liquids by case — need **gallons per case**

| Product | Inventory row | Vendor | Purchase | Total |
|---------|---------------|--------|----------|-------|
| Ampliphy 18 *(DO NOT MERGE)* | Ampliphy 18 | Vereens | 4 cases | $608.20 |
| BioRhythym | *(no match)* | Vereens | 6 cases | $1105.26 |
| Double Bass Kelp | Double Bass (Kelp) | Vereens | 3 cases | $1223.67 |
| Excalibur | Excalibur | Aqua Aid | 5.5 cases | $4125.00 |
| Harmony | *(no match)* | Vereens | 5 cases | $842.10 |
| Hydra 30 Plus | Hydra 30 Plus | Aqua Aid | 4 cases | $1488.00 |
| Kickdrum 0-0-29 K Acetate | KickDrum 0-0-29 | Vereens | 3 cases | $547.38 |
| Microtone | Microtone | Vereens | 2 cases | $194.16 |
| Oars PS | Oars PS | Aqua Aid | 1.5 cases | $850.50 |
| PowerChord 0-0-26 | PowerChord 0-0-26 | Vereens | 3 cases | $719.31 |
| Prize Phiter | Prize Phiter | Vereens | 2 cases | $530.35 |
| Rootnote 3-18-18 | Rootnote 3-18-18 | Vereens | 2 cases | $321.64 |
| Sea Sugar | Sea Sugar | Molasses Kings | 3 cases | $600.00 |
| Sweet Heat | Sweet Heat | Molasses Kings | 4 cases | $800.00 |

## Granulars / solubles by bag — need **pounds per bag**

| Product | Inventory row | Vendor | Purchase | Total |
|---------|---------------|--------|----------|-------|
| 5-4-5 Greens Grade | 5-4-5 Greens Grade | Granular | 30 bags | $1230.00 |
| Calcium Nitrate 15.5-0-0 | Calcium Nitrate 15.5-0-0 | Soluble | 6 bags | $163.50 |
| Ecolite | Ecolite | Granular | 40 bags | $840.00 |
| Epsom Salt | Epsom Salt | Soluble | 1 bag | $35.00 |
| Fipronil 0.0143G | Fipronil 0.0143G | Qualipro | 12 bags | $576.00 |
| KMag | *(no match)* | Granular | 12 bags | $420.00 |
| MycoReplenish | MycoReplenish | Granular | 30 bags | $1222.50 |
| Potassium Nitrate 13.5-0-46 | Potassium Nitrate 13.5-0-46 | Soluble | 12 bags | $723.60 |
| VerdeCal Gypsum | *(no match)* | Granular | 30 bags | $894.00 |
| VerdeCal Lime | VerdeCal Lime | Granular | 40 bags | $1144.00 |
| Vereens 13-2-13 | *(no match)* | Granular | 30 bags | $1170.00 |

## Packs — need **pounds per pack**

| Product | Vendor | Purchase | Total |
|---------|--------|----------|-------|
| Triden Microbes | Soluble | 10 packs | $375.00 |

## Bottles / bundles — need a **standalone price** (and bottle size)

These have no standalone per-unit price in the source document (bundled
into a vendor "solution", or priced by bottle without a stated size).

| Product | Vendor | Note |
|---------|--------|------|
| Appear | Syngenta | Bundled in the Greens Foundation Solution |
| Appear II | Syngenta | 8 bottles / 16 gal — no per-unit $ stated |
| Ascernity | Syngenta | 3 gal listed, no standalone $ |
| Daconil Action | Syngenta | Bundled in the Greens Foundation Solution |
| Secure Action | Syngenta | Bundled (1 gal listed without standalone $) |
| Fosetyl Al | Qualipro | 27 bottles / $2868.75 — confirm bottle size |
| Segway | PBI Gordon | 8 bottles / $3600 — confirm bottle size |

## Alias / name cleanup needed

| Product | Note |
|---------|------|
| Prothioconazole | Price is already clean ($1320/gal). The inventory row is named "Prothioconazole (generic Densicor)" — reconcile the name, then it can be costed directly (no package size needed). |

Other no-match cases above (BioRhythym vs "BioRhythm", Harmony vs "Root
Harmony", KMag, VerdeCal Gypsum, Vereens 13-2-13, Kickdrum vs KickDrum)
also need a name reconciliation before linking — see the
[product audit](crosswinds-greens-program-2026-product-audit.md).

## Already costed (reference — no input needed)

These 13 products were costed in Phase 7U.3 and need nothing here:
Chlorothalonil 720, Contrado, Crescendo, Dual Shield, Manzate Max,
Nemamectin, Pedigree, Pendant SC, Rain Pigment, Redox K+,
Tebuconazole 3.6F, TM 4.5, Zelto.

## Instructions for Bryan

1. **Fill in gallons per case** for each liquid above (from the case
   label or the vendor invoice).
2. **Fill in pounds per bag** for each granular / soluble above.
3. **Confirm pounds per pack** for Triden Microbes.
4. **Get a standalone price + bottle size** for the bundled / by-bottle
   products (Appear, Appear II, Ascernity, Daconil Action, Secure Action,
   Fosetyl Al, Segway).
5. **Reconcile name mismatches** (e.g. BioRhythym/BioRhythm,
   Harmony/Root Harmony, Kickdrum/KickDrum) so the program name and the
   inventory row line up.
6. **Do NOT merge Ampliphy 18 and Veriphy 18** — they are separate
   products; price each independently.

Once a package size is known, the per-unit cost follows directly from the
formulas above. Apply it through the existing Inventory → Products cost
field (the same Phase 7J.1 path used for the 13 already-costed products).
