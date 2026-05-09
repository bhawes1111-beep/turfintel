import { useState, useMemo, useEffect } from 'react'
import { REPAIRS } from '../../../data/irrigation'
import { useOperations } from '../../../utils/operations/OperationsContext'
import { createCalendarEvent, createAlert } from '../../../utils/operations/actions'
import UploadCenter from '../../../components/uploads/UploadCenter'
import { buildIrrigationRepairReport, buildIrrigationRepairSummaryReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import styles from '../Irrigation.module.css'

const TODAY      = '2026-05-08'
const WEEK_START = '2026-05-04'

const STATUS_FILTERS = [
  { label: 'All',          value: 'All'          },
  { label: 'Open',         value: 'open'         },
  { label: 'In Progress',  value: 'in-progress'  },
  { label: 'Parts Needed', value: 'parts-needed' },
  { label: 'Completed',    value: 'completed'    },
]

const PRIORITY_FILTERS = [
  { label: 'All',    value: 'All'    },
  { label: 'High',   value: 'high'   },
  { label: 'Medium', value: 'medium' },
  { label: 'Low',    value: 'low'    },
]

const AREA_FILTERS = ['All', 'Greens', 'Fairways', 'Tees', 'Rough', 'Pump Station']

const STATUS_META = {
  'open':         { label: 'Open',         cls: 'irStatusOpen'        },
  'in-progress':  { label: 'In Progress',  cls: 'irStatusInProgress'  },
  'parts-needed': { label: 'Parts Needed', cls: 'irStatusPartsNeeded' },
  'completed':    { label: 'Completed',    cls: 'irStatusCompleted'   },
}

const PRIORITY_ACCENT = {
  high:   '#c0392b',
  medium: '#dca032',
  low:    '#4a9e4a',
}

const ISSUE_TYPE_LABELS = {
  'broken-head':     'Broken Head',
  'leaking-valve':   'Leaking Valve',
  'clogged-nozzle':  'Clogged Nozzle',
  'line-break':      'Line Break',
  'controller-fault':'Controller Fault',
  'stuck-valve':     'Stuck Valve',
  'pop-up-failure':  'Pop-Up Failure',
}

const SORT_STATUS   = { 'in-progress': 0, open: 1, 'parts-needed': 2, completed: 3 }
const SORT_PRIORITY = { high: 0, medium: 1, low: 2 }

function matchesArea(repair, area) {
  if (area === 'All')          return true
  if (area === 'Greens')       return repair.area.includes('Green')
  if (area === 'Fairways')     return repair.area.includes('Fairway')
  if (area === 'Tees')         return repair.area.includes('Tee')
  if (area === 'Rough')        return repair.area.includes('Rough')
  if (area === 'Pump Station') return repair.area === 'Pump Station'
  return true
}

export default function Repairs() {
  const { dispatch }                         = useOperations()
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [areaFilter,     setAreaFilter]     = useState('All')
  const [selected,       setSelected]       = useState(null)
  const [toast,          setToast]          = useState(null)
  const [activeReport,   setActiveReport]   = useState(null)
  const [reportLoading,  setReportLoading]  = useState(false)
  const [reportThumbs,   setReportThumbs]   = useState([])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  function handleCloseReport() {
    reportThumbs.forEach(url => URL.revokeObjectURL(url))
    setReportThumbs([])
    setActiveReport(null)
  }

  async function generateRepairReport(repair) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(repair.repairId).catch(() => []),
        getMediaByModule(`${repair.repairId}-docs`).catch(() => []),
      ])
      const allMedia  = [...photos, ...docs]
      const thumbUrls = []

      const attachmentRefs = await Promise.all(allMedia.map(async rec => {
        let thumbnailUrl = null
        if (rec.type === 'image') {
          try {
            const blob = await getThumbnailBlob(rec.id)
            if (blob) {
              thumbnailUrl = URL.createObjectURL(blob)
              thumbUrls.push(thumbnailUrl)
            }
          } catch {}
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
      setActiveReport(buildIrrigationRepairReport(repair, attachmentRefs))
    } finally {
      setReportLoading(false)
    }
  }

  function generateSummaryReport() {
    setActiveReport(buildIrrigationRepairSummaryReport(REPAIRS))
  }

  function handleScheduleRepair(repair) {
    const locationStr = [
      repair.hole != null ? `Hole ${repair.hole}` : null,
      repair.area,
      repair.headNumber ? `Head #${repair.headNumber}` : null,
    ].filter(Boolean).join(' · ')

    dispatch(createCalendarEvent({
      title:         `Irrigation Repair — ${ISSUE_TYPE_LABELS[repair.issueType] || repair.issueType}`,
      date:          repair.dateReported,
      category:      'irrigation',
      priority:      repair.priority,
      status:        repair.status === 'completed' ? 'completed' : 'scheduled',
      location:      locationStr,
      assignedStaff: repair.assignedTo ? [repair.assignedTo] : [],
      equipment:     repair.partsUsed.length > 0 ? ['Repair Kit'] : [],
      tags:          [repair.issueType],
      notes:         repair.notes || '',
      sourceModule:  'irrigation',
      sourceId:      repair.repairId,
    }))

    if (repair.priority === 'high') {
      dispatch(createAlert({
        title:       `Irrigation Repair Scheduled — ${ISSUE_TYPE_LABELS[repair.issueType]}`,
        message:     `${locationStr}. Assigned to ${repair.assignedTo || 'unassigned'}. Status: ${repair.status.replace('-', ' ')}.`,
        module:      'irrigation',
        priority:    'high',
        course:      repair.area,
        actionLabel: 'View Irrigation',
        sourceId:    repair.repairId,
      }))
    }

    showToast('Repair added to Operations Calendar')
  }

  useEffect(() => {
    if (!selected) return
    const onKey = e => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const stats = useMemo(() => ({
    open:              REPAIRS.filter(r => r.status !== 'completed').length,
    highPriority:      REPAIRS.filter(r => r.priority === 'high' && r.status !== 'completed').length,
    completedThisWeek: REPAIRS.filter(r => r.status === 'completed' && r.dateCompleted >= WEEK_START).length,
    partsNeeded:       REPAIRS.filter(r => r.status === 'parts-needed').length,
  }), [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return REPAIRS
      .filter(r => {
        if (q &&
          !r.description.toLowerCase().includes(q) &&
          !r.area.toLowerCase().includes(q) &&
          !(ISSUE_TYPE_LABELS[r.issueType] || r.issueType).toLowerCase().includes(q) &&
          !(r.assignedTo || '').toLowerCase().includes(q)) return false
        if (statusFilter   !== 'All' && r.status   !== statusFilter)   return false
        if (priorityFilter !== 'All' && r.priority !== priorityFilter) return false
        if (!matchesArea(r, areaFilter)) return false
        return true
      })
      .sort((a, b) => {
        const ss = (SORT_STATUS[a.status] ?? 9) - (SORT_STATUS[b.status] ?? 9)
        if (ss !== 0) return ss
        return (SORT_PRIORITY[a.priority] ?? 9) - (SORT_PRIORITY[b.priority] ?? 9)
      })
  }, [search, statusFilter, priorityFilter, areaFilter])

  return (
    <div className={styles.irWrap}>

      {/* ── Stat row ─────────────────────────────────────────────────────── */}
      <div className={styles.irStatRow}>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Open Repairs</span>
          <span className={`${styles.irStatValue} ${stats.open > 0 ? styles.irStatAmber : ''}`}>
            {stats.open}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>High Priority</span>
          <span className={`${styles.irStatValue} ${stats.highPriority > 0 ? styles.irStatRed : ''}`}>
            {stats.highPriority}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Completed This Week</span>
          <span className={`${styles.irStatValue} ${styles.irStatGreen}`}>
            {stats.completedThisWeek}
          </span>
        </div>
        <div className={styles.irStatCard}>
          <span className={styles.irStatLabel}>Parts Needed</span>
          <span className={`${styles.irStatValue} ${stats.partsNeeded > 0 ? styles.irStatRed : ''}`}>
            {stats.partsNeeded}
          </span>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className={styles.irToolbar}>
        <input
          className={styles.irSearch}
          type="text"
          placeholder="Search area, issue type, or assignee…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="opActionBtn" onClick={generateSummaryReport}>
          Summary Report
        </button>
      </div>

      {/* ── Status chips ─────────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.irChip} ${statusFilter === value ? styles.irChipActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >{label}</button>
        ))}
      </div>

      {/* ── Priority chips ───────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {PRIORITY_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            className={`${styles.irChip} ${priorityFilter === value ? styles.irChipActive : ''}`}
            onClick={() => setPriorityFilter(value)}
          >{label}</button>
        ))}
      </div>

      {/* ── Area chips ───────────────────────────────────────────────────── */}
      <div className={styles.irFilters}>
        {AREA_FILTERS.map(a => (
          <button
            key={a}
            className={`${styles.irChip} ${areaFilter === a ? styles.irChipActive : ''}`}
            onClick={() => setAreaFilter(a)}
          >{a}</button>
        ))}
      </div>

      <p className={styles.irCount}>
        {filtered.length} repair{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* ── Repair list ──────────────────────────────────────────────────── */}
      <div className={styles.irList}>
        {filtered.map(repair => {
          const sm        = STATUS_META[repair.status] || { label: repair.status, cls: '' }
          const accent    = PRIORITY_ACCENT[repair.priority] || 'var(--color-accent)'
          const issueLabel = ISSUE_TYPE_LABELS[repair.issueType] || repair.issueType
          const completed  = repair.status === 'completed'

          return (
            <button
              key={repair.repairId}
              className={`${styles.irCard} ${styles[`irCard_${repair.priority}`]} ${completed ? styles.irCard_completed : ''}`}
              onClick={() => setSelected(repair)}
            >
              <div className={styles.irCardMain}>
                <div className={styles.irCardLeft}>

                  {/* Title row */}
                  <div className={styles.irCardNameRow}>
                    <span className={styles.irCardTitle}>{issueLabel}</span>
                    {repair.headNumber && (
                      <span className={styles.irHeadBadge}>Head #{repair.headNumber}</span>
                    )}
                    {repair.partsUsed.length > 0 && (
                      <span className={styles.irPartsBadge}>
                        {repair.partsUsed.length} part{repair.partsUsed.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Location */}
                  <div className={styles.irCardMeta}>
                    {repair.hole != null ? `Hole ${repair.hole} · ` : ''}{repair.area}
                  </div>

                  {/* Description */}
                  <div className={styles.irCardDesc}>{repair.description}</div>

                  {/* Assigned + labor */}
                  <div className={styles.irCardFooter}>
                    <span className={styles.irAssigned}>
                      {repair.assignedTo || <em className={styles.irUnassigned}>Unassigned</em>}
                    </span>
                    {repair.laborHours > 0 && (
                      <span className={styles.irLaborHours}>{repair.laborHours}h logged</span>
                    )}
                    <span className={styles.irCardDate}>{repair.dateReported}</span>
                  </div>

                </div>

                <div className={styles.irCardRight}>
                  <span className={`${styles.irStatusBadge} ${styles[sm.cls]}`}>
                    {sm.label}
                  </span>
                  <span className={styles.irPriorityLabel} style={{ color: accent }}>
                    {repair.priority.charAt(0).toUpperCase() + repair.priority.slice(1)}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className={styles.irEmpty}>No repairs match the current filters.</p>
        )}
      </div>

      {/* ── Detail modal ─────────────────────────────────────────────────── */}
      {selected && (() => {
        const sm         = STATUS_META[selected.status] || { label: selected.status, cls: '' }
        const accent     = PRIORITY_ACCENT[selected.priority] || 'var(--color-accent)'
        const issueLabel = ISSUE_TYPE_LABELS[selected.issueType] || selected.issueType
        const repairTags = [selected.priority, selected.issueType, selected.area].filter(Boolean)

        return (
          <div className={styles.irModalOverlay} onClick={() => setSelected(null)}>
            <div className={styles.irModalPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.irModalAccent} style={{ background: accent }} />
              <div className={styles.irModalBody}>

                {/* Header */}
                <div className={styles.irModalHeader}>
                  <div>
                    <h2 className={styles.irModalTitle}>{issueLabel}</h2>
                    <p className={styles.irModalSub}>
                      {selected.hole != null ? `Hole ${selected.hole} · ` : ''}{selected.area}
                      {selected.headNumber ? ` · Head #${selected.headNumber}` : ''}
                    </p>
                  </div>
                  <span className={`${styles.irStatusBadge} ${styles[sm.cls]}`}>{sm.label}</span>
                </div>

                {/* Repair Overview */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Repair Overview</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Repair ID</span>
                      <span className={styles.irFieldValue}>{selected.repairId}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Issue Type</span>
                      <span className={styles.irFieldValue}>{issueLabel}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Priority</span>
                      <span className={styles.irFieldValue} style={{ color: accent, fontWeight: 600, textTransform: 'capitalize' }}>
                        {selected.priority}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Status</span>
                      <span className={styles.irFieldValue} style={{ textTransform: 'capitalize' }}>
                        {selected.status.replace('-', ' ')}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Date Reported</span>
                      <span className={styles.irFieldValue}>{selected.dateReported}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Date Completed</span>
                      <span className={styles.irFieldValue}>
                        {selected.dateCompleted || (selected.status === 'completed' ? '—' : 'In progress')}
                      </span>
                    </div>
                  </div>
                  {selected.description && (
                    <p className={styles.irModalDesc}>{selected.description}</p>
                  )}
                </div>

                {/* Location */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Location</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Hole</span>
                      <span className={styles.irFieldValue}>
                        {selected.hole != null ? `Hole ${selected.hole}` : '—'}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Area</span>
                      <span className={styles.irFieldValue}>{selected.area}</span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Head Number</span>
                      <span className={styles.irFieldValue}>
                        {selected.headNumber ? `#${selected.headNumber}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Parts Used */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Parts Used</p>
                  {selected.partsUsed.length > 0 ? (
                    <div className={styles.irPartsTable}>
                      <div className={styles.irPartsHeader}>
                        <span className={styles.irPartsQtyHead}>Qty</span>
                        <span className={styles.irPartsNameHead}>Part / Material</span>
                      </div>
                      {selected.partsUsed.map((p, i) => (
                        <div key={i} className={styles.irPartsRow}>
                          <span className={styles.irPartsQty}>{p.qty}</span>
                          <span className={styles.irPartsName}>{p.part}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.irNoParts}>No parts required.</p>
                  )}
                </div>

                {/* Labor */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Labor</p>
                  <div className={styles.irFieldGrid}>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Assigned To</span>
                      <span className={styles.irFieldValue}>
                        {selected.assignedTo || <em style={{ color: 'var(--color-muted)' }}>Unassigned</em>}
                      </span>
                    </div>
                    <div className={styles.irField}>
                      <span className={styles.irFieldLabel}>Labor Hours</span>
                      <span className={styles.irFieldValue}>
                        {selected.laborHours > 0 ? `${selected.laborHours}h` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div className={styles.irModalSection}>
                    <p className={styles.irModalSectionTitle}>Notes</p>
                    <p className={styles.irModalNotes}>{selected.notes}</p>
                  </div>
                )}

                {/* GPS / Map Placeholder */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>GPS / Head Map</p>
                  <div className={styles.irMapPlaceholder}>
                    <span className={styles.irMapPlaceholderText}>
                      Interactive head map coming soon
                      {selected.headNumber ? ` · Head #${selected.headNumber}` : ''}
                      {selected.hole != null ? ` · Hole ${selected.hole}` : ''}
                    </span>
                    <span className={styles.irMapPlaceholderSub}>
                      Toro Lynx / QIS integration · GPS coordinates · Layer overlay
                    </span>
                  </div>
                </div>

                {/* Attachments */}
                <div className={styles.irModalSection}>
                  <p className={styles.irModalSectionTitle}>Attachments</p>
                  <UploadCenter
                    module={selected.repairId}
                    type="image"
                    tags={repairTags}
                    title="Photos"
                  />
                  <UploadCenter
                    module={`${selected.repairId}-docs`}
                    type="document"
                    tags={repairTags}
                    title="Documents"
                  />
                </div>

                <div className="opActionRow">
                  <button
                    className="opActionBtn"
                    onClick={() => generateRepairReport(selected)}
                    disabled={reportLoading}
                  >
                    {reportLoading ? 'Loading…' : 'Generate Report'}
                  </button>
                  <button
                    className="opActionBtn"
                    onClick={() => { handleScheduleRepair(selected); setSelected(null) }}
                    disabled={selected.status === 'completed'}
                    title={selected.status === 'completed' ? 'Already completed' : 'Add to Operations Calendar'}
                  >
                    + Schedule Repair
                  </button>
                  <button className={styles.irModalClose} onClick={() => setSelected(null)}>
                    Close
                  </button>
                </div>

              </div>
            </div>
          </div>
        )
      })()}

      {toast && <div className="opToast">{toast}</div>}

      <ReportPreviewModal
        report={activeReport}
        onClose={handleCloseReport}
      />

    </div>
  )
}
