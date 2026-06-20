import { useState, useMemo, useEffect } from 'react'
import { TYPE_COLORS } from '../../../data/spray'
import { useSpraysData } from '../../../utils/sprays/spraysStore'
// Phase S.6a — Shared needs-info heuristic. Used here by the Needs
// Info filter toggle (S.5c.1). The same helper now also drives the
// Workspace card and the Compliance Packet report so all three
// surfaces give the same verdict.
import { recordNeedsInfo } from '../../../utils/sprays/recordNeedsInfo'
import {
  buildSpraySummaryReport,
  buildSprayCompliancePacket,
  buildSprayProductUsageReport,
} from '../../../utils/reports/reportBuilder'
import { useToast } from '../../../utils/feedback/toastContext'
import { useCourse } from '../../../context/CourseContext'
// Phase S.5a.2 — Permission-aware UI. Hide Edit affordances when the
// viewer lacks canEditSprays. Exports + single-record Generate Report
// remain visible — those are read-only outputs available to any
// authenticated viewer who can reach the Records tab.
import { useAuth } from '../../../context/AuthContext'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import { EmptyState } from '../../../components/shared/EmptyState'
import WorkspaceSection from '../../../components/shared/WorkspaceSection'
import EditSprayRecordModal from './EditSprayRecordModal'
import styles from '../Spray.module.css'

const TYPE_FILTERS = ['All', 'Fungicide', 'Herbicide', 'Insecticide', 'PGR', 'Fertilizer']

const STATUS_META = {
  completed:      { label: 'Completed',     cls: styles.statusCompleted },
  planned:        { label: 'Planned',        cls: styles.statusPlanned   },
  'in-progress':  { label: 'In Progress',   cls: styles.statusInProgress },
  'pending-review': { label: 'Pending Review', cls: styles.statusPending },
}

function holesLabel(holes) {
  if (!holes || holes.length === 0) return '—'
  if (holes.length === 18) return 'All 18'
  if (holes.length === 9 && holes[0] === 1) return 'Front 9'
  if (holes.length === 9 && holes[0] === 10) return 'Back 9'
  return `Holes ${holes[0]}–${holes[holes.length - 1]}`
}

function conditionsSummary(c) {
  if (!c || (!c.temp && !c.wind)) return '—'
  const parts = []
  if (c.temp)     parts.push(`${c.temp}°F`)
  if (c.wind)     parts.push(c.wind)
  if (c.humidity) parts.push(`${c.humidity}% RH`)
  return parts.join(' · ')
}

// Phase S.5c.1 → S.6a — recordNeedsInfo() moved to src/utils/sprays/
// recordNeedsInfo.js so the Records filter toggle, the Workspace card,
// and the Compliance Packet report all use the same predicate.

