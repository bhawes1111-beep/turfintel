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
import { createSpray } from '../../../utils/sprays/spraysStore'
import { useInventoryData, recordInventoryUsage } from '../../../utils/inventory/inventoryStore'
import { useCrewData } from '../../../utils/crew/crewStore'
import { createCalendarEvent } from '../../../utils/calendar/calendarStore'
import { createAlert } from '../../../utils/alerts/alertsStore'
import { useToast } from '../../../utils/feedback/toastContext'
import { useSelectedCourse } from '../../../utils/courses/courseStore'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import styles from '../Spray.module.css'

const TODAY    = new Date().toISOString().slice(0, 10)
const DRAFT_KEY = 'turfintel:spray-draft-v1'

// ── Course geometry ──────────────────────────────────────────────────────
// Static for Crossroads GC; future phases can move this onto the
// courses table or per-course config.
const AREA_OPTS = [
  { label: 'Greens',        acres: 1.2  },
  { label: 'Tees',          acres: 2.4  },
  { label: 'Fairways',      acres: 28.0 },
  { label: 'All Roughs',    acres: 18.0 },
  { label: 'Greens + Tees', acres: 3.6  },
  { label: 'Practice Area', acres: 1.5  },
  { label: 'Custom',        acres: 0    },
]

const SPRAY_RIGS = [
  { name: 'Spray Rig #1', capacity: 200 },
  { name: 'Spray Rig #2', capacity: 200 },
  { name: 'Backpack',     capacity: 4   },
]

const UNIT_OPTS = ['oz', 'fl oz', 'lb', 'gal', 'qt', 'pt']

// 1 acre = 43.56 (× 1,000 sq ft).
const SQFT_PER_ACRE_K = 43.56

