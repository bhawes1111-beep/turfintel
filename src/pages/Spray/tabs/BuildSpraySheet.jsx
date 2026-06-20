// Phase 5.9 — New Spray Application builder.
//
// Replaces the previous "Build Spray Sheet" aggregator. This is now a
// tank-mix planner that drafts a brand-new spray application from
// scratch, calculates totals live, and commits the result as a
// permanent spray_record with cascading inventory deductions, calendar
// event, and REI alert.
//
// Filename kept as BuildSpraySheet.jsx per route-stability rule —
// only user-facing labels say "New Application".
//
// Persistence contracts preserved:
//   - createSpray writes spray_records + nested spray_products / spray_areas
//   - recordInventoryUsage decrements inventory_items atomically and logs
//     an inventory_usage row keyed by spray_record.id
//   - createCalendarEvent creates the operational calendar entry,
//     deduped by (sourceId + event_type + start_date)
//   - createAlert fires the REI advisory when applicable
//   - courseId is injected by each store from the active scope
//   - Soft-delete + inventory restoration happens server-side
//     (worker/api/sprays.js → deleteSpray) — not exercised from this
//     screen but the contract is intact for the SprayRecords UI.

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSpray, useSpraysData } from '../../../utils/sprays/spraysStore'
import { useInventoryData, recordInventoryUsage } from '../../../utils/inventory/inventoryStore'
import { useImportedLabels } from '../../../utils/inventory/labelImportStore'
import { useProductCatalog } from '../../../utils/productCatalog/productCatalogStore'
import { resolveSprayProductIntel } from '../../../utils/productCatalog/resolveSprayProductIntel'
import { buildSprayIntelligence } from '../../../utils/productCatalog/sprayIntelligence'
import { buildSprayRotationAwareness } from '../../../utils/productCatalog/sprayRotationAwareness'
import { buildSprayIntervalAwareness } from '../../../utils/productCatalog/sprayIntervalAwareness'
import { useCrewData } from '../../../utils/crew/crewStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import { createAlert } from '../../../utils/alerts/alertsStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { useSelectedCourse } from '../../../utils/courses/courseStore'
import { analyzeSprayDraft, areaSurfaceTypeOf } from '../../../utils/chemistry'
import ChemicalIntelligencePanel from '../../../components/chemistry/ChemicalIntelligencePanel'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
// Phase S.5b.2 — Save current draft as a reusable Spray Program.
import SaveAsProgramModal from './SaveAsProgramModal'
// Phase S.5b.3 — Load a saved Spray Program into the builder draft.
import LoadProgramModal from './LoadProgramModal'
import styles from '../Spray.module.css'

const TODAY    = new Date().toISOString().slice(0, 10)
const DRAFT_KEY = 'turfintel:spray-draft-v1'

// ── Course geometry ──────────────────────────────────────────────────────
// The live `areaOpts` is derived inside the component from the selected
// course's Course Configuration (built-in acreage fields +
// customCourseAreas). FALLBACK_AREA_OPTS is used only when the active
// course has no acreage configured yet — so a fresh install still gets
// a usable picker.
const FALLBACK_AREA_OPTS = [
  { label: 'Greens',        acres: 1.2  },
  { label: 'Tees',          acres: 2.4  },
  { label: 'Fairways',      acres: 28.0 },
  { label: 'All Roughs',    acres: 18.0 },
  { label: 'Greens + Tees', acres: 3.6  },
  { label: 'Practice Area', acres: 1.5  },
]

const CUSTOM_AREA_OPT = { label: 'Custom', acres: 0 }

// Order matches the Course Configuration UI. acresTotal is intentionally
// excluded — it's a reference metric, not a sprayable surface category.
const BUILTIN_AREA_FIELDS = [
  { key: 'acresGreens',    label: 'Greens' },
  { key: 'acresTees',      label: 'Tees' },
  { key: 'acresFairways',  label: 'Fairways' },
  { key: 'acresRough',     label: 'Rough' },
  { key: 'acresSprayable', label: 'Sprayable' },
  { key: 'acresPractice',  label: 'Practice Area' },
]

const SPRAY_RIGS = [
  { name: 'Spray Rig #1', capacity: 200 },
  { name: 'Spray Rig #2', capacity: 200 },
  { name: 'Backpack',     capacity: 4   },
]

const UNIT_OPTS = ['oz', 'fl oz', 'lb', 'gal', 'qt', 'pt']

// 1 acre = 43.56 (× 1,000 sq ft).
const SQFT_PER_ACRE_K = 43.56

// 1 US gallon = 128 fluid ounces. Used for oz ↔ gal conversions when
// deducting inventory from a rate expressed in the opposite measure.
const OZ_PER_GAL = 128

// Rate units supported on each product row. The measure (oz vs gal)
// dictates the resulting quantity's natural unit. The denominator
// (acre vs 1000 sq ft) dictates the formula.
const RATE_UNIT_OPTS = [
  { value: 'oz_per_acre',          label: 'oz / acre',          measure: 'oz',  perK: false },
  { value: 'oz_per_1000sqft',      label: 'oz / 1,000 sq ft',   measure: 'oz',  perK: true  },
  { value: 'gallons_per_acre',     label: 'gal / acre',         measure: 'gal', perK: false },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft',  measure: 'gal', perK: true  },
]

function rateUnitSpec(rateUnit) {
  return RATE_UNIT_OPTS.find(o => o.value === rateUnit) ?? RATE_UNIT_OPTS[0]
}

// Rate value × acres, scaled by 1,000-sq-ft if the rate denominator is
// per-thousand-sq-ft. Returns the quantity in the rate's natural measure
// (oz or gal — see rateUnitSpec.measure).
function computeQty(rate, acres, rateUnit) {
  const spec = rateUnitSpec(rateUnit)
  const r = Number(rate)  || 0
  const a = Number(acres) || 0
  return spec.perK ? r * a * SQFT_PER_ACRE_K : r * a
}

// Convert a quantity in the rate's natural measure into the inventory
// item's stored unit, when the conversion is unambiguous. Returns:
//   { qty, ok: true }  — same measure (no conversion needed)
//   { qty, ok: true, converted: true } — fluid oz ↔ gal conversion applied
//   { qty, ok: false, rateMeasure, invUnit } — cross-form mismatch
//     (e.g. rate gallons, inventory lbs) — caller should warn + skip.
function convertToInventoryUnit(qty, rateMeasure, invUnit) {
  if (!invUnit) return { qty, ok: true }       // no metadata — pass through
  const inv = String(invUnit).trim().toLowerCase()
  const rm  = String(rateMeasure).trim().toLowerCase()
  // Direct same-measure match (oz↔oz, gal↔gal, fl oz↔fl oz)
  if (inv === rm)                           return { qty, ok: true }
  if (rm === 'oz'  && inv === 'fl oz')      return { qty, ok: true }
  if (rm === 'gal' && inv === 'gallons')    return { qty, ok: true }
  // Fluid oz ↔ gallons
  if (rm === 'oz'  && (inv === 'gal' || inv === 'gallons')) {
    return { qty: qty / OZ_PER_GAL, ok: true, converted: true }
  }
  if (rm === 'gal' && (inv === 'oz' || inv === 'fl oz')) {
    return { qty: qty * OZ_PER_GAL, ok: true, converted: true }
  }
  // Cross-form (lbs / qt / pt / etc.) — refuse.
  return { qty, ok: false, rateMeasure: rm, invUnit: inv }
}

function formatRateLabel(rate, rateUnit) {
  const spec = rateUnitSpec(rateUnit)
  return `${rate} ${spec.label}`
}

// ── Carrier + load planning helpers (Phase 3) ───────────────────────────
//
// Total carrier water (gallons) for the application:
//   gallons_per_acre        → rate × acres
//   gallons_per_1000sqft    → rate × acres × 43.56
//
// These are pure proportional math; product splits are scaled by water
// share and never trigger unit conversion. Unit-mismatch protection on
// deduction (Phase 2) still applies at commit time.

const CARRIER_UNIT_OPTS = [
  { value: 'gallons_per_acre',     label: 'gal / acre',        perK: false },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft', perK: true  },
]

function carrierUnitSpec(unit) {
  return CARRIER_UNIT_OPTS.find(o => o.value === unit) ?? CARRIER_UNIT_OPTS[0]
}

function computeCarrierGal(rate, unit, acres) {
  const spec = carrierUnitSpec(unit)
  const r = Number(rate)  || 0
  const a = Number(acres) || 0
  return spec.perK ? r * a * SQFT_PER_ACRE_K : r * a
}

/**
 * Plan loads against a given total water and tank capacity.
 * Returns null when inputs are unusable (so the UI can prompt instead).
 *
 *   loadsRequired   exact decimal (1232/160 = 7.7)
 *   fullLoads       integer count of full-tank loads
 *   partialGal      water in the final partial tank (0 if loads divide evenly)
 *   hasPartial      whether a partial load is needed
 *   totalLoads      fullLoads + (hasPartial ? 1 : 0)
 *   perLoadFullGal  water per full load (= tankCapacity)
 */
function planLoadOut(totalWaterGal, tankCapacityGal) {
  if (!Number.isFinite(totalWaterGal) || totalWaterGal <= 0) return null
  if (!Number.isFinite(tankCapacityGal) || tankCapacityGal <= 0) return null
  const loadsRequired = totalWaterGal / tankCapacityGal
  const fullLoads     = Math.floor(loadsRequired + 1e-9)  // tolerate float dust
  const partialGal    = Math.max(0, totalWaterGal - fullLoads * tankCapacityGal)
  const hasPartial    = partialGal > 0.01
  return {
    loadsRequired,
    fullLoads,
    partialGal:    hasPartial ? partialGal : 0,
    hasPartial,
    totalLoads:    fullLoads + (hasPartial ? 1 : 0),
    perLoadFullGal: tankCapacityGal,
  }
}

