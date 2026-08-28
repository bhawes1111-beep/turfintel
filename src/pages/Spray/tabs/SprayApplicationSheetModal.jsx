// Phase S.7b — Read-only full spray application sheet.
//
// Opens when a completed spray row is clicked from the calendar
// workspace. Shows every field the worker exposes via rowToRecord:
//
//   • Header — area / date / status / applicator / start-end / Needs Info
//   • Application details — license, target pest, carrier/total volume,
//     total cost, notes
//   • Weather — temp, humidity, wind summary, soil temp
//   • Sprayed areas — full list with acreage
//   • Products / chemicals — name, type, rate, unit, quantity, EPA #,
//     active ingredients, REI/PHI, product cost snapshots, total cost
//   • Audit footer — record id, created / updated / deleted timestamps
//
// Actions:
//   • Edit — opens the existing S.5a.1 EditSprayRecordModal for safe
//     application fields (S.7b explicitly defers product editing —
//     see PHASE-S.7b audit note for the inventory-ledger gap).
//   • Close
//
// All chrome is read-only. Permission for the Edit affordance is
// driven by `canEdit` prop from the parent (calendar workspace).

import { useMemo, useState } from 'react'
import styles from './SprayApplicationSheetModal.module.css'
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'
// Phase S.7b.2 — Chemical edit mode uses the existing patchSpray()
// helper. The worker's PATCH /api/sprays/:id now accepts a `products`
// payload that triggers replace-and-resnapshot + inventory adjust.
import { patchSpray, deleteSpray } from '../../../utils/sprays/spraysStore'
// Phase S.7c — Refresh inventory store after a delete so the
// restored on-hand quantities surface immediately in the spray
// picker + Inventory tab without a page reload.
import { refreshInventoryData } from '../../../utils/inventory/inventoryStore'
import { normalizeNutrientSources } from '../../../utils/inventory/nutrientForms'
import {
  buildNutrientReleaseSummary,
  buildNutrientTankRows,
  nutrientPercentFromAnalysis,
  parseAnalysisNPK,
} from '../../../utils/sprays/nutrientSummary'
import { useToast } from '../../../utils/feedback/toastContext'
import { useAuth } from '../../../context/AuthContext'
import { useNutrientSamplesData } from '../../../utils/turfHealth/nutrientSamplesStore'
// Phase S.7b.3 — Real product picker. Same shared component
// BuildSpraySheet uses, so added/edited rows carry inventoryItemId
// + productCatalogId out of the gate (S.7b.2 backend can then
// reverse old inventory + deduct new inventory + refresh snapshots).
import SprayProductPicker, {
  mapInventoryItemToProductRow,
  useSprayProductOptions,
} from './SprayProductPicker'
// Phase S.7b.6 — Shared rate math + unit option sets. Same module
// BuildSpraySheet will eventually consume so commit-time math and
// edit-time math stay aligned.
import {
  RATE_UNIT_OPTS,
  TOTAL_USED_UNIT_OPTS,
  rateToTotalUsed,
  totalUsedToRate,
  formatRateLabel,
  rateUnitSpec,
  sumAcresFromRecord,
  normalizeRateUnit,
  roundDisplay,
  defaultRateUnitForInventory,
} from '../../../utils/sprays/rateMath'

function fmt(v, fallback = '—') {
  if (v == null) return fallback
  if (typeof v === 'string' && v.trim() === '') return fallback
  return v
}

function fmtMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `$${Number(v).toFixed(2)}`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString()
  } catch { return iso }
}