// ── Draft seed (used when localStorage is empty) ────────────────────────
function makeEmptyDraft() {
  return {
    date:           TODAY,
    startTime:      '',
    operator:       '',
    area:           '',
    acres:          0,
    target:         '',
    waterVolume:    '',
    carrierAmount:  '',
    sprayRig:       'Spray Rig #1',
    conditions: { temp: '', wind: '', humidity: '' },
    observations:   '',
    rows:           [],
  }
}

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
  const selectedCourse                  = useSelectedCourse()
  const toast                           = useToast()
  const navigate                        = useNavigate()

  // ── Draft state (with localStorage autosave restore) ───────────────────
  const [draft, setDraft] = useState(() => {
    if (typeof localStorage === 'undefined') return makeEmptyDraft()
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return makeEmptyDraft()
      const parsed = JSON.parse(raw)
      return { ...makeEmptyDraft(), ...parsed }
    } catch {
      return makeEmptyDraft()
    }
  })

  // Debounced autosave. Saves the draft 600ms after the last edit.
  const saveTimer = useRef(null)
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [draft])

  const [committing, setCommitting] = useState(false)

  // ── Derived data ──────────────────────────────────────────────────────
  const productPickerOptions = useMemo(() => {
    return inventoryProducts
      .filter(p => p.kind === 'product' || p.kind === 'chemical' || p.kind === 'fertilizer')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [inventoryProducts])

  const operatorOptions = useMemo(() => {
    return (crewEmployees ?? [])
      .filter(e => e.status !== 'inactive')
      .map(e => ({ id: e.id ?? e.employeeId, name: e.fullName ?? e.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [crewEmployees])

  const sprayRigSpec = SPRAY_RIGS.find(r => r.name === draft.sprayRig) ?? SPRAY_RIGS[0]

  // Compute per-row totals + tank summary.
  const enrichedRows = useMemo(() => {
    return draft.rows.map(row => {
      const inv  = row.inventoryItemId
        ? inventoryProducts.find(p => p.id === row.inventoryItemId)
        : inventoryProducts.find(p => p.name === row.name)
      const rate = parseFloat(row.rate) || 0
      const qtyNeeded = rate * (draft.acres || 0) * SQFT_PER_ACRE_K
      const available = inv?.quantity ?? null
      const cost      = inv?.costPerUnit != null
        ? +(qtyNeeded * inv.costPerUnit).toFixed(2)
        : null
      const status   = inv ? stockStatus(available, inv.reorderLevel) : 'unknown'
      const insufficient = inv && available != null && qtyNeeded > available
      return {
        ...row,
        inv,
        qtyNeeded,
        available,
        cost,
        status,
        insufficient,
      }
    })
  }, [draft.rows, draft.acres, inventoryProducts])

  const summary = useMemo(() => {
    const productCount = enrichedRows.length
    const totalCost    = enrichedRows.reduce(
      (s, r) => s + (r.cost ?? 0),
      0,
    )
    const water = parseFloat(draft.waterVolume) || 0
    const tankFillPct = sprayRigSpec.capacity > 0
      ? Math.min(100, Math.round((water / sprayRigSpec.capacity) * 100))
      : 0

    // Nutrient totals — only computed when at least one row's inventory
    // item carries a parseable analysis string. We never invent values.
    let nutrientSource = 0
    let totalN = 0, totalP = 0, totalK = 0
    for (const r of enrichedRows) {
      const npk = parseAnalysisNPK(r.inv?.analysis)
      if (!npk) continue
      nutrientSource += 1
      const qty = r.qtyNeeded || 0
      totalN += (npk.n / 100) * qty
      totalP += (npk.p / 100) * qty
      totalK += (npk.k / 100) * qty
    }

    const reiRows = enrichedRows
      .map(r => r.rei || 0)
      .filter(n => n > 0)
    const maxRei = reiRows.length > 0 ? Math.max(...reiRows) : 0

    return {
      productCount,
      acres:        draft.acres || 0,
      totalCost,
      water,
      tankFillPct,
      nutrientSource,
      totalN, totalP, totalK,
      maxRei,
      anyInsufficient: enrichedRows.some(r => r.insufficient),
    }
  }, [enrichedRows, draft.waterVolume, draft.acres, sprayRigSpec.capacity])

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
    setDraft(prev => ({
      ...prev,
      rows: [...prev.rows, { id: uid('row'), inventoryItemId: null, name: '', type: '', rate: '', unit: 'oz', rei: 0 }],
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
    const opt = AREA_OPTS.find(a => a.label === label)
    patchDraft({ area: label, acres: opt?.acres ?? draft.acres })
  }
  function clearDraft() {
    if (!confirm('Discard the current spray application draft?')) return
    setDraft(makeEmptyDraft())
    try { localStorage.removeItem(DRAFT_KEY) } catch {}
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
      const payload = {
        applicationName: `${draft.area} — ${TODAY}`,
        targetPest:      draft.target,
        applicator:      draft.operator,
        course:          selectedCourse?.shortName ?? selectedCourse?.name ?? null,
        date:            draft.date,
        startTime:       draft.startTime,
        status:          'completed',
        conditions: {
          temp:     draft.conditions.temp     ? parseFloat(draft.conditions.temp)     : null,
          wind:     draft.conditions.wind     || null,
          humidity: draft.conditions.humidity ? parseFloat(draft.conditions.humidity) : null,
        },
        rei:           summary.maxRei,
        carrierVolume: draft.carrierAmount || null,
        totalVolume:   summary.water,
        notes:         draft.observations,
        area:          draft.area,
        acreage:       draft.acres,
        products: enrichedRows.map(r => ({
          name:            r.name,
          type:            r.type,
          rate:            `${r.rate} ${r.unit} / 1,000 sq ft`,
          unit:            r.unit,
          quantityUsed:    r.qtyNeeded,
          inventoryItemId: r.inventoryItemId,
        })),
      }
      const saved = await createSpray(payload)

      // 2. Inventory deductions — fire-and-forget per product so a
      // single miss doesn't tank the whole commit.
      const deductionResults = await Promise.allSettled(
        enrichedRows
          .filter(r => r.name && r.qtyNeeded > 0)
          .map(r => recordInventoryUsage({
            productName:   r.name,
            quantityUsed:  r.qtyNeeded,
            unit:          r.unit,
            sourceId:      saved.id,
            date:          draft.date,
            area:          draft.area,
            applicator:    draft.operator,
          })),
      )
      const deductCount = deductionResults.filter(r => r.status === 'fulfilled').length

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
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      setDraft(makeEmptyDraft())
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

              <Field label="Time of application">
                <input
                  type="time"
                  className={styles.naInput}
                  value={draft.startTime}
                  onChange={e => patchDraft({ startTime: e.target.value })}
                />
              </Field>

              <Field label="Operator">
                {operatorOptions.length > 0 ? (
                  <select
                    className={styles.naInput}
                    value={draft.operator}
                    onChange={e => patchDraft({ operator: e.target.value })}
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
                    onChange={e => patchDraft({ operator: e.target.value })}
                    placeholder="Operator name"
                  />
                )}
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

              <Field label="Area treated">
                <select
                  className={styles.naInput}
                  value={draft.area}
                  onChange={e => onAreaChange(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {AREA_OPTS.map(a => (
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
                    <th>Unit</th>
                    <th>Qty Needed</th>
                    <th>Available</th>
                    <th>Est. Cost</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {enrichedRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className={styles.naEmptyRow}>
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
                          value={row.unit}
                          onChange={e => setRow(row.id, { unit: e.target.value })}
                        >
                          {UNIT_OPTS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className={styles.naNumCell}>
                        {row.qtyNeeded > 0 ? `${fmt(row.qtyNeeded, 2)} ${row.unit}` : '—'}
                      </td>
                      <td className={styles.naNumCell} data-warn={row.insufficient ? 'true' : undefined}>
                        {row.available != null ? `${fmt(row.available, 1)} ${row.inv?.unit ?? ''}` : '—'}
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
                      <td colSpan={6} className={styles.naFooterLabel}>Total cost</td>
                      <td className={styles.naNumCell}><strong>{fmtCurrency(summary.totalCost)}</strong></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ── Conditions ── */}
            <div className={styles.naSectionHeader}>
              <h3 className={styles.naSectionTitle}>Conditions at application</h3>
            </div>
            <div className={styles.naConditionsGrid}>
              <Field label="Water volume (gal)">
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={styles.naInput}
                  value={draft.waterVolume}
                  onChange={e => patchDraft({ waterVolume: e.target.value })}
                  placeholder="120"
                />
              </Field>
              <Field label="Carrier amount (gal/A)">
                <input
                  type="text"
                  className={styles.naInput}
                  value={draft.carrierAmount}
                  onChange={e => patchDraft({ carrierAmount: e.target.value })}
                  placeholder="2 gal/A"
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
              <Field label="Wind">
                <input
                  type="text"
                  className={styles.naInput}
                  value={draft.conditions.wind}
                  onChange={e => patchConditions({ wind: e.target.value })}
                  placeholder="4–6 mph NE"
                />
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
              <span className={styles.naActionHint}>
                Draft autosaves locally · committing creates a permanent record + deducts inventory
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

            <SummarySection label="Nutrient totals (N-P-K)">
              {summary.nutrientSource > 0 ? (
                <>
                  <SummaryRow label="Nitrogen (N)"   value={`${fmt(summary.totalN, 2)} ${enrichedRows[0]?.unit ?? 'oz'}`} />
                  <SummaryRow label="Phosphorus (P)" value={`${fmt(summary.totalP, 2)} ${enrichedRows[0]?.unit ?? 'oz'}`} />
                  <SummaryRow label="Potassium (K)"  value={`${fmt(summary.totalK, 2)} ${enrichedRows[0]?.unit ?? 'oz'}`} />
                </>
              ) : (
                <span className={styles.naUnavailable}>
                  Data unavailable — no fertilizer analysis on tank products.
                </span>
              )}
            </SummarySection>

            <SummarySection label="Compatibility & FRAC">
              <span className={styles.naUnavailable}>
                Data unavailable — compatibility matrix not yet wired.
              </span>
            </SummarySection>

            {summary.anyInsufficient && (
              <div className={styles.naInsufficientCard} role="alert">
                <strong>Insufficient inventory.</strong> One or more products
                exceed available stock for this tank mix.
              </div>
            )}
          </aside>

        </div>
      </WorkspaceSection>
    </div>
  )
}

// ── Small render helpers ────────────────────────────────────────────────

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