/**
 * Compact, human-readable carrier summary written to spray_records.carrier_volume.
 * No schema change needed; the column has always been TEXT.
 */
function formatCarrierSummary(draft, summary) {
  const rate = parseFloat(draft.carrierRate) || 0
  if (rate <= 0) {
    return summary.totalCarrierGal > 0
      ? `${Math.round(summary.totalCarrierGal)} gal total`
      : null
  }
  const unitLabel = carrierUnitSpec(draft.carrierUnit).label
  const head      = `${rate} ${unitLabel} · ${Math.round(summary.totalCarrierGal)} gal total`
  const plan      = summary.loadPlan
  if (!plan) return head
  const planStr = plan.hasPartial
    ? `${plan.fullLoads} full + 1 partial (${Math.round(plan.partialGal)} gal)`
    : `${plan.fullLoads} full`
  return `${head} · ${planStr}`
}

/** Scale a product quantity by this load's share of total water. */
function splitPerLoad(productQty, totalWaterGal, perLoadWaterGal) {
  if (!Number.isFinite(productQty) || productQty <= 0) return 0
  if (!Number.isFinite(totalWaterGal) || totalWaterGal <= 0) return 0
  if (!Number.isFinite(perLoadWaterGal) || perLoadWaterGal <= 0) return 0
  return productQty * (perLoadWaterGal / totalWaterGal)
}

// ── Draft seed (used when localStorage is empty) ────────────────────────
function makeEmptyDraft() {
  return {
    date:           TODAY,
    startTime:      '',
    // Phase S.5b.1 — Optional end time. Worker already supports
    // end_time in MUTABLE_RECORD_COLS + createSpray payload (Phase
    // S.3 baseline); the builder just wasn't capturing it.
    endTime:        '',
    operator:       '',
    // Phase S.3 — Optional applicator pesticide license #. Prefilled
    // from the selected crew employee's profile when available; the
    // supervisor can override or leave blank.
    applicatorLicense: '',
    area:           '',
    acres:          0,
    target:         '',
    waterVolume:    '',          // fallback manual gallons if no carrierRate set
    carrierRate:    '',          // numeric rate, e.g. "44"
    carrierUnit:    'gallons_per_acre',
    tankCapacity:   '',          // override gallons; falls back to sprayRig preset
    sprayRig:       'Spray Rig #1',
    // Phase S.3 — windSpeedMph + windDirection are optional structured
    // fields living alongside the free-text `wind`. Either surface is
    // valid; the read mapper exposes both so reports can pick whichever
    // is populated. Existing records continue to show whatever was
    // typed into the legacy `wind` field.
    // Phase S.5b.1 — soilTemp added. Worker already supports soil_temp
    // (Phase S.3 baseline); EditSprayRecordModal already exposes it.
    conditions: { temp: '', wind: '', windSpeedMph: '', windDirection: '', humidity: '', soilTemp: '' },
    observations:   '',
    rows:           [],
  }
}

// Phase S.3 — Wind direction options for the structured picker. "Variable"
// covers shifting wind during the application; "Calm" covers near-zero
// wind days. Compliance/regulatory record formats typically expect one
// of these or a free-text equivalent — the legacy `wind` field still
// accepts arbitrary text for back-compat.
const WIND_DIRECTION_OPTS = ['', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'Variable', 'Calm']

// ── Helpers ──────────────────────────────────────────────────────────────

function uid(prefix = 'r') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// Parse "N-P-K" or "16-4-8" out of an inventory analysis field. Returns
// null if no obvious triple is present — we never invent nutrient
// percentages.
function parseAnalysisNPK(analysis) {
  if (!analysis) return null
  const m = analysis.match(/(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)[-\s]+(\d+(?:\.\d+)?)/)
  if (!m) return null
  return {
    n: parseFloat(m[1]),
    p: parseFloat(m[2]),
    k: parseFloat(m[3]),
  }
}

function fmt(num, digits = 1) {
  if (num == null || Number.isNaN(num)) return '—'
  return Number(num).toFixed(digits).replace(/\.0+$/, '')
}

function fmtCurrency(num) {
  if (num == null || Number.isNaN(num)) return '—'
  return `$${num.toFixed(2)}`
}

// Inventory-aware low-stock semantics (mirrors InventoryProducts).
function stockStatus(qty, reorderLevel) {
  if (qty <= 0)                                return 'out'
  if (reorderLevel == null)                    return 'good'
  if (qty <= reorderLevel * 0.5)               return 'critical'
  if (qty <= reorderLevel)                     return 'low'
  return 'good'
}

// ── Main component ──────────────────────────────────────────────────────

