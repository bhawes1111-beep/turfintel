import { useState } from 'react'
import {
  patchInventory,
  refreshInventoryData,
  setInventoryCostBasis,
} from '../../../utils/inventory/inventoryStore'
import { useToast } from '../../../utils/feedback/toastContext'
import {
  calculateContainerInventoryValue,
  calculateContainerTotal,
  calculateUnitCost,
  formatMoney,
  formatInventoryNumber,
  formatInventoryWeightEquivalent,
} from '../../../utils/inventory/containerSize'
import { normalizeNutrientSources } from '../../../utils/inventory/nutrientForms'
import { normalizeDiseaseTargets } from '../../../utils/inventory/diseaseTargets'
import { normalizeNematodeTargets } from '../../../utils/inventory/nematodeTargets'
import { normalizeWeedTargets } from '../../../utils/inventory/weedTargets'
import { normalizeFertilizerCoating } from '../../../utils/inventory/fertilizerCoatings'
import { useEquipmentData } from '../../../utils/equipment/equipmentStore'
import NutrientSourcesEditor from './NutrientSourcesEditor'
import DiseaseTargetsEditor from './DiseaseTargetsEditor'
import NematodeTargetsEditor from './NematodeTargetsEditor'
import WeedTargetsEditor from './WeedTargetsEditor'
import FertilizerCoatingEditor from './FertilizerCoatingEditor'
import PartEquipmentPicker from './PartEquipmentPicker'
import { normalizePartEquipment } from '../../../utils/inventory/partEquipment'
import styles from './EditInventoryQuantityModal.module.css'

const KIND_OPTIONS = [
  { value: 'chemical', label: 'Chemical' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'part', label: 'Part' },
  { value: 'irrigation', label: 'Irrigation' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'product', label: 'Product / other' },
]

const COST_SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'imported', label: 'Imported' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'unknown', label: 'Unknown' },
]

function textValue(value) {
  return value == null ? '' : String(value)
}

function numberValue(value) {
  return value == null ? '' : String(value)
}

function nullableText(value) {
  const next = String(value ?? '').trim()
  return next || null
}

function parseRequiredNumber(value, label) {
  const next = Number(value)
  if (value === '' || value == null || Number.isNaN(next) || !Number.isFinite(next)) {
    throw new Error(`${label} must be a number.`)
  }
  if (next < 0) throw new Error(`${label} cannot be negative.`)
  return next
}

function parseOptionalNumber(value, label) {
  if (value === '' || value == null) return null
  const next = Number(value)
  if (Number.isNaN(next) || !Number.isFinite(next)) {
    throw new Error(`${label} must be a number when set.`)
  }
  if (next < 0) throw new Error(`${label} cannot be negative.`)
  return next
}

function normalizeCostSource(value, costPerUnit) {
  if (costPerUnit == null) return null
  return nullableText(value) || 'manual'
}

function normalizeCostUnit(value, costPerUnit) {
  if (costPerUnit == null) return null
  return nullableText(value)
}

function buildInitialForm(item) {
  const containerSize = textValue(item?.containerSize)
  return {
    name: textValue(item?.name),
    kind: item?.kind || 'product',
    category: textValue(item?.category),
    quantity: numberValue(item?.quantity ?? 0),
    unit: textValue(item?.unit),
    containerCount: textValue(item?.containerCount ?? deriveContainerCount(item)),
    containerSize,
    containerUnit: textValue(item?.containerUnit),
    containerType: textValue(item?.containerType),
    containerPrice: numberValue(item?.containerPrice),
    reorderLevel: numberValue(item?.reorderLevel),
    location: textValue(item?.location),
    vendor: textValue(item?.vendor),
    notes: textValue(item?.notes),
    costPerUnit: numberValue(item?.costPerUnit),
    costUnit: textValue(item?.costUnit),
    costSource: textValue(item?.costSource),
    costNotes: textValue(item?.costNotes),
    manufacturer: textValue(item?.manufacturer),
    epaNumber: textValue(item?.epaNumber),
    expiryDate: textValue(item?.expiryDate),
    partNumber: textValue(item?.partNumber),
    equipment: textValue(item?.equipment),
    equipmentList: normalizePartEquipment(item?.equipmentList ?? item?.equipment),
    analysis: textValue(item?.analysis),
    nitrogenSource: textValue(item?.nitrogenSource),
    nutrientSources: normalizeNutrientSources(item?.nutrientSources),
    diseaseTargets: normalizeDiseaseTargets(item?.diseaseTargets),
    nematodeTargets: normalizeNematodeTargets(item?.nematodeTargets),
    weedTargets: normalizeWeedTargets(item?.weedTargets),
    fertilizerCoating: normalizeFertilizerCoating(item?.fertilizerCoating),
    tankCapacity: numberValue(item?.tankCapacity),
    currentLevel: numberValue(item?.currentLevel),
    lastFill: textValue(item?.lastFill),
    relatedUsage: Array.isArray(item?.relatedUsage)
      ? item.relatedUsage.join('\n')
      : textValue(item?.relatedUsage),
  }
}