export default function SprayRecords() {
  const { records: SPRAY_RECORDS }      = useSpraysData()
  const { activeCourse }                = useCourse()
  const toast                           = useToast()
  // Phase S.5a.2 — Edit affordances hide for viewers lacking the
  // permission. Worker still rejects unauthorized PATCH (regression
  // couple from S.5a.1).
  const { can }                         = useAuth()
  const canEditSprays                   = can('canEditSprays')
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  // Phase S.5c.1 — New filters: date range, applicator, product, needs-info.
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [applicatorFilter, setApplicatorFilter] = useState('All')
  const [productFilter, setProductFilter]       = useState('All')
  const [needsInfoOnly, setNeedsInfoOnly]       = useState(false)
  const [selected, setSelected]         = useState(null)
  // Phase S.5a.1 — Edit target. Holds the record being edited; null
  // when the editor is closed. Independent of `selected` (the detail
  // modal) so a supervisor can open the editor directly from the
  // record card without bouncing through the details modal.
  const [editing, setEditing]           = useState(null)
  const [activeReport,  setActiveReport]  = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportThumbs,  setReportThumbs]  = useState([])

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
  }

  async function generateApplicationReport(record) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(record.id).catch(() => []),
        getMediaByModule(`${record.id}-docs`).catch(() => []),
      ])
      const allMedia  = [...photos, ...docs]
      const thumbUrls = []

      await Promise.all(allMedia.map(async rec => {
        let thumbnailUrl = null
        if (rec.type === 'image') {
          try {
            const blob = await getThumbnailBlob(rec.id)
            if (blob) {
              thumbnailUrl = URL.createObjectURL(blob)
              thumbUrls.push(thumbnailUrl)
            }
          } catch { /* thumbnail optional — ignore */ }
        }
        return createAttachmentRef({
          id:           rec.id,
          filename:     rec.filename,
          type:         rec.type,
          thumbnailUrl,
          size:         rec.size,
        })
      }))

      setReportThumbs(thumbUrls)
      setActiveReport(buildSpraySummaryReport(
        [{
          ...record,
          product: record.products.map(p => p.name).join(' + '),
          rate:    record.products.map(p => p.rate).join(' / '),
        }],
        {
          title:     `Application Report — ${record.products.map(p => p.name).join(' + ')}`,
          dateRange: record.date,
          zone:      record.area,
        },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  // Phase S.5c.1 — Applicator + product option lists derived from the
  // current record set. Empty/whitespace applicators are skipped;
  // both lists sort alphabetically and prepend the "All ..." sentinel.
  const applicatorOptions = useMemo(() => {
    const set = new Set()
    for (const r of SPRAY_RECORDS) {
      const a = (r.applicator ?? '').trim()
      if (a) set.add(a)
    }
    return ['All', ...[...set].sort((a, b) => a.localeCompare(b))]
  }, [SPRAY_RECORDS])

  const productOptions = useMemo(() => {
    const set = new Set()
    for (const r of SPRAY_RECORDS) {
      for (const p of r.products ?? []) {
        const n = (p?.name ?? '').trim()
        if (n) set.add(n)
      }
    }
    return ['All', ...[...set].sort((a, b) => a.localeCompare(b))]
  }, [SPRAY_RECORDS])

  // Phase S.5c.1 — Auto-swap when start > end to match the rest of the
  // app's "be helpful, not punitive" date-range convention.
  const [effStart, effEnd] = useMemo(() => {
    if (startDate && endDate && startDate > endDate) {
      return [endDate, startDate]
    }
    return [startDate, endDate]
  }, [startDate, endDate])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    const applicatorQ = applicatorFilter.toLowerCase()
    return SPRAY_RECORDS.filter(r => {
      // Type / status filters — unchanged from prior phase.
      const matchType = typeFilter === 'All' ||
        r.products.some(p => p.type === typeFilter)
      const matchStatus = statusFilter === 'All' || r.status === statusFilter

      // Date range — inclusive. ISO YYYY-MM-DD compares lexicographically
      // so we can string-compare directly without parsing.
      if (effStart && (!r.date || r.date < effStart)) return false
      if (effEnd   && (!r.date || r.date > effEnd))   return false

      // Applicator — case-insensitive exact match against the selected
      // option from the derived list.
      if (applicatorFilter !== 'All') {
        if ((r.applicator ?? '').toLowerCase() !== applicatorQ) return false
      }

      // Product — at least one product row whose name matches the
      // selected option.
      if (productFilter !== 'All') {
        const hit = (r.products ?? []).some(p => p?.name === productFilter)
        if (!hit) return false
      }

      // Needs Info — pure heuristic, no mutation.
      if (needsInfoOnly && !recordNeedsInfo(r)) return false

      const matchSearch = !q ||
        (r.area ?? '').toLowerCase().includes(q) ||
        (r.applicator ?? '').toLowerCase().includes(q) ||
        (r.targetPest && r.targetPest.toLowerCase().includes(q)) ||
        r.products.some(p => p.name.toLowerCase().includes(q))
      return matchType && matchStatus && matchSearch
    })
  }, [
    SPRAY_RECORDS, search, typeFilter, statusFilter,
    effStart, effEnd, applicatorFilter, productFilter, needsInfoOnly,
  ])

  // Phase S.5c.1 — Any active filter? Drives the "(filtered)" suffix
  // and the Clear-all affordance.
  const anyFilterActive =
    typeFilter !== 'All' || statusFilter !== 'All' || !!search ||
    !!startDate || !!endDate ||
    applicatorFilter !== 'All' || productFilter !== 'All' ||
    needsInfoOnly

  function clearDates() {
    setStartDate('')
    setEndDate('')
  }
  function clearAllFilters() {
    setSearch('')
    setTypeFilter('All')
    setStatusFilter('All')
    setStartDate('')
    setEndDate('')
    setApplicatorFilter('All')
    setProductFilter('All')
    setNeedsInfoOnly(false)
  }

  // Phase S.5c.2 — Export the currently visible/filtered records as a
  // compliance packet PDF. Reuses ReportPreviewModal via setActiveReport
  // so the existing print/PDF export pipeline drives the output.
  // Refuses to generate an empty packet — toasts and bails instead.
  function handleExportCompliancePacket() {
    if (visible.length === 0) {
      toast.info('No records match the current filters. Adjust the filters and try again.')
      return
    }
    // Build a human-readable dateRange + filtersSummary so the cover
    // section tells the supervisor exactly what was exported.
    const dateRange =
      effStart && effEnd ? `${effStart} → ${effEnd}`
      : effStart         ? `On or after ${effStart}`
      : effEnd           ? `On or before ${effEnd}`
      : 'All dates'
    const filterBits = []
    if (search)                     filterBits.push(`Search: "${search}"`)
    if (typeFilter      !== 'All')  filterBits.push(`Type: ${typeFilter}`)
    if (statusFilter    !== 'All')  filterBits.push(`Status: ${statusFilter}`)
    if (applicatorFilter !== 'All') filterBits.push(`Applicator: ${applicatorFilter}`)
    if (productFilter   !== 'All')  filterBits.push(`Product: ${productFilter}`)
    if (needsInfoOnly)              filterBits.push('Needs Info only')
    const filtersSummary = filterBits.length > 0 ? filterBits.join(' · ') : 'None'

    setActiveReport(buildSprayCompliancePacket(visible, {
      title:      'Spray Compliance Packet',
      dateRange,
      courseName: activeCourse?.name ?? activeCourse?.shortName ?? null,
      filtersSummary,
    }))
  }

  // Phase S.5c.3 — Product Usage Totals report. Same filtered-set
  // contract as the compliance packet (uses `visible`, not raw
  // SPRAY_RECORDS) and the same empty-set guard. Reuses the cover
  // strings (dateRange + filtersSummary) so the two PDFs read as
  // a matched pair when stapled together.
  function handleExportProductUsage() {
    if (visible.length === 0) {
      toast.info('No records match the current filters. Adjust the filters and try again.')
      return
    }
    const dateRange =
      effStart && effEnd ? `${effStart} → ${effEnd}`
      : effStart         ? `On or after ${effStart}`
      : effEnd           ? `On or before ${effEnd}`
      : 'All dates'
    const filterBits = []
    if (search)                     filterBits.push(`Search: "${search}"`)
    if (typeFilter      !== 'All')  filterBits.push(`Type: ${typeFilter}`)
    if (statusFilter    !== 'All')  filterBits.push(`Status: ${statusFilter}`)
    if (applicatorFilter !== 'All') filterBits.push(`Applicator: ${applicatorFilter}`)
    if (productFilter   !== 'All')  filterBits.push(`Product: ${productFilter}`)
    if (needsInfoOnly)              filterBits.push('Needs Info only')
    const filtersSummary = filterBits.length > 0 ? filterBits.join(' · ') : 'None'

    setActiveReport(buildSprayProductUsageReport(visible, {
      title:      'Product Usage Totals',
      dateRange,
      courseName: activeCourse?.name ?? activeCourse?.shortName ?? null,
      filtersSummary,
    }))
  }

  return (
    <div className={styles.tabContent}>
      <WorkspaceSection
        title="Spray Records"
        subtitle="Completed, in-progress, planned, and pending-review applications."
      >

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search product, area, applicator, pest…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search spray records"
        />

        <div className={styles.filterRow}>
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              className={`${styles.filterBtn} ${typeFilter === t ? styles.filterBtnActive : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.filterRow}>
          {['All', 'completed', 'in-progress', 'planned', 'pending-review'].map(s => {
            const meta = STATUS_META[s]
            return (
              <button
                key={s}
                className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''} ${s !== 'All' ? styles[`statusFilter_${s.replace('-', '_')}`] : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {meta ? meta.label : 'All'}
              </button>
            )
          })}
        </div>

        {/* Phase S.5c.1 — Date range + applicator + product + needs-info.
            Each control is its own field-group so the row wraps cleanly
            on phones. Date inputs are native <input type="date">. */}
        <div className={styles.advancedFilterRow}>
          <label className={styles.advFilterField}>
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              aria-label="Filter records on or after date"
            />
          </label>
          <label className={styles.advFilterField}>
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              aria-label="Filter records on or before date"
            />
          </label>
          {(startDate || endDate) && (
            <button
              type="button"
              className={styles.advFilterClearBtn}
              onClick={clearDates}
              aria-label="Clear date range"
            >
              Clear dates
            </button>
          )}
          <label className={styles.advFilterField}>
            <span>Applicator</span>
            <select
              value={applicatorFilter}
              onChange={e => setApplicatorFilter(e.target.value)}
              aria-label="Filter by applicator"
            >
              {applicatorOptions.map(opt => (
                <option key={opt} value={opt}>{opt === 'All' ? 'All applicators' : opt}</option>
              ))}
            </select>
          </label>
          <label className={styles.advFilterField}>
            <span>Product</span>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              aria-label="Filter by product"
            >
              {productOptions.map(opt => (
                <option key={opt} value={opt}>{opt === 'All' ? 'All products' : opt}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${styles.filterBtn} ${needsInfoOnly ? styles.filterBtnActive : ''} ${styles.needsInfoToggle}`}
            onClick={() => setNeedsInfoOnly(v => !v)}
            aria-pressed={needsInfoOnly}
            title="Show only completed records that are missing required compliance information."
          >
            Needs Info
          </button>
          {anyFilterActive && (
            <button
              type="button"
              className={styles.advFilterClearBtn}
              onClick={clearAllFilters}
              aria-label="Clear all filters"
            >
              Clear all
            </button>
          )}
          {/* Phase S.5c.2 — Multi-record compliance packet PDF. Always
              renders; refuses to generate when visible is empty (toasts
              instead). Honors every active filter via the `visible`
              record set. */}
          <button
            type="button"
            className={styles.exportPacketBtn}
            onClick={handleExportCompliancePacket}
            aria-label="Export filtered records as compliance packet PDF"
            title="Export the currently filtered records as a printable compliance packet."
          >
            Export Compliance Packet
          </button>
          {/* Phase S.5c.3 — Product Usage Totals. Same filter-set
              contract as the compliance packet; product-first rollup
              instead of record-first. */}
          <button
            type="button"
            className={styles.exportUsageBtn}
            onClick={handleExportProductUsage}
            aria-label="Export filtered records as product usage totals report"
            title="Export per-product quantities + costs across the currently filtered records."
          >
            Export Product Usage
          </button>
        </div>
      </div>

      {/* ── Record count ── */}
      <p className={styles.recordCount}>
        {visible.length} record{visible.length !== 1 ? 's' : ''}
        {anyFilterActive ? ' (filtered)' : ''}
      </p>

      {/* ── List ── */}
      {visible.length === 0 ? (
        SPRAY_RECORDS.length === 0 ? (
          <EmptyState
            title="No spray records available."
            description="Completed and planned spray applications will appear here."
          />
        ) : (
          <EmptyState
            compact
            title="No matches."
            description="No records match the current filters."
          />
        )
      ) : (
        <div className={styles.recordList}>
          {visible.map(r => {
            const primaryType = r.products[0]?.type
            const colors = TYPE_COLORS[primaryType] || {}
            const statusMeta = STATUS_META[r.status] || {}
            return (
              <button
                key={r.id}
                className={styles.recordCard}
                onClick={() => setSelected(r)}
                aria-label={`View details for ${r.products.map(p => p.name).join(', ')} on ${r.date}`}
              >
                <div className={styles.recordHeader}>
                  <div className={styles.recordTitleRow}>
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
                      {primaryType}
                      {r.products.length > 1 ? ' +' : ''}
                    </span>
                  </div>
                  <span className={styles.recordDate}>{r.date}</span>
                </div>

                <div className={styles.recordMeta}>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Area</span>
                    <span className={styles.recordMetaValue}>{r.area}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Holes</span>
                    <span className={styles.recordMetaValue}>{holesLabel(r.holes)}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Target</span>
                    <span className={styles.recordMetaValue}>{r.targetPest || '—'}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Applicator</span>
                    <span className={styles.recordMetaValue}>{r.applicator || '—'}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Conditions</span>
                    <span className={styles.recordMetaValue}>{conditionsSummary(r.conditions)}</span>
                  </div>
                  <div className={styles.recordMetaItem}>
                    <span className={styles.recordMetaLabel}>Total Volume</span>
                    <span className={styles.recordMetaValue}>{r.totalVolume ? `${r.totalVolume} gal` : '—'}</span>
                  </div>
                </div>

                <div className={styles.recordFooter}>
                  <span className={`${styles.statusBadge} ${statusMeta.cls || ''}`}>
                    {statusMeta.label || r.status}
                  </span>
                  {r.rei > 0 && (
                    <span className={styles.reiBadge}>REI {r.rei}h</span>
                  )}
                  {r.notes && (
                    <span className={styles.hasNotes}>Note</span>
                  )}
                  {/* Phase S.5a.1 — Edit affordance. stopPropagation
                      prevents the parent record card's onClick (which
                      opens the detail modal) from firing. Worker
                      permission gate (canEditSprays) remains the
                      source of truth; an unauthorized user gets a
                      403 on Save.
                      Phase S.5a.2 — Hidden entirely for viewers who
                      lack canEditSprays. No view-only purpose for an
                      Edit affordance. */}
                  {canEditSprays && (
                    <button
                      type="button"
                      className={styles.recordEditBtn}
                      onClick={e => { e.stopPropagation(); setEditing(r) }}
                      aria-label={`Edit spray record from ${r.date}`}
                    >
                      Edit
                    </button>
                  )}
                  <span className={styles.viewDetail}>View Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      </WorkspaceSection>

      {/* ── Detail Modal ── */}
      {selected && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Spray record details"
        >
          <div
            className={styles.modalPanel}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar — color of primary product type */}
            <div
              className={styles.modalAccent}
              style={{ background: TYPE_COLORS[selected.products[0]?.type]?.text || '#4a9e4a' }}
            />

            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {selected.products.map(p => p.name).join(' + ')}
                </h2>
                <p className={styles.modalSubtitle}>{selected.date} · {selected.course}</p>
              </div>
              <button
                className={styles.modalClose}
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>

              {/* Application info */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Application</h3>
                <div className={styles.modalGrid}>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Area</span>
                    <span className={styles.modalFieldValue}>{selected.area}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Holes</span>
                    <span className={styles.modalFieldValue}>{holesLabel(selected.holes)}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Target Pest / Use</span>
                    <span className={styles.modalFieldValue}>{selected.targetPest || '—'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Applicator</span>
                    <span className={styles.modalFieldValue}>{selected.applicator || '—'}</span>
                  </div>
                  {/* Phase S.3 — Applicator license only renders when
                      populated. Old records without a snapshot stay
                      visually clean. */}
                  {selected.applicatorLicense && (
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Applicator License #</span>
                      <span className={styles.modalFieldValue}>{selected.applicatorLicense}</span>
                    </div>
                  )}
                  {/* Phase S.6a — Start / End time. Worker has supported
                      both since the S.3 baseline; the builder captures
                      them (S.5b.1); this is the matching display path.
                      Each renders only when populated to keep older
                      records visually clean. */}
                  {selected.startTime && (
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Start Time</span>
                      <span className={styles.modalFieldValue}>{selected.startTime}</span>
                    </div>
                  )}
                  {selected.endTime && (
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>End Time</span>
                      <span className={styles.modalFieldValue}>{selected.endTime}</span>
                    </div>
                  )}
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Carrier Volume</span>
                    <span className={styles.modalFieldValue}>{selected.carrierVolume}</span>
                  </div>
                  {/* Phase S.3 — Total cost snapshot, only when present. */}
                  {selected.totalCostSnapshot != null && (
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Estimated Cost</span>
                      <span className={styles.modalFieldValue}>${selected.totalCostSnapshot.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Total Tank Volume</span>
                    <span className={styles.modalFieldValue}>{selected.totalVolume ? `${selected.totalVolume} gal` : '—'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>REI</span>
                    <span className={styles.modalFieldValue}>{selected.rei > 0 ? `${selected.rei} hrs` : 'None'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>PHI</span>
                    <span className={styles.modalFieldValue}>{selected.phi > 0 ? `${selected.phi} days` : 'None'}</span>
                  </div>
                  <div className={styles.modalField}>
                    <span className={styles.modalFieldLabel}>Status</span>
                    <span className={`${styles.statusBadge} ${STATUS_META[selected.status]?.cls || ''}`}>
                      {STATUS_META[selected.status]?.label || selected.status}
                    </span>
                  </div>
                </div>
              </section>

              {/* Products */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Product{selected.products.length > 1 ? 's' : ''}</h3>
                <div className={styles.modalProductList}>
                  {selected.products.map((p, i) => {
                    const c = TYPE_COLORS[p.type] || {}
                    // Phase S.3 — Build a thin compliance meta line.
                    // EPA #, active ingredients (snapshot from catalog
                    // at save time), and per-product cost render only
                    // when populated; old records stay visually clean.
                    const complianceParts = []
                    if (p.epaNumberSnapshot)         complianceParts.push(`EPA ${p.epaNumberSnapshot}`)
                    if (p.activeIngredientsSnapshot) complianceParts.push(p.activeIngredientsSnapshot)
                    if (p.totalCostSnapshot != null) complianceParts.push(`$${p.totalCostSnapshot.toFixed(2)}`)
                    return (
                      <div key={i} className={styles.modalProductRow}>
                        <span
                          className={styles.modalProductType}
                          style={{ background: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {p.type}
                        </span>
                        <span className={styles.modalProductName}>{p.name}</span>
                        <span className={styles.modalProductRate}>{p.rate}</span>
                        {complianceParts.length > 0 && (
                          <span className={styles.modalProductRate} style={{ opacity: 0.7, fontStyle: 'italic' }}>
                            {complianceParts.join(' · ')}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Conditions */}
              {/* Phase S.6a — Render weather when ANY weather field is
                  populated, not just temp. Previously a humidity-only
                  or wind-only record would have its entire weather
                  section hidden. */}
              {selected.conditions && (
                selected.conditions.temp          != null
                || selected.conditions.humidity      != null
                || selected.conditions.wind          != null
                || selected.conditions.windSpeedMph  != null
                || selected.conditions.windDirection
                || selected.conditions.soilTemp      != null
              ) && (
                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Conditions at Application</h3>
                  <div className={styles.modalGrid}>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Temperature</span>
                      <span className={styles.modalFieldValue}>
                        {selected.conditions.temp != null ? `${selected.conditions.temp}°F` : '—'}
                      </span>
                    </div>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Wind</span>
                      <span className={styles.modalFieldValue}>{selected.conditions.wind || '—'}</span>
                    </div>
                    {/* Phase S.3 — Structured wind only renders when
                        populated. Old records with only free-text wind
                        keep their original two-cell shape. */}
                    {(selected.conditions.windSpeedMph != null || selected.conditions.windDirection) && (
                      <div className={styles.modalField}>
                        <span className={styles.modalFieldLabel}>Wind (Structured)</span>
                        <span className={styles.modalFieldValue}>
                          {[
                            selected.conditions.windSpeedMph != null ? `${selected.conditions.windSpeedMph} mph` : null,
                            selected.conditions.windDirection || null,
                          ].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    )}
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Humidity</span>
                      <span className={styles.modalFieldValue}>
                        {selected.conditions.humidity != null ? `${selected.conditions.humidity}%` : '—'}
                      </span>
                    </div>
                    <div className={styles.modalField}>
                      <span className={styles.modalFieldLabel}>Soil Temp</span>
                      <span className={styles.modalFieldValue}>
                        {selected.conditions.soilTemp != null ? `${selected.conditions.soilTemp}°F` : '—'}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Notes */}
              {selected.notes && (
                <section className={styles.modalSection}>
                  <h3 className={styles.modalSectionTitle}>Notes</h3>
                  <p className={styles.modalNotes}>{selected.notes}</p>
                </section>
              )}

              {/* Attachments */}
              <section className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Attachments</h3>
                <UploadCenter
                  module={selected.id}
                  type="image"
                  tags={[selected.area, selected.targetPest, selected.products[0]?.type].filter(Boolean)}
                  title="Photos"
                />
                <UploadCenter
                  module={`${selected.id}-docs`}
                  type="document"
                  tags={[selected.area, selected.targetPest, selected.products[0]?.type].filter(Boolean)}
                  title="Documents"
                />
              </section>

            </div>

            <div className="opActionRow">
              {/* Phase S.5a.1 — Edit shortcut from the detail modal.
                  Routes to the same EditSprayRecordModal as the
                  record-card Edit button.
                  Phase S.5a.2 — Hidden for viewers without canEditSprays. */}
              {canEditSprays && (
                <button
                  className="opActionBtn"
                  onClick={() => { setEditing(selected); setSelected(null) }}
                >
                  Edit Record
                </button>
              )}
              <button
                className="opActionBtn"
                onClick={() => generateApplicationReport(selected)}
                disabled={reportLoading}
              >
                {reportLoading ? 'Loading…' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

      {/* Phase S.5a.1 — Edit Spray Record modal. Renders only when
          `editing` is non-null. Save triggers a worker PATCH via the
          existing patchSpray helper and refreshes the store. */}
      {editing && (
        <EditSprayRecordModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

    </div>
  )
}
