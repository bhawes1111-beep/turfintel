import { useState } from 'react'
import {
  createInventory,
  refreshInventoryData,
  setInventoryCostBasis,
} from '../../../utils/inventory/inventoryStore'
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

const EMPTY_FORM = () => ({
  name: '',
  kind: 'chemical',
  category: '',
  quantity: '',
  unit: '',
  containerCount: '',
  containerSize: '',
  containerUnit: '',
  containerType: '',
  containerPrice: '',
  reorderLevel: '',
  location: '',
  vendor: '',
  notes: '',
  costPerUnit: '',
  costUnit: '',
  costSource: '',
  costNotes: '',
  manufacturer: '',
  epaNumber: '',
  expiryDate: '',
  partNumber: '',
  equipment: '',
  equipmentList: [],
  analysis: '',
  nitrogenSource: '',
  nutrientSources: [],
  diseaseTargets: [],
  nematodeTargets: [],
  weedTargets: [],
  fertilizerCoating: normalizeFertilizerCoating(null),
  tankCapacity: '',
  currentLevel: '',
  lastFill: '',
  relatedUsage: '',
})

function nullableText(value) {
  const next = String(value ?? '').trim()
  return next || null
}

function parseOptionalNumber(value, label) {
  if (value === '' || value == null) return null
  const next = Number(value)
  if (!Number.isFinite(next)) throw new Error(`${label} must be a number when set.`)
  if (next < 0) throw new Error(`${label} cannot be negative.`)
  return next
}