function deriveContainerCount(item) {
  const total = Number(item?.quantity)
  const size = Number(item?.containerSize)
  if (!Number.isFinite(total) || !Number.isFinite(size) || size <= 0) return ''
  return formatInventoryNumber(total / size)
}

function costFieldsChanged(item, next) {
  const currentCost = item?.costPerUnit == null ? null : Number(item.costPerUnit)
  const currentUnit = currentCost == null ? null : nullableText(item?.costUnit)
  const currentSource = currentCost == null ? null : (nullableText(item?.costSource) || 'manual')
  const currentNotes = currentCost == null ? null : nullableText(item?.costNotes)
  return currentCost !== next.costPerUnit ||
    currentUnit !== next.costUnit ||
    currentSource !== next.costSource ||
    currentNotes !== next.costNotes
}

function packageInputStarted(form) {
  return Boolean(
    String(form.containerCount ?? '').trim() ||
    String(form.containerSize ?? '').trim() ||
    String(form.containerUnit ?? '').trim() ||
    String(form.containerPrice ?? '').trim()
  )
}

function buildStockPackage(form) {
  if (!packageInputStarted(form)) {
    const quantity = parseRequiredNumber(form.quantity, 'Quantity on hand')
    return {
      quantity,
      unit: nullableText(form.unit),
      containerCount: null,
      containerSize: null,
      containerUnit: null,
      containerPrice: null,
      costPerUnit: null,
    }
  }

  if (!String(form.containerUnit ?? '').trim()) {
    throw new Error('Stock unit is required for the package calculator.')
  }

  const containerCount = parseOptionalNumber(form.containerCount, 'Containers on hand')
  const containerSize = parseOptionalNumber(form.containerSize, 'Size per container')
  const containerPrice = parseOptionalNumber(form.containerPrice, 'Price per container')
  if (containerCount == null) throw new Error('Containers on hand is required.')
  if (containerSize == null || containerSize <= 0) {
    throw new Error('Size per container must be greater than zero.')
  }
  if (containerPrice != null && containerPrice < 0) {
    throw new Error('Price per container cannot be negative.')
  }

  return {
    quantity: calculateContainerTotal(containerCount, containerSize),
    unit: String(form.containerUnit).trim(),
    containerCount,
    containerSize: String(form.containerSize).trim(),
    containerUnit: String(form.containerUnit).trim(),
    containerPrice,
    costPerUnit: calculateUnitCost(containerPrice, containerSize),
  }
}

function stockTotalLabel(form) {
  const total = calculateContainerTotal(form.containerCount, form.containerSize)
  const unit = String(form.containerUnit ?? '').trim()
  if (total == null || !unit) return 'Enter containers, size, and unit to calculate total stock.'
  const equivalent = formatInventoryWeightEquivalent(total, unit)
  return `${formatInventoryNumber(form.containerCount)} x ${formatInventoryNumber(form.containerSize)} ${unit} = ${formatInventoryNumber(total)} ${unit} in inventory${equivalent ? ` (${equivalent})` : ''}`
}

function stockValueLabel(form) {
  const inventoryValue = calculateContainerInventoryValue(form.containerCount, form.containerPrice)
  const unitCost = calculateUnitCost(form.containerPrice, form.containerSize)
  const unit = String(form.containerUnit ?? '').trim()
  if (inventoryValue == null) return 'Enter price per container to calculate inventory value.'
  const unitCostText = unitCost == null || !unit ? '' : ` (${formatMoney(unitCost)} / ${unit})`
  return `${formatMoney(form.containerPrice)} x ${formatInventoryNumber(form.containerCount)} containers = ${formatMoney(inventoryValue)} value${unitCostText}`
}

