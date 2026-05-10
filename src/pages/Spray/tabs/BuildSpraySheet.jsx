import { useState, useMemo, useEffect } from 'react'
import { SPRAY_RECORDS, TYPE_COLORS } from '../../../data/spray'
import { useOperations } from '../../../utils/operations/OperationsContext'
import { useToast } from '../../../utils/feedback/toastContext'
import { createCalendarEvent, createAlert, deductInventory } from '../../../utils/operations/actions'
import ContextActions from '../../../components/contextActions/ContextActions'
import ExpandableSection from '../../../components/expandable/ExpandableSection'
import { EmptyState } from '../../../components/shared/EmptyState'
import exStyles from '../../../components/expandable/expandable.module.css'
import styles from '../Spray.module.css'

const TODAY  = new Date().toISOString().slice(0, 10)
const COURSE = 'Crossroads GC'

const ACREAGE_MAP = {
  'Greens':        1.2,
  'Tees':          2.4,
  'Fairways':     28.0,
  'All Roughs':   18.0,
  'Greens + Tees': 3.6,
}

const PRODUCT_META = {
  'Primo MAXX':          { frac: 'PGR',   ppe: 'Gloves, long-sleeved shirt' },
  'Heritage G':          { frac: '11',    ppe: 'Gloves, eye protection, respirator' },
  'Daconil Ultrex':      { frac: 'M05',   ppe: 'Gloves, goggles, waterproof coveralls' },
  'Headway G':           { frac: '3 + 11',ppe: 'Gloves, eye protection' },
  'Prodiamine 65 WDG':   { frac: '3',     ppe: 'Gloves, long-sleeved shirt, waterproof pants' },
  'Ferromec AC':         { frac: 'n/a',   ppe: 'Gloves, eye protection' },
  'Certainty Herbicide': { frac: 'ALS',   ppe: 'Gloves, long-sleeved shirt' },
}

const STATUS_META = {
  completed:          { label: 'Completed',     cls: styles.statusCompleted   },
  planned:            { label: 'Planned',        cls: styles.statusPlanned     },
  'in-progress':      { label: 'In Progress',   cls: styles.statusInProgress  },
  'pending-review':   { label: 'Pending Review', cls: styles.statusPending     },
}

const AREA_OPTS   = ['All', 'Greens', 'Tees', 'Fairways', 'All Roughs', 'Greens + Tees']
const STATUS_OPTS = ['All', 'planned', 'in-progress', 'pending-review', 'completed']

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extract the leading numeric value from a rate string, e.g. '1.5 lbs / 1,000 sq ft' → 1.5
function parseRateQty(rateStr) {
  const match = rateStr && rateStr.match(/^(\d+\.?\d*)/)
  return match ? parseFloat(match[1]) : 0
}

// Mirrors the stockStatus function in InventoryProducts without importing it
function invStockStatus(qty, reorderLevel) {
  if (qty <= 0)                   return 'out'
  if (qty <= reorderLevel * 0.5)  return 'critical'
  if (qty <= reorderLevel)        return 'low'
  return 'good'
}

function holesLabel(holes) {
  if (!holes || holes.length === 0) return '—'
  if (holes.length === 18) return 'All 18'
  if (holes.length === 9 && holes[0] === 1)  return 'Front 9'
  if (holes.length === 9 && holes[0] === 10) return 'Back 9'
  return `Holes ${holes[0]}–${holes[holes.length - 1]}`
}

function condSummary(c) {
  if (!c || (!c.temp && !c.wind)) return '—'
  const parts = []
  if (c.temp)     parts.push(`${c.temp}°F`)
  if (c.wind)     parts.push(c.wind)
  if (c.humidity) parts.push(`${c.humidity}% RH`)
  return parts.join(' · ')
}

function acres(area) {
  return ACREAGE_MAP[area] || 0
}