function parseOptionalPositiveNumber(value, label) {
  if (value === '' || value == null) return null
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) {
    throw new Error(`${label} must be a positive number when set.`)
  }
  return next
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
    return {
      quantity: 0,
      unit: null,
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
  const containerSize = parseOptionalPositiveNumber(form.containerSize, 'Size per container')
  const containerPrice = parseOptionalPositiveNumber(form.containerPrice, 'Price per container')
  if (containerCount == null) throw new Error('Containers on hand is required.')
  if (containerSize == null) throw new Error('Size per container is required.')

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

export default function ManualProductForm({ onSaved, onCancel }) {
  const { equipment } = useEquipmentData()
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  function update(patch) {
    setForm(current => ({ ...current, ...patch }))
  }

  async function submit(e) {
    e?.preventDefault?.()
    setErr(null)

    const name = form.name.trim().toUpperCase()
    if (!name) {
      setErr('Product name is required.')
      return
    }
    if (!form.kind) {
      setErr('Inventory type is required.')
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
      formCostPerUnit = parseOptionalPositiveNumber(form.costPerUnit, 'Cost per unit')
    } catch (error) {
      setErr(error.message)
      return
    }

    const costPerUnit = stockPackage.costPerUnit ?? formCostPerUnit
    const costUnit = stockPackage.costPerUnit != null
      ? stockPackage.unit
      : (form.costUnit.trim() || stockPackage.unit || '')
    if (costPerUnit != null && !costUnit) {
      setErr('Cost unit is required when cost per unit is set.')
      return
    }

    setSubmitting(true)
    try {
      let saved = await createInventory({
        kind: form.kind,
        name,
        category: nullableText(form.category),
        quantity: stockPackage.quantity ?? 0,
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
      })

      if (costPerUnit != null) {
        saved = await setInventoryCostBasis(saved.id, {
          costPerUnit,
          costUnit,
          costSource: nullableText(form.costSource),
          costNotes: nullableText(form.costNotes),
          changeSource: 'manual',
        })
      }

      refreshInventoryData().catch(() => { /* non-fatal */ })
      setForm(EMPTY_FORM())
      onSaved?.(saved)
    } catch (error) {
      setErr(error?.message ?? String(error))
    } finally {
      setSubmitting(false)
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
      aria-label="Add inventory product manually"
    >
      <form className={styles.modal} onSubmit={submit} data-modal="add-inventory-product">
        <header className={styles.header}>
          <h2 className={styles.title}>Add product</h2>
          <p className={styles.subtitle}>Manual inventory entry</p>
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
                placeholder="Daconil Action"
                aria-label="Inventory item name"
                autoFocus
                disabled={submitting}
              />
            </label>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Type</span>
                <select
                  value={form.kind}
                  onChange={e => update({ kind: e.target.value })}
                  aria-label="Inventory type"
                  disabled={submitting}
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
                  disabled={submitting}
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
                  min="0"
                  step="0.01"
                  value={form.containerCount}
                  onChange={e => update({ containerCount: e.target.value })}
                  placeholder="2"
                  aria-label="Containers on hand"
                  disabled={submitting}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Size each</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.containerSize}
                  onChange={e => update({ containerSize: e.target.value })}
                  placeholder="2.5"
                  aria-label="Size per container"
                  disabled={submitting}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Unit</span>
                <input
                  type="text"
                  value={form.containerUnit}
                  onChange={e => update({ containerUnit: e.target.value, unit: e.target.value })}
                  placeholder="gal, oz, lb, each"
                  aria-label="Stocking unit"
                  disabled={submitting}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Price per container</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.containerPrice}
                  onChange={e => update({ containerPrice: e.target.value })}
                  placeholder="400"
                  aria-label="Price per container"
                  disabled={submitting}
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
                  min="0"
                  step="0.01"
                  value={form.reorderLevel}
                  onChange={e => update({ reorderLevel: e.target.value })}
                  aria-label="Reorder level"
                  disabled={submitting}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Vendor</span>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={e => update({ vendor: e.target.value })}
                  aria-label="Vendor"
                  disabled={submitting}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Location</span>
              <input
                type="text"
                value={form.location}
                onChange={e => update({ location: e.target.value })}
                placeholder="Maintenance shed"
                aria-label="Storage location"
                disabled={submitting}
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
                    disabled={submitting}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>EPA number</span>
                  <input
                    type="text"
                    value={form.epaNumber}
                    onChange={e => update({ epaNumber: e.target.value })}
                    aria-label="EPA number"
                    disabled={submitting}
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
                    disabled={submitting}
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
                disabled={submitting}
              />
            </fieldset>
          )}

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Weeds controlled</legend>
              <WeedTargetsEditor
                value={form.weedTargets}
                onChange={weedTargets => update({ weedTargets })}
                disabled={submitting}
              />
            </fieldset>
          )}

          {isChemical && (
            <fieldset className={styles.section}>
              <legend>Nematode targets</legend>
              <NematodeTargetsEditor
                value={form.nematodeTargets}
                onChange={nematodeTargets => update({ nematodeTargets })}
                disabled={submitting}
              />
            </fieldset>
          )}

          {isFertilizer && (
            <fieldset className={styles.section}>
              <legend>Coated fertilizer</legend>
              <FertilizerCoatingEditor
                value={form.fertilizerCoating}
                onChange={fertilizerCoating => update({ fertilizerCoating })}
                disabled={submitting}
              />
            </fieldset>
          )}

          {supportsNutrientAnalysis && (
            <fieldset className={styles.section}>
              <legend>Nutrient sources</legend>
              <NutrientSourcesEditor
                value={form.nutrientSources}
                onChange={nutrientSources => update({ nutrientSources })}
                disabled={submitting}
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
                    disabled={submitting}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.label}>{isIrrigation ? 'System / equipment' : 'Equipment'}</span>
                  {isPart ? (
                    <PartEquipmentPicker
                      equipment={equipment}
                      value={form.equipmentList}
                      onChange={equipmentList => update({ equipmentList })}
                      disabled={submitting}
                    />
                  ) : (
                    <input
                      type="text"
                      value={form.equipment}
                      onChange={e => update({ equipment: e.target.value })}
                      aria-label="Irrigation system or equipment"
                      disabled={submitting}
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
                    disabled={submitting}
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
                    disabled={submitting}
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
                    disabled={submitting}
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
                  disabled={submitting}
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
                  min="0"
                  step="0.01"
                  value={form.costPerUnit}
                  onChange={e => update({ costPerUnit: e.target.value })}
                  aria-label="Cost per unit"
                  disabled={submitting}
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
                  disabled={submitting}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Cost source</span>
                <select
                  value={form.costSource}
                  onChange={e => update({ costSource: e.target.value })}
                  aria-label="Cost source"
                  disabled={submitting}
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
                disabled={submitting}
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
                disabled={submitting}
              />
            </label>
          </fieldset>

          {err && (
            <p className={styles.errorBanner} role="alert">{err}</p>
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save product'}
          </button>
        </footer>
      </form>
    </div>
  )
}
