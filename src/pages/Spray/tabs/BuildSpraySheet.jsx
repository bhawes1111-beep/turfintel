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

import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSpray, useSpraysData } from '../../../utils/sprays/spraysStore'
import { useInventoryData } from '../../../utils/inventory/inventoryStore'
import { NUTRIENTS, normalizeNutrientSources } from '../../../utils/inventory/nutrientForms'
import { diseaseLabel, normalizeDiseaseTargets } from '../../../utils/inventory/diseaseTargets'
import { nematodeLabel, normalizeNematodeTargets } from '../../../utils/inventory/nematodeTargets'
import { weedLabel, normalizeWeedTargets } from '../../../utils/inventory/weedTargets'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
// Phase S.7b.3 — Shared spray product picker. BuildSpraySheet keeps
// its rich table row (stock chips, intel, unit conversion warnings)
// but delegates option building + selection mapping to the shared
// helpers so the sheet editor stays in lockstep.
import SprayProductPicker, {
  useSprayProductOptions,
  mapInventoryItemToProductRow,
} from './SprayProductPicker'
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
import { useWeather } from '../../../utils/weather/useWeather'
import { useNutrientSamplesData } from '../../../utils/turfHealth/nutrientSamplesStore'
import { fetchApplicationDateWeather } from '../../../utils/weather/api'
import { fetchWeatherHistoryRange } from '../../../utils/weather/weatherHistoryStore'
import { defaultRateUnitForInventory } from '../../../utils/sprays/rateMath'
import {
  buildNutrientReleaseSummary,
  buildNutrientTankRows,
  formatNutrientReleaseBucket,
  nutrientPercentFromAnalysis,
  parseAnalysisNPK,
} from '../../../utils/sprays/nutrientSummary'
import { analyzeSprayDraft, areaSurfaceTypeOf } from '../../../utils/chemistry'
import ChemicalIntelligencePanel from '../../../components/chemistry/ChemicalIntelligencePanel'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
// Phase S.5b.2 — Save current draft as a reusable Spray Program.
import SaveAsProgramModal from './SaveAsProgramModal'
// Phase S.5b.3 — Load a saved Spray Program into the builder draft.
import LoadProgramModal from './LoadProgramModal'
// Phase S.5a.2 — Permission-aware UI. Worker enforces canEditSprays
// for any spray mutation; this hook is the UX-only client gate that
// hides / disables actions the user can't perform.
import { useAuth } from '../../../context/AuthContext'
import styles from '../Spray.module.css'

function localTodayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const TODAY    = localTodayKey()
const DRAFT_KEY = 'turfintel:spray-draft-v1'
const SQ_FT_PER_ACRE = 43560

const APPLICATION_TYPES = [
  {
    value: 'liquid',
    label: 'Liquid Spray',
    description: 'Tank mix, carrier water, sprayer, load plan.',
  },
  {
    value: 'granular',
    label: 'Granular',
    description: 'Dry product, spreader, acreage, inventory deduction.',
  },
]

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

function areaAcresValue(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function courseAreaOption(name, acres) {
  const label = String(name ?? '').trim()
  if (!label) return null
  const areaAcres = areaAcresValue(acres)
  const displayLabel = areaAcres > 0
    ? `${label} (${formatRowNumber(areaAcres, 2)} ac / ${formatRowNumber(areaAcres * SQ_FT_PER_ACRE, 0)} sq ft)`
    : label
  return { label, acres: areaAcres, displayLabel }
}

const SPRAYER_MATCH = /\b(spray|sprayer|spray rig|backpack)\b/i
const GRANULAR_EQUIPMENT_MATCH = /\b(spreader|broadcast|drop|granular|fertilizer)\b/i

const UNIT_OPTS = ['oz', 'fl oz', 'lb', 'gal', 'qt', 'pt']
const TOTAL_USED_UNIT_OPTS = ['oz', 'fl oz', 'pt', 'qt', 'gal', 'lb']

// 1 acre = 43.56 (× 1,000 sq ft).
const SQFT_PER_ACRE_K = 43.56

// 1 US gallon = 128 fluid ounces. Used for oz ↔ gal conversions when
// deducting inventory from a rate expressed in the opposite measure.
const OZ_PER_GAL = 128

// Rate units supported on each product row. The measure (oz vs lb vs gal)
// dictates the resulting quantity's natural unit. The denominator
// (acre vs 1000 sq ft) dictates the formula.
const RATE_UNIT_OPTS = [
  { value: 'oz_per_acre',          label: 'oz / acre',          measure: 'oz',  perK: false },
  { value: 'oz_per_1000sqft',      label: 'oz / 1,000 sq ft',   measure: 'oz',  perK: true  },
  { value: 'lb_per_acre',          label: 'lb / acre',          measure: 'lb',  perK: false },
  { value: 'lb_per_1000sqft',      label: 'lb / 1,000 sq ft',   measure: 'lb',  perK: true  },
  { value: 'gallons_per_acre',     label: 'gal / acre',         measure: 'gal', perK: false },
  { value: 'gallons_per_1000sqft', label: 'gal / 1,000 sq ft',  measure: 'gal', perK: true  },
  ...NUTRIENTS.map(nutrient => ({
    value: `lb_${nutrient.value.toLowerCase()}_nutrient_per_1000sqft`,
    label: `lb ${nutrient.value} / 1,000 sq ft`,
    measure: 'lb',
    perK: true,
    nutrient: nutrient.value,
    nutrientRate: true,
  })),
]

function rateUnitSpec(rateUnit) {
  return RATE_UNIT_OPTS.find(o => o.value === rateUnit)
    ?? RATE_UNIT_OPTS.find(o => o.value === 'oz_per_1000sqft')
}

function canonicalInventoryUnit(unit) {
  const u = String(unit ?? '').trim().toLowerCase()
  if (['lb', 'lbs', 'pound', 'pounds'].includes(u)) return 'lb'
  if (['gal', 'gallon', 'gallons'].includes(u)) return 'gal'
  if (['oz', 'ounce', 'ounces'].includes(u)) return 'oz'
  if (['fl oz', 'floz', 'fluid ounce', 'fluid ounces'].includes(u)) return 'fl oz'
  return u
}

// Rate value × acres, scaled by 1,000-sq-ft if the rate denominator is
// per-thousand-sq-ft. Returns the quantity in the rate's natural measure
// (oz, lb, or gal — see rateUnitSpec.measure).
function computeQty(rate, acres, rateUnit) {
  const spec = rateUnitSpec(rateUnit)
  const r = Number(rate)  || 0
  const a = Number(acres) || 0
  return spec.perK ? r * a * SQFT_PER_ACRE_K : r * a
}

function nutrientPercentForInventory(inv, nutrient) {
  if (!inv || !nutrient) return 0
  const guaranteed = nutrientPercentFromAnalysis(parseAnalysisNPK(inv.analysis), nutrient)
  if (guaranteed > 0) return guaranteed

  const structured = normalizeNutrientSources(inv.nutrientSources)
    .filter(source => source.nutrient === nutrient)
    .reduce((sum, source) => sum + (Number(source.percent) || 0), 0)
  if (structured > 0) return structured
  return 0
}

function computeProductQtyFromRate(rate, acres, rateUnit, inv) {
  const spec = rateUnitSpec(rateUnit)
  const qty = computeQty(rate, acres, rateUnit)
  if (!spec.nutrientRate) return qty
  const percent = nutrientPercentForInventory(inv, spec.nutrient)
  return percent > 0 ? qty / (percent / 100) : 0
}

function rateDenominator(acres, rateUnit) {
  const spec = rateUnitSpec(rateUnit)
  const a = Number(acres) || 0
  if (a <= 0) return 0
  return spec.perK ? a * SQFT_PER_ACRE_K : a
}

function computeRateFromQty(qty, acres, rateUnit) {
  const denominator = rateDenominator(acres, rateUnit)
  const q = Number(qty) || 0
  return denominator > 0 ? q / denominator : 0
}

function volumeUnitToOzFactor(unit) {
  const u = canonicalInventoryUnit(unit)
  if (u === 'oz' || u === 'fl oz') return 1
  if (u === 'pt') return 16
  if (u === 'qt') return 32
  if (u === 'gal') return OZ_PER_GAL
  return null
}

function convertQuantityUnit(qty, fromUnit, toUnit) {
  const amount = Number(qty) || 0
  const from = canonicalInventoryUnit(fromUnit)
  const to = canonicalInventoryUnit(toUnit)
  if (from === to) return amount

  if (from === 'lb' && to === 'oz') return amount * 16
  if (from === 'oz' && to === 'lb') return amount / 16

  const fromOz = volumeUnitToOzFactor(from)
  const toOz = volumeUnitToOzFactor(to)
  if (fromOz != null && toOz != null) return (amount * fromOz) / toOz

  return null
}

function defaultTotalUnitForRate(rateUnit) {
  return rateUnitSpec(rateUnit).measure
}

function normalizeTotalProductUnit(unit, rateUnit) {
  const fallback = defaultTotalUnitForRate(rateUnit)
  if (!unit) return fallback
  return convertQuantityUnit(1, unit, fallback) == null ? fallback : unit
}

function totalUnitOptionsForRate(rateUnit) {
  const rateMeasure = rateUnitSpec(rateUnit).measure
  return TOTAL_USED_UNIT_OPTS.filter(unit => convertQuantityUnit(1, unit, rateMeasure) != null)
}

function inventoryForRow(row, inventoryProducts) {
  if (!row) return null
  return row.inventoryItemId
    ? inventoryProducts.find(p => p.id === row.inventoryItemId)
    : inventoryProducts.find(p => p.name === row.name)
}

function computeRateFromTotalProduct(totalProduct, totalProductUnit, acres, rateUnit, inv) {
  const spec = rateUnitSpec(rateUnit)
  if (spec.nutrientRate) {
    const productLb = convertQuantityUnit(totalProduct, totalProductUnit, 'lb')
    const percent = nutrientPercentForInventory(inv, spec.nutrient)
    if (productLb == null || percent <= 0) return 0
    return computeRateFromQty(productLb * (percent / 100), acres, rateUnit)
  }
  const rateMeasure = rateUnitSpec(rateUnit).measure
  const qtyInRateUnit = convertQuantityUnit(totalProduct, totalProductUnit, rateMeasure)
  return qtyInRateUnit == null ? 0 : computeRateFromQty(qtyInRateUnit, acres, rateUnit)
}

function nutrientRateBasisLabel(row) {
  const spec = rateUnitSpec(row?.rateUnit)
  if (!spec.nutrientRate) return null
  if (row?.nutrientPercent > 0) return `Using ${fmt(row.nutrientPercent, 2)}% ${spec.nutrient}`
  return `Add ${spec.nutrient}% nutrient source in Inventory`
}

function nutrientProductMathLabel(row, acres) {
  const spec = rateUnitSpec(row?.rateUnit)
  const rate = Number(row?.rate)
  const percent = Number(row?.nutrientPercent)
  const areaK = (Number(acres) || 0) * SQFT_PER_ACRE_K
  if (!spec.nutrientRate || rate <= 0 || percent <= 0 || areaK <= 0 || row?.qtyNeeded <= 0) return null
  const productRate = rate / (percent / 100)
  return `${fmt(rate, 4)} lb ${spec.nutrient}/1,000 ÷ ${fmt(percent, 2)}% = ${fmt(productRate, 4)} lb product/1,000 × ${fmt(areaK, 2)} = ${fmt(row.qtyNeeded, 4)} lb total`
}

function formatRowNumber(num, digits = 4) {
  if (num == null || Number.isNaN(num) || !Number.isFinite(num) || num <= 0) return ''
  return Number(num.toFixed(digits)).toString()
}

function isBlankValue(value) {
  return String(value ?? '').trim() === ''
}

function weatherNumber(value, digits = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return Number(n.toFixed(digits)).toString()
}

function optionalPositiveNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function buildWeatherConditionPatch(current) {
  if (!current || typeof current !== 'object') return {}
  return {
    temp:          weatherNumber(current.currentTemp, 0),
    windSpeedMph:  weatherNumber(current.wind, 1),
    windDirection: String(current.windDir ?? '').trim(),
    humidity:      weatherNumber(current.humidity, 0),
    soilTemp:      weatherNumber(current.soilTemp, 1),
  }
}

function weatherCurrentFromObservation(obs) {
  if (!obs || typeof obs !== 'object') return null
  const raw = obs.raw ?? {}
  return {
    currentTemp: obs.tempF ?? raw.currentTemp ?? raw.tempF ?? null,
    wind:        obs.windMph ?? raw.wind ?? raw.windMph ?? null,
    windDir:     obs.windDir ?? raw.windDir ?? null,
    humidity:    obs.humidity ?? raw.humidity ?? null,
    soilTemp:    raw.soilTemp ?? raw.soilTempF ?? raw.soiltempf ?? null,
  }
}

function localDayBoundsIso(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr ?? ''))) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { from: start.toISOString(), to: end.toISOString() }
}