function buildProductTable(records) {
  const map = new Map()
  for (const r of records) {
    for (const p of r.products) {
      if (!map.has(p.name)) {
        map.set(p.name, {
          name: p.name,
          type: p.type,
          rate: p.rate,
          frac: PRODUCT_META[p.name]?.frac || '—',
          rei:  r.rei,
          phi:  r.phi,
        })
      }
    }
  }
  return [...map.values()]
}

function buildPPE(records) {
  const set = new Set()
  for (const r of records) {
    for (const p of r.products) {
      const ppe = PRODUCT_META[p.name]?.ppe
      if (ppe) set.add(ppe)
    }
  }
  return [...set]
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BuildSpraySheet() {
  const { state, dispatch }              = useOperations()
  const toast                            = useToast()
  const [search,       setSearch]       = useState('')
  const [dateFilter,   setDateFilter]   = useState('')
  const [areaFilter,   setAreaFilter]   = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selected,     setSelected]     = useState(new Set())
  const [modalRecord,  setModalRecord]  = useState(null)
  const [hoveredId,    setHoveredId]    = useState(null)
  const [expandedId,   setExpandedId]   = useState(null)

  function handleAddToCalendar() {
    // ── Calendar events ──────────────────────────────────────────────────────
    selectedRecords.forEach(r => {
      const isPrimary    = r.products.some(p => p.type === 'Fungicide' || p.type === 'Insecticide')
      const categoryPrio = isPrimary ? 'high' : 'medium'
      const evtStatus    = r.status === 'completed' ? 'completed'
                         : r.status === 'in-progress' ? 'in-progress'
                         : 'scheduled'
      dispatch(createCalendarEvent({
        title:         `Spray — ${r.area}: ${r.products.map(p => p.name).join(' + ')}`,
        date:          r.date,
        category:      'spray',
        priority:      categoryPrio,
        status:        evtStatus,
        location:      r.area,
        assignedStaff: r.applicator ? [r.applicator] : [],
        equipment:     ['Spray Rig #1'],
        tags:          r.products.map(p => p.name),
        notes:         r.notes || '',
        sourceModule:  'spray',
        sourceId:      r.id,
      }))
    })

    if (maxREI > 0) {
      dispatch(createAlert({
        title:       `REI Active — ${sheetAreas}`,
        message:     `${maxREI}-hour re-entry interval in effect after spray application on ${sheetDate}. Restrict turf access until interval expires.`,
        module:      'spray',
        priority:    maxREI >= 12 ? 'high' : 'medium',
        course:      sheetAreas,
        actionLabel: 'View Spray',
        sourceId:    selectedRecords[0]?.id,
      }))
    }

    // ── Inventory deductions ─────────────────────────────────────────────────
    // Skip records whose products have already been deducted (duplicate protection).
    const alreadyProcessed = new Set(state.inventoryUsage.map(u => u.sourceId))

    selectedRecords.forEach(r => {
      if (alreadyProcessed.has(r.id)) return

      r.products.forEach(p => {
        const qty = parseRateQty(p.rate)
        if (qty <= 0) return

        // Match by exact name, then case-insensitive fallback
        const invItem = state.inventoryProducts.find(i => i.name === p.name)
          ?? state.inventoryProducts.find(i => i.name.toLowerCase() === p.name.toLowerCase())
        if (!invItem) return  // Not tracked in inventory — skip silently

        if (invItem.quantity < qty) {
          dispatch(createAlert({
            title:    `Insufficient Stock — ${p.name}`,
            message:  `Spray requires ${qty} ${invItem.unit} but only ${invItem.quantity} ${invItem.unit} on hand. Deduction skipped.`,
            module:   'inventory',
            priority: 'high',
            sourceId: r.id,
          }))
          return
        }

        // Fire low/critical/out-of-stock alert if this deduction crosses a threshold
        const newQty     = Math.max(0, invItem.quantity - qty)
        const prevStatus = invStockStatus(invItem.quantity, invItem.reorderLevel)
        const nextStatus = invStockStatus(newQty, invItem.reorderLevel)
        if (prevStatus !== nextStatus && nextStatus !== 'good') {
          const alertTitle = nextStatus === 'out'
            ? `Out of Stock — ${p.name}`
            : `${nextStatus === 'critical' ? 'Critical' : 'Low'} Stock — ${p.name}`
          dispatch(createAlert({
            title:    alertTitle,
            message:  `${p.name} at ${newQty} ${invItem.unit} after spray application — min. threshold ${invItem.reorderLevel} ${invItem.unit}.`,
            module:   'inventory',
            priority: nextStatus === 'out' || nextStatus === 'critical' ? 'high' : 'medium',
            sourceId: r.id,
          }))
        }

        dispatch(deductInventory({
          productName:  p.name,
          quantityUsed: qty,
          unit:         invItem.unit,
          sourceId:     r.id,
          date:         r.date,
          area:         r.area,
          applicator:   r.applicator,
        }))
      })
    })

    toast.success(
      `${selectedRecords.length} event${selectedRecords.length !== 1 ? 's' : ''} added to Operations Calendar`
    )
  }

  useEffect(() => {
    if (!modalRecord) return
    const onKey = e => { if (e.key === 'Escape') setModalRecord(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalRecord])

  const visible = useMemo(() => {
    return SPRAY_RECORDS.filter(r => {
      if (areaFilter   !== 'All' && r.area   !== areaFilter)   return false
      if (statusFilter !== 'All' && r.status !== statusFilter)  return false
      if (dateFilter && r.date !== dateFilter)                  return false
      if (search) {
        const q = search.toLowerCase()
        return r.area.toLowerCase().includes(q)
          || r.applicator.toLowerCase().includes(q)
          || (r.targetPest && r.targetPest.toLowerCase().includes(q))
          || r.products.some(p => p.name.toLowerCase().includes(q))
      }
      return true
    })
  }, [search, dateFilter, areaFilter, statusFilter])

  const selectedRecords = useMemo(
    () => SPRAY_RECORDS.filter(r => selected.has(r.id)),
    [selected]
  )

  // Stat row (based on visible list)
  const statsAcres    = visible.reduce((s, r) => s + acres(r.area), 0).toFixed(1)
  const statsGallons  = visible.reduce((s, r) => s + (r.totalVolume || 0), 0)
  const statsProducts = useMemo(() => {
    const set = new Set()
    visible.forEach(r => r.products.forEach(p => set.add(p.name)))
    return set.size
  }, [visible])
  const statsActive = visible.filter(r => r.status === 'in-progress').length

  // Derived sheet values
  const productTable    = useMemo(() => buildProductTable(selectedRecords), [selectedRecords])
  const ppeList         = useMemo(() => buildPPE(selectedRecords), [selectedRecords])
  const weatherSnap     = selectedRecords.find(r => r.conditions?.temp)?.conditions ?? null
  const sheetAreas      = [...new Set(selectedRecords.map(r => r.area))].join(', ')
  const sheetHoles      = selectedRecords.some(r => r.holes?.length === 18)
    ? 'All 18'
    : [...new Set(selectedRecords.map(r => holesLabel(r.holes)))].join(', ')
  const sheetAcres      = selectedRecords.reduce((s, r) => s + acres(r.area), 0).toFixed(1)
  const sheetGallons    = selectedRecords.reduce((s, r) => s + (r.totalVolume || 0), 0)
  const sheetApplicator = selectedRecords.find(r => r.applicator)?.applicator || '—'
  const sheetDate       = selectedRecords[0]?.date || TODAY
  const hasTankMix      = selectedRecords.some(r => r.products.length > 1)
  const maxREI          = Math.max(...selectedRecords.map(r => r.rei || 0), 0)
  const allNotes        = selectedRecords.filter(r => r.notes).map(r => r.notes)

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    if (visible.length > 0 && visible.every(r => selected.has(r.id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(visible.map(r => r.id)))
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id))

  return (
    <div className={styles.tabContent}>

      {/* ── Toolbar ── */}
      <div className={styles.ssToolbar}>
        <div className={styles.ssToolbarTop}>
          <input
            type="search"
            className={styles.ssSearch}
            placeholder="Search product, area, applicator, pest…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search applications"
          />
          <input
            type="date"
            className={styles.ssDateInput}
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            title="Filter by date"
          />
          <div className={styles.ssToolbarActions}>
            <button
              className={styles.ssBtnPrimary}
              disabled={selected.size === 0}
              onClick={() => document.getElementById('ss-preview')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Generate Spray Sheet
            </button>
            <button
              className={styles.ssBtnSecondary}
              disabled={selected.size === 0}
              onClick={() => window.print()}
            >
              Print View
            </button>
            <button className={styles.ssBtnDisabled} disabled title="PDF export — coming soon">
              Export PDF
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <span className={styles.ssFilterLabel}>Area:</span>
          {AREA_OPTS.map(a => (
            <button
              key={a}
              className={`${styles.filterBtn} ${areaFilter === a ? styles.filterBtnActive : ''}`}
              onClick={() => setAreaFilter(a)}
            >
              {a}
            </button>
          ))}
        </div>

        <div className={styles.filterRow}>
          <span className={styles.ssFilterLabel}>Status:</span>
          {STATUS_OPTS.map(s => (
            <button
              key={s}
              className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'All' ? 'All' : (STATUS_META[s]?.label || s)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat row ── */}
      <div className={styles.ssStats}>
        <div className={styles.ssStatCard}>
          <span className={styles.ssStatValue}>{statsAcres}</span>
          <span className={styles.ssStatLabel}>Acres Scheduled</span>
        </div>
        <div className={styles.ssStatCard}>
          <span className={styles.ssStatValue}>{statsGallons.toLocaleString()}</span>
          <span className={styles.ssStatLabel}>Total Volume (gal)</span>
        </div>
        <div className={styles.ssStatCard}>
          <span className={styles.ssStatValue}>{statsProducts}</span>
          <span className={styles.ssStatLabel}>Unique Products</span>
        </div>
        <div className={styles.ssStatCard}>
          <span className={styles.ssStatValue} style={statsActive > 0 ? { color: '#70b8e8' } : undefined}>
            {statsActive}
          </span>
          <span className={styles.ssStatLabel}>Active Applications</span>
        </div>
      </div>

      {/* ── Main split layout ── */}
      <div className={styles.ssLayout}>

        {/* ── Left: application list ── */}
        <div className={styles.ssList}>
          <div className={styles.ssListHeader}>
            <span className={styles.ssListCount}>
              {visible.length} application{visible.length !== 1 ? 's' : ''}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
            {visible.length > 0 && (
              <button className={styles.ssSelectAll} onClick={handleSelectAll}>
                {allVisibleSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            SPRAY_RECORDS.length === 0 ? (
              <EmptyState
                title="No spray records to build from."
                description="Create spray applications to assemble crew sheets here."
              />
            ) : (
              <p className={styles.emptyState}>No applications match your filters.</p>
            )
          ) : (
            <div className={styles.ssCardList}>
              {visible.map(r => {
                const isSelected  = selected.has(r.id)
                const primaryType = r.products[0]?.type
                const colors      = TYPE_COLORS[primaryType] || {}
                const statusMeta  = STATUS_META[r.status]   || {}

                return (
                  <div
                    key={r.id}
                    className={`${styles.ssAppCard} ${isSelected ? styles.ssAppCardSelected : ''}`}
                    onMouseEnter={() => setHoveredId(r.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className={styles.ssCardRow}>
                      <button
                        className={styles.ssCheckbox}
                        onClick={() => toggleSelect(r.id)}
                        aria-label={isSelected ? 'Deselect application' : 'Select application'}
                        aria-pressed={isSelected}
                      >
                        <span className={`${styles.ssCheckboxBox} ${isSelected ? styles.ssCheckboxChecked : ''}`}>
                          {isSelected && '✓'}
                        </span>
                      </button>

                      <button className={styles.ssAppCardBody} onClick={() => setModalRecord(r)}>
                        <div className={styles.ssAppCardHeader}>
                          <div className={styles.ssAppCardTitle}>
                            <span className={styles.recordProduct}>
                              {r.products.map(p => p.name).join(' + ')}
                            </span>
                            {r.products.length > 1 && (
                              <span className={styles.mixBadge}>Tank Mix</span>
                            )}
                            <span
                              className={styles.recordTypePill}
                              style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
                            >
                              {primaryType}{r.products.length > 1 ? ' +' : ''}
                            </span>
                          </div>
                          <span className={styles.recordDate}>{r.date}</span>
                        </div>

                        <div className={styles.ssAppCardMeta}>
                          <span><span className={styles.ssMetaKey}>Area</span>{r.area}</span>
                          <span><span className={styles.ssMetaKey}>Holes</span>{holesLabel(r.holes)}</span>
                          <span><span className={styles.ssMetaKey}>Target</span>{r.targetPest || '—'}</span>
                          <span><span className={styles.ssMetaKey}>Operator</span>{r.applicator || '—'}</span>
                          <span><span className={styles.ssMetaKey}>Conditions</span>{condSummary(r.conditions)}</span>
                          <span><span className={styles.ssMetaKey}>Gallons</span>{r.totalVolume ? `${r.totalVolume} gal` : '—'}</span>
                        </div>

                        <div className={styles.ssAppCardFooter}>
                          <span className={`${styles.statusBadge} ${statusMeta.cls || ''}`}>
                            {statusMeta.label || r.status}
                          </span>
                          {r.rei > 0 && <span className={styles.reiBadge}>REI {r.rei}h</span>}
                          {r.phi > 0 && <span className={styles.ssPhiBadge}>PHI {r.phi}d</span>}
                          <span className={styles.viewDetail}>Details →</span>
                        </div>
                      </button>

                      <ContextActions
                        hovered={hoveredId === r.id}
                        actions={[{
                          id: 'details',
                          label: '📄 Details',
                          onClick: e => { e.stopPropagation(); setModalRecord(r) },
                          title: 'View application details',
                        }]}
                      />
                    </div>

                    <button
                      className={`${exStyles.esExpandBar} ${expandedId === r.id ? exStyles.esExpandBarOpen : ''}`}
                      onClick={e => { e.stopPropagation(); setExpandedId(prev => prev === r.id ? null : r.id) }}
                      aria-expanded={expandedId === r.id}
                    >
                      {expandedId === r.id ? '▲ Less' : '▼ Products & conditions'}
                    </button>

                    <ExpandableSection expanded={expandedId === r.id}>
                      <div className={exStyles.esBody} style={{ padding: '10px 14px 10px' }}>
                        <div className={exStyles.esGrid}>
                          <div className={exStyles.esField}>
                            <span className={exStyles.esLabel}>Carrier Volume</span>
                            <span className={exStyles.esValue}>{r.carrierVolume || '—'}</span>
                          </div>
                          <div className={exStyles.esField}>
                            <span className={exStyles.esLabel}>Total Volume</span>
                            <span className={exStyles.esValue}>{r.totalVolume ? `${r.totalVolume} gal` : '—'}</span>
                          </div>
                          {r.conditions && (
                            <>
                              <div className={exStyles.esField}>
                                <span className={exStyles.esLabel}>Wind</span>
                                <span className={exStyles.esValue}>{r.conditions.wind || '—'}</span>
                              </div>
                              <div className={exStyles.esField}>
                                <span className={exStyles.esLabel}>Temp</span>
                                <span className={exStyles.esValue}>{r.conditions.temp ? `${r.conditions.temp}°F` : '—'}</span>
                              </div>
                              <div className={exStyles.esField}>
                                <span className={exStyles.esLabel}>Humidity</span>
                                <span className={exStyles.esValue}>{r.conditions.humidity ? `${r.conditions.humidity}%` : '—'}</span>
                              </div>
                              <div className={exStyles.esField}>
                                <span className={exStyles.esLabel}>Soil Temp</span>
                                <span className={exStyles.esValue}>{r.conditions.soilTemp ? `${r.conditions.soilTemp}°F` : '—'}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {r.products.length > 0 && (
                          <div className={exStyles.esPartsList}>
                            <span className={exStyles.esLabel}>
                              {r.products.length > 1 ? 'Tank Mix' : 'Product'}
                            </span>
                            {r.products.map((p, i) => (
                              <div key={i} className={exStyles.esPartsItem}>
                                <span className={exStyles.esPartsBadge}>{p.type}</span>
                                <span>{p.name}</span>
                                <span className={exStyles.esPartsItemCost}>{p.rate}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {r.notes && <p className={exStyles.esNote}>{r.notes}</p>}
                      </div>
                    </ExpandableSection>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right: generated spray sheet ── */}
        <div className={styles.ssPanelWrap} id="ss-preview">
          {selected.size === 0 ? (
            <div className={styles.ssPanelEmpty}>
              <div className={styles.ssPanelEmptyIcon}>📋</div>
              <p className={styles.ssPanelEmptyTitle}>No Applications Selected</p>
              <p className={styles.ssPanelEmptyText}>
                Select one or more applications from the list to generate your spray sheet.
              </p>
            </div>
          ) : (
            <div className={styles.ssSheet}>

              {/* 1. Header */}
              <div className={styles.ssSheetHeader}>
                <div className={styles.ssSheetBrand}>
                  <span className={styles.ssSheetBrandName}>TurfIntel Pro</span>
                  <span className={styles.ssSheetBrandSub}>Spray Application Worksheet</span>
                </div>
                <div className={styles.ssSheetHeaderFields}>
                  <div className={styles.ssSheetHeaderField}>
                    <span className={styles.ssSheetFieldLabel}>Course</span>
                    <span className={styles.ssSheetFieldValue}>{COURSE}</span>
                  </div>
                  <div className={styles.ssSheetHeaderField}>
                    <span className={styles.ssSheetFieldLabel}>Date</span>
                    <span className={styles.ssSheetFieldValue}>{sheetDate}</span>
                  </div>
                  <div className={styles.ssSheetHeaderField}>
                    <span className={styles.ssSheetFieldLabel}>Applicator</span>
                    <span className={styles.ssSheetFieldValue}>{sheetApplicator}</span>
                  </div>
                </div>
              </div>

              {/* Weather snapshot */}
              <div className={styles.ssSheetWeather}>
                <span className={styles.ssSheetWeatherLabel}>Weather at Application</span>
                {weatherSnap ? (
                  <div className={styles.ssSheetWeatherGrid}>
                    <span>{weatherSnap.temp}°F</span>
                    <span>{weatherSnap.wind}</span>
                    <span>{weatherSnap.humidity}% RH</span>
                    {weatherSnap.soilTemp && <span>Soil {weatherSnap.soilTemp}°F</span>}
                  </div>
                ) : (
                  <span className={styles.ssSheetWeatherPending}>
                    Record conditions at time of application
                  </span>
                )}
              </div>

              <div className={styles.ssSheetDivider} />

              {/* 2. Application Summary */}
              <div className={styles.ssSheetSection}>
                <div className={styles.ssSheetSectionTitle}>Application Summary</div>
                <div className={styles.ssSheetSummaryGrid}>
                  <div className={styles.ssSheetSummaryItem}>
                    <span className={styles.ssSheetSummaryLabel}>Target Areas</span>
                    <span className={styles.ssSheetSummaryValue}>{sheetAreas || '—'}</span>
                  </div>
                  <div className={styles.ssSheetSummaryItem}>
                    <span className={styles.ssSheetSummaryLabel}>Holes</span>
                    <span className={styles.ssSheetSummaryValue}>{sheetHoles || '—'}</span>
                  </div>
                  <div className={styles.ssSheetSummaryItem}>
                    <span className={styles.ssSheetSummaryLabel}>Total Acreage</span>
                    <span className={styles.ssSheetSummaryValue}>{sheetAcres} ac</span>
                  </div>
                  <div className={styles.ssSheetSummaryItem}>
                    <span className={styles.ssSheetSummaryLabel}>Total Gallons</span>
                    <span className={styles.ssSheetSummaryValue}>{sheetGallons} gal</span>
                  </div>
                  {hasTankMix && (
                    <div className={styles.ssSheetSummaryItem}>
                      <span className={styles.ssSheetSummaryLabel}>Tank Mix</span>
                      <span className={styles.ssSheetSummaryValue} style={{ color: '#e0b840' }}>
                        Yes — verify compatibility
                      </span>
                    </div>
                  )}
                  {maxREI > 0 && (
                    <div className={styles.ssSheetSummaryItem}>
                      <span className={styles.ssSheetSummaryLabel}>Max REI</span>
                      <span className={styles.ssSheetSummaryValue} style={{ color: '#e07070' }}>
                        {maxREI} hrs
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.ssSheetDivider} />

              {/* 3. Product Table */}
              <div className={styles.ssSheetSection}>
                <div className={styles.ssSheetSectionTitle}>Products</div>
                <div className={styles.ssSheetTableWrap}>
                  <table className={styles.ssSheetTable}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Type</th>
                        <th>Rate</th>
                        <th>FRAC / HRAC</th>
                        <th>REI</th>
                        <th>PHI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productTable.map((p, i) => (
                        <tr key={i}>
                          <td className={styles.ssTableProductName}>{p.name}</td>
                          <td>{p.type}</td>
                          <td>{p.rate}</td>
                          <td>{p.frac}</td>
                          <td>{p.rei > 0 ? `${p.rei}h` : 'None'}</td>
                          <td>{p.phi > 0 ? `${p.phi}d` : 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.ssSheetDivider} />

              {/* 4. Notes / Safety */}
              <div className={styles.ssSheetSection}>
                <div className={styles.ssSheetSectionTitle}>Notes &amp; Safety</div>
                {ppeList.length > 0 && (
                  <div className={styles.ssSheetSafetyBlock}>
                    <span className={styles.ssSheetSafetyLabel}>PPE Required</span>
                    <ul className={styles.ssSheetSafetyList}>
                      {ppeList.map((ppe, i) => <li key={i}>{ppe}</li>)}
                    </ul>
                  </div>
                )}
                {allNotes.length > 0 && (
                  <div className={styles.ssSheetSafetyBlock}>
                    <span className={styles.ssSheetSafetyLabel}>Field Notes</span>
                    <ul className={styles.ssSheetSafetyList}>
                      {allNotes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
                <div className={styles.ssSheetSafetyBlock}>
                  <span className={styles.ssSheetSafetyLabel}>Weather Concerns</span>
                  <span className={styles.ssSheetSafetyText}>
                    Do not apply if wind exceeds 10 mph or rain is forecast within the REI window.
                  </span>
                </div>
                <div className={styles.ssSheetSafetyBlock}>
                  <span className={styles.ssSheetSafetyLabel}>Irrigation Note</span>
                  <span className={styles.ssSheetSafetyText}>
                    {maxREI > 0
                      ? `Hold irrigation for minimum ${maxREI} hrs post-application.`
                      : 'No irrigation hold required for selected products.'}
                  </span>
                </div>
              </div>

              <div className={styles.ssSheetDivider} />

              {/* 5. Signature Section */}
              <div className={styles.ssSheetSection}>
                <div className={styles.ssSheetSectionTitle}>Verification &amp; Sign-Off</div>
                <div className={styles.ssSheetSigGrid}>
                  <div className={styles.ssSheetSigBlock}>
                    <div className={styles.ssSheetSigLine} />
                    <span className={styles.ssSheetSigLabel}>Applicator Signature</span>
                    <span className={styles.ssSheetSigName}>{sheetApplicator}</span>
                  </div>
                  <div className={styles.ssSheetSigBlock}>
                    <div className={styles.ssSheetSigLine} />
                    <span className={styles.ssSheetSigLabel}>Supervisor Signature</span>
                    <span className={styles.ssSheetSigName}>&nbsp;</span>
                  </div>
                  <div className={styles.ssSheetSigBlock}>
                    <div className={styles.ssSheetSigLine} />
                    <span className={styles.ssSheetSigLabel}>Date / Time</span>
                    <span className={styles.ssSheetSigName}>{sheetDate}</span>
                  </div>
                </div>
              </div>

              {/* Operations actions */}
              <div className={styles.ssSheetSection}>
                <div className="opActionRow">
                  <button className="opActionBtn" onClick={handleAddToCalendar}>
                    + Add to Operations Calendar
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {selectedRecords.length} application{selectedRecords.length !== 1 ? 's' : ''} selected
                    {maxREI > 0 ? ` · REI alert will be created` : ''}
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {modalRecord && (() => {
        const r      = modalRecord
        const colors = TYPE_COLORS[r.products[0]?.type] || {}
        return (
          <div
            className={styles.modalOverlay}
            onClick={() => setModalRecord(null)}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalPanel} onClick={e => e.stopPropagation()}>
              <div
                className={styles.modalAccent}
                style={{ background: colors.text || '#4a9e4a' }}
              />
              <div className={styles.modalHeader}>
                <div>
                  <h2 className={styles.modalTitle}>{r.products.map(p => p.name).join(' + ')}</h2>
                  <p className={styles.modalSubtitle}>{r.date} · {r.course}</p>
                </div>
                <button className={styles.modalClose} onClick={() => setModalRecord(null)} aria-label="Close">✕</button>
              </div>
              <div className={styles.modalBody}>

                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Application</h3>
                  <div className={styles.modalGrid}>
                    {[
                      ['Area',              r.area],
                      ['Holes',             holesLabel(r.holes)],
                      ['Target Pest / Use', r.targetPest || '—'],
                      ['Applicator',        r.applicator || '—'],
                      ['Carrier Volume',    r.carrierVolume],
                      ['Total Volume',      r.totalVolume ? `${r.totalVolume} gal` : '—'],
                      ['REI',               r.rei > 0 ? `${r.rei} hrs` : 'None'],
                      ['PHI',               r.phi > 0 ? `${r.phi} days` : 'None'],
                    ].map(([label, value]) => (
                      <div key={label} className={styles.modalField}>
                        <span className={styles.modalFieldLabel}>{label}</span>
                        <span className={styles.modalFieldValue}>{value}</span>
                      </div>
                    ))}
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Status</span>
                      <span className={`${styles.statusBadge} ${STATUS_META[r.status]?.cls || ''}`}>
                        {STATUS_META[r.status]?.label || r.status}
                      </span>
                    </div>
                  </div>
                </section>

                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Products</h3>
                  <div className={styles.modalProductList}>
                    {r.products.map((p, i) => {
                      const c = TYPE_COLORS[p.type] || {}
                      return (
                        <div key={i} className={styles.modalProductRow}>
                          <span className={styles.modalProductType} style={{ background: c.bg, color: c.text, borderColor: c.border }}>{p.type}</span>
                          <span className={styles.modalProductName}>{p.name}</span>
                          <span className={styles.modalProductRate}>{p.rate}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {r.conditions?.temp && (
                  <section className={styles.modalSection}>
                    <h3 className={styles.modalSectionTitle}>Conditions at Application</h3>
                    <div className={styles.modalGrid}>
                      {[
                        ['Temperature', `${r.conditions.temp}°F`],
                        ['Wind',        r.conditions.wind || '—'],
                        ['Humidity',    r.conditions.humidity ? `${r.conditions.humidity}%` : '—'],
                        ['Soil Temp',   r.conditions.soilTemp ? `${r.conditions.soilTemp}°F` : '—'],
                      ].map(([label, value]) => (
                        <div key={label} className={styles.modalField}>
                          <span className={styles.modalFieldLabel}>{label}</span>
                          <span className={styles.modalFieldValue}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {r.notes && (
                  <section className={styles.modalSection}>
                    <h3 className={styles.modalSectionTitle}>Notes</h3>
                    <p className={styles.modalNotes}>{r.notes}</p>
                  </section>
                )}

              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
