// Phase S.7b.6 — Shared spray rate math.
//
// Pulled out of BuildSpraySheet so the completed-spray chemical
// editor uses the same conversion rules. Both directions (rate ↔
// total used) are computed by the same helpers, so a manual entry
// in either field stays consistent with the rest of the spray
// pipeline.
//
// All math runs on numbers; callers parse and validate user input
// before passing values in.

export const SQFT_PER_ACRE_K = 43.56 // 1 acre = 43.56 (× 1,000 sq ft)
export const OZ_PER_GAL      = 128
export const DEFAULT_RATE_UNIT = 'oz_per_1000sqft'

export const NUTRIENT_RATE_UNITS = [
  { nutrient: 'N',  label: 'N'  },
  { nutrient: 'P',  label: 'P'  },
  { nutrient: 'K',  label: 'K'  },
  { nutrient: 'Ca', label: 'Ca' },
  { nutrient: 'Mg', label: 'Mg' },
  { nutrient: 'S',  label: 'S'  },
  { nutrient: 'Fe', label: 'Fe' },
  { nutrient: 'Mn', label: 'Mn' },
  { nutrient: 'Zn', label: 'Zn' },
  { nutrient: 'Cu', label: 'Cu' },
  { nutrient: 'B',  label: 'B'  },
  { nutrient: 'Mo', label: 'Mo' },
  { nutrient: 'Cl', label: 'Cl' },
  { nutrient: 'Ni', label: 'Ni' },
]

// Rate units. `measure` is the natural total-used unit produced by
// the rate (oz vs gal vs lb). `perK` flags rates expressed per 1,000
// sq ft (so the formula scales by 43.56).
export const RATE_UNIT_OPTS = [
  { value: 'oz_per_acre',          label: 'oz / acre',           measure: 'oz',  perK: false },
  { value: 'lb_per_acre',          label: 'lb / acre',           measure: 'lb',  perK: false },
  { value: 'pt_per_acre',          label: 'pt / acre',           measure: 'pt',  perK: false },
  { value: 'qt_per_acre',          label: 'qt / acre',           measure: 'qt',  perK: false },
  { value: 'gallons_per_acre',     label: 'gal / acre',          measure: 'gal', perK: false },
  { value: 'fl_oz_per_1000sqft',   label: 'fl oz / 1,000 sq ft', measure: 'oz',  perK: true  },
  { value: 'oz_per_1000sqft',      label: 'oz / 1,000 sq ft',    measure: 'oz',  perK: true  },
  { value: 'lb_per_1000sqft',      label: 'lb / 1,000 sq ft',    measure: 'lb',  perK: true  },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft',   measure: 'gal', perK: true  },
  ...NUTRIENT_RATE_UNITS.map(({ nutrient, label }) => ({
    value: `lb_${nutrient.toLowerCase()}_nutrient_per_1000sqft`,
    label: `lb ${label} / 1,000 sq ft`,
    measure: 'lb',
    perK: true,
    nutrient,
    nutrientRate: true,
  })),
]

// Total-used units shown in the editor's "Total used unit" dropdown.
// These are stock units a product might be sold/inventoried in.
export const TOTAL_USED_UNIT_OPTS = [
  { value: 'oz',    label: 'oz'    },
  { value: 'fl oz', label: 'fl oz' },
  { value: 'lb',    label: 'lb'    },
  { value: 'pt',    label: 'pt'    },
  { value: 'qt',    label: 'qt'    },
  { value: 'gal',   label: 'gal'   },
]

export function rateUnitSpec(rateUnit) {
  return RATE_UNIT_OPTS.find(o => o.value === rateUnit)
    ?? RATE_UNIT_OPTS.find(o => o.value === DEFAULT_RATE_UNIT)
}

export function normalizeRateUnit(value) {
  if (!value) return DEFAULT_RATE_UNIT
  if (RATE_UNIT_OPTS.some(o => o.value === value)) return value
  // Tolerate legacy unsupported tokens by collapsing to the
  // current per-1,000 default — the editor will still render the
  // value, and the user can pick a proper one before saving.
  return DEFAULT_RATE_UNIT
}

function structuredNutrientValues(item) {
  let sources = item?.nutrientSources
  if (typeof sources === 'string') {
    try { sources = JSON.parse(sources) } catch { sources = [] }
  }
  if (!Array.isArray(sources)) return new Set()
  return new Set(
    sources
      .filter(source => Number(source?.percent) > 0)
      .map(source => String(source?.nutrient ?? '').trim())
      .filter(Boolean),
  )
}

// New application rows use an operational per-1,000-sq-ft default. When
// Inventory contains a nutrient analysis, prefer that nutrient's actual-pound
// rate so entering a nutrient target calculates the required product amount.
// N-P-K and minors follow the same stable order as the rate-unit menu.
export function defaultRateUnitForInventory(item, fallback = DEFAULT_RATE_UNIT) {
  const structured = structuredNutrientValues(item)
  const structuredNutrient = NUTRIENT_RATE_UNITS.find(({ nutrient }) => structured.has(nutrient))
  if (structuredNutrient) {
    return `lb_${structuredNutrient.nutrient.toLowerCase()}_nutrient_per_1000sqft`
  }

  const analysis = String(item?.analysis ?? '')
  const npk = analysis.match(/(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)/)
  if (npk) {
    const nutrient = ['N', 'P', 'K'].find((_, index) => Number(npk[index + 1]) > 0)
    if (nutrient) return `lb_${nutrient.toLowerCase()}_nutrient_per_1000sqft`
  }

  return normalizeRateUnit(fallback)
}

// Compute total used from a rate. Returns 0 when any input is
// missing/invalid (caller checks acres > 0 before relying on this).
export function rateToTotalUsed(rate, rateUnit, acres) {
  const r = Number(rate)
  const a = Number(acres)
  if (!Number.isFinite(r) || !Number.isFinite(a) || a <= 0) return 0
  const spec = rateUnitSpec(rateUnit)
  return spec.perK ? r * a * SQFT_PER_ACRE_K : r * a
}

// Compute rate from a total used + acres. Inverse of rateToTotalUsed.
// Returns 0 when any input is invalid or acres ≤ 0.
export function totalUsedToRate(totalUsed, rateUnit, acres) {
  const t = Number(totalUsed)
  const a = Number(acres)
  if (!Number.isFinite(t) || !Number.isFinite(a) || a <= 0) return 0
  const spec = rateUnitSpec(rateUnit)
  return spec.perK ? t / (a * SQFT_PER_ACRE_K) : t / a
}

// Pretty rate label used to populate spray_products.rate at write
// time. Matches BuildSpraySheet's pre-S.7b.6 format exactly so a
// record edited via the chemical editor displays the same way as a
// record created via commit.
export function formatRateLabel(rate, rateUnit) {
  if (rate == null || rate === '' || !Number.isFinite(Number(rate))) return ''
  const spec = rateUnitSpec(rateUnit)
  return `${rate} ${spec.label}`
}

// Sum acreage from a hydrated spray record's areas array. Returns 0
// when no acreage data is available — the editor surfaces a warning
// instead of guessing.
export function sumAcresFromRecord(record) {
  if (!record) return 0
  if (!Array.isArray(record.areas)) return 0
  let total = 0
  for (const a of record.areas) {
    const v = Number(a?.acreage)
    if (Number.isFinite(v) && v > 0) total += v
  }
  return total
}

// Round a number to N decimals for display. Avoids "0.30000000004"
// JS float drift when the editor's two-way binding round-trips.
export function roundDisplay(n, decimals = 2) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return ''
  const v = Number(n)
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}