function applicationWeatherTargetMs({ date, startTime, endTime }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return null
  const time = startTime || endTime || '12:00'
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function sameLocalDate(ms, dateStr) {
  if (!Number.isFinite(ms) || !dateStr) return false
  const d = new Date(ms)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso === dateStr
}

function nearestWeatherObservation(history = [], targetMs = null, dateStr = '') {
  if (!Array.isArray(history) || !Number.isFinite(targetMs)) return null
  let best = null
  let bestDiff = Infinity
  for (const obs of history) {
    const observedAt = obs?.observedAt ?? obs?.createdAt
    const ms = Date.parse(observedAt)
    if (!Number.isFinite(ms) || !sameLocalDate(ms, dateStr)) continue
    const diff = Math.abs(ms - targetMs)
    if (diff < bestDiff) {
      best = obs
      bestDiff = diff
    }
  }
  return best
}

function weatherObservedLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function weatherDisplay(value, unit = '', digits = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return `${Number(n.toFixed(digits)).toString()}${unit}`
}

// Convert a quantity in the rate's natural measure into the inventory
// item's stored unit, when the conversion is unambiguous. Returns:
//   { qty, ok: true }  — same measure (no conversion needed)
//   { qty, ok: true, converted: true } — fluid oz ↔ gal conversion applied
//   { qty, ok: false, rateMeasure, invUnit } — cross-form mismatch
//     (e.g. rate gallons, inventory lbs) — caller should warn + skip.
function convertToInventoryUnit(qty, rateMeasure, invUnit) {
  if (!invUnit) return { qty, ok: true }       // no metadata — pass through
  const inv = canonicalInventoryUnit(invUnit)
  const rm  = canonicalInventoryUnit(rateMeasure)
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
  // Dry weight ounces ↔ pounds. An ounce rate paired with pound
  // inventory is unambiguously a weight conversion.
  if (rm === 'oz' && inv === 'lb') {
    return { qty: qty / 16, ok: true, converted: true }
  }
  if (rm === 'lb' && inv === 'oz') {
    return { qty: qty * 16, ok: true, converted: true }
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

function isSprayerEquipment(unit) {
  const haystack = `${unit?.category ?? ''} ${unit?.name ?? ''} ${unit?.model ?? ''}`
  return SPRAYER_MATCH.test(haystack)
}

function isGranularEquipment(unit) {
  const haystack = `${unit?.category ?? ''} ${unit?.name ?? ''} ${unit?.model ?? ''}`
  return GRANULAR_EQUIPMENT_MATCH.test(haystack)
}

function equipmentTankCapacity(unit) {
  const n = Number(unit?.tankCapacityGal ?? unit?.tankCapacity ?? unit?.capacity)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function equipmentRigLabel(unit) {
  const capacity = equipmentTankCapacity(unit)
  return capacity > 0 ? `${unit.name} (${capacity} gal)` : unit.name
}

function applicationTypeLabel(value) {
  return APPLICATION_TYPES.find(type => type.value === value)?.label ?? APPLICATION_TYPES[0].label
}

function inferTargetTreatment(rows) {
  const labels = []
  const add = label => {
    if (!labels.includes(label)) labels.push(label)
  }
  for (const row of rows) {
    const type = String(row?.type ?? row?.inv?.category ?? '').toLowerCase()
    const diseaseTargets = normalizeDiseaseTargets(row?.inv?.diseaseTargets)
    const nematodeTargets = normalizeNematodeTargets(row?.inv?.nematodeTargets)
    const weedTargets = normalizeWeedTargets(row?.inv?.weedTargets)
    for (const target of diseaseTargets) add(diseaseLabel(target.disease))
    for (const target of nematodeTargets) add(nematodeLabel(target.nematode))
    for (const target of weedTargets) add(weedLabel(target.weed))
    if (!type) continue
    if (type.includes('fungicide') && diseaseTargets.length === 0) add('Disease')
    if (type.includes('herbicide') && weedTargets.length === 0) add('Weed')
    if ((type.includes('insecticide') || type.includes('nematicide')) && nematodeTargets.length === 0) add('Pest')
    if (type.includes('pgr') || type.includes('plant growth')) add('Growth regulation')
    if (type.includes('fertilizer') || type.includes('nutrient')) add('Fertility')
    if (type.includes('wetting') || type.includes('surfactant')) add('Water management')
  }
  return labels.join(' / ')
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
    applicationType: 'liquid',
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
    areaUnit:       'acres',
    nutrientSampleId: '',
    target:         '',
    waterVolume:    '',          // fallback manual gallons if no carrierRate set
    carrierRate:    '',          // numeric rate, e.g. "44"
    carrierUnit:    'gallons_per_acre',
    irrigationInches: '',
    irrigationMinutes: '',
    tankCapacity:   '',          // override gallons; falls back to sprayRig preset
    sprayRigId:     '',
    sprayRig:       '',
    // Phase S.3 — windSpeedMph + windDirection are optional structured
    // fields living alongside the free-text `wind`. Either surface is
    // valid; the read mapper exposes both so reports can pick whichever
    // is populated. Existing records continue to show whatever was
    // typed into the legacy `wind` field.
    // Phase S.5b.1 — soilTemp added. Worker already supports soil_temp
    // (Phase S.3 baseline); EditSprayRecordModal already exposes it.
    conditions: { temp: '', wind: '', windSpeedMph: '', windDirection: '', humidity: '', soilTemp: '' },
    observations:   '',
    skipInventoryDeduction: false,
    rows:           [],
  }
}

// Phase SPR.3a — Multi-step wizard structure. Four steps guide the
// user from context → tank → conditions → review. Draft state, commit
// pipeline, calculations, permission gates, and inventory logic are
// UNCHANGED — this is a render-layout change only.
export const SPRAY_WIZARD_STEPS = [
  { id: 'where',      label: 'Where & When',   short: 'Where' },
  { id: 'mix',        label: 'Products',       short: 'Products' },
  { id: 'conditions', label: 'Conditions',     short: 'Weather' },
  { id: 'review',     label: 'Review & Save',  short: 'Review' },
]

function wizardStepIndex(id) {
  const i = SPRAY_WIZARD_STEPS.findIndex(s => s.id === id)
  return i === -1 ? 0 : i
}

function resolveInitialWizardStep(candidate) {
  if (!candidate) return SPRAY_WIZARD_STEPS[0].id
  return SPRAY_WIZARD_STEPS.some(s => s.id === candidate)
    ? candidate
    : SPRAY_WIZARD_STEPS[0].id
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
function fmt(num, digits = 1) {
  if (num == null || Number.isNaN(num)) return '—'
  return Number(num).toFixed(digits).replace(/\.0+$/, '')
}

function fmtCurrency(num) {
  if (num == null || Number.isNaN(num)) return '—'
  return `$${num.toFixed(2)}`
}

function inventoryQtyLabel(row) {
  if (!row?.inv || !row?.unitConversion?.ok || !row?.inv?.unit) return null
  if (canonicalInventoryUnit(row.qtyUnit) === canonicalInventoryUnit(row.inv.unit)) return null
  if (!(row.qtyInInv > 0)) return null
  return `= ${fmt(row.qtyInInv, 2)} ${row.inv.unit} inventory`
}

function inventoryCostInfo(quantityInInventoryUnit, inv) {
  const costPerUnit = Number(inv?.costPerUnit)
  const costUnit = inv?.costUnit || inv?.unit || null
  if (!Number.isFinite(costPerUnit) || costPerUnit <= 0 || !inv?.unit || !costUnit) {
    return { totalCost: null, costPerUnit: inv?.costPerUnit ?? null, costUnit }
  }
  const qtyForCost = convertQuantityUnit(quantityInInventoryUnit, inv.unit, costUnit)
  if (qtyForCost == null) return { totalCost: null, costPerUnit, costUnit }
  return {
    totalCost: +(qtyForCost * costPerUnit).toFixed(2),
    costPerUnit,
    costUnit,
  }
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

// Phase S.7 — Optional embedded-mode props:
//   • initialDate (ISO YYYY-MM-DD): seeds the builder's draft date.
//     When the calendar workspace switches to a new selected date, the
//     date-seed effect updates the live draft IF it is empty (no
//     rows / no operator). If the draft has unsaved work the calendar
//     workspace confirms with the user BEFORE changing initialDate,
//     so by the time this prop changes the seed is safe.
//   • onCommit: callback invoked after a successful commit. The
//     embedded calendar uses it to refresh the spraysStore so the
//     monthly grid chips reflect the new record.
//
// When mounted as the top-level Build Spray tab (no props), behavior
// is byte-identical to pre-S.7: draft seeds from TODAY via
// makeEmptyDraft(), no refresh callback fires.
export default function BuildSpraySheet({
  initialDate,
  initialNutrientSampleId,
  initialArea,
  onInitialContextApplied,
  onCommit,
  onCreateTrainingBrief,
} = {}) {
  // Phase S.5a.2 — Permission-aware UI. Worker is the source of
  // truth (POST /api/sprays gated by canEditSprays); this client
  // gate just hides / disables actions to avoid dead-end clicks.
  const { can } = useAuth()
  const canEditSprays = can('canEditSprays')

  const { items: inventoryProducts }    = useInventoryData()
  const { employees: crewEmployees }    = useCrewData()
  const { equipment: fleetEquipment }    = useEquipmentData()
  const { labels: importedLabels }      = useImportedLabels()
  // Phase 7C.1 (6/6) — catalog-first intelligence. Lazy-loaded on first
  // subscription via the store; no extra fetch when the builder loads.
  const { products: catalogProducts }   = useProductCatalog()
  const { records: sprayHistory }       = useSpraysData()
  const { samples: nutrientSamples }    = useNutrientSamplesData()
  const selectedCourse                  = useSelectedCourse()
  const weather                         = useWeather()
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
      .map(({ key, label }) => courseAreaOption(label, selectedCourse?.[key]))
      .filter(Boolean)

    const custom = Array.isArray(selectedCourse?.customCourseAreas)
      ? selectedCourse.customCourseAreas
          .map(a => courseAreaOption(a?.name ?? a?.label ?? a?.area, a?.acres ?? a?.acreage ?? a?.areaAcres))
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

  const applicationType = draft.applicationType === 'granular' ? 'granular' : 'liquid'
  const selectedNutrientSample = useMemo(
    () => (nutrientSamples ?? []).find(sample => sample.id === draft.nutrientSampleId) ?? null,
    [nutrientSamples, draft.nutrientSampleId],
  )
  const sampleRecommendations = selectedNutrientSample?.recommendations ?? []
  const isLiquidApplication = applicationType === 'liquid'

  const sprayRigOptions = useMemo(() => {
    const equipmentFilter = isLiquidApplication ? isSprayerEquipment : isGranularEquipment
    const sprayers = (Array.isArray(fleetEquipment) ? fleetEquipment : [])
      .filter(equipmentFilter)
      .map(unit => ({
        id: unit.id,
        name: unit.name,
        capacity: equipmentTankCapacity(unit),
        category: unit.category,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (draft.sprayRig && !sprayers.some(unit => unit.id === draft.sprayRigId || unit.name === draft.sprayRig)) {
      sprayers.unshift({
        id: `legacy:${draft.sprayRig}`,
        name: draft.sprayRig,
        capacity: Number(draft.tankCapacity) || 0,
        category: 'Legacy',
      })
    }

    return sprayers
  }, [fleetEquipment, draft.sprayRig, draft.sprayRigId, draft.tankCapacity, isLiquidApplication])

  const selectedSprayRig = useMemo(() => (
    sprayRigOptions.find(unit => unit.id === draft.sprayRigId || unit.name === draft.sprayRig)
      ?? sprayRigOptions[0]
      ?? null
  ), [sprayRigOptions, draft.sprayRigId, draft.sprayRig])

  useEffect(() => {
    if (!selectedSprayRig) return
    setDraft(prev => {
      const nextCapacity = !prev.tankCapacity && selectedSprayRig.capacity > 0
        && (prev.applicationType ?? 'liquid') !== 'granular'
        ? String(selectedSprayRig.capacity)
        : prev.tankCapacity
      if (
        prev.sprayRigId === selectedSprayRig.id &&
        prev.sprayRig === selectedSprayRig.name &&
        prev.tankCapacity === nextCapacity
      ) return prev
      return {
        ...prev,
        sprayRigId: selectedSprayRig.id,
        sprayRig: selectedSprayRig.name,
        tankCapacity: nextCapacity,
      }
    })
  }, [selectedSprayRig])

  // Phase S.7 — When embedded in the calendar workspace, an
  // `initialDate` prop seeds the draft date. We update the live draft
  // only if it is "empty enough" to safely replace — no products, no
  // operator. The calendar workspace handles the unsaved-confirm prompt
  // before changing this prop, so the seed itself is unconditional.
  useEffect(() => {
    if (!initialDate) return
    setDraft(prev => {
      if (prev?.date === initialDate) return prev
      const isEmpty =
        (!prev?.rows || prev.rows.length === 0) &&
        !prev?.operator
      if (!isEmpty) return prev
      return { ...prev, date: initialDate }
    })
  }, [initialDate])

  const initialContextKeyRef = useRef('')
  useEffect(() => {
    if (!initialNutrientSampleId) return
    const contextKey = `${initialNutrientSampleId}|${initialArea ?? ''}`
    if (initialContextKeyRef.current === contextKey) return
    initialContextKeyRef.current = contextKey

    setDraft(prev => {
      const matchingArea = initialArea
        ? areaOpts.find(option => option.label.toLowerCase() === String(initialArea).toLowerCase())
        : null
      return {
        ...prev,
        nutrientSampleId: initialNutrientSampleId,
        ...(initialArea ? {
          area: matchingArea?.label ?? initialArea,
          acres: matchingArea?.acres ?? prev.acres,
        } : {}),
      }
    })
    onInitialContextApplied?.()
  }, [initialNutrientSampleId, initialArea, areaOpts, onInitialContextApplied])

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
  const [creatingTrainingBrief, setCreatingTrainingBrief] = useState(false)
  // Phase S.5b.2 — Save-as-Program modal toggle. Independent of
  // commit/discard so the supervisor can review a draft, save it as
  // a reusable program, and still go on to commit/print/discard.
  const [saveAsProgramOpen, setSaveAsProgramOpen] = useState(false)
  // Phase S.5b.3 — Load-Program modal toggle. Same lifecycle pattern.
  const [loadProgramOpen, setLoadProgramOpen] = useState(false)

  // Phase SPR.3a — Wizard step state. Kept out of the draft object so
  // the draft's persisted shape and localStorage key stay unchanged.
  // Fresh sessions land on Step 1; users can freely revisit prior steps.
  const [wizardStep, setWizardStep] = useState(() => resolveInitialWizardStep('where'))
  // Progressive disclosure toggles per step. Also intentionally local —
  // these are UI-only and never round-trip through the draft.
  const [showMoreWhere,      setShowMoreWhere]      = useState(false)
  const [showMoreConditions, setShowMoreConditions] = useState(false)
  const [showMoreActions,    setShowMoreActions]    = useState(false)
  const [showApplicationChecks, setShowApplicationChecks] = useState(false)
  const [weatherAutoFilledAt, setWeatherAutoFilledAt] = useState(null)
  const weatherAutoFillKeyRef = useRef(null)
  const weatherAutoFillValuesRef = useRef({})
  const weatherSelectionKeyRef = useRef(null)
  const [applicationWeatherHistory, setApplicationWeatherHistory] = useState({
    date: null,
    observations: [],
    loading: false,
    error: null,
  })
  const [applicationDateWeather, setApplicationDateWeather] = useState({
    key: null,
    result: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    const selectionKey = `${draft.date}|${draft.startTime || ''}|${draft.endTime || ''}`
    if (weatherSelectionKeyRef.current == null) {
      weatherSelectionKeyRef.current = selectionKey
      return
    }
    if (weatherSelectionKeyRef.current === selectionKey) return

    const previousAutoFill = weatherAutoFillValuesRef.current
    setDraft(prev => {
      const nextConditions = { ...prev.conditions }
      let changed = false
      for (const [field, value] of Object.entries(previousAutoFill)) {
        if (String(nextConditions[field] ?? '') !== String(value ?? '')) continue
        nextConditions[field] = ''
        changed = true
      }
      return changed ? { ...prev, conditions: nextConditions } : prev
    })
    weatherSelectionKeyRef.current = selectionKey
    weatherAutoFillKeyRef.current = null
    weatherAutoFillValuesRef.current = {}
    setWeatherAutoFilledAt(null)
  }, [draft.date, draft.startTime, draft.endTime])

  useEffect(() => {
    const bounds = localDayBoundsIso(draft.date)
    if (!bounds) {
      setApplicationWeatherHistory({ date: draft.date ?? null, observations: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setApplicationWeatherHistory(prev => ({
      date: draft.date,
      observations: prev.date === draft.date ? prev.observations : [],
      loading: true,
      error: null,
    }))
    fetchWeatherHistoryRange({ from: bounds.from, to: bounds.to, limit: 200 })
      .then(observations => {
        if (cancelled) return
        setApplicationWeatherHistory({
          date: draft.date,
          observations: Array.isArray(observations) ? observations : [],
          loading: false,
          error: null,
        })
      })
      .catch(err => {
        if (cancelled) return
        setApplicationWeatherHistory({
          date: draft.date,
          observations: [],
          loading: false,
          error: err?.message ?? 'Could not load weather history',
        })
      })

    return () => { cancelled = true }
  }, [draft.date, selectedCourse?.id])

  useEffect(() => {
    const targetMs = applicationWeatherTargetMs({
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
    })
    const key = `${draft.date}|${draft.startTime || draft.endTime || '12:00'}`
    const useLiveCurrent = draft.date === TODAY && !draft.startTime && !draft.endTime
    if (!Number.isFinite(targetMs) || useLiveCurrent) return

    let cancelled = false
    setApplicationDateWeather(prev => ({
      key,
      result: prev.key === key ? prev.result : null,
      loading: true,
      error: null,
    }))
    fetchApplicationDateWeather({
      date: draft.date,
      time: draft.startTime || draft.endTime || '12:00',
    }).then(result => {
      if (cancelled) return
      setApplicationDateWeather({
        key,
        result,
        loading: false,
        error: result ? null : 'No weather data is available for the selected application date and time.',
      })
    }).catch(err => {
      if (cancelled) return
      setApplicationDateWeather({
        key,
        result: null,
        loading: false,
        error: err?.message ?? 'Could not load date-specific weather.',
      })
    })

    return () => { cancelled = true }
  }, [draft.date, draft.startTime, draft.endTime])

  const applicationWeather = useMemo(() => {
    const targetMs = applicationWeatherTargetMs({
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
    })
    const matched = nearestWeatherObservation(
      applicationWeatherHistory.date === draft.date ? applicationWeatherHistory.observations : [],
      targetMs,
      draft.date,
    )
    if (matched) {
      return {
        current: weatherCurrentFromObservation(matched),
        observedAt: matched.observedAt ?? matched.createdAt ?? null,
        sourceLabel: 'Weather history',
        loading: applicationWeatherHistory.loading,
        error: null,
        matched,
      }
    }

    const dateWeatherKey = `${draft.date}|${draft.startTime || draft.endTime || '12:00'}`
    const dateWeather = applicationDateWeather.key === dateWeatherKey
      ? applicationDateWeather.result
      : null
    if (dateWeather?.current) {
      return {
        current: dateWeather.current,
        observedAt: dateWeather.observedAt ?? dateWeather.current.observedAt ?? dateWeather.current.timestamp ?? null,
        sourceLabel: dateWeather.sourceLabel || 'Date-specific weather',
        loading: applicationWeatherHistory.loading || applicationDateWeather.loading,
        error: null,
        matched: dateWeather,
      }
    }

    const liveObservedAt = weather.observedAt
      ?? weather.current?.observedAt
      ?? weather.current?.timestamp
      ?? null
    const liveMs = liveObservedAt ? Date.parse(liveObservedAt) : Date.now()
    const hasApplicationTime = Boolean(draft.startTime || draft.endTime)
    const canUseLive = weather.isLive
      && !hasApplicationTime
      && (draft.date === TODAY || sameLocalDate(liveMs, draft.date))
    if (canUseLive) {
      return {
        current: weather.current,
        observedAt: liveObservedAt,
        sourceLabel: weather.sourceLabel ?? weather.current?.sourceLabel ?? 'Live weather',
        loading: applicationWeatherHistory.loading || weather.loading,
        error: applicationWeatherHistory.error || weather.error,
        matched: null,
      }
    }

    return {
      current: null,
      observedAt: null,
      sourceLabel: 'Weather history',
      loading: applicationWeatherHistory.loading || applicationDateWeather.loading,
      error: applicationWeatherHistory.error || applicationDateWeather.error || 'No weather is available for the selected application date and time.',
      matched: null,
    }
  }, [
    applicationWeatherHistory,
    applicationDateWeather,
    draft.date,
    draft.startTime,
    draft.endTime,
    weather.current,
    weather.observedAt,
    weather.sourceLabel,
    weather.loading,
    weather.error,
    weather.isLive,
  ])

  const weatherObservedAt = applicationWeather.observedAt
  const weatherSourceLabel = applicationWeather.sourceLabel
  const weatherConditionPatch = useMemo(
    () => buildWeatherConditionPatch(applicationWeather.current),
    [applicationWeather.current],
  )
  const hasUsableWeather = Object.values(weatherConditionPatch).some(Boolean)
  const weatherAutofillKey = useMemo(
    () => [
      draft.date,
      draft.startTime || '',
      draft.endTime || '',
      weatherObservedAt ?? JSON.stringify(weatherConditionPatch),
    ].join('|'),
    [draft.date, draft.startTime, draft.endTime, weatherObservedAt, weatherConditionPatch],
  )

  function applyWeatherToConditions({ overwrite = false, silent = false } = {}) {
    if (!hasUsableWeather) {
      if (!silent) toast.info('Weather is not available for that application date/time yet.')
      return
    }

    const willChange = Object.entries(weatherConditionPatch).some(([field, value]) => {
      if (!value) return false
      if (!overwrite && !isBlankValue(draft.conditions?.[field])) return false
      return String(draft.conditions?.[field] ?? '') !== String(value)
    })

    setDraft(prev => {
      const nextConditions = { ...prev.conditions }
      let changed = false
      for (const [field, value] of Object.entries(weatherConditionPatch)) {
        if (!value) continue
        if (!overwrite && !isBlankValue(nextConditions[field])) continue
        if (String(nextConditions[field] ?? '') === String(value)) continue
        nextConditions[field] = value
        changed = true
      }
      return changed ? { ...prev, conditions: nextConditions } : prev
    })

    if (willChange) {
      setWeatherAutoFilledAt(new Date())
      weatherAutoFillKeyRef.current = weatherAutofillKey
      weatherAutoFillValuesRef.current = { ...weatherConditionPatch }
      if (!silent) toast.success('Weather added to application.')
    } else if (!silent) {
      toast.info('Weather fields are already filled.')
    }
  }

  useEffect(() => {
    if (!hasUsableWeather) return
    const key = weatherAutofillKey
    if (weatherAutoFillKeyRef.current === key) return

    const canRefreshPriorAutofill = weatherAutoFillKeyRef.current != null
    const hasBlankWeatherFields = Object.entries(weatherConditionPatch)
      .some(([field, value]) => value && isBlankValue(draft.conditions?.[field]))
    if (!hasBlankWeatherFields && !canRefreshPriorAutofill) return

    setDraft(prev => {
      const nextConditions = { ...prev.conditions }
      let filled = false
      for (const [field, value] of Object.entries(weatherConditionPatch)) {
        if (!value) continue
        if (!canRefreshPriorAutofill && !isBlankValue(nextConditions[field])) continue
        nextConditions[field] = value
        filled = true
      }
      return filled ? { ...prev, conditions: nextConditions } : prev
    })

    weatherAutoFillKeyRef.current = key
    weatherAutoFillValuesRef.current = { ...weatherConditionPatch }
    setWeatherAutoFilledAt(new Date())
  }, [
    draft.conditions,
    hasUsableWeather,
    weatherAutofillKey,
    weatherConditionPatch,
  ])

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
  // Phase S.7b.3 — Shared spray product picker options. Same filter
  // + sort the inline computation used since S.4; now it's one
  // function so BuildSpraySheet and SprayApplicationSheetModal stay
  // in lockstep on which inventory kinds count as spray-eligible.
  const productPickerOptions = useSprayProductOptions()

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

  function handleSprayRigChange(id) {
    const rig = sprayRigOptions.find(unit => unit.id === id)
    if (!rig) return
    patchDraft({
      sprayRigId: rig.id,
      sprayRig: rig.name,
      tankCapacity: rig.capacity > 0 ? String(rig.capacity) : '',
    })
  }

  function handleApplicationTypeChange(nextType) {
    const cleanType = nextType === 'granular' ? 'granular' : 'liquid'
    setDraft(prev => ({
      ...prev,
      applicationType: cleanType,
      ...(cleanType === 'granular'
        ? {
            carrierRate: '',
            waterVolume: '',
            tankCapacity: '',
            sprayRigId: '',
            sprayRig: '',
          }
        : {
            sprayRigId: '',
            sprayRig: '',
          }),
    }))
  }

  const sprayRigSpec = selectedSprayRig ?? { id: '', name: '', capacity: 0 }

  // Compute per-row totals + tank summary.
  const enrichedRows = useMemo(() => {
    return draft.rows.map(row => {
      const inv  = inventoryForRow(row, inventoryProducts)
      const rateUnit = row.rateUnit ?? 'oz_per_1000sqft'
      const spec     = rateUnitSpec(rateUnit)
      const nutrientPercent = spec.nutrientRate
        ? nutrientPercentForInventory(inv, spec.nutrient)
        : 0
      const inputMode = row.inputMode === 'total' ? 'total' : 'rate'
      const totalProductUnit = normalizeTotalProductUnit(row.totalProductUnit, rateUnit)
      const qtyFromRate = computeProductQtyFromRate(row.rate, draft.acres, rateUnit, inv)
      const qtyFromTotal = convertQuantityUnit(row.totalProduct, totalProductUnit, spec.measure) ?? 0
      const qtyNeeded = inputMode === 'total' && qtyFromTotal > 0
        ? qtyFromTotal
        : qtyFromRate
      const derivedRate = inputMode === 'total'
        ? computeRateFromTotalProduct(row.totalProduct, totalProductUnit, draft.acres, rateUnit, inv)
        : Number(row.rate) || 0
      // qtyUnit is the natural unit of the computed quantity (oz, lb, or gal),
      // distinct from row.unit which is the inventory unit. They may
      // differ — see convertToInventoryUnit in the commit pipeline.
      const qtyUnit   = spec.measure
      // Cost is computed against inventory pricing, so when the rate
      // measure differs from the inventory unit we convert first.
      const conv      = convertToInventoryUnit(qtyNeeded, qtyUnit, inv?.unit)
      const qtyInInv  = conv.ok ? conv.qty : qtyNeeded
      const available = inv?.quantity ?? null
      const costInfo  = inventoryCostInfo(qtyInInv, inv)
      const cost      = costInfo.totalCost
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
        inputMode,
        totalProductUnit,
        rate: inputMode === 'total' ? formatRowNumber(derivedRate, 4) : row.rate,
        totalProduct: inputMode === 'rate'
          ? formatRowNumber(convertQuantityUnit(qtyNeeded, spec.measure, totalProductUnit) ?? qtyNeeded, 4)
          : row.totalProduct,
        inv,
        qtyNeeded,        // quantity in rate's natural measure (oz, lb, or gal)
        qtyUnit,          // natural unit of qtyNeeded
        qtyInInv,         // quantity in inventory's unit (converted)
        unitConversion:   conv,
        available,
        cost,
        costInfo,
        status,
        insufficient,
        nutrientRate: Boolean(spec.nutrientRate),
        nutrientRateNutrient: spec.nutrient ?? null,
        nutrientPercent,
        nutrientRateMissing: Boolean(spec.nutrientRate && nutrientPercent <= 0),
        intel,
      }
    })
  }, [draft.rows, draft.acres, inventoryProducts, catalogProducts, labelsByItemId])

  const inferredTargetTreatment = useMemo(
    () => inferTargetTreatment(enrichedRows),
    [enrichedRows],
  )
  const targetTreatment = draft.target?.trim() || inferredTargetTreatment

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
    const liquidApplication = (draft.applicationType ?? 'liquid') !== 'granular'
    const derivedCarrierGal = liquidApplication ? computeCarrierGal(draft.carrierRate, draft.carrierUnit, draft.acres) : 0
    const manualWaterGal    = liquidApplication ? (parseFloat(draft.waterVolume) || 0) : 0
    const totalCarrierGal   = liquidApplication ? (derivedCarrierGal > 0 ? derivedCarrierGal : manualWaterGal) : 0
    const manualTankCap     = liquidApplication ? (parseFloat(draft.tankCapacity) || 0) : 0
    const effectiveTankCap  = liquidApplication ? (manualTankCap > 0 ? manualTankCap : sprayRigSpec.capacity) : 0
    const loadPlan          = liquidApplication ? planLoadOut(totalCarrierGal, effectiveTankCap) : null

    const water = totalCarrierGal
    const tankFillPct = effectiveTankCap > 0
      ? Math.min(100, Math.round((Math.min(water, effectiveTankCap) / effectiveTankCap) * 100))
      : 0

    // Per-measure buckets — keeps oz, lb, and gal totals visually separated
    // in the tank summary instead of summing apples + oranges.
    let totalOz = 0, totalLb = 0, totalGal = 0
    for (const r of enrichedRows) {
      if (r.qtyUnit === 'oz')  totalOz  += r.qtyNeeded || 0
      if (r.qtyUnit === 'lb')  totalLb  += r.qtyNeeded || 0
      if (r.qtyUnit === 'gal') totalGal += r.qtyNeeded || 0
    }

    // Nutrient totals — only computed when at least one row's inventory
    // item carries a parseable analysis string. Totals are expressed in
    // the rate's natural measure (mixed oz + gal contributions are
    // accumulated together — superintendents read this as a guidance
    // pound-equivalent, not a single bottling unit).
    const nutrientRelease = buildNutrientReleaseSummary(enrichedRows)

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
      applicationType: draft.applicationType ?? 'liquid',
      isLiquidApplication: liquidApplication,
      acres:        draft.acres || 0,
      totalCost,
      totalOz,
      totalLb,
      totalGal,
      water,
      totalCarrierGal,
      effectiveTankCap,
      loadPlan,
      tankFillPct,
      nutrientSource: nutrientRelease.sourceCount,
      nutrientReleaseTotals: nutrientRelease.totals,
      nutrientReleaseForms: nutrientRelease.forms,
      nutrientUnsupported: nutrientRelease.unsupported,
      nutrientUnsupportedCount: nutrientRelease.unsupportedCount,
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
    draft.applicationType,
  ])

  // ── Mutations on draft ────────────────────────────────────────────────
  async function handleCreateTrainingBrief() {
    if (!onCreateTrainingBrief || enrichedRows.length === 0) return
    setCreatingTrainingBrief(true)
    try {
      await onCreateTrainingBrief({
        sourceType: 'wizard_draft',
        sourceSnapshot: {
          application: {
            name: `${draft.area || 'Application'} training brief`,
            applicationType: draft.applicationType ?? 'liquid',
            plannedDate: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            areas: draft.area ? [{ name: draft.area, acreage: Number(draft.acres) || null }] : [],
            acreage: Number(draft.acres) || null,
            target: targetTreatment,
            equipment: draft.sprayRig,
            gpa: Number(draft.carrierRate) || null,
            tankVolume: summary.effectiveTankCap || null,
            loads: summary.loadPlan
              ? summary.loadPlan.fullLoads + (summary.loadPlan.hasPartial ? 1 : 0)
              : null,
            operator: draft.operator,
            weather: [
              draft.conditions.temp ? `${draft.conditions.temp} F` : '',
              draft.conditions.humidity ? `${draft.conditions.humidity}% RH` : '',
              draft.conditions.windSpeedMph ? `${draft.conditions.windSpeedMph} mph ${draft.conditions.windDirection || ''}`.trim() : draft.conditions.wind,
            ].filter(Boolean).join(' | '),
            objective: targetTreatment,
            warningSigns: draft.observations,
            managerNotes: draft.observations,
          },
          products: enrichedRows.map(row => ({
            inventoryItemId: row.inventoryItemId,
            productCatalogId: row.intel?.catalogId,
            name: row.name,
            category: row.type || row.intel?.category,
            activeIngredient: row.intel?.activeIngredientSummary,
            rate: row.rate,
            rateUnit: rateUnitSpec(row.rateUnit)?.label || row.rateUnit,
            totalAmount: row.totalProduct || row.qtyNeeded,
            totalUnit: row.totalProductUnit || row.qtyUnit,
            fracGroup: row.intel?.fracGroup,
            hracGroup: row.intel?.hracGroup,
            iracGroup: row.intel?.iracGroup,
            labelUrl: row.intel?.labelUrl,
            signalWord: row.intel?.signalWord,
            reiHours: row.intel?.reiHours,
            phiHours: row.intel?.phiHours,
            restrictedUse: row.intel?.restrictedUse === true,
            source: row.intel?.source,
            verificationStatus: 'unverified',
          })),
          instructions: {
            sprayer: draft.sprayRig,
            waterVolume: draft.carrierRate
              ? `${draft.carrierRate} ${draft.carrierUnit || 'gal / acre'}`
              : draft.waterVolume ? `${draft.waterVolume} gal total` : '',
            observations: draft.observations,
          },
        },
      })
    } finally {
      setCreatingTrainingBrief(false)
    }
  }

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
  function setRowRate(rowId, rate) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (r.id !== rowId) return r
        const rateUnit = r.rateUnit ?? 'oz_per_1000sqft'
        const inv = inventoryForRow(r, inventoryProducts)
        const totalProductUnit = normalizeTotalProductUnit(r.totalProductUnit, rateUnit)
        const qtyNeeded = computeProductQtyFromRate(rate, prev.acres, rateUnit, inv)
        const totalProduct = convertQuantityUnit(qtyNeeded, rateUnitSpec(rateUnit).measure, totalProductUnit)
        return {
          ...r,
          rate,
          inputMode: 'rate',
          totalProductUnit,
          totalProduct: formatRowNumber(totalProduct ?? qtyNeeded, 4),
        }
      }),
    }))
  }
  function setRowTotalProduct(rowId, totalProduct) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (r.id !== rowId) return r
        const rateUnit = r.rateUnit ?? 'oz_per_1000sqft'
        const inv = inventoryForRow(r, inventoryProducts)
        const totalProductUnit = normalizeTotalProductUnit(r.totalProductUnit, rateUnit)
        return {
          ...r,
          totalProduct,
          totalProductUnit,
          inputMode: 'total',
          rate: formatRowNumber(computeRateFromTotalProduct(totalProduct, totalProductUnit, prev.acres, rateUnit, inv), 4),
        }
      }),
    }))
  }
  function setRowTotalProductUnit(rowId, totalProductUnit) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (r.id !== rowId) return r
        const rateUnit = r.rateUnit ?? 'oz_per_1000sqft'
        const inv = inventoryForRow(r, inventoryProducts)
        const nextUnit = normalizeTotalProductUnit(totalProductUnit, rateUnit)
        const inputMode = r.inputMode === 'total' ? 'total' : 'rate'
        const qtyNeeded = computeProductQtyFromRate(r.rate, prev.acres, rateUnit, inv)
        return {
          ...r,
          totalProductUnit: nextUnit,
          ...(inputMode === 'total'
            ? { rate: formatRowNumber(computeRateFromTotalProduct(r.totalProduct, nextUnit, prev.acres, rateUnit, inv), 4) }
            : { totalProduct: formatRowNumber(convertQuantityUnit(qtyNeeded, rateUnitSpec(rateUnit).measure, nextUnit) ?? qtyNeeded, 4) }),
        }
      }),
    }))
  }
  function setRowRateUnit(rowId, rateUnit) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (r.id !== rowId) return r
        const inputMode = r.inputMode === 'total' ? 'total' : 'rate'
        const inv = inventoryForRow(r, inventoryProducts)
        const totalProductUnit = normalizeTotalProductUnit(r.totalProductUnit, rateUnit)
        const qtyNeeded = computeProductQtyFromRate(r.rate, prev.acres, rateUnit, inv)
        return {
          ...r,
          rateUnit,
          totalProductUnit,
          ...(inputMode === 'total'
            ? { rate: formatRowNumber(computeRateFromTotalProduct(r.totalProduct, totalProductUnit, prev.acres, rateUnit, inv), 4) }
            : { totalProduct: formatRowNumber(convertQuantityUnit(qtyNeeded, rateUnitSpec(rateUnit).measure, totalProductUnit) ?? qtyNeeded, 4) }),
        }
      }),
    }))
  }
  function applySampleRecommendation(rowId, recommendationIndex) {
    const recommendation = sampleRecommendations[Number(recommendationIndex)]
    if (!recommendation) return
    const rateUnit = `lb_${String(recommendation.nutrient).toLowerCase()}_nutrient_per_1000sqft`
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        if (row.id !== rowId) return row
        const inv = inventoryForRow(row, inventoryProducts)
        const totalProductUnit = normalizeTotalProductUnit(row.totalProductUnit, rateUnit)
        const qtyNeeded = computeProductQtyFromRate(recommendation.rateLbPer1000, prev.acres, rateUnit, inv)
        return {
          ...row,
          rate: String(recommendation.rateLbPer1000),
          rateUnit,
          inputMode: 'rate',
          sampleRecommendation: `${selectedNutrientSample.id}:${recommendation.nutrient}`,
          totalProductUnit,
          totalProduct: formatRowNumber(
            convertQuantityUnit(qtyNeeded, rateUnitSpec(rateUnit).measure, totalProductUnit) ?? qtyNeeded,
            4,
          ),
        }
      }),
    }))
  }
  function removeRow(rowId) {
    setDraft(prev => ({ ...prev, rows: prev.rows.filter(r => r.id !== rowId) }))
  }
  function addRow() {
    const defaultRateUnit = selectedCourse?.defaultSprayUnits || 'oz_per_1000sqft'
    setDraft(prev => ({
      ...prev,
      rows: [...prev.rows, {
        id:              uid('row'),
        inventoryItemId: null,
        name:            '',
        type:            '',
        rate:            '',
        rateUnit:        defaultRateUnit,
        totalProduct:    '',
        totalProductUnit: defaultTotalUnitForRate(defaultRateUnit),
        inputMode:       'rate',
        unit:            'oz',
        rei:             0,
      }],
    }))
  }
  function pickInventoryForRow(rowId, inv) {
    // Phase S.7b.3 — Delegate the {inventoryItemId, name, type, unit,
    // productCatalogId} mapping to the shared helper so it stays in
    // sync with the sheet editor's mapping.
    const patch = mapInventoryItemToProductRow(inv)
    if (!patch) return
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (r.id !== rowId) return r
        const rateUnit = defaultRateUnitForInventory(
          inv,
          selectedCourse?.defaultSprayUnits || 'oz_per_1000sqft',
        )
        const totalProductUnit = normalizeTotalProductUnit(patch.unit, rateUnit)
        const inputMode = r.inputMode === 'total' ? 'total' : 'rate'
        const rowWithInventory = { ...r, ...patch }
        const qtyNeeded = computeProductQtyFromRate(r.rate, prev.acres, rateUnit, inv ?? rowWithInventory)
        return {
          ...r,
          ...patch,
          rateUnit,
          totalProductUnit,
          ...(inputMode === 'total'
            ? { rate: formatRowNumber(computeRateFromTotalProduct(r.totalProduct, totalProductUnit, prev.acres, rateUnit, inv ?? rowWithInventory), 4) }
            : { totalProduct: formatRowNumber(convertQuantityUnit(qtyNeeded, rateUnitSpec(rateUnit).measure, totalProductUnit) ?? qtyNeeded, 4) }),
        }
      }),
    }))
  }
  function onAreaChange(label) {
    const opt = areaOpts.find(a => a.label === label)
    patchDraft({ area: label, acres: opt?.acres ?? 0 })
  }
  function areaDisplayValue() {
    const acres = Number(draft.acres) || 0
    if (!(acres > 0)) return ''
    return draft.areaUnit === 'square-feet'
      ? formatRowNumber(acres * SQ_FT_PER_ACRE, 2)
      : formatRowNumber(acres, 4)
  }
  function handleAreaSizeChange(value) {
    const entered = Number(value)
    const acres = Number.isFinite(entered) && entered > 0
      ? (draft.areaUnit === 'square-feet' ? entered / SQ_FT_PER_ACRE : entered)
      : 0
    patchDraft({ acres })
  }
  function clearDraft() {
    if (!confirm('Discard the current application draft?')) return
    setDraft(makeEmptyDraft())
    weatherAutoFillKeyRef.current = null
    weatherAutoFillValuesRef.current = {}
    weatherSelectionKeyRef.current = null
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
    const missingNutrientRateBasis = enrichedRows.find(r =>
      r.nutrientRateMissing && (Number(r.rate) > 0 || Number(r.totalProduct) > 0)
    )
    if (missingNutrientRateBasis) {
      toast.error(
        `Add ${missingNutrientRateBasis.nutrientRateNutrient}% nutrient source in Inventory for "${missingNutrientRateBasis.name || 'this product'}" before using lb nutrient / 1,000 sq ft.`,
      )
      return
    }
    if (!draft.skipInventoryDeduction && summary.anyInsufficient && !confirm(
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
        applicationName: `${applicationTypeLabel(applicationType)} - ${draft.area} - ${draft.date}`,
        applicationType,
        equipmentId:     draft.sprayRigId || null,
        equipmentName:   draft.sprayRig || null,
        tankCapacity:    isLiquidApplication ? (summary.effectiveTankCap || null) : null,
        targetPest:      targetTreatment,
        applicator:      draft.operator,
        nutrientSampleId: draft.nutrientSampleId || null,
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
        carrierVolume: isLiquidApplication ? formatCarrierSummary(draft, summary) : 'Granular application',
        totalVolume:   isLiquidApplication ? summary.totalCarrierGal : null,
        irrigationInches:  optionalPositiveNumber(draft.irrigationInches),
        irrigationMinutes: optionalPositiveNumber(draft.irrigationMinutes),
        // Phase S.3 — Sum of per-product totals at save time. Null when
        // no inventory cost was available (e.g. no product has a
        // costPerUnit), so reports don't show "$0" misleadingly.
        totalCostSnapshot: recordTotalCost > 0 ? +recordTotalCost.toFixed(2) : null,
        deductInventory: !draft.skipInventoryDeduction,
        notes:         draft.observations,
        area:          draft.area,
        acreage:       draft.acres,
        products: enrichedRows.map(r => {
          const useInvUnit = r.inv && r.unitConversion?.ok
          const quantityUnit = useInvUnit ? r.inv.unit : r.qtyUnit
          const quantityUsed = useInvUnit ? r.qtyInInv : r.qtyNeeded
          return {
            name:            r.name,
            type:            r.type,
            rate:            formatRateLabel(r.rate, r.rateUnit),
            rateUnit:        r.rateUnit,
            unit:            quantityUnit,
            quantityUsed,
            quantityUnit,
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
            productCostSnapshot:       r.costInfo?.costPerUnit ?? r.inv?.costPerUnit ?? null,
            productCostUnitSnapshot:   r.costInfo?.costUnit    ?? r.inv?.costUnit    ?? r.inv?.unit ?? null,
            totalCostSnapshot:         typeof r.cost === 'number' ? r.cost : null,
          }
        }),
      }
      const saved = await createSpray(payload)

      // 3. Calendar event (dedupe handled server-side).
      createCalendarEvent({
        title:         `${isLiquidApplication ? 'Spray' : 'Granular'} - ${draft.area}: ${enrichedRows.map(r => r.name).join(' + ')}`,
        date:          draft.date,
        category:      'spray',
        priority:      summary.maxRei >= 12 ? 'high' : 'medium',
        status:        'completed',
        startTime:     draft.startTime,
        location:      draft.area,
        assignedStaff: draft.operator ? [draft.operator] : [],
        equipment:     draft.sprayRig ? [draft.sprayRig] : [],
        tags:          enrichedRows.map(r => r.name),
        notes:         draft.observations,
        sourceModule:  'spray',
        sourceId:      saved.id,
      }).catch(() => {})

      // 4. REI alert if applicable.
      if (summary.maxRei > 0) {
        createAlert({
          title:    `REI Active — ${draft.area}`,
          message:  `${summary.maxRei}-hour re-entry interval in effect after ${isLiquidApplication ? 'spray' : 'granular'} application on ${draft.date}.`,
          module:   'spray',
          priority: summary.maxRei >= 12 ? 'high' : 'medium',
          course:   selectedCourse?.shortName ?? selectedCourse?.name ?? null,
          actionLabel: 'View Application',
          sourceId:    saved.id,
        }).catch(() => {})
      }

      // 5. Reset draft.
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      // Phase S.7 — When embedded in the calendar workspace, keep the
      // fresh draft's date on the calendar's selected date so the user
      // can immediately log another spray for the same day. Outside the
      // calendar this is just TODAY (unchanged from pre-S.7 behavior).
      const fresh = makeEmptyDraft()
      if (initialDate) fresh.date = initialDate
      setDraft(fresh)
      weatherAutoFillKeyRef.current = null
      weatherAutoFillValuesRef.current = {}
      weatherSelectionKeyRef.current = null
      // Phase S.5b.1 — Reset the saved indicator after commit.
      setDraftSavedAt(null)
      // Phase S.7 — Notify the embedding workspace so it can refresh
      // its calendar/store. No-op when used as a standalone tab.
      onCommit?.(saved)
      toast.success(
        draft.skipInventoryDeduction
          ? 'Application committed without changing inventory'
          : 'Application committed; completed application inventory has been deducted',
      )
    } catch (err) {
      toast.error?.(`Commit failed: ${err.message ?? err}`)
    } finally {
      setCommitting(false)
    }
  }

  // ── Wizard step validation (Phase SPR.3a) ─────────────────────────
  // Lightweight, per-step gates that prevent Continue from advancing
  // when a step is clearly incomplete. The full commit pipeline in
  // handleCommit remains the ultimate authority — nothing here relaxes
  // the existing final validation, and no rules are duplicated.
  const step1Issues = useMemo(() => {
    const issues = []
    if (!draft.operator?.trim()) issues.push('Operator is required')
    if (!draft.area)             issues.push('Area treated is required')
    if (!(Number(draft.acres) > 0)) issues.push('Area must be greater than zero')
    return issues
  }, [draft.operator, draft.area, draft.acres])

  const step2Issues = useMemo(() => {
    const issues = []
    if (enrichedRows.length === 0) {
      issues.push('Add at least one product')
    } else {
      const incomplete = enrichedRows.some(r =>
        !r.name?.trim() || !(Number(r.rate) > 0) || !r.rateUnit
      )
      if (incomplete) issues.push('Complete each product row (product, rate, rate unit)')
      const missingNutrientRateBasis = enrichedRows.some(r =>
        r.nutrientRateMissing && (Number(r.rate) > 0 || Number(r.totalProduct) > 0)
      )
      if (missingNutrientRateBasis) {
        issues.push('Add nutrient percentages in Inventory before using lb nutrient / 1,000 sq ft rates')
      }
    }
    return issues
  }, [enrichedRows])

  // Step 3 (Conditions) currently has no required fields — mirrors the
  // existing form, which never blocked commit on weather values. Left
  // as an empty array so tests can pin "Conditions never blocks
  // Continue" without additional logic.
  const step3Issues = useMemo(() => [], [])

  const stepIssuesById = {
    where:      step1Issues,
    mix:        step2Issues,
    conditions: step3Issues,
    review:     [],
  }

  const currentStepIndex = wizardStepIndex(wizardStep)
  const currentStepId    = SPRAY_WIZARD_STEPS[currentStepIndex]?.id ?? 'where'
  const currentIssues    = stepIssuesById[currentStepId] ?? []
  const canContinue      = currentIssues.length === 0

  const stepHeadingRef = useRef(null)
  useEffect(() => {
    // Move focus to the current step's heading when the step changes,
    // so keyboard users land on the new content instead of the last
    // control they touched. Silent no-op if the ref hasn't attached.
    stepHeadingRef.current?.focus?.({ preventScroll: false })
  }, [wizardStep])

  const goToStep = useCallback((id) => {
    setWizardStep(resolveInitialWizardStep(id))
  }, [])

  const goNext = useCallback(() => {
    if (!canContinue) return
    const next = SPRAY_WIZARD_STEPS[currentStepIndex + 1]
    if (next) setWizardStep(next.id)
  }, [canContinue, currentStepIndex])

  const goBack = useCallback(() => {
    const prev = SPRAY_WIZARD_STEPS[currentStepIndex - 1]
    if (prev) setWizardStep(prev.id)
  }, [currentStepIndex])

  // ── Render (Phase SPR.3a — four-step wizard) ─────────────────────
  //
  // Layout order:
  //   1. Workspace header
  //   2. Wizard progress indicator
  //   3. Current step body (Where / Mix / Conditions / Review)
  //   4. Tank summary rail (visible on Mix + Review only)
  //   5. Sticky action bar (Back / Continue / Save & Log Application + more actions)
  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="New Application"
        subtitle="Build liquid spray or granular applications, preview totals, save to permanent record."
      >
        <SprayWizardProgress
          steps={SPRAY_WIZARD_STEPS}
          currentIndex={currentStepIndex}
          onSelect={goToStep}
          stepIssuesById={stepIssuesById}
          summary={summary}
        />

        <div className={styles.naWizardLayout} data-wizard-step={currentStepId}>

          {/* ── Left: current step ── */}
          <div className={styles.naBuilder}>

            <header className={styles.naHeader}>
              <h2
                ref={stepHeadingRef}
                tabIndex={-1}
                className={styles.naTitle}
              >
                {SPRAY_WIZARD_STEPS[currentStepIndex]?.label ?? 'New Application'}
              </h2>
              <div className={styles.naHeaderMeta}>
                <span className={styles.naMetaItem}>
                  <span className={styles.naMetaLabel}>Course</span>
                  <span className={styles.naMetaValue}>
                    {selectedCourse?.shortName ?? selectedCourse?.name ?? '—'}
                  </span>
                </span>
                <span className={styles.naMetaItem}>
                  <span className={styles.naMetaLabel}>Step</span>
                  <span className={styles.naMetaValue}>
                    {currentStepIndex + 1} of {SPRAY_WIZARD_STEPS.length}
                  </span>
                </span>
              </div>
            </header>

            {/* ── Step 1 — Where & When ── */}
            {currentStepId === 'where' && (
            <div className={styles.naStepBody} data-step="where">
            <ApplicationTypeSelector
              value={applicationType}
              onChange={handleApplicationTypeChange}
            />

            <div className={styles.naMetaGrid}>
              <Field label="Date">
                <input
                  type="date"
                  className={styles.naInput}
                  value={draft.date}
                  onChange={e => patchDraft({ date: e.target.value })}
                />
              </Field>

              <Field label="Area treated">
                <select
                  className={styles.naInput}
                  value={draft.area}
                  onChange={e => onAreaChange(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {draft.area && !areaOpts.some(option => option.label === draft.area) && (
                    <option value={draft.area}>{draft.area}</option>
                  )}
                  {areaOpts.map(a => (
                    <option key={a.label} value={a.label}>{a.displayLabel ?? a.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Area size">
                <div className={styles.naAreaSizeControl}>
                  <input
                    type="number"
                    className={styles.naInput}
                    value={areaDisplayValue()}
                    onChange={e => handleAreaSizeChange(e.target.value)}
                    step={draft.areaUnit === 'square-feet' ? '1' : '0.01'}
                    min="0"
                    placeholder={draft.areaUnit === 'square-feet' ? '0' : '0.00'}
                    aria-label="Treatment area size"
                  />
                  <select
                    className={`${styles.naInput} ${styles.naAreaUnitSelect}`}
                    value={draft.areaUnit ?? 'acres'}
                    onChange={e => patchDraft({ areaUnit: e.target.value })}
                    aria-label="Treatment area unit"
                  >
                    <option value="acres">Acres</option>
                    <option value="square-feet">Square feet</option>
                  </select>
                </div>
              </Field>

              <Field label="Nutrient sample (optional)">
                <select
                  className={styles.naInput}
                  value={draft.nutrientSampleId ?? ''}
                  onChange={e => patchDraft({ nutrientSampleId: e.target.value })}
                >
                  <option value="">— No sample selected —</option>
                  {(nutrientSamples ?? []).map(sample => (
                    <option key={sample.id} value={sample.id}>
                      {sample.sampleDate} · {sample.sampleType === 'tissue' ? 'Tissue' : 'Soil'} · {sample.location}
                    </option>
                  ))}
                </select>
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

              <Field label={isLiquidApplication ? 'Spray rig' : 'Application equipment'}>
                <select
                  className={styles.naInput}
                  value={selectedSprayRig?.id ?? ''}
                  onChange={e => handleSprayRigChange(e.target.value)}
                  disabled={sprayRigOptions.length === 0}
                >
                  {sprayRigOptions.length === 0 && (
                    <option value="">{isLiquidApplication ? 'Add sprayer equipment in Fleet' : 'Add spreader equipment in Fleet'}</option>
                  )}
                  {sprayRigOptions.map(r => (
                    <option key={r.id} value={r.id}>
                      {equipmentRigLabel(r)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {selectedNutrientSample && (
              <div className={styles.naSampleRecommendationPanel}>
                <div>
                  <strong>{selectedNutrientSample.sampleType === 'tissue' ? 'Tissue' : 'Soil'} sample recommendations</strong>
                  <span>{selectedNutrientSample.location} · {selectedNutrientSample.sampleDate}</span>
                </div>
                {sampleRecommendations.length > 0 ? (
                  <div className={styles.naSampleRecommendationChips}>
                    {sampleRecommendations.map((recommendation, index) => (
                      <span key={`${recommendation.nutrient}-${index}`}>
                        <b>{recommendation.nutrient}</b> {recommendation.rateLbPer1000} lb / 1,000 sq ft
                      </span>
                    ))}
                  </div>
                ) : <span className={styles.naSampleNoRecommendation}>This sample has measured results but no lab application recommendations.</span>}
              </div>
            )}

            <div className={styles.naMetaGrid}>
              <Field label="Irrigation inches">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.irrigationInches}
                  onChange={e => patchDraft({ irrigationInches: e.target.value })}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </Field>

              <Field label="Irrigation minutes">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.irrigationMinutes}
                  onChange={e => patchDraft({ irrigationMinutes: e.target.value })}
                  step="1"
                  min="0"
                  placeholder="0"
                />
              </Field>
            </div>

            <button
              type="button"
              className={styles.naDisclosureBtn}
              aria-expanded={showMoreWhere}
              onClick={() => setShowMoreWhere(v => !v)}
            >
              {showMoreWhere ? 'Hide more details' : 'More details'}
            </button>

            {showMoreWhere && (
              <div className={styles.naMetaGrid}>
                <Field label="Start time">
                  <input
                    type="time"
                    className={styles.naInput}
                    value={draft.startTime}
                    onChange={e => patchDraft({ startTime: e.target.value })}
                  />
                </Field>

                <Field label="End time">
                  <input
                    type="time"
                    className={styles.naInput}
                    value={draft.endTime}
                    onChange={e => patchDraft({ endTime: e.target.value })}
                  />
                </Field>

                <Field label="Applicator license #">
                  <input
                    type="text"
                    className={styles.naInput}
                    value={draft.applicatorLicense}
                    onChange={e => patchDraft({ applicatorLicense: e.target.value })}
                    placeholder="Optional"
                  />
                </Field>

                {isLiquidApplication && (
                  <Field label="Tank capacity (gal)">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className={styles.naInput}
                      value={draft.tankCapacity}
                      onChange={e => patchDraft({ tankCapacity: e.target.value })}
                      placeholder={sprayRigSpec.capacity > 0 ? String(sprayRigSpec.capacity) : 'Set on sprayer equipment'}
                      title={sprayRigSpec.capacity > 0
                        ? `Auto-filled from ${sprayRigSpec.name}`
                        : 'Add tank capacity to this sprayer in Equipment'}
                    />
                  </Field>
                )}

                <Field label="Target treatment" wide>
                  <input
                    type="text"
                    className={styles.naInput}
                    value={targetTreatment}
                    onChange={e => patchDraft({ target: e.target.value })}
                    placeholder="Auto from products"
                  />
                </Field>
              </div>
            )}
            </div>
            )}

            {/* ── Step 2 — Products ── */}
            {currentStepId === 'mix' && (
            <div className={styles.naStepBody} data-step="mix">

            {/* ── Carrier controls (liquid applications only) ── */}
            {isLiquidApplication && (
            <div className={styles.naMetaGrid}>
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
            </div>
            )}

            {/* ── Product table ── */}
            <div className={styles.naProductWrap}>
              <div className={styles.naSectionHeader}>
                <h3 className={styles.naSectionTitle}>{isLiquidApplication ? 'Tank Mix' : 'Products'}</h3>
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
                    <th>Total To Use</th>
                    <th>Available</th>
                    <th>Est. Cost</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {enrichedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className={styles.naEmptyRow}>
                        No products added - click <strong>+ Add product</strong> to begin.
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
                        {sampleRecommendations.length > 0 && (
                          <select
                            className={styles.naSampleRateSelect}
                            value=""
                            onChange={event => applySampleRecommendation(row.id, event.target.value)}
                            aria-label={`Apply lab recommendation to ${row.name || 'product'}`}
                          >
                            <option value="">Apply sample recommendation...</option>
                            {sampleRecommendations.map((recommendation, index) => (
                              <option key={`${recommendation.nutrient}-${index}`} value={index}>
                                {recommendation.nutrient}: {recommendation.rateLbPer1000} lb nutrient / 1,000 sq ft
                              </option>
                            ))}
                          </select>
                        )}
                        {nutrientRateBasisLabel(row) && (
                          <span
                            className={styles.naQtyConverted}
                            data-tone={row.nutrientRateMissing ? 'warn' : undefined}
                          >
                            {nutrientRateBasisLabel(row)}
                          </span>
                        )}
                      </td>
                      <td className={styles.naDimCell}>{row.type || '—'}</td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className={styles.naRowInput}
                          value={row.rate}
                          onChange={e => setRowRate(row.id, e.target.value)}
                          placeholder="0.0"
                        />
                      </td>
                      <td>
                        <select
                          className={styles.naRowInput}
                          value={row.rateUnit}
                          onChange={e => setRowRateUnit(row.id, e.target.value)}
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
                      <td>
                        <div className={styles.naTotalInputWrap}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={styles.naRowInput}
                            value={row.totalProduct}
                            onChange={e => setRowTotalProduct(row.id, e.target.value)}
                            placeholder="0.0"
                            aria-label={`Total product to use for ${row.name || 'product'}`}
                          />
                          <select
                            className={`${styles.naRowInput} ${styles.naTotalUnitSelect}`}
                            value={row.totalProductUnit}
                            onChange={e => setRowTotalProductUnit(row.id, e.target.value)}
                            aria-label={`Total used unit for ${row.name || 'product'}`}
                            title="Total used unit"
                          >
                            {totalUnitOptionsForRate(row.rateUnit).map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                          {row.qtyNeeded > 0 && inventoryQtyLabel(row) && (
                            <span className={styles.naQtyConverted}>{inventoryQtyLabel(row)}</span>
                          )}
                          {nutrientProductMathLabel(row, draft.acres) && (
                            <span className={styles.naQtyConverted}>
                              {nutrientProductMathLabel(row, draft.acres)}
                            </span>
                          )}
                        </div>
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

            {isLiquidApplication && (
              <>
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
              </>
            )}
            </div>
            )}

            {/* ── Step 3 — Conditions ── */}
            {currentStepId === 'conditions' && (
            <div className={styles.naStepBody} data-step="conditions">
            <WeatherAutofillPanel
              weather={applicationWeather}
              hasUsableWeather={hasUsableWeather}
              sourceLabel={weatherSourceLabel}
              observedAt={weatherObservedAt}
              onFill={() => applyWeatherToConditions({ overwrite: true })}
            />

            <div className={styles.naConditionsGrid}>
              <Field label="Temperature (°F)">
                <input
                  type="number"
                  className={styles.naInput}
                  value={draft.conditions.temp}
                  onChange={e => patchConditions({ temp: e.target.value })}
                  placeholder="72"
                />
              </Field>
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
            </div>

            {weatherAutoFilledAt && (
              <div className={styles.naWeatherAutofill}>
                <span className={styles.naWeatherAutofillDot} />
                <span>
                  Weather filled from {weatherSourceLabel}
                  {weatherObservedAt ? ` at ${weatherObservedLabel(weatherObservedAt)}` : ''}
                </span>
              </div>
            )}

            <button
              type="button"
              className={styles.naDisclosureBtn}
              aria-expanded={showMoreConditions}
              onClick={() => setShowMoreConditions(v => !v)}
            >
              {showMoreConditions ? 'Hide additional conditions' : 'Additional conditions'}
            </button>

            {showMoreConditions && (
              <>
              <div className={styles.naConditionsGrid}>
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
                {isLiquidApplication && (
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
                )}
                <Field label="Wind / conditions notes" wide>
                  <input
                    type="text"
                    className={styles.naInput}
                    value={draft.conditions.wind}
                    onChange={e => patchConditions({ wind: e.target.value })}
                    placeholder="gusty after 9am, partly cloudy"
                  />
                </Field>
              </div>

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
              </>
            )}
            </div>
            )}

            {/* ── Step 4 — Review & Save ── */}
            {currentStepId === 'review' && (
            <div className={styles.naStepBody} data-step="review">
              <SprayReviewSummary
                draft={draft}
                enrichedRows={enrichedRows}
                summary={summary}
                applicationType={applicationType}
                isLiquidApplication={isLiquidApplication}
                targetTreatment={targetTreatment}
                selectedCourse={selectedCourse}
                stepIssuesById={stepIssuesById}
                onEditStep={goToStep}
                onToggleInventoryDeduction={value => patchDraft({ skipInventoryDeduction: value })}
              />
            </div>
            )}

          </div>

          {/* ── Right: tank summary — visible on Mix + Review only ── */}
          {(currentStepId === 'mix' || currentStepId === 'review') && (
          <aside className={styles.naTankSummary}>
            <div className={styles.naTankHeader}>
              <h3 className={styles.naTankTitle}>Application Summary</h3>
              <span className={styles.naTankSub}>Live preview</span>
            </div>

            <SummarySection label="Operational">
              <SummaryRow label="Type"            value={applicationTypeLabel(applicationType)} />
              <SummaryRow label="Products"        value={summary.productCount} />
              <SummaryRow label="Acres covered"   value={summary.acres ? `${fmt(summary.acres, 1)} ac` : '—'} />
              {isLiquidApplication && (
                <>
                  <SummaryRow label="Water volume" value={summary.water ? `${summary.water} gal` : '—'} />
                  <SummaryRow label="Tank fill" value={`${summary.tankFillPct}%`} tone={summary.tankFillPct > 100 ? 'critical' : undefined} />
                </>
              )}
              <SummaryRow label="Est. cost"       value={fmtCurrency(summary.totalCost)} />
              <SummaryRow
                label="REI"
                value={summary.maxRei > 0 ? `${summary.maxRei} hrs` : 'None'}
                tone={summary.maxRei >= 12 ? 'warn' : undefined}
              />
            </SummarySection>

            <NutrientTankSummary summary={summary} />

            <button
              type="button"
              className={styles.naSecondaryBtn}
              onClick={() => setShowApplicationChecks(v => !v)}
            >
              {showApplicationChecks ? 'Hide application checks' : 'Show application checks'}
            </button>

            {showApplicationChecks && (
            <>
            <SummarySection label="Product totals">
              <SummaryRow
                label="Total product (oz)"
                value={summary.totalOz > 0 ? `${fmt(summary.totalOz, 2)} oz` : '—'}
              />
              <SummaryRow
                label="Total product (lb)"
                value={summary.totalLb > 0 ? `${fmt(summary.totalLb, 2)} lb` : '—'}
              />
              <SummaryRow
                label="Total product (gal)"
                value={summary.totalGal > 0 ? `${fmt(summary.totalGal, 3)} gal` : '—'}
              />
            </SummarySection>

            <SummarySection label="Application Intelligence">
              <ChemicalIntelligencePanel
                analysis={chemAnalysis}
                tankProductCount={tankProducts.length}
                labeledProductCount={labeledTankCount}
              />
            </SummarySection>

            <SummarySection label="Product Intelligence">
              <SprayIntelligencePanel intel={sprayIntel} />
            </SummarySection>

            <SummarySection label="Rotation Awareness">
              <SprayRotationAwarenessPanel awareness={rotationAwareness} />
            </SummarySection>

            <SummarySection label="Interval Awareness">
              <SprayIntervalAwarenessPanel awareness={intervalAwareness} />
            </SummarySection>
            </>
            )}

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
                exceed available stock for this application.
              </div>
            )}
          </aside>
          )}

        </div>

        {/* ── Sticky wizard action bar ── */}
        <SprayWizardActions
          currentStepId={currentStepId}
          currentStepIndex={currentStepIndex}
          totalSteps={SPRAY_WIZARD_STEPS.length}
          canContinue={canContinue}
          currentIssues={currentIssues}
          committing={committing}
          canEditSprays={canEditSprays}
          hasRows={enrichedRows.length > 0}
          showMoreActions={showMoreActions}
          setShowMoreActions={setShowMoreActions}
          draftSavedAt={draftSavedAt}
          onBack={goBack}
          onContinue={goNext}
          onCommit={handleCommit}
          onCreateTrainingBrief={handleCreateTrainingBrief}
          creatingTrainingBrief={creatingTrainingBrief}
          onSaveAsTemplate={() => setSaveAsProgramOpen(true)}
          onLoadTemplate={() => setLoadProgramOpen(true)}
          onClear={clearDraft}
        />

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

function ApplicationTypeSelector({ value, onChange }) {
  return (
    <div className={styles.naApplicationTypeGroup} role="radiogroup" aria-label="Application type">
      {APPLICATION_TYPES.map(type => {
        const selected = value === type.value
        return (
          <button
            key={type.value}
            type="button"
            className={styles.naApplicationTypeBtn}
            data-selected={selected ? 'true' : undefined}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(type.value)}
          >
            <span className={styles.naApplicationTypeTitle}>{type.label}</span>
            <span className={styles.naApplicationTypeDescription}>{type.description}</span>
          </button>
        )
      })}
    </div>
  )
}

function WeatherAutofillPanel({ weather, hasUsableWeather, sourceLabel, observedAt, onFill }) {
  const current = weather.current ?? {}
  const windText = hasUsableWeather
    ? `${weatherDisplay(current.wind, ' mph', 1)}${current.windDir ? ` ${current.windDir}` : ''}`
    : '--'
  const sourceText = weather.loading
    ? 'Loading weather'
    : hasUsableWeather
      ? `${sourceLabel}${observedAt ? ` at ${weatherObservedLabel(observedAt)}` : ''}`
      : (weather.error || 'Weather unavailable')

  return (
    <section className={styles.naWeatherPanel} data-ready={hasUsableWeather ? 'true' : undefined}>
      <div className={styles.naWeatherPanelHead}>
        <div>
          <h3 className={styles.naWeatherPanelTitle}>Application weather</h3>
          <p className={styles.naWeatherPanelMeta}>{sourceText}</p>
        </div>
        <button
          type="button"
          className={styles.naWeatherFillBtn}
          disabled={!hasUsableWeather || weather.loading}
          onClick={onFill}
        >
          Use weather
        </button>
      </div>
      <div className={styles.naWeatherPanelStats}>
        <WeatherPanelStat label="Temp" value={weatherDisplay(current.currentTemp, 'F')} />
        <WeatherPanelStat label="Wind" value={windText} />
        <WeatherPanelStat label="Humidity" value={weatherDisplay(current.humidity, '%')} />
        <WeatherPanelStat label="Soil" value={weatherDisplay(current.soilTemp, 'F', 1)} />
      </div>
    </section>
  )
}

function WeatherPanelStat({ label, value }) {
  return (
    <div className={styles.naWeatherPanelStat}>
      <span className={styles.naWeatherPanelStatLabel}>{label}</span>
      <span className={styles.naWeatherPanelStatValue}>{value}</span>
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

function NutrientTankSummary({ summary }) {
  const nutrients = buildNutrientTankRows(summary)
  if (nutrients.length === 0) return null

  return (
    <SummarySection label={summary.isLiquidApplication ? 'Nutrients in tank' : 'Nutrients applied'}>
      <div className={styles.naTankNutrientList}>
        {nutrients.map(row => (
          <div key={row.key} className={styles.naTankNutrientItem}>
            <div className={styles.naTankNutrientHeader}>
              <div className={styles.naTankNutrientIdentity}>
                <span className={styles.naTankNutrientBadge}>{row.key}</span>
                <span className={styles.naTankNutrientName}>{row.label}</span>
              </div>
              <span className={styles.naTankNutrientValue}>{row.value}</span>
            </div>
            {row.forms.length > 0 && (
              <div className={styles.naTankNutrientForms}>
                {row.forms.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </SummarySection>
  )
}

function ActionNutrientSummary({ summary }) {
  if (!summary || summary.nutrientSource <= 0) return null

  const nutrients = NUTRIENTS
    .map(nutrient => [
      nutrient.value,
      formatNutrientReleaseBucket(summary.nutrientReleaseTotals[nutrient.value], summary.acres),
    ])
    .filter(([, value]) => value && value !== '—')

  if (nutrients.length === 0) return null

  return (
    <div className={styles.naActionNutrients} aria-label="Nutrient summary">
      <span className={styles.naActionNutrientLabel}>Nutrients</span>
      <span className={styles.naActionNutrientList}>
        {nutrients.map(([label, value]) => (
          <span key={label} className={styles.naActionNutrientItem}>
            <strong>{label}</strong> {value}
          </span>
        ))}
      </span>
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

// ── Phase SPR.3a — Wizard components ─────────────────────────────────

function SprayWizardProgress({ steps, currentIndex, onSelect, stepIssuesById, summary }) {
  return (
    <nav
      className={styles.naWizardProgress}
      role="tablist"
      aria-label="Application steps"
    >
      {steps.map((s, i) => {
        const isCurrent  = i === currentIndex
        const isPast     = i < currentIndex
        const state      = isCurrent ? 'current' : isPast ? 'complete' : 'future'
        const stepIssues = stepIssuesById[s.id] ?? []
        const hasIssues  = stepIssues.length > 0
        // Past + current steps clickable (safe — user can freely revisit).
        // Future steps not clickable via progress rail; they must click
        // Continue so per-step validation runs.
        const clickable = isPast || isCurrent
        return (
          <Fragment key={s.id}>
          <button
            type="button"
            role="tab"
            aria-current={isCurrent ? 'step' : undefined}
            aria-selected={isCurrent}
            data-state={state}
            data-has-issues={hasIssues && isCurrent ? 'true' : undefined}
            className={styles.naWizardStep}
            disabled={!clickable}
            onClick={() => clickable && onSelect(s.id)}
          >
            <span className={styles.naWizardStepNum}>{i + 1}</span>
            <span className={styles.naWizardStepLabel}>{s.label}</span>
          </button>
          {s.id === 'review' && <ActionNutrientSummary summary={summary} />}
          </Fragment>
        )
      })}
    </nav>
  )
}

function SprayWizardActions({
  currentStepId,
  currentStepIndex,
  totalSteps,
  canContinue,
  currentIssues,
  committing,
  canEditSprays,
  hasRows,
  showMoreActions,
  setShowMoreActions,
  draftSavedAt,
  onBack,
  onContinue,
  onCommit,
  onCreateTrainingBrief,
  creatingTrainingBrief,
  onSaveAsTemplate,
  onLoadTemplate,
  onClear,
}) {
  const isLast    = currentStepId === 'review'
  const isFirst   = currentStepIndex === 0
  const commitDisabled = committing || !hasRows || !canEditSprays

  return (
    <div className={styles.naWizardActionBar} role="group" aria-label="Wizard actions">
      {currentIssues.length > 0 && !isLast && (
        <ul className={styles.naWizardIssueList} aria-live="polite">
          {currentIssues.map(msg => (
            <li key={msg} className={styles.naWizardIssue}>{msg}</li>
          ))}
        </ul>
      )}

      <div className={styles.naWizardActionRow}>
        <div className={styles.naWizardActionLeft}>
          {!isFirst && (
            <button
              type="button"
              className={styles.naSecondaryBtn}
              onClick={onBack}
              disabled={committing}
            >
              ← Back
            </button>
          )}
          <span className={styles.naWizardStepHint}>
            Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>

        <div className={styles.naWizardActionRight}>
          <button
            type="button"
            className={styles.naSecondaryBtn}
            onClick={() => setShowMoreActions(v => !v)}
            aria-expanded={showMoreActions}
            title="Template + form actions"
          >
            More actions
          </button>

          {isLast && onCreateTrainingBrief && (
            <button
              type="button"
              className={styles.naSecondaryBtn}
              disabled={creatingTrainingBrief || !hasRows || !canEditSprays}
              onClick={onCreateTrainingBrief}
              title="Create a separate training draft without saving or completing this application."
            >
              {creatingTrainingBrief ? 'Creating Brief...' : 'Create Training Brief'}
            </button>
          )}

          {isLast ? (
            <button
              type="button"
              className={styles.naCommitBtn}
              disabled={commitDisabled}
              onClick={onCommit}
              title={!canEditSprays ? 'Application edit permission required' : undefined}
            >
              {committing ? 'Saving…' : 'Save & Log Application'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.naCommitBtn}
              disabled={!canContinue}
              onClick={onContinue}
              title={!canContinue ? 'Resolve required fields to continue' : undefined}
            >
              Continue →
            </button>
          )}
        </div>
      </div>

      {showMoreActions && (
        <div className={styles.naWizardMoreRow}>
          <button
            type="button"
            className={styles.naSaveAsProgramBtn}
            onClick={onSaveAsTemplate}
            disabled={committing || !hasRows || !canEditSprays}
            title={!canEditSprays
              ? 'Application edit permission required'
              : 'Save the current draft as a template (no inventory deduction, no application record created).'}
          >
            Save as Template
          </button>
          <button
            type="button"
            className={styles.naLoadProgramBtn}
            onClick={onLoadTemplate}
            disabled={committing || !canEditSprays}
            title={!canEditSprays
              ? 'Application edit permission required'
              : 'Load a template into the builder (replaces or appends product rows).'}
          >
            Load Template
          </button>
          <button
            type="button"
            className={styles.naSecondaryBtn}
            onClick={onClear}
            disabled={committing}
          >
            Clear Form
          </button>
          <span className={styles.naDraftSavedHint} aria-live="polite">
            {draftSavedAt
              ? `Saved to this device at ${draftSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : 'Unsaved changes'}
          </span>
        </div>
      )}
    </div>
  )
}

// Read-only summary. Consumes existing derived state — never recomputes.
function SprayReviewSummary({
  draft,
  enrichedRows,
  summary,
  applicationType,
  isLiquidApplication,
  targetTreatment,
  selectedCourse,
  stepIssuesById,
  onEditStep,
  onToggleInventoryDeduction,
}) {
  const anyIssues =
    (stepIssuesById.where?.length ?? 0) > 0 ||
    (stepIssuesById.mix?.length ?? 0) > 0

  return (
    <div className={styles.naReview}>
      {anyIssues && (
        <div className={styles.naReviewIssues} role="alert">
          <strong>Fix these before saving:</strong>
          <ul>
            {(stepIssuesById.where ?? []).map(m => (
              <li key={`w-${m}`}>
                {m}{' '}
                <button
                  type="button"
                  className={styles.naReviewEditLink}
                  onClick={() => onEditStep('where')}
                >Edit</button>
              </li>
            ))}
            {(stepIssuesById.mix ?? []).map(m => (
              <li key={`m-${m}`}>
                {m}{' '}
                <button
                  type="button"
                  className={styles.naReviewEditLink}
                  onClick={() => onEditStep('mix')}
                >Edit</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReviewCard
        title="Application"
        onEdit={() => onEditStep('where')}
      >
        <ReviewRow label="Type"                value={applicationTypeLabel(applicationType)} />
        <ReviewRow label="Date"                value={draft.date || '—'} />
        <ReviewRow label="Start time"          value={draft.startTime || '—'} />
        <ReviewRow label="End time"            value={draft.endTime || '—'} />
        <ReviewRow label="Course"              value={selectedCourse?.shortName ?? selectedCourse?.name ?? '—'} />
        <ReviewRow label="Area treated"        value={draft.area || '—'} />
        <ReviewRow
          label="Area size"
          value={draft.acres > 0
            ? draft.areaUnit === 'square-feet'
              ? `${fmt(draft.acres * SQ_FT_PER_ACRE, 0)} sq ft`
              : `${fmt(draft.acres, 2)} acres`
            : '—'}
        />
        <ReviewRow label="Operator"            value={draft.operator || '—'} />
        <ReviewRow label="Applicator license"  value={draft.applicatorLicense || '—'} />
        <ReviewRow label={isLiquidApplication ? 'Spray rig' : 'Equipment'} value={draft.sprayRig || '—'} />
        <ReviewRow label="Irrigation inches"   value={draft.irrigationInches ? `${draft.irrigationInches} in` : '—'} />
        <ReviewRow label="Irrigation minutes"  value={draft.irrigationMinutes ? `${draft.irrigationMinutes} min` : '—'} />
        <ReviewRow label="Target treatment"    value={targetTreatment || '—'} />
      </ReviewCard>

      <ReviewCard
        title={isLiquidApplication ? 'Tank mix' : 'Products'}
        onEdit={() => onEditStep('mix')}
      >
        <ReviewRow label="Products" value={enrichedRows.length} />
        {isLiquidApplication && (
          <>
            <ReviewRow
              label="Total water"
              value={summary.totalCarrierGal > 0 ? `${fmt(summary.totalCarrierGal, 0)} gal` : '—'}
            />
            <ReviewRow
              label="Tanks required"
              value={summary.loadPlan
                ? `${summary.loadPlan.fullLoads}${summary.loadPlan.hasPartial ? ' full + 1 partial' : ' full'}`
                : '—'}
            />
          </>
        )}
        <ReviewRow label="Estimated cost" value={fmtCurrency(summary.totalCost)} />

        {enrichedRows.length > 0 && (
          <div className={styles.naReviewProducts}>
            <div className={styles.naReviewProductsHead}>
              <span>Product</span>
              <span>Rate</span>
              <span>Qty needed</span>
              <span>Cost</span>
            </div>
            {enrichedRows.map(r => (
              <div key={r.id} className={styles.naReviewProductRow}>
                <span>{r.name || '—'}</span>
                <span>{r.rate ? formatRateLabel(r.rate, r.rateUnit) : '—'}</span>
                <span>
                  {r.qtyNeeded > 0 ? (
                    <span className={styles.naQtyStack}>
                      <span>{fmt(r.qtyNeeded, 2)} {r.qtyUnit}</span>
                      {inventoryQtyLabel(r) && (
                        <span className={styles.naQtyConverted}>{inventoryQtyLabel(r)}</span>
                      )}
                    </span>
                  ) : '—'}
                </span>
                <span>{fmtCurrency(r.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </ReviewCard>

      <ReviewCard
        title="Conditions"
        onEdit={() => onEditStep('conditions')}
      >
        <ReviewRow label="Temperature (°F)"    value={draft.conditions.temp || '—'} />
        <ReviewRow label="Wind speed (mph)"    value={draft.conditions.windSpeedMph || '—'} />
        <ReviewRow label="Wind direction"      value={draft.conditions.windDirection || '—'} />
        <ReviewRow label="Humidity (%)"        value={draft.conditions.humidity || '—'} />
        <ReviewRow label="Soil temperature"    value={draft.conditions.soilTemp || '—'} />
        <ReviewRow label="Wind / notes"        value={draft.conditions.wind || '—'} />
        {draft.observations && (
          <div className={styles.naReviewObservations}>
            <div className={styles.naReviewObservationsLabel}>Observations</div>
            <div className={styles.naReviewObservationsBody}>{draft.observations}</div>
          </div>
        )}
      </ReviewCard>

      <ReviewCard title="Warnings & inventory impact">
        {summary.unitMismatches.length === 0 &&
         !summary.anyInsufficient &&
         (summary.maxRei ?? 0) === 0 && (
          <span className={styles.naUnavailable}>No warnings on this tank mix.</span>
        )}
        {summary.unitMismatches.length > 0 && (
          <div className={styles.naReviewWarn} role="alert">
            <strong>Unit mismatch.</strong>{' '}
            {summary.unitMismatches.length === 1
              ? `${summary.unitMismatches[0].name} rate is in ${summary.unitMismatches[0].rateMeasure} but inventory is in ${summary.unitMismatches[0].invUnit}.`
              : `${summary.unitMismatches.length} products have rate units incompatible with inventory.`}
            {' '}Inventory will be skipped on save for these rows.
          </div>
        )}
        {summary.anyInsufficient && (
          <div className={styles.naReviewWarn} role="alert">
            <strong>Insufficient inventory.</strong> One or more products exceed
            available stock for this tank mix.
          </div>
        )}
        {(summary.maxRei ?? 0) > 0 && (
          <ReviewRow label="REI (post-save)" value={`${summary.maxRei} hrs`} />
        )}

        <div className={styles.naReviewImpact}>
          <button
            type="button"
            className={styles.naNoDeductBox}
            data-active={draft.skipInventoryDeduction ? 'true' : undefined}
            aria-pressed={Boolean(draft.skipInventoryDeduction)}
            onClick={() => onToggleInventoryDeduction?.(!draft.skipInventoryDeduction)}
          >
            <span className={styles.naNoDeductCheck} aria-hidden="true" />
            <span>
              <strong>Do not deduct tank mix from inventory</strong>
              <small>Save the spray record only. Chemicals and products stay unchanged.</small>
            </span>
          </button>
          <div className={styles.naReviewImpactLabel}>Inventory impact on save</div>
          <ul className={styles.naReviewImpactList}>
            {enrichedRows
              .filter(r => r.name && r.qtyNeeded > 0)
              .map(r => {
                const skip = r.inv && r.unitConversion && !r.unitConversion.ok
                const insufficient = r.insufficient
                return (
                  <li key={r.id}>
                    <span>{r.name}</span>
                    <span>
                      {skip
                        ? 'Skipped — unit mismatch'
                        : draft.skipInventoryDeduction
                          ? 'No deduction'
                          : insufficient
                          ? `Insufficient — will deduct up to ${fmt(r.available ?? 0, 1)} ${r.inv?.unit ?? r.qtyUnit}`
                          : `Deduct ${fmt(r.qtyInInv ?? r.qtyNeeded, 2)} ${r.inv?.unit ?? r.qtyUnit}`}
                    </span>
                  </li>
                )
              })}
            {enrichedRows.filter(r => r.name && r.qtyNeeded > 0).length === 0 && (
              <li>No inventory changes.</li>
            )}
          </ul>
        </div>
      </ReviewCard>
    </div>
  )
}

function ReviewCard({ title, onEdit, children }) {
  return (
    <section className={styles.naReviewCard}>
      <header className={styles.naReviewCardHead}>
        <h3 className={styles.naReviewCardTitle}>{title}</h3>
        {onEdit && (
          <button
            type="button"
            className={styles.naReviewEditLink}
            onClick={onEdit}
          >Edit</button>
        )}
      </header>
      <div className={styles.naReviewCardBody}>{children}</div>
    </section>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div className={styles.naReviewRow}>
      <span className={styles.naReviewRowLabel}>{label}</span>
      <span className={styles.naReviewRowValue}>{value}</span>
    </div>
  )
}