export default function BuildSpraySheet() {
  const { items: inventoryProducts }    = useInventoryData()
  const { employees: crewEmployees }    = useCrewData()
  const { labels: importedLabels }      = useImportedLabels()
  // Phase 7C.1 (6/6) — catalog-first intelligence. Lazy-loaded on first
  // subscription via the store; no extra fetch when the builder loads.
  const { products: catalogProducts }   = useProductCatalog()
  const { records: sprayHistory }       = useSpraysData()
  const selectedCourse                  = useSelectedCourse()
  const toast                           = useToast()
  const navigate                        = useNavigate()

  // ── Chemistry intelligence inputs (Phase 22B) ────────────────────────
  // Build a stable lookup from inventory-item-id → label row so the
  // history analyzer can resolve FRAC/HRAC/IRAC codes per past
  // application without re-scanning the labels array each call.
  const labelsByItemId = useMemo(() => {
    const out = {}
    for (const lbl of importedLabels ?? []) {
      if (lbl?.inventoryItemId) out[lbl.inventoryItemId] = lbl
    }
    return out
  }, [importedLabels])

  // ── Spray area options (Phase 1b) ──────────────────────────────────────
  // Built-in acreage fields + customCourseAreas from Course Configuration.
  // Falls back to legacy hardcoded list when the active course has no
  // acreage configured yet, so a fresh install still works.
  const areaOpts = useMemo(() => {
    const builtIn = BUILTIN_AREA_FIELDS
      .map(({ key, label }) => {
        const v = selectedCourse?.[key]
        return Number.isFinite(v) && v > 0 ? { label, acres: v } : null
      })
      .filter(Boolean)

    const custom = Array.isArray(selectedCourse?.customCourseAreas)
      ? selectedCourse.customCourseAreas
          .map(a => (a?.name && Number.isFinite(a.acres) && a.acres > 0
            ? { label: a.name, acres: a.acres }
            : null))
          .filter(Boolean)
      : []

    const derived = [...builtIn, ...custom]
    const base    = derived.length > 0 ? derived : FALLBACK_AREA_OPTS
    return [...base, CUSTOM_AREA_OPT]
  }, [selectedCourse])

  // ── Draft state (with localStorage autosave restore) ───────────────────
  // Legacy drafts predate the rateUnit field — every row had an implicit
  // oz_per_1000sqft rate. Backfill on read so quantity math doesn't shift
  // for in-flight drafts.
  const [draft, setDraft] = useState(() => {
    if (typeof localStorage === 'undefined') return makeEmptyDraft()
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return makeEmptyDraft()
      const parsed = JSON.parse(raw)
      const migrated = {
        ...makeEmptyDraft(),
        ...parsed,
        rows: Array.isArray(parsed.rows)
          ? parsed.rows.map(r => ({ rateUnit: r.rateUnit ?? 'oz_per_1000sqft', ...r }))
          : [],
      }
      return migrated
    } catch {
      return makeEmptyDraft()
    }
  })

  // Debounced autosave. Saves the draft 600ms after the last edit.
  //
  // Phase S.5b.1 — Track the last successful localStorage write so
  // the builder can show a subtle "Draft saved locally at HH:MM AM"
  // indicator. Synchronous localStorage write means we never have an
  // "in-flight" state — either the write happened (set timestamp) or
  // it threw (leave the previous timestamp in place so the
  // supervisor at least sees the prior known-good time).
  const saveTimer = useRef(null)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        setDraftSavedAt(new Date())
      } catch { /* ignore — keep previous timestamp */ }
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [draft])

  const [committing, setCommitting] = useState(false)
  // Phase S.5b.2 — Save-as-Program modal toggle. Independent of
  // commit/discard so the supervisor can review a draft, save it as
  // a reusable program, and still go on to commit/print/discard.
  const [saveAsProgramOpen, setSaveAsProgramOpen] = useState(false)
  // Phase S.5b.3 — Load-Program modal toggle. Same lifecycle pattern.
  const [loadProgramOpen, setLoadProgramOpen] = useState(false)

  // Phase S.5b.3 — Apply a loaded program to the builder draft.
  // The modal builds the rows + suggestions; this handler is the
  // single place that touches setDraft, so the builder owns its own
  // state lifecycle and the modal stays decoupled from the draft shape.
  //
  // Side-effects MUST be limited to setDraft. No createSpray, no
  // inventory deduction, no alerts, no calendar events, no program
  // mutation — those happen only on Commit Application.
  function handleLoadProgramIntoDraft({
    mode,
    rows,
    suggestedArea,
    suggestedDate,
    suggestedCarrierRate,
    suggestedCarrierUnit,
  }) {
    setDraft(prev => {
      const nextRows = mode === 'append'
        ? [...prev.rows, ...rows]
        : rows
      const next = { ...prev, rows: nextRows }
      // Fill suggestion slots only when the current builder field is
      // blank — never clobber what the supervisor already typed.
      if (suggestedArea && !prev.area) {
        next.area = suggestedArea
      }
      if (suggestedDate && !prev.date) {
        next.date = suggestedDate
      }
      if (suggestedCarrierRate && !prev.carrierRate) {
        next.carrierRate = suggestedCarrierRate
        if (suggestedCarrierUnit) next.carrierUnit = suggestedCarrierUnit
      }
      return next
    })
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const productPickerOptions = useMemo(() => {
    return inventoryProducts
      .filter(p => p.kind === 'product' || p.kind === 'chemical' || p.kind === 'fertilizer')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [inventoryProducts])

  const operatorOptions = useMemo(() => {
    return (crewEmployees ?? [])
      .filter(e => e.status !== 'inactive')
      .map(e => ({
        id:                e.id ?? e.employeeId,
        name:              e.fullName ?? e.name,
        // Phase S.3 — Carried through to the form so a license auto-
        // fills when the supervisor picks an operator. The crew API
        // already gates pesticideLicense behind canViewEmployeePrivate
        // (Phase 9C.5a.5), so a non-privileged client just sees
        // undefined here and the form stays blank.
        pesticideLicense:  e.pesticideLicense ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [crewEmployees])

  // Phase S.3 — Auto-fill applicator license when operator changes
  // AND the current license is blank. We never overwrite a hand-typed
  // license: that respects "manual edits win" symmetry with the rest
  // of the spray module.
  function handleOperatorChange(name) {
    setDraft(prev => {
      const match = operatorOptions.find(opt => opt.name === name)
      const next = { ...prev, operator: name }
      if (!prev.applicatorLicense?.trim() && match?.pesticideLicense) {
        next.applicatorLicense = match.pesticideLicense
      }
      return next
    })
  }

  const sprayRigSpec = SPRAY_RIGS.find(r => r.name === draft.sprayRig) ?? SPRAY_RIGS[0]

  // Compute per-row totals + tank summary.
  const enrichedRows = useMemo(() => {
    return draft.rows.map(row => {
      const inv  = row.inventoryItemId
        ? inventoryProducts.find(p => p.id === row.inventoryItemId)
        : inventoryProducts.find(p => p.name === row.name)
      const rateUnit = row.rateUnit ?? 'oz_per_1000sqft'
      const spec     = rateUnitSpec(rateUnit)
      const qtyNeeded = computeQty(row.rate, draft.acres, rateUnit)
      // qtyUnit is the natural unit of the computed quantity (oz or gal),
      // distinct from row.unit which is the inventory unit. They may
      // differ — see convertToInventoryUnit in the commit pipeline.
      const qtyUnit   = spec.measure
      // Cost is computed against inventory pricing, so when the rate
      // measure differs from the inventory unit we convert first.
      const conv      = convertToInventoryUnit(qtyNeeded, qtyUnit, inv?.unit)
      const qtyInInv  = conv.ok ? conv.qty : qtyNeeded
      const available = inv?.quantity ?? null
      const cost      = inv?.costPerUnit != null
        ? +(qtyInInv * inv.costPerUnit).toFixed(2)
        : null
      const status   = inv ? stockStatus(available, inv.reorderLevel) : 'unknown'
      const insufficient = inv && available != null && conv.ok && qtyInInv > available
      // Phase 7C.1 (6/6) — read-only product intelligence. Catalog-first
      // resolver; falls back to inventory_product_labels, then legacy.
      // The result is rendered inline as compact chips so the planner
      // sees FRAC/HRAC/IRAC at-a-glance without leaving the row.
      const intel = resolveSprayProductIntel(row, {
        inventoryProducts,
        catalogProducts,
        labelsByItemId,
      })
      return {
        ...row,
        rateUnit,
        inv,
        qtyNeeded,        // quantity in rate's natural measure (oz or gal)
        qtyUnit,          // 'oz' or 'gal' — natural unit of qtyNeeded
        qtyInInv,         // quantity in inventory's unit (converted)
        unitConversion:   conv,
        available,
        cost,
        status,
        insufficient,
        intel,
      }
    })
  }, [draft.rows, draft.acres, inventoryProducts, catalogProducts, labelsByItemId])

  // ── Chemistry intelligence analysis (Phase 22B) ──────────────────────
  // tankProducts is the typed shape the analyzer expects:
  //   { id, name, label } — label is the inventory_product_labels row or
  //   null when the product hasn't been imported through the wizard.
  // We re-derive on every relevant change so the panel updates live as
  // products / area / date change.
  const tankProducts = useMemo(() => {
    return enrichedRows
      .filter(r => r.inventoryItemId)
      .map(r => ({
        id:    r.inventoryItemId,
        name:  r.name,
        label: labelsByItemId[r.inventoryItemId] ?? null,
      }))
  }, [enrichedRows, labelsByItemId])

  const labeledTankCount = useMemo(
    () => tankProducts.filter(p => p.label).length,
    [tankProducts],
  )

  // Phase 7D (1/?) — Spray Intelligence summary. Pure derivation from
  // row.intel; renders awareness chips in the tank summary. Does not
  // affect save behavior or tank math.
  const sprayIntel = useMemo(
    () => buildSprayIntelligence(enrichedRows),
    [enrichedRows],
  )

  // Phase 7D (2/?) — Rotation Awareness. Pure helper; we inject a
  // resolver closure so the helper itself stays free of store/network
  // imports. The closure reuses the same catalog-first 3-tier resolver
  // already in place for today's tank rows.
  const rotationAwareness = useMemo(
    () => buildSprayRotationAwareness(enrichedRows, sprayHistory ?? [], {
      lookbackDays: 30,
      maxHistoryItems: 10,
      resolveProductIntel: (productLike) =>
        resolveSprayProductIntel(productLike, {
          inventoryProducts,
          catalogProducts,
          labelsByItemId,
        }),
    }),
    [enrichedRows, sprayHistory, inventoryProducts, catalogProducts, labelsByItemId],
  )

  // Phase 7D (3/?) — Application Interval Awareness. Same injected
  // resolver pattern as Rotation Awareness so the helper itself stays
  // free of store/network coupling. Wider lookback than rotation
  // (45 vs 30 days) because interval awareness specifically cares about
  // "when was the last time" rather than "what's still active".
  const intervalAwareness = useMemo(
    () => buildSprayIntervalAwareness(enrichedRows, sprayHistory ?? [], {
      lookbackDays: 45,
      maxMatches: 8,
      resolveProductIntel: (productLike) =>
        resolveSprayProductIntel(productLike, {
          inventoryProducts,
          catalogProducts,
          labelsByItemId,
        }),
    }),
    [enrichedRows, sprayHistory, inventoryProducts, catalogProducts, labelsByItemId],
  )

  const chemAnalysis = useMemo(() => {
    if (tankProducts.length === 0) return null
    // Phase 22C — pass areaType so warnings can carry surface-type
    // context; areaMatchMode stays 'exact' to preserve Phase 22B math.
    return analyzeSprayDraft({
      tankProducts,
      sprayHistory:    sprayHistory ?? [],
      labelsByItemId,
      draftArea:       draft.area,
      referenceDate:   draft.date,
      lookbackDays:    21,
      areaMatchMode:   'exact',
      areaType:        areaSurfaceTypeOf(draft.area),
    })
  }, [tankProducts, sprayHistory, labelsByItemId, draft.area, draft.date])

  const summary = useMemo(() => {
    const productCount = enrichedRows.length
    const totalCost    = enrichedRows.reduce(
      (s, r) => s + (r.cost ?? 0),
      0,
    )

    // Carrier / load planning (Phase 3) — carrier rate × acres takes
    // precedence; fall back to the legacy manual waterVolume field when
    // no rate is set so existing drafts keep working.
    const derivedCarrierGal = computeCarrierGal(draft.carrierRate, draft.carrierUnit, draft.acres)
    const manualWaterGal    = parseFloat(draft.waterVolume) || 0
    const totalCarrierGal   = derivedCarrierGal > 0 ? derivedCarrierGal : manualWaterGal
    const manualTankCap     = parseFloat(draft.tankCapacity) || 0
    const effectiveTankCap  = manualTankCap > 0 ? manualTankCap : sprayRigSpec.capacity
    const loadPlan          = planLoadOut(totalCarrierGal, effectiveTankCap)

    const water = totalCarrierGal
    const tankFillPct = effectiveTankCap > 0
      ? Math.min(100, Math.round((Math.min(water, effectiveTankCap) / effectiveTankCap) * 100))
      : 0

    // Per-measure buckets — keeps oz and gal totals visually separated
    // in the tank summary instead of summing apples + oranges.
    let totalOz = 0, totalGal = 0
    for (const r of enrichedRows) {
      if (r.qtyUnit === 'oz')  totalOz  += r.qtyNeeded || 0
      if (r.qtyUnit === 'gal') totalGal += r.qtyNeeded || 0
    }

    // Nutrient totals — only computed when at least one row's inventory
    // item carries a parseable analysis string. Totals are expressed in
    // the rate's natural measure (mixed oz + gal contributions are
    // accumulated together — superintendents read this as a guidance
    // pound-equivalent, not a single bottling unit).
    let nutrientSource = 0
    let totalN = 0, totalP = 0, totalK = 0
    const nSources = new Set()
    for (const r of enrichedRows) {
      const npk = parseAnalysisNPK(r.inv?.analysis)
      if (!npk) continue
      nutrientSource += 1
      const qty = r.qtyNeeded || 0
      totalN += (npk.n / 100) * qty
      totalP += (npk.p / 100) * qty
      totalK += (npk.k / 100) * qty
      if (r.inv?.nitrogenSource) nSources.add(r.inv.nitrogenSource)
    }

    const reiRows = enrichedRows
      .map(r => r.rei || 0)
      .filter(n => n > 0)
    const maxRei = reiRows.length > 0 ? Math.max(...reiRows) : 0

    const unitMismatches = enrichedRows
      .filter(r => r.inv && r.unitConversion && !r.unitConversion.ok)
      .map(r => ({
        name:        r.name,
        rateMeasure: r.unitConversion.rateMeasure,
        invUnit:     r.unitConversion.invUnit,
      }))

    return {
      productCount,
      acres:        draft.acres || 0,
      totalCost,
      totalOz,
      totalGal,
      water,
      totalCarrierGal,
      effectiveTankCap,
      loadPlan,
      tankFillPct,
      nutrientSource,
      totalN, totalP, totalK,
      nitrogenSources: Array.from(nSources),
      maxRei,
      anyInsufficient: enrichedRows.some(r => r.insufficient),
      unitMismatches,
    }
  }, [
    enrichedRows,
    draft.waterVolume,
    draft.acres,
    draft.carrierRate,
    draft.carrierUnit,
    draft.tankCapacity,
    sprayRigSpec.capacity,
  ])

  // ── Mutations on draft ────────────────────────────────────────────────
  function patchDraft(patch) {
    setDraft(prev => ({ ...prev, ...patch }))
  }
  function patchConditions(patch) {
    setDraft(prev => ({ ...prev, conditions: { ...prev.conditions, ...patch } }))
  }
  function setRow(rowId, patch) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.id === rowId ? { ...r, ...patch } : r),
    }))
  }
  function removeRow(rowId) {
    setDraft(prev => ({ ...prev, rows: prev.rows.filter(r => r.id !== rowId) }))
  }
  function addRow() {
    const defaultRateUnit = selectedCourse?.defaultSprayUnits ?? 'oz_per_acre'
    setDraft(prev => ({
      ...prev,
      rows: [...prev.rows, {
        id:              uid('row'),
        inventoryItemId: null,
        name:            '',
        type:            '',
        rate:            '',
        rateUnit:        defaultRateUnit,
        unit:            'oz',
        rei:             0,
      }],
    }))
  }
  function pickInventoryForRow(rowId, inv) {
    setRow(rowId, {
      inventoryItemId: inv.id,
      name:            inv.name,
      type:            inv.category ?? '',
      unit:            inv.unit ?? 'oz',
    })
  }
  function onAreaChange(label) {
    const opt = areaOpts.find(a => a.label === label)
    patchDraft({ area: label, acres: opt?.acres ?? draft.acres })
  }
  function clearDraft() {
    if (!confirm('Discard the current spray application draft?')) return
    setDraft(makeEmptyDraft())
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    // Phase S.5b.1 — Reset the saved indicator; an empty draft has
    // no prior saved state worth advertising.
    setDraftSavedAt(null)
  }

  // ── Commit pipeline ──────────────────────────────────────────────────
  async function handleCommit() {
    if (!draft.operator)        { toast.info('Operator is required'); return }
    if (!draft.area)            { toast.info('Area treated is required'); return }
    if (enrichedRows.length === 0) { toast.info('Add at least one product'); return }
    if (summary.anyInsufficient && !confirm(
      'One or more products exceed available inventory. Commit anyway?',
    )) return

    setCommitting(true)
    try {
      // 1. Persist the spray record (incl. nested products + areas).
      // Phase S.3 — Send compliance + cost snapshots alongside the
      // existing fields. The worker stores whatever it receives and
      // best-effort enriches missing EPA / active ingredients from
      // product_catalog when productCatalogId is supplied.
      const recordTotalCost = enrichedRows.reduce(
        (sum, r) => sum + (typeof r.cost === 'number' ? r.cost : 0),
        0,
      )
      const payload = {
        applicationName: `${draft.area} — ${TODAY}`,
        targetPest:      draft.target,
        applicator:      draft.operator,
        // Phase S.3 — Optional pesticide license, trimmed. Empty → null
        // so the worker doesn't store the empty-string sentinel.
        applicatorLicense: draft.applicatorLicense?.trim() || null,
        course:          selectedCourse?.shortName ?? selectedCourse?.name ?? null,
        date:            draft.date,
        startTime:       draft.startTime,
        // Phase S.5b.1 — endTime added to the commit payload. Worker
        // schema already accepts end_time (S.3 baseline).
        endTime:         draft.endTime || null,
        status:          'completed',
        conditions: {
          temp:          draft.conditions.temp     ? parseFloat(draft.conditions.temp)     : null,
          wind:          draft.conditions.wind     || null,
          // Phase S.3 — Optional structured wind. Either or both
          // surfaces may be populated; the worker stores whatever
          // the supervisor supplied.
          windSpeedMph:  draft.conditions.windSpeedMph
                          ? parseFloat(draft.conditions.windSpeedMph)
                          : null,
          windDirection: draft.conditions.windDirection || null,
          humidity:      draft.conditions.humidity ? parseFloat(draft.conditions.humidity) : null,
          // Phase S.5b.1 — soilTemp added. Worker already maps
          // conditions.soilTemp → soil_temp column.
          soilTemp:      draft.conditions.soilTemp ? parseFloat(draft.conditions.soilTemp) : null,
        },
        rei:           summary.maxRei,
        // Structured carrier summary so SprayRecords can show the rate
        // and load plan at a glance. e.g. "44 gal/acre · 1232 gal total
        // · 7 full + 1 partial".
        carrierVolume: formatCarrierSummary(draft, summary),
        totalVolume:   summary.totalCarrierGal,
        // Phase S.3 — Sum of per-product totals at save time. Null when
        // no inventory cost was available (e.g. no product has a
        // costPerUnit), so reports don't show "$0" misleadingly.
        totalCostSnapshot: recordTotalCost > 0 ? +recordTotalCost.toFixed(2) : null,
        notes:         draft.observations,
        area:          draft.area,
        acreage:       draft.acres,
        products: enrichedRows.map(r => ({
          name:            r.name,
          type:            r.type,
          rate:            formatRateLabel(r.rate, r.rateUnit),
          rateUnit:        r.rateUnit,
          unit:            r.unit,
          quantityUsed:    r.qtyNeeded,
          quantityUnit:    r.qtyUnit,
          inventoryItemId: r.inventoryItemId,
          // Phase S.3 — Pass the catalog id when known so the worker
          // can enrich EPA # + active ingredients. The activeIngredient
          // summary string is also snapshotted directly when the
          // resolver already produced it (label / legacy tiers don't
          // have a catalog id to enrich from).
          productCatalogId:          r.intel?.catalogId ?? null,
          activeIngredientsSnapshot: r.intel?.activeIngredientSummary ?? null,
          // Per-product cost snapshot. Captures the inventory unit
          // basis so a future re-report can describe "$X per gal at
          // the time of application" without re-resolving inventory.
          productCostSnapshot:       r.inv?.costPerUnit ?? null,
          productCostUnitSnapshot:   r.inv?.unit        ?? null,
          totalCostSnapshot:         typeof r.cost === 'number' ? r.cost : null,
        })),
      }
      const saved = await createSpray(payload)

      // 2. Inventory deductions — convert quantity to the inventory
      // item's stored unit when possible (fluid oz ↔ gal). Cross-form
      // mismatches (e.g. rate gallons, inventory lbs) are skipped with
      // a visible warning so we never silently mis-deduct.
      const deductable = enrichedRows.filter(r => r.name && r.qtyNeeded > 0)
      const skipped = []
      const deductionResults = await Promise.allSettled(
        deductable
          .filter(r => {
            // No inventory match → still record usage with rate-natural unit.
            if (!r.inv) return true
            if (r.unitConversion?.ok) return true
            skipped.push(r)
            return false
          })
          .map(r => {
            const useInvUnit = r.inv && r.unitConversion?.ok
            return recordInventoryUsage({
              productName:   r.name,
              quantityUsed:  useInvUnit ? r.qtyInInv : r.qtyNeeded,
              unit:          useInvUnit ? r.inv.unit : r.qtyUnit,
              sourceId:      saved.id,
              date:          draft.date,
              area:          draft.area,
              applicator:    draft.operator,
            })
          }),
      )
      const deductCount = deductionResults.filter(r => r.status === 'fulfilled').length

      if (skipped.length > 0) {
        const names = skipped.map(r => r.name).join(', ')
        toast.warning(
          `Inventory deduction skipped for ${names}: rate unit (${skipped[0].qtyUnit}) cannot be safely converted to inventory unit (${skipped[0].inv?.unit}). Adjust the row or update the inventory record.`,
        )
      }

      // 3. Calendar event (dedupe handled server-side).
      createCalendarEvent({
        title:         `Spray — ${draft.area}: ${enrichedRows.map(r => r.name).join(' + ')}`,
        date:          draft.date,
        category:      'spray',
        priority:      summary.maxRei >= 12 ? 'high' : 'medium',
        status:        'completed',
        startTime:     draft.startTime,
        location:      draft.area,
        assignedStaff: draft.operator ? [draft.operator] : [],
        equipment:     [draft.sprayRig],
        tags:          enrichedRows.map(r => r.name),
        notes:         draft.observations,
        sourceModule:  'spray',
        sourceId:      saved.id,
      }).catch(() => {})

      // 4. REI alert if applicable.
      if (summary.maxRei > 0) {
        createAlert({
          title:    `REI Active — ${draft.area}`,
          message:  `${summary.maxRei}-hour re-entry interval in effect after spray application on ${draft.date}.`,
          module:   'spray',
          priority: summary.maxRei >= 12 ? 'high' : 'medium',
          course:   selectedCourse?.shortName ?? selectedCourse?.name ?? null,
          actionLabel: 'View Spray',
          sourceId:    saved.id,
        }).catch(() => {})
      }

      // 5. Reset draft.
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setDraft(makeEmptyDraft())
      // Phase S.5b.1 — Reset the saved indicator after commit.
      setDraftSavedAt(null)
      toast.success(
        `Application committed${deductCount > 0 ? ` · ${deductCount} product${deductCount !== 1 ? 's' : ''} deducted from inventory` : ''}`,
      )
    } catch (err) {
      toast.error?.(`Commit failed: ${err.message ?? err}`)
    } finally {
      setCommitting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="New Application"
        subtitle="Build a tank mix, preview operational totals, commit to permanent record."
      >
        <div className={styles.naLayout}>

          {/* ── Left: builder ── */}
          <div className={styles.naBuilder}>

            <header className={styles.naHeader}>
              <h2 className={styles.naTitle}>NEW SPRAY APPLICATION</h2>
              <div className={styles.naHeaderMeta}>
                <span className={styles.naMetaItem}>
                  <span className={styles.naMetaLabel}>Course</span>
                  <span className={styles.naMetaValue}>
                    {selectedCourse?.shortName ?? selectedCourse?.name ?? '—'}
                  </span>
                </span>
              </div>
            </header>

            {/* ── Metadata strip ── */}
            <div className={styles.naMetaGrid}>
              <Field label="Date">
                <input
                  type="date"
                  className={styles.naInput}
                  value={draft.date}
                  onChange={e => patchDraft({ date: e.target.value })}
                />
              </Field>

              <Field label="Start time">
                <input
                  type="time"
                  className={styles.naInput}
                  value={draft.startTime}
                  onChange={e => patchDraft({ startTime: e.target.value })}
                />
              </Field>

              {/* Phase S.5b.1 — End time. Worker has supported
                  end_time since the S.3 baseline; the builder simply
                  wasn't capturing it. Optional — leave blank if
                  unknown. */}
              <Field label="End time">
                <input
                  type="time"
                  className={styles.naInput}
                  value={draft.endTime}
                  onChange={e => patchDraft({ endTime: e.target.value })}
                />
              </Field>

              <Field label="Operator">
                {operatorOptions.length > 0 ? (
                  <select
                    className={styles.naInput}
                    value={draft.operator}
                    onChange={e => handleOperatorChange(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {operatorOptions.map(emp => (
                      <option key={emp.id} value={emp.name}>{emp.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className={styles.naInput}
                    value={draft.operator}
                    onChange={e => handleOperatorChange(e.target.value)}
                    placeholder="Operator name"
                  />
                )}
              </Field>

              {/* Phase S.3 — Optional pesticide license # for the
                  applicator. Auto-fills from the crew employee record
                  when the operator is picked (and the field is still
                  blank); supervisor can override or leave empty. */}
              <Field label="Applicator license #">
                <input
                  type="text"
                  className={styles.naInput}
                  value={draft.applicatorLicense}
                  onChange={e => patchDraft({ applicatorLicense: e.target.value })}
                  placeholder="Optional"
                />
              </Field>

              <Field label="Spray rig">
                <select
                  className={styles.naInput}
                  value={draft.sprayRig}
                  onChange={e => patchDraft({ sprayRig: e.target.value })}
                >
                  {SPRAY_RIGS.map(r => (
                    <option key={r.name} value={r.name}>
                      {r.name} ({r.capacity} gal)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tank capacity (gal)">
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={styles.naInput}
                  value={draft.tankCapacity}
                  onChange={e => patchDraft({ tankCapacity: e.target.value })}
                  placeholder={String(sprayRigSpec.capacity)}
                  title={`Defaults to ${sprayRigSpec.capacity} gal from ${sprayRigSpec.name}`}
                />
              </Field>

              <Field label="Carrier rate">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className={styles.naInput}
                  value={draft.carrierRate}
                  onChange={e => patchDraft({ carrierRate: e.target.value })}
                  placeholder="44"
                />
              </Field>

              <Field label="Carrier unit">
                <select
                  className={styles.naInput}
                  value={draft.carrierUnit}
                  onChange={e => patchDraft({ carrierUnit: e.target.value })}
                >
                  {CARRIER_UNIT_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Area treated">
                <select
                  className={styles.naInput}
                  value={draft.area}
                  onChange={e => onAreaChange(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {areaOpts.map(a => (
                    <option key={a.label} value={a.label}>{a.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Acres">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.acres || ''}
                  onChange={e => patchDraft({ acres: parseFloat(e.target.value) || 0 })}
                  step="0.1"
                  min="0"
                  placeholder="0.0"
                />
              </Field>

              <Field label="Target treatment" wide>
                <input
                  type="text"
                  className={styles.naInput}
                  value={draft.target}
                  onChange={e => patchDraft({ target: e.target.value })}
                  placeholder="Disease / pest / weed"
                />
              </Field>
            </div>

            {/* ── Product table ── */}
            <div className={styles.naProductWrap}>
              <div className={styles.naSectionHeader}>
                <h3 className={styles.naSectionTitle}>Tank Mix</h3>
                <button
                  type="button"
                  className={styles.naAddBtn}
                  onClick={addRow}
                >+ Add product</button>
              </div>

              <table className={styles.naProductTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Rate</th>
                    <th>Rate Unit</th>
                    <th>Inv. Unit</th>
                    <th>Qty Needed</th>
                    <th>Available</th>
                    <th>Est. Cost</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {enrichedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className={styles.naEmptyRow}>
                        No products in tank — click <strong>+ Add product</strong> to begin.
                      </td>
                    </tr>
                  )}
                  {enrichedRows.map(row => (
                    <tr key={row.id} data-insufficient={row.insufficient ? 'true' : undefined}>
                      <td className={styles.naProductCell}>
                        <select
                          className={styles.naProductSelect}
                          value={row.inventoryItemId ?? ''}
                          onChange={e => {
                            const inv = productPickerOptions.find(p => p.id === e.target.value)
                            if (inv) pickInventoryForRow(row.id, inv)
                          }}
                        >
                          <option value="">— Select product —</option>
                          {productPickerOptions.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.quantity != null ? ` (${p.quantity} ${p.unit ?? ''})` : ''}
                            </option>
                          ))}
                        </select>
                        {row.status && row.status !== 'good' && row.status !== 'unknown' && (
                          <span
                            className={styles.naStockChip}
                            data-tone={row.status === 'low' ? 'warn' : 'critical'}
                            onClick={() => row.inv && navigate('/inventory', {
                              state: { activeTab: 'Products', productId: row.inv.id },
                            })}
                            role="button"
                            tabIndex={0}
                            title="Open in Inventory"
                          >
                            {row.status === 'out' ? 'Out of stock'
                              : row.status === 'critical' ? 'Critical stock'
                              : 'Low stock'}
                          </span>
                        )}
                        <RowIntelChips intel={row.intel} />
                      </td>
                      <td className={styles.naDimCell}>{row.type || '—'}</td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className={styles.naRowInput}
                          value={row.rate}
                          onChange={e => setRow(row.id, { rate: e.target.value })}
                          placeholder="0.0"
                        />
                      </td>
                      <td>
                        <select
                          className={styles.naRowInput}
                          value={row.rateUnit}
                          onChange={e => setRow(row.id, { rateUnit: e.target.value })}
                          title="Rate denominator"
                        >
                          {RATE_UNIT_OPTS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.naRowInput}
                          value={row.unit}
                          onChange={e => setRow(row.id, { unit: e.target.value })}
                          title="Inventory unit (how this product is stocked)"
                        >
                          {UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className={styles.naNumCell}>
                        {row.qtyNeeded > 0 ? `${fmt(row.qtyNeeded, 2)} ${row.qtyUnit}` : '—'}
                      </td>
                      <td className={styles.naNumCell} data-warn={row.insufficient ? 'true' : undefined}>
                        {row.available != null ? `${fmt(row.available, 1)} ${row.inv?.unit ?? ''}` : '—'}
                        {row.inv && row.unitConversion && !row.unitConversion.ok && (
                          <span
                            className={styles.naStockChip}
                            data-tone="critical"
                            title={`Rate is in ${row.unitConversion.rateMeasure} but inventory is in ${row.unitConversion.invUnit}. Inventory deduction will be skipped on commit.`}
                          >
                            Unit mismatch
                          </span>
                        )}
                      </td>
                      <td className={styles.naNumCell}>{fmtCurrency(row.cost)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.naRemoveBtn}
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove product"
                          title="Remove product"
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {enrichedRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={7} className={styles.naFooterLabel}>Total cost</td>
                      <td className={styles.naNumCell}><strong>{fmtCurrency(summary.totalCost)}</strong></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ── Load Plan (Phase 3) ── */}
            <div className={styles.naSectionHeader}>
              <h3 className={styles.naSectionTitle}>Load Plan</h3>
              {summary.loadPlan && (
                <span className={styles.naLoadPlanHint}>
                  {summary.loadPlan.fullLoads} full
                  {summary.loadPlan.hasPartial
                    ? ` + 1 partial (${fmt(summary.loadPlan.partialGal, 0)} gal)`
                    : ''}
                </span>
              )}
            </div>
            <LoadPlanPanel
              summary={summary}
              draft={draft}
              enrichedRows={enrichedRows}
            />

            {/* ── Conditions ── */}
            <div className={styles.naSectionHeader}>
              <h3 className={styles.naSectionTitle}>Conditions at application</h3>
            </div>
            <div className={styles.naConditionsGrid}>
              <Field label="Total water (gal)">
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={styles.naInput}
                  value={summary.totalCarrierGal > 0 && parseFloat(draft.carrierRate) > 0
                    ? Math.round(summary.totalCarrierGal * 10) / 10
                    : draft.waterVolume}
                  onChange={e => patchDraft({ waterVolume: e.target.value })}
                  readOnly={parseFloat(draft.carrierRate) > 0}
                  placeholder="auto from carrier rate"
                  title={parseFloat(draft.carrierRate) > 0
                    ? 'Derived from carrier rate × acres. Clear carrier rate to enter manually.'
                    : 'Manual entry. Set a carrier rate above to derive automatically.'}
                />
              </Field>
              <Field label="Temperature (°F)">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.conditions.temp}
                  onChange={e => patchConditions({ temp: e.target.value })}
                  placeholder="72"
                />
              </Field>
              {/* Phase S.3 — Structured wind speed + direction are the
                  primary compliance fields. The free-text "Wind /
                  conditions notes" further below is secondary and
                  exists for legacy back-compat + nuance ("gusty",
                  "shifting", "calm after 8am"). Most supervisors will
                  fill the structured pair; the notes field is
                  optional. */}
              <Field label="Wind speed (mph)">
                <input
                  type="number"
                  step="0.1"
                  className={styles.naInput}
                  value={draft.conditions.windSpeedMph}
                  onChange={e => patchConditions({ windSpeedMph: e.target.value })}
                  placeholder="5"
                />
              </Field>
              <Field label="Wind direction">
                <select
                  className={styles.naInput}
                  value={draft.conditions.windDirection}
                  onChange={e => patchConditions({ windDirection: e.target.value })}
                >
                  {WIND_DIRECTION_OPTS.map(d => (
                    <option key={d || 'none'} value={d}>{d || '— Direction —'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Humidity (%)">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.conditions.humidity}
                  onChange={e => patchConditions({ humidity: e.target.value })}
                  placeholder="55"
                />
              </Field>
              {/* Phase S.5b.1 — Soil Temperature. Worker has supported
                  soil_temp since the S.3 baseline. */}
              <Field label="Soil temperature (°F)">
                <input
                  type="number"
                  step="0.1"
                  className={styles.naInput}
                  value={draft.conditions.soilTemp}
                  onChange={e => patchConditions({ soilTemp: e.target.value })}
                  placeholder="68"
                />
              </Field>
              {/* Phase S.5b.1 — Legacy free-text wind field, relabeled
                  as "Wind / conditions notes" and moved to the end of
                  the weather row so the structured pair above reads
                  as the primary compliance entry. Stays on the same
                  conditions.wind column so existing records render
                  unchanged. */}
              <Field label="Wind / conditions notes">
                <input
                  type="text"
                  className={styles.naInput}
                  value={draft.conditions.wind}
                  onChange={e => patchConditions({ wind: e.target.value })}
                  placeholder="gusty after 9am, partly cloudy"
                />
              </Field>
            </div>

            {/* ── Observations ── */}
            <div className={styles.naSectionHeader}>
              <h3 className={styles.naSectionTitle}>Observations</h3>
            </div>
            <textarea
              className={styles.naObservations}
              value={draft.observations}
              onChange={e => patchDraft({ observations: e.target.value })}
              rows={4}
              placeholder="Field notes, growth-stage observations, conditions changes, post-application notes…"
            />

            {/* ── Action row ── */}
            <div className={styles.naActionRow}>
              <button
                type="button"
                className={styles.naCommitBtn}
                disabled={committing || enrichedRows.length === 0}
                onClick={handleCommit}
              >
                {committing ? 'Committing…' : 'Commit Application'}
              </button>
              <button
                type="button"
                className={styles.naSecondaryBtn}
                onClick={clearDraft}
              >
                Discard draft
              </button>
              {/* Phase S.5b.2 — Save the current draft as a reusable
                  Spray Program (template). Does NOT commit a record,
                  deduct inventory, or fire REI alerts. */}
              <button
                type="button"
                className={styles.naSaveAsProgramBtn}
                onClick={() => setSaveAsProgramOpen(true)}
                disabled={committing || enrichedRows.length === 0}
                title="Save the current draft as a reusable Spray Program template (no inventory deduction, no spray record created)"
              >
                Save as Program
              </button>
              {/* Phase S.5b.3 — Load a saved Spray Program into the
                  current draft. Also non-destructive — no record,
                  no inventory, no alerts. Available even on an empty
                  draft (a fresh "start from program" gesture). */}
              <button
                type="button"
                className={styles.naLoadProgramBtn}
                onClick={() => setLoadProgramOpen(true)}
                disabled={committing}
                title="Load a saved Spray Program into the builder (replaces or appends product rows)"
              >
                Load Program
              </button>
              <span className={styles.naActionHint}>
                Draft autosaves locally · committing creates a permanent record + deducts inventory
              </span>
              {/* Phase S.5b.1 — Subtle draft-saved indicator. Reads
                  the localStorage write timestamp from draftSavedAt.
                  Synchronous write — no "saving…" spinner needed. */}
              <span className={styles.naDraftSavedHint} aria-live="polite">
                {draftSavedAt
                  ? `Draft saved locally at ${draftSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Unsaved changes'}
              </span>
            </div>

          </div>

          {/* ── Right: tank summary ── */}
          <aside className={styles.naTankSummary}>
            <div className={styles.naTankHeader}>
              <h3 className={styles.naTankTitle}>Tank Summary</h3>
              <span className={styles.naTankSub}>Live preview</span>
            </div>

            <SummarySection label="Operational">
              <SummaryRow label="Products"        value={summary.productCount} />
              <SummaryRow label="Acres covered"   value={summary.acres ? `${fmt(summary.acres, 1)} ac` : '—'} />
              <SummaryRow label="Water volume"    value={summary.water ? `${summary.water} gal` : '—'} />
              <SummaryRow label="Tank fill"       value={`${summary.tankFillPct}%`} tone={summary.tankFillPct > 100 ? 'critical' : undefined} />
              <SummaryRow label="Est. cost"       value={fmtCurrency(summary.totalCost)} />
              <SummaryRow
                label="REI"
                value={summary.maxRei > 0 ? `${summary.maxRei} hrs` : 'None'}
                tone={summary.maxRei >= 12 ? 'warn' : undefined}
              />
            </SummarySection>

            <SummarySection label="Product totals">
              <SummaryRow
                label="Total product (oz)"
                value={summary.totalOz > 0 ? `${fmt(summary.totalOz, 2)} oz` : '—'}
              />
              <SummaryRow
                label="Total product (gal)"
                value={summary.totalGal > 0 ? `${fmt(summary.totalGal, 3)} gal` : '—'}
              />
            </SummarySection>

            <SummarySection label="Nutrient totals (N-P-K)">
              {summary.nutrientSource > 0 ? (
                <>
                  <SummaryRow label="Nitrogen (N)"   value={`${fmt(summary.totalN, 2)} (rate-unit basis)`} />
                  <SummaryRow label="Phosphorus (P)" value={`${fmt(summary.totalP, 2)} (rate-unit basis)`} />
                  <SummaryRow label="Potassium (K)"  value={`${fmt(summary.totalK, 2)} (rate-unit basis)`} />
                  <SummaryRow
                    label="Nitrogen source"
                    value={summary.nitrogenSources.length > 0
                      ? summary.nitrogenSources.join(', ')
                      : 'Data unavailable'}
                  />
                </>
              ) : (
                <span className={styles.naUnavailable}>
                  Data unavailable — no fertilizer analysis on tank products.
                </span>
              )}
            </SummarySection>

            <SummarySection label="Chemical Intelligence">
              <ChemicalIntelligencePanel
                analysis={chemAnalysis}
                tankProductCount={tankProducts.length}
                labeledProductCount={labeledTankCount}
              />
            </SummarySection>

            <SummarySection label="Spray Intelligence">
              <SprayIntelligencePanel intel={sprayIntel} />
            </SummarySection>

            <SummarySection label="Rotation Awareness">
              <SprayRotationAwarenessPanel awareness={rotationAwareness} />
            </SummarySection>

            <SummarySection label="Interval Awareness">
              <SprayIntervalAwarenessPanel awareness={intervalAwareness} />
            </SummarySection>

            {summary.unitMismatches.length > 0 && (
              <div className={styles.naInsufficientCard} role="alert">
                <strong>Unit mismatch.</strong> {summary.unitMismatches.length === 1
                  ? `${summary.unitMismatches[0].name} rate is in ${summary.unitMismatches[0].rateMeasure} but inventory is in ${summary.unitMismatches[0].invUnit}.`
                  : `${summary.unitMismatches.length} products have rate units incompatible with inventory.`}
                {' '}Inventory will not be deducted for these rows on commit.
              </div>
            )}

            {summary.anyInsufficient && (
              <div className={styles.naInsufficientCard} role="alert">
                <strong>Insufficient inventory.</strong> One or more products
                exceed available stock for this tank mix.
              </div>
            )}
          </aside>

        </div>

        {/* Phase S.5b.2 — Save-as-Program modal. Renders only when
            the supervisor clicks Save as Program in the action row.
            Modal manages its own busy state; we just need to know
            when it's open and when it saves. */}
        {saveAsProgramOpen && (
          <SaveAsProgramModal
            draft={draft}
            enrichedRows={enrichedRows}
            onClose={() => setSaveAsProgramOpen(false)}
            onSaved={() => setSaveAsProgramOpen(false)}
          />
        )}

        {/* Phase S.5b.3 — Load-Program modal. Pure builder-draft
            populate; never creates records / deducts inventory / fires
            alerts / mutates programs. Handler decides replace-vs-append. */}
        {loadProgramOpen && (
          <LoadProgramModal
            draftHasContent={draft.rows.length > 0}
            onClose={() => setLoadProgramOpen(false)}
            onLoad={handleLoadProgramIntoDraft}
          />
        )}
      </WorkspaceSection>
    </div>
  )
}

// ── Small render helpers ────────────────────────────────────────────────

// Phase 7D (1/?) — Spray Intelligence panel. Renders the deterministic
// summary from buildSprayIntelligence as compact chips + a notices list.
// Stewardship language only: awareness, not recommendation.
function SprayIntelligencePanel({ intel }) {
  if (!intel || intel.totalProducts === 0) {
    return (
      <span className={styles.naUnavailable}>
        Read-only awareness based on linked catalog and label data. Add a
        product to begin.
      </span>
    )
  }

  const groupChip = (label, values, tone) =>
    values.length === 0 ? null : (
      <span
        key={label}
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          marginRight: 4,
          marginBottom: 4,
          ...intelChipTone(tone),
        }}
        title={`${label}: ${values.join(', ')}`}
      >
        <span style={{ opacity: 0.65, marginRight: 4, fontWeight: 400 }}>{label}</span>
        {values.join(', ')}
      </span>
    )

  const noticeLine = (n) => (
    <li
      key={`${n.type}-${n.label}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        fontSize: 12,
        lineHeight: 1.5,
        margin: '2px 0',
        color: noticeColor(n.type),
      }}
    >
      <span style={{ flex: '0 0 auto', opacity: 0.8 }}>{noticeIcon(n.type)}</span>
      <span style={{ flex: '1 1 auto' }}>
        <strong style={{ fontWeight: 600 }}>{n.label}:</strong> {n.value}
      </span>
    </li>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
        Read-only awareness based on linked catalog and label data. This
        does not replace the product label.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }}>
        {groupChip('FRAC', intel.groups.frac, 'frac')}
        {groupChip('HRAC', intel.groups.hrac, 'hrac')}
        {groupChip('IRAC', intel.groups.irac, 'irac')}
        {groupChip('PGR',  intel.groups.pgr,  'pgr')}
        {intel.maxReiHours != null && groupChip('Max REI', [`${intel.maxReiHours} hrs`], 'rei')}
        {intel.highestSignalWord && groupChip('Signal', [intel.highestSignalWord], 'signal')}
        {intel.restrictedUse && groupChip('RUP', ['present'], 'rup')}
      </div>

      {intel.notices.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {intel.notices.map(noticeLine)}
        </ul>
      )}

      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', lineHeight: 1.45 }}>
        Missing intelligence means the product is not linked or no label
        data is available. {intel.productsWithIntelCount} of {intel.totalProducts}{' '}
        product{intel.totalProducts !== 1 ? 's' : ''} have intelligence available.
      </p>
    </div>
  )
}

function intelChipTone(tone) {
  switch (tone) {
    case 'frac':   return { background: 'rgba(200,100,100,0.12)', color: '#f08c8c', border: '1px solid rgba(200,100,100,0.35)' }
    case 'hrac':   return { background: 'rgba(100,180,100,0.12)', color: '#8cd48c', border: '1px solid rgba(100,180,100,0.35)' }
    case 'irac':   return { background: 'rgba(200,160,80,0.12)',  color: '#e0c070', border: '1px solid rgba(200,160,80,0.35)' }
    case 'pgr':    return { background: 'rgba(160,100,200,0.12)', color: '#c897e3', border: '1px solid rgba(160,100,200,0.35)' }
    case 'rei':    return { background: 'rgba(80,140,200,0.12)',  color: '#9ec5ec', border: '1px solid rgba(80,140,200,0.35)' }
    case 'signal': return { background: 'rgba(220,180,60,0.12)',  color: '#e8c660', border: '1px solid rgba(220,180,60,0.35)' }
    case 'rup':    return { background: 'rgba(220,60,60,0.18)',   color: '#ff8080', border: '1px solid rgba(220,60,60,0.45)' }
    default:       return { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.12)' }
  }
}

function noticeColor(type) {
  switch (type) {
    case 'warning': return '#e0a060'
    case 'caution': return '#e8c660'
    default:        return 'rgba(255, 255, 255, 0.75)'
  }
}
function noticeIcon(type) {
  switch (type) {
    case 'warning': return '⚠'
    case 'caution': return '•'
    default:        return '·'
  }
}

// Phase 7D (2/?) — Rotation Awareness panel. Read-only comparison
// against recent spray history. Awareness only — never prescribes a
// rotation, never says safe/unsafe, never blocks save. Mobile-first
// stacked layout via inline styles, matching SprayIntelligencePanel.
function SprayRotationAwarenessPanel({ awareness }) {
  if (!awareness) return null

  const r = awareness.repeatedGroups
  const hasRepeats =
    r.frac.length + r.hrac.length + r.irac.length + r.pgr.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
        Read-only comparison against recent spray history. Repeated
        groups are shown for awareness only. This does not recommend a
        treatment.
      </p>

      {hasRepeats ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }}>
          {r.frac.length > 0 && (
            <RepeatedChip label="Repeated FRAC" values={r.frac} tone="frac" />
          )}
          {r.hrac.length > 0 && (
            <RepeatedChip label="Repeated HRAC" values={r.hrac} tone="hrac" />
          )}
          {r.irac.length > 0 && (
            <RepeatedChip label="Repeated IRAC" values={r.irac} tone="irac" />
          )}
          {r.pgr.length > 0 && (
            <RepeatedChip label="Repeated PGR"  values={r.pgr}  tone="pgr"  />
          )}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          No repeated groups detected vs the last {awareness.lookbackDays} day{awareness.lookbackDays !== 1 ? 's' : ''}.
        </p>
      )}

      {awareness.notices.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {awareness.notices.map(n => (
            <li
              key={`${n.type}-${n.label}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                fontSize: 12,
                lineHeight: 1.5,
                margin: '2px 0',
                color: noticeColor(n.type),
              }}
            >
              <span style={{ flex: '0 0 auto', opacity: 0.8 }}>{noticeIcon(n.type)}</span>
              <span style={{ flex: '1 1 auto' }}>
                <strong style={{ fontWeight: 600 }}>{n.label}:</strong> {n.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {awareness.recentExposure.length > 0 && (
        <details style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            Recent sprays ({awareness.recentExposure.length})
          </summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            {awareness.recentExposure.map(e => (
              <li key={e.id} style={{ margin: '4px 0', lineHeight: 1.4 }}>
                <span style={{ opacity: 0.7 }}>{e.date}</span>
                {e.sprayName && <span> · {e.sprayName}</span>}
                <div style={{ marginTop: 2, opacity: 0.85 }}>
                  {e.groups.frac.length > 0 && <span>FRAC {e.groups.frac.join(', ')} </span>}
                  {e.groups.hrac.length > 0 && <span>HRAC {e.groups.hrac.join(', ')} </span>}
                  {e.groups.irac.length > 0 && <span>IRAC {e.groups.irac.join(', ')} </span>}
                  {e.groups.pgr.length  > 0 && <span>PGR {e.groups.pgr.join(', ')} </span>}
                  {e.missingIntelCount > 0 && (
                    <span style={{ color: '#e0a060' }}>
                      · {e.missingIntelCount} missing intel
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function RepeatedChip({ label, values, tone }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        marginRight: 4,
        marginBottom: 4,
        ...intelChipTone(tone),
      }}
      title={`${label}: ${values.join(', ')}`}
    >
      <span style={{ opacity: 0.65, marginRight: 4, fontWeight: 400 }}>{label}</span>
      {values.join(', ')}
    </span>
  )
}

// Phase 7D (3/?) — Application Interval Awareness panel. Read-only
// comparison against recent recorded applications. Awareness only —
// never prescribes, never blocks save, never says safe/unsafe.
function SprayIntervalAwarenessPanel({ awareness }) {
  if (!awareness) return null

  const productCount = awareness.productMatches.length
  const groupCount   = awareness.groupMatches.length
  const closest = [...awareness.productMatches, ...awareness.groupMatches]
    .filter(m => typeof m.daysSince === 'number')
    .sort((a, b) => a.daysSince - b.daysSince)[0] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
        Read-only comparison against recent recorded applications.
        Recent matches are shown for awareness only. This does not
        recommend a treatment.
      </p>

      {(productCount > 0 || groupCount > 0) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }}>
          {productCount > 0 && (
            <IntervalChip
              label="Product matches"
              value={String(productCount)}
              tone="rei"
              title="Same product applied within the lookback window"
            />
          )}
          {groupCount > 0 && (
            <IntervalChip
              label="Group matches"
              value={String(groupCount)}
              tone="frac"
              title="Same FRAC/HRAC/IRAC/PGR group appeared in the lookback window"
            />
          )}
          {closest && (
            <IntervalChip
              label="Closest"
              value={closest.daysSince === 0 ? 'today' : `${closest.daysSince} day${closest.daysSince !== 1 ? 's' : ''} ago`}
              tone="signal"
            />
          )}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          No recent matches in the last {awareness.lookbackDays} day{awareness.lookbackDays !== 1 ? 's' : ''}.
        </p>
      )}

      {awareness.notices.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {awareness.notices.map(n => (
            <li
              key={`${n.type}-${n.label}-${n.value}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                fontSize: 12,
                lineHeight: 1.5,
                margin: '2px 0',
                color: noticeColor(n.type),
              }}
            >
              <span style={{ flex: '0 0 auto', opacity: 0.8 }}>{noticeIcon(n.type)}</span>
              <span style={{ flex: '1 1 auto' }}>
                <strong style={{ fontWeight: 600 }}>{n.label}:</strong> {n.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(productCount > 0 || groupCount > 0) && (
        <details style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            Match details
          </summary>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
            {awareness.productMatches.map(m => (
              <li key={`p-${m.sprayId ?? m.productName}-${m.lastAppliedDate}`} style={{ margin: '4px 0', lineHeight: 1.4 }}>
                <span style={{ opacity: 0.85 }}>{m.productName}</span>
                <span style={{ opacity: 0.6 }}> · {m.lastAppliedDate}</span>
                {m.sprayName && <span style={{ opacity: 0.6 }}> · {m.sprayName}</span>}
              </li>
            ))}
            {awareness.groupMatches.map(m => (
              <li key={`g-${m.groupType}-${m.group}-${m.lastAppliedDate}`} style={{ margin: '4px 0', lineHeight: 1.4 }}>
                <span style={{ opacity: 0.85 }}>{m.groupType} {m.group}</span>
                <span style={{ opacity: 0.6 }}> · {m.lastAppliedDate}</span>
                {m.sprayName && <span style={{ opacity: 0.6 }}> · {m.sprayName}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function IntervalChip({ label, value, tone, title }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        marginRight: 4,
        marginBottom: 4,
        ...intelChipTone(tone),
      }}
    >
      <span style={{ opacity: 0.65, marginRight: 4, fontWeight: 400 }}>{label}</span>
      {value}
    </span>
  )
}

// Phase 7C.1 (6/6) — Read-only product-intelligence chips. Rendered
// directly under the product picker for each spray row when the
// resolver returned something useful. The `source` tag is intentionally
// visible (small "via catalog" / "via label" / "via inventory" hint) so
// the planner knows where each piece of intelligence came from. No
// click handlers — the catalog tab is the source of truth for deeper
// detail. Mobile-first: chips wrap to multiple lines.
function RowIntelChips({ intel }) {
  if (!intel || intel.source === 'none') return null

  const chips = []
  if (intel.fracGroup) chips.push({ key: 'frac', label: `FRAC ${intel.fracGroup}`, bg: 'rgba(200,100,100,0.12)', bd: 'rgba(200,100,100,0.35)', fg: '#f08c8c' })
  if (intel.hracGroup) chips.push({ key: 'hrac', label: `HRAC ${intel.hracGroup}`, bg: 'rgba(100,180,100,0.12)', bd: 'rgba(100,180,100,0.35)', fg: '#8cd48c' })
  if (intel.iracGroup) chips.push({ key: 'irac', label: `IRAC ${intel.iracGroup}`, bg: 'rgba(200,160,80,0.12)',  bd: 'rgba(200,160,80,0.35)',  fg: '#e0c070' })
  if (intel.pgrClass)  chips.push({ key: 'pgr',  label: `PGR ${intel.pgrClass}`,   bg: 'rgba(160,100,200,0.12)', bd: 'rgba(160,100,200,0.35)', fg: '#c897e3' })
  if (intel.signalWord && intel.signalWord !== 'Caution') chips.push({
    key: 'sig', label: intel.signalWord, bg: 'rgba(220,60,60,0.12)', bd: 'rgba(220,60,60,0.35)', fg: '#ff9999',
  })
  if (intel.reiHours != null) chips.push({
    key: 'rei', label: `REI ${intel.reiHours}h`,
    bg: 'rgba(80,140,200,0.12)', bd: 'rgba(80,140,200,0.35)', fg: '#9ec5ec',
  })

  // No structured chips but maybe an ingredient summary — still useful.
  if (chips.length === 0 && !intel.activeIngredientSummary) return null

  const sourceLabel = intel.source === 'catalog' ? 'via catalog'
    : intel.source === 'label'   ? 'via label'
    : intel.source === 'legacy'  ? 'via inventory'
    : null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
      {chips.map(c => (
        <span
          key={c.key}
          style={{
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: 999,
            fontSize: 10,
            lineHeight: 1.5,
            background: c.bg,
            color: c.fg,
            border: `1px solid ${c.bd}`,
            whiteSpace: 'nowrap',
          }}
        >{c.label}</span>
      ))}
      {intel.activeIngredientSummary && (
        <span
          style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}
          title={intel.activeIngredientSummary}
        >
          {intel.activeIngredientSummary.length > 40
            ? `${intel.activeIngredientSummary.slice(0, 38)}…`
            : intel.activeIngredientSummary}
        </span>
      )}
      {sourceLabel && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{sourceLabel}</span>
      )}
    </div>
  )
}

function Field({ label, wide, children }) {
  return (
    <div className={`${styles.naField}${wide ? ` ${styles.naFieldWide}` : ''}`}>
      <span className={styles.naFieldLabel}>{label}</span>
      {children}
    </div>
  )
}

function SummarySection({ label, children }) {
  return (
    <div className={styles.naTankSection}>
      <div className={styles.naTankSectionLabel}>{label}</div>
      <div className={styles.naTankSectionBody}>{children}</div>
    </div>
  )
}

function SummaryRow({ label, value, tone }) {
  return (
    <div className={styles.naTankRow}>
      <span className={styles.naTankRowLabel}>{label}</span>
      <span className={styles.naTankRowValue} data-tone={tone}>{value}</span>
    </div>
  )
}

/**
 * Load Plan panel (Phase 3).
 *
 * Renders three blocks:
 *   1. Header stats — total carrier, tank capacity, loads required, full/partial.
 *   2. Per-load table — one row per full load + one row for the partial,
 *      with a column per product showing the scaled quantity in that load.
 *   3. Empty-state prompt when carrier rate or tank capacity is missing.
 *
 * Per-load product splits are pure proportional scaling on qtyNeeded, so
 * no unit conversion is involved. The Phase 2 unit-mismatch protection
 * remains in effect at commit time.
 */
function LoadPlanPanel({ summary, draft, enrichedRows }) {
  const plan = summary.loadPlan
  if (!plan) {
    return (
      <div className={styles.naLoadPlan}>
        <p className={styles.naUnavailable}>
          Set a <strong>carrier rate</strong>, <strong>acres</strong>, and
          <strong> tank capacity</strong> above to generate the load plan.
        </p>
      </div>
    )
  }

  const productRows = enrichedRows.filter(r => r.name && r.qtyNeeded > 0)

  return (
    <div className={styles.naLoadPlan}>
      <div className={styles.naLoadPlanStats}>
        <LoadStat label="Total Carrier"   value={`${fmt(summary.totalCarrierGal, 0)} gal`} />
        <LoadStat label="Tank Capacity"   value={`${fmt(summary.effectiveTankCap, 0)} gal`} />
        <LoadStat label="Loads Required"  value={fmt(plan.loadsRequired, 2)} />
        <LoadStat
          label="Operational Breakdown"
          value={`${plan.fullLoads} Full${plan.hasPartial ? ' + 1 Partial' : ''}`}
        />
      </div>

      {productRows.length === 0 ? (
        <p className={styles.naUnavailable}>
          Add products to the tank mix to see per-load splits.
        </p>
      ) : (
        <table className={styles.naLoadTable}>
          <thead>
            <tr>
              <th>Load</th>
              <th>Water</th>
              {productRows.map(r => (
                <th key={r.id}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: plan.fullLoads }).map((_, i) => (
              <tr key={`full-${i}`}>
                <td className={styles.naLoadCellLabel}>Load {i + 1}</td>
                <td className={styles.naLoadCellNum}>
                  {fmt(plan.perLoadFullGal, 0)} gal
                </td>
                {productRows.map(r => (
                  <td key={r.id} className={styles.naLoadCellNum}>
                    {fmt(splitPerLoad(r.qtyNeeded, summary.totalCarrierGal, plan.perLoadFullGal), 2)}
                    {' '}{r.qtyUnit}
                  </td>
                ))}
              </tr>
            ))}
            {plan.hasPartial && (
              <tr className={styles.naLoadPartialRow}>
                <td className={styles.naLoadCellLabel}>Final Load (Partial)</td>
                <td className={styles.naLoadCellNum}>
                  {fmt(plan.partialGal, 0)} gal
                </td>
                {productRows.map(r => (
                  <td key={r.id} className={styles.naLoadCellNum}>
                    {fmt(splitPerLoad(r.qtyNeeded, summary.totalCarrierGal, plan.partialGal), 2)}
                    {' '}{r.qtyUnit}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LoadStat({ label, value }) {
  return (
    <div className={styles.naLoadStat}>
      <span className={styles.naLoadStatLabel}>{label}</span>
      <span className={styles.naLoadStatValue}>{value}</span>
    </div>
  )
}