export default function EditInventoryQuantityModal({ item, onClose, onSaved }) {
  const { equipment } = useEquipmentData()
  const toast = useToast()
  const [form, setForm] = useState(() => buildInitialForm(item))
  const [busy, setBusy] = useState(false)

  if (!item) return null

  function update(patch) {
    setForm(current => ({ ...current, ...patch }))
  }

  async function handleSave() {
    const name = form.name.trim().toUpperCase()
    if (!name) {
      toast.info?.('Product name is required.')
      return
    }
    if (!form.kind) {
      toast.info?.('Inventory type is required.')
      return
    }

    let stockPackage
    let reorderLevel
    let tankCapacity
    let currentLevel
    let formCostPerUnit
    try {
      stockPackage = buildStockPackage(form)
      reorderLevel = parseOptionalNumber(form.reorderLevel, 'Reorder level')
      tankCapacity = parseOptionalNumber(form.tankCapacity, 'Tank capacity')
      currentLevel = parseOptionalNumber(form.currentLevel, 'Current level')
      formCostPerUnit = parseOptionalNumber(form.costPerUnit, 'Cost per unit')
    } catch (err) {
      toast.info?.(err.message)
      return
    }

    const costPerUnit = stockPackage.costPerUnit ?? formCostPerUnit
    const costUnit = stockPackage.costPerUnit != null
      ? stockPackage.unit
      : (form.costUnit.trim() || stockPackage.unit || '')
    if (costPerUnit != null && !costUnit) {
      toast.info?.('Cost unit is required when cost per unit is set.')
      return
    }

    const costPatch = {
      costPerUnit,
      costUnit: normalizeCostUnit(costUnit, costPerUnit),
      costSource: normalizeCostSource(form.costSource, costPerUnit),
      costNotes: costPerUnit == null ? null : nullableText(form.costNotes),
      changeSource: 'manual',
    }

    const payload = {
      kind: form.kind,
      name,
      category: nullableText(form.category),
      quantity: stockPackage.quantity,
      unit: stockPackage.unit,
      containerCount: stockPackage.containerCount,
      containerSize: stockPackage.containerSize,
      containerUnit: stockPackage.containerUnit,
      containerType: null,
      containerPrice: stockPackage.containerPrice,
      reorderLevel,
      location: nullableText(form.location),
      vendor: nullableText(form.vendor),
      notes: nullableText(form.notes),
      manufacturer: form.kind === 'chemical' ? nullableText(form.manufacturer) : null,
      epaNumber: form.kind === 'chemical' ? nullableText(form.epaNumber) : null,
      expiryDate: form.kind === 'chemical' ? nullableText(form.expiryDate) : null,
      partNumber: ['part', 'irrigation'].includes(form.kind) ? nullableText(form.partNumber) : null,
      equipment: form.kind === 'part'
        ? nullableText(form.equipmentList.join(', '))
        : form.kind === 'irrigation' ? nullableText(form.equipment) : null,
      equipmentList: form.kind === 'part' ? form.equipmentList : null,
      analysis: ['chemical', 'fertilizer'].includes(form.kind) ? nullableText(form.analysis) : null,
      nitrogenSource: ['chemical', 'fertilizer'].includes(form.kind) ? nullableText(form.nitrogenSource) : null,
      nutrientSources: ['chemical', 'fertilizer'].includes(form.kind) ? normalizeNutrientSources(form.nutrientSources) : null,
      diseaseTargets: form.kind === 'chemical' ? normalizeDiseaseTargets(form.diseaseTargets) : null,
      nematodeTargets: form.kind === 'chemical' ? normalizeNematodeTargets(form.nematodeTargets) : null,
      weedTargets: form.kind === 'chemical' ? normalizeWeedTargets(form.weedTargets) : null,
      fertilizerCoating: form.kind === 'fertilizer' ? normalizeFertilizerCoating(form.fertilizerCoating) : null,
      tankCapacity: form.kind === 'fuel' ? tankCapacity : null,
      currentLevel: form.kind === 'fuel' ? currentLevel : null,
      lastFill: form.kind === 'fuel' ? nullableText(form.lastFill) : null,
      relatedUsage: form.kind === 'fuel'
        ? form.relatedUsage.split('\n').map(line => line.trim()).filter(Boolean)
        : null,
    }

    setBusy(true)
    try {
      let saved = await patchInventory(item.id, payload)
      if (costFieldsChanged(item, costPatch)) {
        saved = await setInventoryCostBasis(item.id, costPatch)
      }
      refreshInventoryData().catch(() => { /* non-fatal */ })
      toast.success?.(`Updated inventory for ${name}.`)
      onSaved?.(saved)
    } catch (err) {
      toast.error?.(`Update failed: ${err.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  const isChemical = form.kind === 'chemical'
  const isPart = form.kind === 'part'
  const isIrrigation = form.kind === 'irrigation'
  const isFertilizer = form.kind === 'fertilizer'
  const supportsNutrientAnalysis = isChemical || isFertilizer
  const isFuel = form.kind === 'fuel'

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Edit inventory item"
    >
      <div className={styles.modal} data-modal="edit-inventory-quantity">
        <header className={styles.header}>
          <h2 className={styles.title}>Edit item</h2>
          <p className={styles.subtitle}>{item.name}</p>
        </header>

        <div className={styles.body}>
          <fieldset className={styles.section}>
            <legend>Identity</legend>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={e => update({ name: e.target.value.toUpperCase() })}
                aria-label="Inventory item name"
                autoFocus
                disabled={busy}
              />
            </label>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Type</span>
                <select
                  value={form.kind}
                  onChange={e => update({ kind: e.target.value })}
                  aria-label="Inventory type"
                  disabled={busy}
                >
                  {KIND_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Category</span>
                <input
                  type="text"
                  value={form.category}
                  onChange={e => update({ category: e.target.value })}
                  placeholder="Fungicide, filter, diesel..."
                  aria-label="Inventory category"
                  disabled={busy}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.section}>
            <legend>Stock</legend>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Containers</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.containerCount}
                  onChange={e => update({ containerCount: e.target.value })}
                  placeholder="2"
                  aria-label="Containers on hand"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Size each</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.containerSize}
                  onChange={e => update({ containerSize: e.target.value })}
                  placeholder="2.5"
                  aria-label="Size per container"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Unit</span>
                <input
                  type="text"
                  value={form.containerUnit}
                  onChange={e => update({ containerUnit: e.target.value, unit: e.target.value })}
                  placeholder="oz, gal, lb, each"
                  aria-label="Stocking unit"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Price per container</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.containerPrice}
                  onChange={e => update({ containerPrice: e.target.value })}
                  placeholder="400"
                  aria-label="Price per container"
                  disabled={busy}
                />
              </label>
              <div className={`${styles.field} ${styles.calculatedTotal}`}>
                <span className={styles.label}>Total in inventory</span>
                <strong>{stockTotalLabel(form)}</strong>
              </div>
              <div className={`${styles.field} ${styles.calculatedTotal}`}>
                <span className={styles.label}>Inventory value</span>
                <strong>{stockValueLabel(form)}</strong>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Reorder level</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.reorderLevel}
                  onChange={e => update({ reorderLevel: e.target.value })}
                  aria-label="Reorder level"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Vendor</span>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={e => update({ vendor: e.target.value })}
                  aria-label="Vendor"
                  disabled={busy}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Location</span>
              <input
                type="text"
                value={form.location}
                onChange={e => update({ location: e.target.value })}
                aria-label="Storage location"
                disabled={busy}
              />
            </label>
          </fieldset>

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Chemical details</legend>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Manufacturer</span>
                  <input
                    type="text"
                    value={form.manufacturer}
                    onChange={e => update({ manufacturer: e.target.value })}
                    aria-label="Manufacturer"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>EPA number</span>
                  <input
                    type="text"
                    value={form.epaNumber}
                    onChange={e => update({ epaNumber: e.target.value })}
                    aria-label="EPA number"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Expiration date</span>
                  <input
                    type="text"
                    value={form.expiryDate}
                    onChange={e => update({ expiryDate: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    aria-label="Expiration date"
                    disabled={busy}
                  />
                </label>
              </div>
            </fieldset>
          )}

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Disease targets</legend>
              <DiseaseTargetsEditor
                value={form.diseaseTargets}
                onChange={diseaseTargets => update({ diseaseTargets })}
                disabled={busy}
              />
            </fieldset>
          )}

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Weeds controlled</legend>
              <WeedTargetsEditor
                value={form.weedTargets}
                onChange={weedTargets => update({ weedTargets })}
                disabled={busy}
              />
            </fieldset>
          )}

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Nematode targets</legend>
              <NematodeTargetsEditor
                value={form.nematodeTargets}
                onChange={nematodeTargets => update({ nematodeTargets })}
                disabled={busy}
              />
            </fieldset>
          )}

          {isFertilizer && (
            <fieldset className={styles.section}>
              <legend>Coated fertilizer</legend>
              <FertilizerCoatingEditor
                value={form.fertilizerCoating}
                onChange={fertilizerCoating => update({ fertilizerCoating })}
                disabled={busy}
              />
            </fieldset>
          )}

          {supportsNutrientAnalysis && (
            <fieldset className={styles.section}>
              <legend>Nutrient sources</legend>
              <NutrientSourcesEditor
                value={form.nutrientSources}
                onChange={nutrientSources => update({ nutrientSources })}
                disabled={busy}
              />
            </fieldset>
          )}

          {(isPart || isIrrigation) && (
            <fieldset className={styles.section}>
              <legend>{isIrrigation ? 'Irrigation details' : 'Part details'}</legend>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Part number</span>
                  <input
                    type="text"
                    value={form.partNumber}
                    onChange={e => update({ partNumber: e.target.value })}
                    aria-label="Part number"
                    disabled={busy}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{isIrrigation ? 'System / equipment' : 'Equipment'}</span>
                  {isPart ? (
                    <PartEquipmentPicker
                      equipment={equipment}
                      value={form.equipmentList}
                      onChange={equipmentList => update({ equipmentList })}
                      disabled={busy}
                    />
                  ) : (
                    <input
                      type="text"
                      value={form.equipment}
                      onChange={e => update({ equipment: e.target.value })}
                      aria-label="Irrigation system or equipment"
                      disabled={busy}
                    />
                  )}
                </div>
              </div>
            </fieldset>
          )}

          {isFuel && (
            <fieldset className={styles.section}>
              <legend>Fuel details</legend>
              <div className={styles.grid}>
                <label className={styles.field}>
                  <span className={styles.label}>Tank capacity</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.tankCapacity}
                    onChange={e => update({ tankCapacity: e.target.value })}
                    aria-label="Tank capacity"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Current level</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.currentLevel}
                    onChange={e => update({ currentLevel: e.target.value })}
                    aria-label="Current fuel level"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Last fill</span>
                  <input
                    type="text"
                    value={form.lastFill}
                    onChange={e => update({ lastFill: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    aria-label="Last fill date"
                    disabled={busy}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Related usage</span>
                <textarea
                  rows={3}
                  value={form.relatedUsage}
                  onChange={e => update({ relatedUsage: e.target.value })}
                  placeholder="One usage note per line"
                  aria-label="Related usage"
                  disabled={busy}
                />
              </label>
            </fieldset>
          )}

          <fieldset className={styles.section}>
            <legend>Advanced cost basis</legend>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Cost per unit</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.costPerUnit}
                  onChange={e => update({ costPerUnit: e.target.value })}
                  aria-label="Cost per unit"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Cost unit</span>
                <input
                  type="text"
                  value={form.costUnit}
                  onChange={e => update({ costUnit: e.target.value })}
                  placeholder={form.unit || 'oz, gal, lb, each'}
                  aria-label="Cost unit"
                  disabled={busy}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Cost source</span>
                <select
                  value={form.costSource}
                  onChange={e => update({ costSource: e.target.value })}
                  aria-label="Cost source"
                  disabled={busy}
                >
                  <option value="">Manual by default</option>
                  {COST_SOURCE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Cost notes</span>
              <textarea
                rows={2}
                value={form.costNotes}
                onChange={e => update({ costNotes: e.target.value })}
                aria-label="Cost notes"
                disabled={busy}
              />
            </label>
          </fieldset>

          <fieldset className={styles.section}>
            <legend>Notes</legend>
            <label className={styles.field}>
              <span className={styles.label}>General notes</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => update({ notes: e.target.value })}
                aria-label="General inventory notes"
                disabled={busy}
              />
            </label>
          </fieldset>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Save changes'}
          </button>
        </footer>
      </div>
    </div>
  )
}