function fmtAcres(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

function fmtIrrigation(record) {
  const parts = []
  const inches = Number(record?.irrigationInches)
  const minutes = Number(record?.irrigationMinutes)
  if (Number.isFinite(inches) && inches > 0) parts.push(`${inches.toFixed(2).replace(/\.?0+$/, '')} in`)
  if (Number.isFinite(minutes) && minutes > 0) parts.push(`${Math.round(minutes)} min`)
  return parts.join(' / ') || '—'
}

function formatNutrientSample(sample, sampleId) {
  if (sample) return `${sample.sampleDate} / ${sample.location} / ${sample.sampleType}`
  return sampleId ? 'Linked sample is no longer available' : 'Not linked'
}

function fmtThousandsSqFt(acres) {
  const n = Number(acres)
  if (!Number.isFinite(n)) return '0.00'
  return (n * 43.56).toFixed(2)
}

function fmtProductTotal(p, sprayedAcres = 0) {
  if (p?.quantityUsed == null || p.quantityUsed === '') return '---'
  const normalized = normalizeAppliedProductQuantity(p, sprayedAcres)
  return `${normalized.quantityUsed}${normalized.unit ? ` ${normalized.unit}` : ''}`
}

function canonicalQuantityUnit(unit) {
  const u = String(unit ?? '').trim().toLowerCase()
  if (['lb', 'lbs', 'pound', 'pounds'].includes(u)) return 'lb'
  if (['gal', 'gallon', 'gallons'].includes(u)) return 'gal'
  if (['qt', 'quart', 'quarts'].includes(u)) return 'qt'
  if (['pt', 'pint', 'pints'].includes(u)) return 'pt'
  if (['oz', 'ounce', 'ounces'].includes(u)) return 'oz'
  if (['fl oz', 'floz', 'fluid ounce', 'fluid ounces'].includes(u)) return 'fl oz'
  return u
}

function volumeUnitToOzFactor(unit) {
  const u = canonicalQuantityUnit(unit)
  if (u === 'oz' || u === 'fl oz') return 1
  if (u === 'pt') return 16
  if (u === 'qt') return 32
  if (u === 'gal') return 128
  return null
}

function convertQuantityUnit(qty, fromUnit, toUnit) {
  const amount = Number(qty)
  if (!Number.isFinite(amount)) return null
  const from = canonicalQuantityUnit(fromUnit)
  const to = canonicalQuantityUnit(toUnit)
  if (from === to) return amount
  if (from === 'lb' && to === 'oz') return amount * 16
  if (from === 'oz' && to === 'lb') return amount / 16
  const fromOz = volumeUnitToOzFactor(from)
  const toOz = volumeUnitToOzFactor(to)
  if (fromOz != null && toOz != null) return (amount * fromOz) / toOz
  return null
}

function quantityForInventory(row, inv) {
  const qty = Number(row?.totalUsed)
  if (!Number.isFinite(qty)) return { quantityUsed: null, unit: row?.unit || inv?.unit || null, ok: false }
  if (!inv?.unit) return { quantityUsed: qty, unit: row?.unit || null, ok: true }
  const converted = convertQuantityUnit(qty, row?.unit, inv.unit)
  if (converted == null) {
    return { quantityUsed: qty, unit: row?.unit || null, ok: false }
  }
  return { quantityUsed: converted, unit: inv.unit, ok: true }
}

function costSnapshotsForQuantity(quantityUsed, quantityUnit, inv, fallback = {}) {
  if (quantityUsed == null || quantityUsed === '') {
    return {
      productCostSnapshot: fallback.productCostSnapshot ?? null,
      productCostUnitSnapshot: fallback.productCostUnitSnapshot ?? null,
      totalCostSnapshot: fallback.totalCostSnapshot ?? null,
    }
  }
  const costPerUnit = Number(inv?.costPerUnit)
  const costUnit = inv?.costUnit || inv?.unit || quantityUnit || null
  if (!Number.isFinite(costPerUnit) || costPerUnit <= 0 || !costUnit) {
    return {
      productCostSnapshot: fallback.productCostSnapshot ?? null,
      productCostUnitSnapshot: fallback.productCostUnitSnapshot ?? null,
      totalCostSnapshot: fallback.totalCostSnapshot ?? null,
    }
  }
  const qtyForCost = convertQuantityUnit(quantityUsed, quantityUnit, costUnit)
  if (qtyForCost == null) {
    return {
      productCostSnapshot: costPerUnit,
      productCostUnitSnapshot: costUnit,
      totalCostSnapshot: fallback.totalCostSnapshot ?? null,
    }
  }
  return {
    productCostSnapshot: costPerUnit,
    productCostUnitSnapshot: costUnit,
    totalCostSnapshot: +(qtyForCost * costPerUnit).toFixed(2),
  }
}

function parseSavedRate(rateLabel) {
  if (rateLabel == null || rateLabel === '') return { rate: '', rateUnit: 'oz_per_1000sqft' }
  const s = String(rateLabel).trim()
  const m = s.match(/^([\d.]+)\s*(.*)$/)
  if (!m) return { rate: s, rateUnit: 'oz_per_1000sqft' }
  const tail = m[2].trim().toLowerCase()
  const found = RATE_UNIT_OPTS.find(o => o.label.toLowerCase() === tail)
  return { rate: m[1], rateUnit: found?.value ?? 'oz_per_1000sqft' }
}

function closeEnough(a, b) {
  const left = Number(a)
  const right = Number(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.002)
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

function normalizeAppliedProductQuantity(product, sprayedAcres = 0, parsed = parseSavedRate(product?.rate)) {
  const unit = product?.unit || rateUnitSpec(parsed.rateUnit).measure
  const rawQty = Number(product?.quantityUsed)
  if (!Number.isFinite(rawQty)) return { quantityUsed: product?.quantityUsed ?? '', unit }
  const rate = Number(parsed.rate)
  const acres = Number(sprayedAcres)
  if (!Number.isFinite(rate) || !Number.isFinite(acres) || acres <= 0) {
    return { quantityUsed: rawQty, unit }
  }
  const rateMeasure = rateUnitSpec(parsed.rateUnit).measure
  const expectedNaturalQty = rateToTotalUsed(rate, parsed.rateUnit, acres)
  if (
    canonicalQuantityUnit(unit) !== canonicalQuantityUnit(rateMeasure) &&
    closeEnough(rawQty, expectedNaturalQty)
  ) {
    const converted = convertQuantityUnit(rawQty, rateMeasure, unit)
    if (converted != null) {
      return { quantityUsed: roundDisplay(converted, 4), unit }
    }
  }
  return { quantityUsed: rawQty, unit }
}

function totalUsedToRateWithUnit(totalUsed, totalUnit, rateUnit, acres, inv) {
  const spec = rateUnitSpec(rateUnit)
  if (spec.nutrientRate) {
    const productLb = convertQuantityUnit(totalUsed, totalUnit, 'lb')
    const percent = nutrientPercentForInventory(inv, spec.nutrient)
    if (productLb == null || percent <= 0) return 0
    return totalUsedToRate(productLb * (percent / 100), rateUnit, acres)
  }
  const naturalQty = convertQuantityUnit(totalUsed, totalUnit, spec.measure)
  return totalUsedToRate(naturalQty ?? totalUsed, rateUnit, acres)
}

function rateToTotalUsedWithUnit(rate, rateUnit, totalUnit, acres, inv) {
  const spec = rateUnitSpec(rateUnit)
  let naturalQty = rateToTotalUsed(rate, rateUnit, acres)
  if (spec.nutrientRate) {
    const percent = nutrientPercentForInventory(inv, spec.nutrient)
    if (percent <= 0) return 0
    naturalQty = naturalQty / (percent / 100)
  }
  const converted = convertQuantityUnit(naturalQty, spec.measure, totalUnit)
  return converted ?? naturalQty
}

function nutrientRateBasisLabel(row, inv) {
  const spec = rateUnitSpec(row?.rateUnit)
  if (!spec.nutrientRate) return null
  const percent = nutrientPercentForInventory(inv, spec.nutrient)
  if (percent > 0) return `Using ${roundDisplay(percent, 2)}% ${spec.nutrient}`
  return `Add ${spec.nutrient}% nutrient source in Inventory`
}

function totalUnitOptionsForRate(rateUnit) {
  const rateMeasure = rateUnitSpec(rateUnit).measure
  return TOTAL_USED_UNIT_OPTS.filter(unit => convertQuantityUnit(1, unit.value, rateMeasure) != null)
}

function savedProductNutrientMathRow(product, sprayedAcres, inv) {
  const parsed = parseSavedRate(product?.rate)
  const rateUnit = normalizeRateUnit(product?.rateUnit ?? parsed.rateUnit)
  const rate = Number(parsed.rate)
  const spec = rateUnitSpec(rateUnit)

  if (Number.isFinite(rate) && rate > 0 && sprayedAcres > 0) {
    let qtyNeeded = rateToTotalUsed(rate, rateUnit, sprayedAcres)
    if (spec.nutrientRate) {
      const percent = nutrientPercentForInventory(inv, spec.nutrient)
      qtyNeeded = percent > 0 ? qtyNeeded / (percent / 100) : 0
    }
    if (qtyNeeded > 0) return { inv, qtyNeeded, qtyUnit: spec.measure }
  }

  const applied = normalizeAppliedProductQuantity(product, sprayedAcres, parsed)
  return {
    inv,
    qtyNeeded: Number(applied.quantityUsed) || 0,
    qtyUnit: applied.unit,
  }
}

function formatNutrientTotal(totalPounds) {
  const value = Number(totalPounds)
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${roundDisplay(value, 3)} lb total nutrient`
}

export default function SprayApplicationSheetModal({
  record,
  canEdit = false,
  onEdit,
  onCreateTrainingBrief,
  onClose,
}) {
  // Phase S.7b.2 — Hooks first, then guard. React requires the hooks
  // order to be stable so the early-null return must follow hook calls.
  const toast = useToast()
  const { can } = useAuth()
  const { samples: nutrientSamples } = useNutrientSamplesData()
  const canEditSprays = can('canEditSprays')
  const [editMode, setEditMode]   = useState(false)
  const [draftRows, setDraftRows] = useState(() => [])
  const [editReason, setEditReason] = useState('')
  const [busy, setBusy] = useState(false)
  // Phase S.7c — Delete-confirmation state. Two-step gate so a stray
  // click can't blow away a record that took inventory + compliance
  // snapshots to build.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const ni = recordNeedsInfo(record)
  const c  = record?.conditions ?? {}
  const products = useMemo(
    () => (Array.isArray(record?.products) ? record.products : []),
    [record],
  )
  const areas    = Array.isArray(record?.areas) ? record.areas : []
  const areaLabel = areas.length > 0
    ? areas.map(a => a?.name).filter(Boolean).join(', ')
    : fmt(record?.area ?? record?.applicationName)
  const isGranularApplication = record?.applicationType === 'granular' || String(record?.applicationName ?? record?.carrierVolume ?? '')
    .toLowerCase().includes('granular')
  const applicationTypeLabel = isGranularApplication ? 'Granular' : 'Liquid Spray'
  const linkedNutrientSample = useMemo(
    () => nutrientSamples.find(sample => sample.id === record?.nutrientSampleId) ?? null,
    [nutrientSamples, record?.nutrientSampleId],
  )
  const nutrientSampleLabel = formatNutrientSample(linkedNutrientSample, record?.nutrientSampleId)

  // Phase S.7b.5 — Live inventory lookup so each draft row can show
  // the actual remaining stock for its picked product. Same hook the
  // picker uses; sharing it means there's only one filtered list in
  // memory.
  const inventoryItems = useSprayProductOptions()
  const inventoryById = useMemo(() => {
    const map = new Map()
    for (const it of inventoryItems) map.set(it.id, it)
    return map
  }, [inventoryItems])

  // Phase S.7b.6 — Acreage anchor for bidirectional rate math.
  // Sums every area's acreage on the saved record. When 0, the
  // editor disables auto-calc and shows a warning.
  const sprayedAcres = useMemo(() => sumAcresFromRecord(record), [record])
  const nutrientSummary = useMemo(() => {
    const nutrientRelease = buildNutrientReleaseSummary(
      products.map(product => savedProductNutrientMathRow(
        product,
        sprayedAcres,
        inventoryById.get(product.inventoryItemId),
      )),
    )
    return {
      acres: sprayedAcres,
      nutrientSource: nutrientRelease.sourceCount,
      nutrientReleaseTotals: nutrientRelease.totals,
      nutrientReleaseForms: nutrientRelease.forms,
      nutrientUnsupported: nutrientRelease.unsupported,
      nutrientUnsupportedCount: nutrientRelease.unsupportedCount,
    }
  }, [products, sprayedAcres, inventoryById])
  const nutrientRows = useMemo(
    () => buildNutrientTankRows(nutrientSummary),
    [nutrientSummary],
  )

  if (!record) return null

  // Phase S.7b.5 — Per-row inventory + validation status.
  // Returns one of:
  //   { kind: 'no-link' }                                  — no inventoryItemId
  //   { kind: 'qty-blank' }                                — link, blank totalUsed
  //   { kind: 'qty-invalid' }                              — link, NaN totalUsed
  //   { kind: 'qty-nonpositive' }                          — link, ≤ 0
  //   { kind: 'ok', qty, unit, available, low, outOfStock } — link, valid
  // Phase S.7b.6 — Reads r.totalUsed (renamed from r.quantityUsed
  // in the editor's draft state). Save handler maps totalUsed →
  // quantityUsed in the payload (worker contract unchanged).
  function rowStatus(r) {
    if (!r?.inventoryItemId) return { kind: 'no-link' }
    const totalUsed = r.totalUsed
    if (totalUsed === '' || totalUsed == null) return { kind: 'qty-blank' }
    const qty = Number(totalUsed)
    if (Number.isNaN(qty)) return { kind: 'qty-invalid' }
    if (qty <= 0) return { kind: 'qty-nonpositive' }
    const inv       = inventoryById.get(r.inventoryItemId)
    const normalized = quantityForInventory(r, inv)
    if (!normalized.ok || normalized.quantityUsed == null) return { kind: 'unit-mismatch' }
    const available = inv?.quantity ?? null
    return {
      kind:        'ok',
      qty:         normalized.quantityUsed,
      unit:        normalized.unit || inv?.unit || r.unit || '',
      available,
      low:         available != null && available > 0 && available < normalized.quantityUsed,
      outOfStock:  available != null && available <= 0,
    }
  }

  function startEditingChemicals() {
    setDraftRows(products.map(p => {
      // Phase S.7b.6 — Existing records store rate as a label string
      // ("4 oz / acre") via BuildSpraySheet's formatRateLabel. Parse
      // back to a number + rateUnit so the editor can show editable
      // fields. If the parse fails, keep whatever string was there as
      // a fallback so the data isn't lost.
      const parsedRateInfo = parseSavedRate(p.rate)
      const appliedQuantity = normalizeAppliedProductQuantity(p, sprayedAcres, parsedRateInfo)
      return {
        id:                       p.id,
        name:                     p.name ?? '',
        type:                     p.type ?? '',
        rate:                     parsedRateInfo.rate,
        rateUnit:                 parsedRateInfo.rateUnit,
        // Total used / quantity used. Renamed for the UI but the
        // payload field name stays quantityUsed (worker contract).
        totalUsed:                appliedQuantity.quantityUsed ?? '',
        unit:                     appliedQuantity.unit ?? '',
        inventoryItemId:          p.inventoryItemId ?? null,
        productCatalogId:         p.productCatalogId ?? null,
        epaNumberSnapshot:        p.epaNumberSnapshot ?? null,
        activeIngredientsSnapshot: p.activeIngredientsSnapshot ?? null,
        productCostSnapshot:      p.productCostSnapshot ?? null,
        productCostUnitSnapshot:  p.productCostUnitSnapshot ?? null,
        totalCostSnapshot:        p.totalCostSnapshot ?? null,
        // Phase S.7b.6 — Tracks which of {totalUsed, rate} the user
        // most recently edited. Null on load (means "no auto-calc
        // happened yet"). Bidirectional math only fires after the
        // user actively edits one field — the seed values are left
        // alone so the editor mirrors the saved record.
        lastEdited:               null,
      }
    }))
    setEditReason('')
    setEditMode(true)
  }

  function cancelEditingChemicals() {
    setEditMode(false)
    setDraftRows([])
    setEditReason('')
  }

  function handlePrint() {
    window.print()
  }

  function patchDraftRow(i, patch) {
    setDraftRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  // Phase S.7b.6 — Bidirectional math driven by sprayedAcres + the
  // row's lastEdited tracker. Edits to totalUsed → recompute rate.
  // Edits to rate → recompute totalUsed. Either is skipped when
  // sprayedAcres is 0 (no source of truth for the conversion).
  function editTotalUsed(i, value) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, totalUsed: value, lastEdited: 'totalUsed' }
      if (sprayedAcres > 0) {
        const num = Number(value)
        if (value === '' || !Number.isFinite(num) || num <= 0) {
          next.rate = ''
        } else {
          const inv = inventoryById.get(next.inventoryItemId)
          next.rate = String(roundDisplay(
            totalUsedToRateWithUnit(num, next.unit, next.rateUnit, sprayedAcres, inv),
            3,
          ))
        }
      }
      return next
    }))
  }

  function editRate(i, value) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, rate: value, lastEdited: 'rate' }
      if (sprayedAcres > 0) {
        const num = Number(value)
        if (value === '' || !Number.isFinite(num) || num <= 0) {
          next.totalUsed = ''
        } else {
          const inv = inventoryById.get(next.inventoryItemId)
          next.totalUsed = String(roundDisplay(
            rateToTotalUsedWithUnit(num, next.rateUnit, next.unit, sprayedAcres, inv),
            2,
          ))
        }
      }
      return next
    }))
  }

  // Rate-unit change rebases whichever field was last touched. If the
  // user last edited rate, recompute totalUsed under the new unit.
  // If they last edited totalUsed, recompute rate. If neither has
  // been edited yet (just loaded), leave both values alone.
  function editRateUnit(i, newUnit) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const spec = rateUnitSpec(newUnit)
      const next = {
        ...r,
        rateUnit: newUnit,
        unit: spec.nutrientRate ? 'lb' : r.unit,
      }
      if (sprayedAcres > 0) {
        const inv = inventoryById.get(next.inventoryItemId)
        if (r.lastEdited === 'rate' && r.rate !== '' && Number.isFinite(Number(r.rate))) {
          next.totalUsed = String(roundDisplay(
            rateToTotalUsedWithUnit(Number(r.rate), newUnit, next.unit, sprayedAcres, inv), 2,
          ))
        } else if (r.lastEdited === 'totalUsed' && r.totalUsed !== '' && Number.isFinite(Number(r.totalUsed))) {
          next.rate = String(roundDisplay(
            totalUsedToRateWithUnit(Number(r.totalUsed), next.unit, newUnit, sprayedAcres, inv), 3,
          ))
        }
      }
      return next
    }))
  }

  function editTotalUnit(i, newUnit) {
    setDraftRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const next = { ...r, unit: newUnit }
      if (sprayedAcres > 0) {
        const inv = inventoryById.get(next.inventoryItemId)
        if (r.lastEdited === 'rate' && r.rate !== '' && Number.isFinite(Number(r.rate))) {
          next.totalUsed = String(roundDisplay(
            rateToTotalUsedWithUnit(Number(r.rate), r.rateUnit, newUnit, sprayedAcres, inv), 2,
          ))
        } else if (r.lastEdited === 'totalUsed' && r.totalUsed !== '' && Number.isFinite(Number(r.totalUsed))) {
          next.rate = String(roundDisplay(
            totalUsedToRateWithUnit(Number(r.totalUsed), newUnit, r.rateUnit, sprayedAcres, inv), 3,
          ))
        }
      }
      return next
    }))
  }

  function addDraftRow() {
    setDraftRows(prev => [...prev, {
      // Phase S.7b.6 — New rows seed empty. quantityUsed is renamed
      // to totalUsed in-editor; payload still sends quantityUsed.
      name: '', type: '',
      rate: '', rateUnit: 'oz_per_1000sqft',
      totalUsed: '', unit: 'oz',
      inventoryItemId: null, productCatalogId: null,
      epaNumberSnapshot: null, activeIngredientsSnapshot: null,
      productCostSnapshot: null, productCostUnitSnapshot: null,
      totalCostSnapshot: null,
      lastEdited: null,
    }])
  }
  function removeDraftRow(i) {
    setDraftRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSaveChemicals() {
    const completedApplication = ['completed', 'complete', 'done'].includes(
      String(record.status ?? '').trim().toLowerCase(),
    )
    if (completedApplication && draftRows.length === 0) {
      toast.info?.('Completed spray must have at least one product row.')
      return
    }
    // Phase S.7b.5 — Quantity validation for inventory-linked rows.
    // An inventory-linked row that saves with blank, zero, negative,
    // or non-numeric quantityUsed will silently skip inventory
    // deduction at the worker level. Block save now so the user sees
    // a clean error rather than a "saved" record that left inventory
    // untouched.
    for (const r of draftRows) {
      if (!r.name || !String(r.name).trim()) {
        toast.info?.('Each product row needs a name.')
        return
      }
      if (r.rate !== '' && r.rate != null && Number.isNaN(Number(r.rate))) {
        toast.error?.(`Rate for "${r.name}" must be a number.`)
        return
      }
      if (r.totalUsed !== '' && r.totalUsed != null && Number.isNaN(Number(r.totalUsed))) {
        toast.error?.(`Total used for "${r.name}" must be a number.`)
        return
      }
      // Phase S.7b.6 — Rate unit required when a rate is provided.
      if (r.rate !== '' && r.rate != null && !r.rateUnit) {
        toast.error?.(`Select a rate unit for "${r.name}".`)
        return
      }
      const spec = rateUnitSpec(r.rateUnit)
      if (
        spec.nutrientRate
        && (Number(r.rate) > 0 || Number(r.totalUsed) > 0)
        && nutrientPercentForInventory(inventoryById.get(r.inventoryItemId), spec.nutrient) <= 0
      ) {
        toast.error?.(
          `Add ${spec.nutrient}% nutrient source in Inventory for "${r.name}" before using lb nutrient / 1,000 sq ft.`,
        )
        return
      }
      const status = rowStatus(r)
      if (status.kind === 'qty-invalid') {
        toast.error?.(`Total used for "${r.name}" must be a number.`)
        return
      }
      if (completedApplication && status.kind === 'qty-blank') {
        toast.error?.(`Enter total used or rate for "${r.name}" (linked to inventory).`)
        return
      }
      if (completedApplication && status.kind === 'qty-nonpositive') {
        toast.error?.(`Total used for "${r.name}" must be greater than 0.`)
        return
      }
      if (completedApplication && status.kind === 'unit-mismatch') {
        toast.error?.(`Total used unit for "${r.name}" cannot be converted to the inventory unit.`)
        return
      }
    }
    if (completedApplication && !editReason.trim()) {
      const proceed = window.confirm(
        'No reason for chemical change provided. Continue without an audit note?',
      )
      if (!proceed) return
    }
    setBusy(true)
    try {
      const payload = {
        products: draftRows.map(r => {
          const inv = inventoryById.get(r.inventoryItemId)
          const normalized = quantityForInventory(r, inv)
          const quantityUsed = r.totalUsed === '' || r.totalUsed == null
            ? null
            : normalized.quantityUsed
          const quantityUnit = quantityUsed == null
            ? (r.unit || null)
            : (normalized.unit || r.unit || null)
          const costSnapshots = costSnapshotsForQuantity(quantityUsed, quantityUnit, inv, r)
          return {
            id:                       r.id,
            name:                     String(r.name).trim(),
            type:                     r.type || null,
          // Phase S.7b.6 — Save the rate as a formatted label string
          // ("4 oz / acre") to match BuildSpraySheet's commit-time
          // shape (formatRateLabel). The worker writes spray_products.rate
          // as text so the read mapper renders the same string everywhere.
          rate:                     r.rate === '' || r.rate == null ? null : formatRateLabel(r.rate, r.rateUnit),
          rateUnit:                 r.rateUnit ?? null,
          // totalUsed → quantityUsed mapping (worker contract unchanged).
            quantityUsed,
            unit:                     quantityUnit,
          inventoryItemId:          r.inventoryItemId,
          productCatalogId:         r.productCatalogId,
          epaNumberSnapshot:        r.epaNumberSnapshot,
          activeIngredientsSnapshot: r.activeIngredientsSnapshot,
            ...costSnapshots,
          }
        }),
      }
      if (editReason.trim()) payload.editReason = editReason.trim()
      await patchSpray(record.id, payload)
      toast.success?.(`Updated chemicals for spray on ${record.date}`)
      setEditMode(false)
      setDraftRows([])
      setEditReason('')
    } catch (err) {
      toast.error?.(`Update failed: ${err.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  // Phase S.7c — Soft-delete via existing deleteSpray pipeline. The
  // worker (deleteSpray in worker/api/sprays.js) walks
  // inventory_usage WHERE source_id = ? AND reverted_at IS NULL,
  // restores inventory_items.quantity, marks reverted_at, and marks
  // the spray status='deleted'. Sheet closes on success; calendar +
  // Records + spray picker all refresh via the existing store contract.
  async function handleDeleteSpray() {
    if (deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteSpray(record.id)
      // Force-refresh inventory so the restored on-hand quantities
      // surface in the spray picker + Inventory tab immediately.
      refreshInventoryData().catch(() => { /* non-fatal */ })
      toast.success?.(`Spray on ${record.date} deleted · inventory restored`)
      setDeleteConfirmOpen(false)
      // Closing the sheet by clearing viewingRecordId in the parent
      // is the cleanest path — the parent watches the store, sees
      // the deleted record vanish from the list, and the sheet
      // unmounts naturally. Calling onClose explicitly to be safe.
      onClose?.()
    } catch (err) {
      toast.error?.(`Delete failed: ${err.message ?? err}`)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Application record sheet"
    >
      <div className={styles.modal} data-modal="spray-application-sheet">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <h2 className={styles.headerTitle}>
              {fmt(record.area, 'Application record')}
            </h2>
            <p className={styles.headerSub}>
              <span>{fmt(record.date)}</span>
              <span> · </span>
              <span className={styles.statusChip} data-status={record.status ?? 'unknown'}>
                {fmt(record.status)}
              </span>
              {record.applicator && (
                <>
                  <span> · </span>
                  <span>{record.applicator}</span>
                </>
              )}
              {(record.startTime || record.endTime) && (
                <>
                  <span> · </span>
                  <span>
                    {fmt(record.startTime)}{record.endTime ? ` → ${record.endTime}` : ''}
                  </span>
                </>
              )}
              {ni && (
                <>
                  <span> · </span>
                  <span className={styles.needsInfoBadge}>Needs info</span>
                </>
              )}
            </p>
          </div>
          <div className={styles.headerActions}>
            {canEdit && !editMode && (
              <button type="button" className={styles.btnPrimary} onClick={() => onEdit?.(record)}>
                Edit
              </button>
            )}
            {!editMode && (
              <button type="button" className={styles.btnSecondary} onClick={handlePrint}>
                Print
              </button>
            )}
            {canEdit && !editMode && onCreateTrainingBrief && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onCreateTrainingBrief(record)}
              >
                Training Brief
              </button>
            )}
            {/* Phase S.7b.2 — Chemical edit mode. Hidden for read-only
                users; disabled while a save is in flight. */}
            {canEdit && canEditSprays && !editMode && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={startEditingChemicals}
                aria-label="Edit products on this application"
              >
                Edit products
              </button>
            )}
            {/* Phase S.7c — Delete Spray. Gated behind canEditSprays;
                opens a confirmation modal before the actual delete. */}
            {canEdit && canEditSprays && !editMode && (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => setDeleteConfirmOpen(true)}
                aria-label="Delete this application record"
              >
                Delete Application
              </button>
            )}
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={busy}
            >
              Close
            </button>
          </div>
        </header>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* Application details */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Application details</h3>
            <dl className={styles.kvGrid}>
              <KV label="Applicator license" value={fmt(record.applicatorLicense)} />
              <KV label="Type"               value={applicationTypeLabel} />
              <KV label="Nutrient sample"    value={nutrientSampleLabel} />
              <KV label="Equipment"          value={fmt(record.equipmentName)} />
              <KV label="Tank capacity"      value={record.tankCapacity != null ? `${record.tankCapacity} gal` : 'â€”'} />
              <KV label="Target treatment"   value={fmt(record.target ?? record.targetPest)} />
              <KV label="Carrier volume"     value={isGranularApplication ? '—' : fmt(record.carrierVolume)} />
              <KV label="Total volume"       value={isGranularApplication ? '—' : fmt(record.totalVolume)} />
              <KV label="Total cost"         value={fmtMoney(record.totalCostSnapshot)} />
              <KV label="Irrigation"         value={fmtIrrigation(record)} />
              <KV label="REI"                value={record.rei != null ? `${record.rei} h` : '—'} />
              <KV label="PHI"                value={record.phi != null ? `${record.phi} d` : '—'} />
              <KV label="Holes"              value={fmt(record.holes)} />
            </dl>
            {record.notes && (
              <div className={styles.notesBlock}>
                <div className={styles.notesLabel}>Notes</div>
                <p className={styles.notesText}>{record.notes}</p>
              </div>
            )}
          </section>

          {/* Weather */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Conditions at application</h3>
            <dl className={styles.kvGrid}>
              <KV label="Temperature"   value={c.temp     != null ? `${c.temp}°F`     : '—'} />
              <KV label="Humidity"      value={c.humidity != null ? `${c.humidity}%`  : '—'} />
              <KV label="Wind speed"    value={c.windSpeedMph != null ? `${c.windSpeedMph} mph` : '—'} />
              <KV label="Wind direction" value={fmt(c.windDirection)} />
              <KV label="Wind notes"    value={fmt(c.wind)} />
              <KV label="Soil temp"     value={c.soilTemp != null ? `${c.soilTemp}°F` : '—'} />
            </dl>
          </section>

          {/* Areas */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Applied areas ({areas.length})</h3>
            {areas.length === 0 ? (
              <p className={styles.emptyMsg}>No area rows recorded.</p>
            ) : (
              <ul className={styles.areaList}>
                {areas.map(a => (
                  <li key={a.id ?? a.name} className={styles.areaRow}>
                    <span className={styles.areaName}>{fmt(a.name)}</span>
                    {a.acreage != null && (
                      <span className={styles.areaAcres}>{a.acreage} ac</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {nutrientRows.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Nutrient breakdown</h3>
              <div className={styles.nutrientGrid}>
                {nutrientRows.map(row => (
                  <article key={row.key} className={styles.nutrientRow}>
                    <div className={styles.nutrientHeader}>
                      <span className={styles.nutrientBadge}>{row.key}</span>
                      <strong className={styles.nutrientName}>{row.label}</strong>
                    </div>
                    <div className={styles.nutrientRate}>{row.value}</div>
                    {row.totalPounds > 0 && (
                      <div className={styles.nutrientTotal}>{formatNutrientTotal(row.totalPounds)}</div>
                    )}
                    {row.forms.length > 0 && (
                      <div className={styles.nutrientForms}>{row.forms.join(', ')}</div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Products — view OR edit mode */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Products / chemicals ({editMode ? draftRows.length : products.length})
            </h3>

            {editMode ? (
              <>
                {/* Phase S.7b.2 — Inline editor. Worker handles
                    inventory reversal+reapply + snapshot resolution +
                    total_cost_snapshot recompute. */}
                <div className={styles.chemEditWarn}>
                  Editing products will reverse the inventory for the previous
                  product list, apply the new products, refresh snapshots, and
                  recalculate the record total cost. This change is logged in
                  the record's notes.
                </div>
                {/* Phase S.7b.6 — Acreage anchor. Drives bidirectional
                    rate math across every chemical row. Read-only;
                    sourced from the saved record's areas. */}
                <div className={sprayedAcres > 0 ? styles.chemAcresBanner : styles.chemAcresBannerWarn} role="status">
                  {sprayedAcres > 0
                    ? <>Total area applied: <strong>{roundDisplay(sprayedAcres, 2)} acres</strong> · enter Total Used OR Rate; the other auto-calculates.</>
                    : <>Area acreage unavailable — rate math cannot auto-calculate. Enter Total Used directly.</>
                  }
                </div>
                {draftRows.length === 0 ? (
                  <p className={styles.emptyMsg}>No product rows in this draft. Add one to continue.</p>
                ) : (
                  <ul className={styles.chemEditList}>
                    {draftRows.map((r, i) => (
                      <li key={i} className={styles.chemEditCard}>
                        {/* ── Top row: product picker + type + remove ── */}
                        <div className={styles.chemTopRow}>
                          <label className={styles.chemTopField}>
                            <span className={styles.chemEditLabel}>Product</span>
                            <SprayProductPicker
                              value={r.inventoryItemId ?? ''}
                              onChange={(inv) => {
                                const patch = mapInventoryItemToProductRow(inv)
                                if (patch) {
                                  // Selecting a new inventory item resets per-row
                                  // snapshots so the S.7b.2 worker re-enriches them.
                                  // Also seed totalUsed unit from inventory unit.
                                  const nextRateUnit = defaultRateUnitForInventory(inv)
                                  const spec = rateUnitSpec(nextRateUnit)
                                  const nextUnit = spec.nutrientRate
                                    ? 'lb'
                                    : (patch.unit || r.unit || 'oz')
                                  const recalcPatch = {}
                                  if (sprayedAcres > 0 && r.lastEdited === 'rate' && r.rate !== '' && Number.isFinite(Number(r.rate))) {
                                    recalcPatch.totalUsed = String(roundDisplay(
                                      rateToTotalUsedWithUnit(Number(r.rate), nextRateUnit, nextUnit, sprayedAcres, inv),
                                      2,
                                    ))
                                  } else if (sprayedAcres > 0 && r.lastEdited === 'totalUsed' && r.totalUsed !== '' && Number.isFinite(Number(r.totalUsed))) {
                                    recalcPatch.rate = String(roundDisplay(
                                      totalUsedToRateWithUnit(Number(r.totalUsed), nextUnit, nextRateUnit, sprayedAcres, inv),
                                      3,
                                    ))
                                  }
                                  patchDraftRow(i, {
                                    ...patch,
                                    rateUnit: nextRateUnit,
                                    unit: nextUnit,
                                    ...recalcPatch,
                                    epaNumberSnapshot:        null,
                                    activeIngredientsSnapshot: null,
                                    productCostSnapshot:      null,
                                    productCostUnitSnapshot:  null,
                                  })
                                } else {
                                  patchDraftRow(i, { inventoryItemId: null, productCatalogId: null })
                                }
                              }}
                              ariaLabel={`Product ${i + 1} selection`}
                            />
                          </label>
                          <label className={styles.chemTopFieldNarrow}>
                            <span className={styles.chemEditLabel}>Type</span>
                            <input
                              type="text"
                              value={r.type ?? ''}
                              onChange={e => patchDraftRow(i, { type: e.target.value })}
                              placeholder="Fungicide…"
                              aria-label={`Product ${i + 1} type`}
                            />
                          </label>
                          <button
                            type="button"
                            className={styles.chemRemoveBtn}
                            onClick={() => removeDraftRow(i)}
                            aria-label={`Remove product ${i + 1}`}
                          >
                            Remove
                          </button>
                        </div>

                        {/* ── Calculation row ── */}
                        <div className={styles.chemCalcRow}>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Total used</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.totalUsed ?? ''}
                              onChange={e => editTotalUsed(i, e.target.value)}
                              aria-label={`Product ${i + 1} total used`}
                              placeholder="0.00"
                            />
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Total unit</span>
                            <select
                              value={r.unit ?? 'oz'}
                              onChange={e => editTotalUnit(i, e.target.value)}
                              aria-label={`Product ${i + 1} total used unit`}
                            >
                              {totalUnitOptionsForRate(r.rateUnit).map(u => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Rate</span>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={r.rate ?? ''}
                              onChange={e => editRate(i, e.target.value)}
                              aria-label={`Product ${i + 1} rate`}
                              placeholder="0.000"
                            />
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Rate unit</span>
                            <select
                              value={normalizeRateUnit(r.rateUnit)}
                              onChange={e => editRateUnit(i, e.target.value)}
                              aria-label={`Product ${i + 1} rate unit`}
                            >
                              {RATE_UNIT_OPTS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.chemCalcField}>
                            <span className={styles.chemEditLabel}>Area applied</span>
                            <input
                              type="text"
                              value={sprayedAcres > 0 ? `${roundDisplay(sprayedAcres, 2)} ac` : '—'}
                              readOnly
                              aria-label="Total area applied (read-only)"
                              className={styles.chemReadOnly}
                            />
                          </label>
                        </div>

                        {/* ── Status row ── */}
                        <div className={styles.chemStatusRow}>
                          {sprayedAcres === 0 && (
                            <span className={styles.chemStatusHint} role="status">
                              Area acreage unavailable — enter total used directly; rate math is disabled.
                            </span>
                          )}
                          {(() => {
                            const inv = inventoryById.get(r.inventoryItemId)
                            const label = nutrientRateBasisLabel(r, inv)
                            if (!label) return null
                            const spec = rateUnitSpec(r.rateUnit)
                            const missing = spec.nutrientRate
                              && nutrientPercentForInventory(inv, spec.nutrient) <= 0
                            return (
                              <span className={missing ? styles.chemBlockingWarn : styles.chemStatusHint} role="status">
                                {label}
                              </span>
                            )
                          })()}
                          {(() => {
                            const s = rowStatus(r)
                            if (s.kind === 'no-link') {
                              return (
                                <span className={styles.chemNoInventoryWarn} role="status">
                                  Not linked to inventory — record will save but no inventory deduction.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-blank') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Enter total used or rate to calculate inventory deduction.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-invalid') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Total used must be a number.
                                </span>
                              )
                            }
                            if (s.kind === 'qty-nonpositive') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Total used must be greater than 0 to deduct inventory.
                                </span>
                              )
                            }
                            if (s.kind === 'unit-mismatch') {
                              return (
                                <span className={styles.chemBlockingWarn} role="status">
                                  Total used unit cannot be converted to this product's inventory unit.
                                </span>
                              )
                            }
                            // kind === 'ok'
                            return (
                              <span className={styles.chemStatusLine} role="status">
                                Will deduct {s.qty}{s.unit ? ` ${s.unit}` : ''} from inventory
                                {s.available != null && ` · ${s.available}${s.unit ? ` ${s.unit}` : ''} on hand`}
                                {s.outOfStock && (
                                  <span className={styles.chemStatusSubWarn}>
                                    {' · '}Selected product has 0 on hand.
                                  </span>
                                )}
                                {!s.outOfStock && s.low && (
                                  <span className={styles.chemStatusSubWarn}>
                                    {' · '}Insufficient stock for full deduction.
                                  </span>
                                )}
                              </span>
                            )
                          })()}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.chemEditAddRow}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={addDraftRow}
                    aria-label="Add another product row"
                  >
                    + Add product
                  </button>
                </div>

                <label className={styles.chemReasonField}>
                  <span className={styles.chemReasonLabel}>Reason for product change</span>
                  <textarea
                    rows={2}
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    placeholder="e.g. corrected rate for Daconil"
                    aria-label="Reason for product change"
                  />
                </label>

                <div className={styles.chemEditActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={handleSaveChemicals}
                    disabled={busy}
                  >
                    {busy ? 'Saving…' : 'Save products'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={cancelEditingChemicals}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : products.length === 0 ? (
              <p className={styles.emptyMsg}>No product rows recorded.</p>
            ) : (
              <div className={styles.productList}>
                {products.map(p => (
                  <article key={p.id ?? p.name} className={styles.productCard}>
                    <header className={styles.productHeader}>
                      <h4 className={styles.productName}>{fmt(p.name)}</h4>
                      {p.type && <span className={styles.productType}>{p.type}</span>}
                    </header>
                    <dl className={styles.productKvGrid}>
                      <KV label="Rate"     value={p.rate != null ? `${p.rate}` : '—'} />
                      <KV label="Rate unit" value={fmt(p.unit)} />
                      <KV label="Quantity used" value={fmtProductTotal(p, sprayedAcres)} />
                      <KV label="EPA #"   value={fmt(p.epaNumberSnapshot)} />
                      <KV label="Active ingredients" value={fmt(p.activeIngredientsSnapshot)} />
                      <KV label="Product cost"
                          value={p.productCostSnapshot != null
                            ? `${fmtMoney(p.productCostSnapshot)}${p.productCostUnitSnapshot ? ` / ${p.productCostUnitSnapshot}` : ''}`
                            : '—'} />
                      <KV label="Total cost" value={fmtMoney(p.totalCostSnapshot)} />
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Audit footer */}
          <section className={styles.audit}>
            <span><strong>Record id:</strong> {record.id}</span>
            <span><strong>Created:</strong> {fmtDateTime(record.createdAt)}</span>
            <span><strong>Updated:</strong> {fmtDateTime(record.updatedAt)}</span>
            {record.deletedAt && (
              <span className={styles.auditDeleted}>
                <strong>Deleted:</strong> {fmtDateTime(record.deletedAt)} by {fmt(record.deletedBy, 'system')}
              </span>
            )}
          </section>
        </div>
      </div>

      {/* Phase S.7c — Delete confirmation dialog. Nested inside the
          sheet's backdrop element so it sits above the sheet visually
          while reusing the dialog stacking context. */}
      <SprayPrintSheet
        record={record}
        products={products}
        areas={areas}
        areaLabel={areaLabel}
        sprayedAcres={sprayedAcres}
        conditions={c}
        nutrientRows={nutrientRows}
        nutrientSampleLabel={nutrientSampleLabel}
      />

      {deleteConfirmOpen && (
        <div
          className={styles.deleteConfirmBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete application"
        >
          <div className={styles.deleteConfirmModal} data-modal="delete-spray-confirm">
            <h3 className={styles.deleteConfirmTitle}>Delete this application record?</h3>
            <p className={styles.deleteConfirmBody}>
              Inventory used by this application will be restored to on-hand quantities.
              This will remove the application from the calendar and Records tab.
              <br />
              <strong>This action cannot be undone easily</strong> — re-creating the
              record requires a fresh application entry.
            </p>
            <div className={styles.deleteConfirmActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleDeleteSpray}
                disabled={deleteBusy}
                aria-label="Confirm delete this application record"
              >
                {deleteBusy ? 'Deleting…' : 'Delete application + restore inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  )
}

function SprayPrintSheet({ record, products, areas, areaLabel, sprayedAcres, conditions, nutrientRows, nutrientSampleLabel }) {
  const target = record?.target ?? record?.targetPest ?? '---'
  const isGranularApplication = String(record?.applicationName ?? record?.carrierVolume ?? '')
    .toLowerCase()
    .includes('granular')
  const weatherSummary = [
    conditions?.temp != null ? `${conditions.temp} F` : null,
    conditions?.humidity != null ? `RH ${conditions.humidity}%` : null,
  ].filter(Boolean).join('; ') || '---'
  const windSummary = [
    conditions?.windDirection,
    conditions?.windSpeedMph != null ? `${conditions.windSpeedMph} mph` : null,
    conditions?.wind,
  ].filter(Boolean).join(' - ') || '---'
  const areasText = areas.length > 0
    ? areas.map(a => `${fmt(a.name)}${a.acreage != null ? ` (${a.acreage} ac)` : ''}`).join(', ')
    : fmt(areaLabel)

  return (
    <article className={styles.printSheet} aria-hidden="true">
      <header className={styles.printHeader}>
        <h1>Crosswinds Golf Club - Application Record</h1>
      </header>

      <section className={styles.printInfoGrid}>
        <PrintField label="Application Date" value={fmt(record?.date)} />
        <PrintField label="Location" value={fmt(record?.course, 'Crosswinds Golf Club')} />
        <PrintField label="Target Site" value={fmt(areaLabel)} />
        <PrintField
          label="Area Treated"
          value={`${fmtAcres(sprayedAcres)} acres (${fmtThousandsSqFt(sprayedAcres)} thousand sq ft)`}
        />
        <PrintField label="Application Type" value={isGranularApplication ? 'Granular' : 'Liquid Spray'} />
        <PrintField label="Nutrient Sample" value={nutrientSampleLabel} />
        <PrintField label="Carrier Volume" value={isGranularApplication ? '---' : fmt(record?.carrierVolume)} />
        <PrintField label="Target Treatment / Purpose" value={fmt(target)} />
      </section>

      <table className={styles.printProductTable}>
        <thead>
          <tr>
            <th>Product</th>
            <th>Rate</th>
            <th>Total Amount Applied</th>
          </tr>
        </thead>
        <tbody>
          {products.length > 0 ? products.map(p => (
            <tr key={p.id ?? p.name}>
              <td>{fmt(p.name)}</td>
              <td>{fmt(p.rate)}</td>
              <td>{fmtProductTotal(p, sprayedAcres)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={3}>No products recorded.</td>
            </tr>
          )}
        </tbody>
      </table>

      {nutrientRows.length > 0 && (
        <>
          <h2 className={styles.printSectionTitle}>Nutrient Breakdown</h2>
          <table className={styles.printProductTable}>
            <thead>
              <tr>
                <th>Nutrient</th>
                <th>Rate per 1,000 sq ft</th>
                <th>Total Nutrient</th>
                <th>Forms</th>
              </tr>
            </thead>
            <tbody>
              {nutrientRows.map(row => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                  <td>{formatNutrientTotal(row.totalPounds) || 'Not quantified'}</td>
                  <td>{row.forms.join(', ') || 'Not specified'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className={styles.printSectionTitle}>Application and Weather Record</h2>
      <section className={styles.printInfoGrid}>
        <PrintField label="Applicator" value={fmt(record?.applicator)} />
        <PrintField label="Certification #" value={fmt(record?.applicatorLicense)} />
        <PrintField label="Start Time" value={fmt(record?.startTime)} />
        <PrintField label="Finish Time" value={fmt(record?.endTime)} />
        <PrintField label="Temperature / RH" value={weatherSummary} />
        <PrintField label="Sky / Weather" value={fmt(conditions?.wind)} />
        <PrintField label="Wind" value={windSummary} />
        <PrintField label="Weather Source" value="Live weather / field observation" />
        <PrintField label="Application Equipment" value={fmt(record?.equipment ?? record?.sprayRig)} />
        <PrintField label="Equipment ID" value="________________________" />
        <PrintField label="Irrigation After Application" value={fmtIrrigation(record)} />
        <PrintField label="Unexpected Occurrences" value="None / ________________" />
      </section>

      <section className={styles.printNotes}>
        <p><strong>Applied Areas:</strong> {areasText}</p>
        <p><strong>Application Notes:</strong> {fmt(record?.notes, '')}</p>
        <p><strong>Follow-up Observations:</strong></p>
      </section>

      <footer className={styles.printFooter}>
        <span>Applicator Signature ____________________________________</span>
        <span>Date Reviewed ________________</span>
      </footer>
      <div className={styles.printPageFoot}>
        Crosswinds Golf Club - Application Record Page 1
      </div>
    </article>
  )
}

function PrintField({ label, value }) {
  return (
    <div className={styles.printField}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
