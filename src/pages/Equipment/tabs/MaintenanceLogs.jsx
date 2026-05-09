import { useState, useMemo, useEffect } from 'react'
import { SERVICE_LOG, EQUIPMENT_LIST } from '../../../data/equipment'
import { useOperations } from '../../../utils/operations/OperationsContext'
import { makeCalendarEvent } from '../../../utils/operations/schemas'
import { CREATE_CALENDAR_EVENT, reserveEquipment } from '../../../utils/operations/actions'
import { buildMaintenanceLogReport } from '../../../utils/reports/reportBuilder'
import { createAttachmentRef } from '../../../utils/reports/reportSchemas'
import { getMediaByModule, getThumbnailBlob } from '../../../utils/media/mediaStore'
import UploadCenter from '../../../components/uploads/UploadCenter'
import ReportPreviewModal from '../../../components/reports/ReportPreviewModal'
import styles from '../Equipment.module.css'

const THIS_MONTH = '2026-05'

const STATUS_FILTERS   = ['All', 'Open', 'In Progress', 'Overdue', 'Completed']
const PRIORITY_FILTERS = ['All', 'Critical', 'High', 'Routine']

const STATUS_META = {
  'completed':   { label: 'Completed',   cls: styles.mlStatusCompleted  },
  'open':        { label: 'Open',        cls: styles.mlStatusOpen       },
  'in-progress': { label: 'In Progress', cls: styles.mlStatusInProgress },
  'overdue':     { label: 'Overdue',     cls: styles.mlStatusOverdue    },
}

const PRIORITY_META = {
  'critical': { label: 'Critical', cls: styles.mlPriorityCritical },
  'high':     { label: 'High',     cls: styles.mlPriorityHigh     },
  'routine':  { label: 'Routine',  cls: styles.mlPriorityRoutine  },
}

const SERVICE_TYPE_COLORS = {
  'Preventive': { bg: 'rgba(74,158,74,0.12)',  color: '#4ecb4e', border: 'rgba(74,158,74,0.28)'  },
  'Repair':     { bg: 'rgba(220,80,80,0.12)',  color: '#e07070', border: 'rgba(220,80,80,0.28)'  },
  'Inspection': { bg: 'rgba(80,140,220,0.12)', color: '#6aabee', border: 'rgba(80,140,220,0.28)' },
  'Adjustment': { bg: 'rgba(91,168,160,0.12)', color: '#5ba8a0', border: 'rgba(91,168,160,0.28)' },
  'Overhaul':   { bg: 'rgba(150,80,220,0.12)', color: '#a060e0', border: 'rgba(150,80,220,0.28)' },
}

const SORT_STATUS = { overdue: 0, open: 1, 'in-progress': 2, completed: 3 }
const SORT_PRIORITY = { critical: 0, high: 1, routine: 2 }

const FILTER_STATUS_KEY = {
  'Open':        'open',
  'In Progress': 'in-progress',
  'Overdue':     'overdue',
  'Completed':   'completed',
}

export default function MaintenanceLogs() {
  const { dispatch }             = useOperations()
  const [search,     setSearch]  = useState('')
  const [staFilter,  setStaFilter] = useState('All')
  const [priFilter,  setPriFilter] = useState('All')
  const [selected,      setSelected]     = useState(null)
  const [toast,         setToast]        = useState(null)
  const [activeReport,  setActiveReport]  = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportThumbs,  setReportThumbs]  = useState([])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  function handleScheduleService(log) {
    const evtPriority = log.priority === 'critical' ? 'high' : log.priority
    const evtStatus   = log.status === 'completed' ? 'completed'
                      : log.status === 'in-progress' ? 'in-progress'
                      : 'scheduled'

    const calEvent = makeCalendarEvent({
      title:         `${log.serviceType} — ${log.equipmentName}`,
      date:          log.date,
      category:      'maintenance',
      priority:      evtPriority,
      status:        evtStatus,
      location:      'Maintenance Shop',
      assignedStaff: log.technician ? [log.technician] : [],
      equipment:     [log.equipmentName],
      tags:          [log.serviceType, log.category],
      notes:         log.notes || '',
      sourceModule:  'equipment',
      sourceId:      log.id,
    })

    dispatch({ type: CREATE_CALENDAR_EVENT, payload: calEvent })

    dispatch(reserveEquipment({
      eventId:        calEvent.id,
      equipmentNames: [log.equipmentName],
      date:           log.date,
      notes:          `${log.serviceType} service — ${log.hoursAtService.toLocaleString()} hrs`,
    }))

    showToast(`Service event added to Operations Calendar`)
  }

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

  function resolveEquipment(log) {
    return EQUIPMENT_LIST.find(e => e.id === log.equipmentId)
      ?? { name: log.equipmentName, type: log.category, category: log.category, model: '', status: log.status }
  }

  function normalizeLog(l) {
    return {
      date:        l.completedDate ?? l.date,
      type:        l.serviceType,
      description: l.notes || `${l.serviceType} — ${l.equipmentName}`,
      technician:  l.technician || 'Unassigned',
      cost:        l.cost,
    }
  }

  async function generateMaintenanceReport(log) {
    setReportLoading(true)
    try {
      const [photos, docs] = await Promise.all([
        getMediaByModule(log.id).catch(() => []),
        getMediaByModule(`${log.id}-docs`).catch(() => []),
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

      const equipment = resolveEquipment(log)
      setReportThumbs(thumbUrls)
      setActiveReport(buildMaintenanceLogReport(
        { ...equipment, type: equipment.category ?? equipment.type },
        [normalizeLog(log)],
        { dateRange: log.completedDate ?? log.date },
      ))
    } finally {
      setReportLoading(false)
    }
  }

  function generateEquipmentHistory(log) {
    const equipment = resolveEquipment(log)
    const logs = SERVICE_LOG
      .filter(l => l.equipmentId === log.equipmentId)
      .map(normalizeLog)
    setActiveReport(buildMaintenanceLogReport(
      { ...equipment, type: equipment.category ?? equipment.type },
      logs,
      { dateRange: 'All Time' },
    ))
  }

  const counts = useMemo(() => {
    let open = 0, completedMonth = 0, overdue = 0, totalCost = 0
    SERVICE_LOG.forEach(log => {
      if (log.status === 'open' || log.status === 'in-progress') open++
      if (log.status === 'overdue') overdue++
      if (log.status === 'completed' && log.completedDate?.startsWith(THIS_MONTH)) completedMonth++
      totalCost += log.cost || 0
    })
    return { open, completedMonth, overdue, totalCost }
  }, [])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return SERVICE_LOG
      .filter(log => {
        const matchSta = staFilter === 'All' || log.status === FILTER_STATUS_KEY[staFilter]
        const matchPri = priFilter === 'All' || log.priority === priFilter.toLowerCase()
        const matchSearch = !q ||
          log.equipmentName.toLowerCase().includes(q) ||
          log.category.toLowerCase().includes(q) ||
          log.serviceType.toLowerCase().includes(q) ||
          (log.technician && log.technician.toLowerCase().includes(q)) ||
          (log.notes && log.notes.toLowerCase().includes(q))
        return matchSta && matchPri && matchSearch
      })
      .sort((a, b) =>
        SORT_STATUS[a.status]   - SORT_STATUS[b.status] ||
        SORT_PRIORITY[a.priority] - SORT_PRIORITY[b.priority]
      )
  }, [search, staFilter, priFilter])

  const totalPartsOnLog = log =>
    log.partsUsed.reduce((sum, p) => sum + p.quantity * p.unitCost, 0)

  return (
    <div className={styles.eqRoot}>

      {/* ── Stat row ── */}
      <div className={styles.eqStats}>
        <div className={`${styles.eqStat} ${styles.mlStatOpen}`}>
          <span className={styles.eqStatValue}>{counts.open}</span>
          <span className={styles.eqStatLabel}>Open Services</span>
        </div>
        <div className={`${styles.eqStat} ${styles.mlStatMonth}`}>
          <span className={styles.eqStatValue}>{counts.completedMonth}</span>
          <span className={styles.eqStatLabel}>Completed This Month</span>
        </div>
        <div className={`${styles.eqStat} ${styles.mlStatOverdue}`}>
          <span className={styles.eqStatValue}>{counts.overdue}</span>
          <span className={styles.eqStatLabel}>Overdue</span>
        </div>
        <div className={`${styles.eqStat} ${styles.mlStatCost}`}>
          <span className={`${styles.eqStatValue} ${styles.mlCostValue}`}>
            ${counts.totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className={styles.eqStatLabel}>Total Service Cost</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.eqToolbar}>
        <input
          type="search"
          className={styles.eqSearch}
          placeholder="Search equipment, service type, technician…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search maintenance logs"
        />
        <div className={styles.eqFilterRow}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`${styles.eqFilterBtn} ${staFilter === s ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setStaFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className={styles.eqFilterRow}>
          {PRIORITY_FILTERS.map(p => (
            <button
              key={p}
              className={`${styles.eqFilterBtn} ${priFilter === p ? styles.eqFilterBtnActive : ''}`}
              onClick={() => setPriFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.eqCount}>
        {visible.length} record{visible.length !== 1 ? 's' : ''}
        {(staFilter !== 'All' || priFilter !== 'All' || search) ? ' (filtered)' : ''}
      </p>

      {/* ── Log list ── */}
      {visible.length === 0 ? (
        <p className={styles.eqEmpty}>No maintenance records match your search.</p>
      ) : (
        <div className={styles.eqList}>
          {visible.map(log => {
            const statusMeta   = STATUS_META[log.status]   || {}
            const priorityMeta = PRIORITY_META[log.priority] || {}
            const typeColors   = SERVICE_TYPE_COLORS[log.serviceType] || SERVICE_TYPE_COLORS.Inspection
            const hasParts     = log.partsUsed && log.partsUsed.length > 0
            const priorityCls  = `mlCard_${log.priority}`
            return (
              <button
                key={log.id}
                className={`${styles.mlCard} ${styles[priorityCls]}`}
                onClick={() => setSelected(log)}
                aria-label={`View details for ${log.equipmentName} ${log.serviceType}`}
              >
                {/* Left: equipment + service info */}
                <div className={styles.eqCardMain}>
                  <div className={styles.eqCardTitleRow}>
                    <span className={styles.eqCardName}>{log.equipmentName}</span>
                    <span
                      className={styles.mlTypeBadge}
                      style={{ background: typeColors.bg, color: typeColors.color, borderColor: typeColors.border }}
                    >
                      {log.serviceType}
                    </span>
                    <span className={styles.eqCategoryPill}>{log.category}</span>
                  </div>

                  <div className={styles.mlCardMeta}>
                    <span className={styles.mlCardDate}>{log.date}</span>
                    {log.technician
                      ? <span className={styles.eqOperatorBadge}>{log.technician}</span>
                      : <span className={styles.mlUnassigned}>Unassigned</span>
                    }
                    <span className={styles.mlHoursAtService}>{log.hoursAtService.toLocaleString()} hrs</span>
                  </div>

                  <div className={styles.eqCardBadgeRow}>
                    <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                      {statusMeta.label}
                    </span>
                    <span className={`${styles.mlPriorityBadge} ${priorityMeta.cls || ''}`}>
                      {priorityMeta.label}
                    </span>
                    {hasParts && (
                      <span className={styles.mlPartsBadge}>
                        {log.partsUsed.length} part{log.partsUsed.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {log.notes && <span className={styles.mlHasNotes}>Note</span>}
                  </div>
                </div>

                {/* Right: cost */}
                <div className={styles.eqCardRight}>
                  {log.cost > 0 ? (
                    <>
                      <span className={styles.mlBigCost}>
                        ${log.cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <span className={styles.eqHoursLabel}>cost</span>
                    </>
                  ) : (
                    <>
                      <span className={`${styles.mlBigCost} ${styles.mlCostPending}`}>—</span>
                      <span className={styles.eqHoursLabel}>
                        {log.status === 'completed' ? 'no cost' : 'pending'}
                      </span>
                    </>
                  )}
                  {log.nextDueHours && (
                    <span className={styles.eqNextService}>
                      Next: {log.nextDueHours.toLocaleString()} hrs
                    </span>
                  )}
                  <span className={styles.eqViewDetail}>Details →</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selected && (() => {
        const statusMeta   = STATUS_META[selected.status]   || {}
        const priorityMeta = PRIORITY_META[selected.priority] || {}
        const typeColors   = SERVICE_TYPE_COLORS[selected.serviceType] || SERVICE_TYPE_COLORS.Inspection
        const accentColors = {
          critical: '#e05050',
          high:     '#d4883a',
          routine:  '#4ecb4e',
        }
        const partsCost  = totalPartsOnLog(selected)
        const laborCost  = Math.max(0, selected.cost - partsCost)
        return (
          <div
            className={styles.eqModalOverlay}
            onClick={() => setSelected(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Maintenance log details"
          >
            <div
              className={styles.eqModalPanel}
              onClick={e => e.stopPropagation()}
            >
              <div
                className={styles.eqModalAccent}
                style={{ background: accentColors[selected.priority] || '#4a9e4a' }}
              />

              <div className={styles.eqModalHeader}>
                <div>
                  <h2 className={styles.eqModalTitle}>
                    {selected.equipmentName} — {selected.serviceType}
                  </h2>
                  <p className={styles.eqModalSubtitle}>
                    {selected.category} · {selected.date}
                    {selected.technician ? ` · ${selected.technician}` : ''}
                  </p>
                </div>
                <div className={styles.eqModalHeaderRight}>
                  <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                    {statusMeta.label}
                  </span>
                  <button
                    className={styles.eqModalClose}
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.eqModalBody}>

                {/* Service Overview */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Service Overview</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Service Type</span>
                      <span
                        className={styles.mlTypeBadge}
                        style={{
                          background:  typeColors.bg,
                          color:       typeColors.color,
                          borderColor: typeColors.border,
                          fontSize:    '0.82rem',
                          padding:     '4px 10px',
                        }}
                      >
                        {selected.serviceType}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Priority</span>
                      <span className={`${styles.mlPriorityBadge} ${priorityMeta.cls || ''}`}>
                        {priorityMeta.label}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Status</span>
                      <span className={`${styles.eqStatusBadge} ${statusMeta.cls || ''}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Technician</span>
                      <span className={styles.eqModalFieldValue}>
                        {selected.technician || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Equipment Information */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Equipment Information</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Equipment</span>
                      <span className={styles.eqModalFieldValue}>{selected.equipmentName}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Category</span>
                      <span className={styles.eqModalFieldValue}>{selected.category}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Hours at Service</span>
                      <span className={`${styles.eqModalFieldValue} ${styles.eqModalHoursBig}`}>
                        {selected.hoursAtService.toLocaleString()} hrs
                      </span>
                    </div>
                  </div>
                </section>

                {/* Service Timeline */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Service Timeline</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Date Opened</span>
                      <span className={styles.eqModalFieldValue}>{selected.date}</span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Completed Date</span>
                      <span className={styles.eqModalFieldValue}>
                        {selected.completedDate || '—'}
                      </span>
                    </div>
                    {selected.nextDueHours && (
                      <div className={styles.eqModalField}>
                        <span className={styles.eqModalFieldLabel}>Next Service At</span>
                        <span className={styles.eqModalFieldValue}>
                          {selected.nextDueHours.toLocaleString()} hrs
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Parts Used */}
                {selected.partsUsed && selected.partsUsed.length > 0 ? (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Parts Used</h3>
                    <div className={styles.mlPartsTable}>
                      <div className={styles.mlPartsHeader}>
                        <span>Part</span>
                        <span>Part #</span>
                        <span className={styles.mlPartsQty}>Qty</span>
                        <span className={styles.mlPartsCost}>Unit Cost</span>
                        <span className={styles.mlPartsCost}>Total</span>
                      </div>
                      {selected.partsUsed.map((p, i) => (
                        <div key={i} className={styles.mlPartsRow}>
                          <span className={styles.mlPartName}>{p.part}</span>
                          <span className={styles.mlPartNumber}>{p.partNumber}</span>
                          <span className={styles.mlPartsQty}>{p.quantity}</span>
                          <span className={styles.mlPartsCost}>${p.unitCost.toFixed(2)}</span>
                          <span className={styles.mlPartsCost}>${(p.quantity * p.unitCost).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Parts Used</h3>
                    <p className={styles.eqModalServiceNote}>No parts recorded for this service.</p>
                  </section>
                )}

                {/* Cost Breakdown */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Cost Breakdown</h3>
                  <div className={styles.eqModalGrid}>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Parts Cost</span>
                      <span className={styles.eqModalFieldValue}>
                        {partsCost > 0 ? `$${partsCost.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Labor / Other</span>
                      <span className={styles.eqModalFieldValue}>
                        {laborCost > 0 ? `$${laborCost.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className={styles.eqModalField}>
                      <span className={styles.eqModalFieldLabel}>Total Cost</span>
                      <span className={`${styles.eqModalFieldValue} ${styles.mlTotalCost}`}>
                        {selected.cost > 0
                          ? `$${selected.cost.toFixed(2)}`
                          : selected.status === 'completed' ? '$0.00' : 'Pending'
                        }
                      </span>
                    </div>
                  </div>
                </section>

                {/* Technician Notes */}
                {selected.notes && (
                  <section className={styles.eqModalSection}>
                    <h3 className={styles.eqModalSectionTitle}>Technician Notes</h3>
                    <p className={styles.eqModalNotes}>{selected.notes}</p>
                  </section>
                )}

                {/* Attachments */}
                <section className={styles.eqModalSection}>
                  <h3 className={styles.eqModalSectionTitle}>Attachments</h3>
                  <UploadCenter
                    module={selected.id}
                    type="image"
                    tags={[selected.category, selected.serviceType, selected.priority].filter(Boolean)}
                    title="Photos"
                  />
                  <UploadCenter
                    module={`${selected.id}-docs`}
                    type="document"
                    tags={[selected.category, selected.serviceType, selected.priority].filter(Boolean)}
                    title="Documents"
                  />
                </section>

                {/* Report actions */}
                <section className={styles.eqModalSection}>
                  <div className="opActionRow">
                    <button
                      className="opActionBtn"
                      onClick={() => generateMaintenanceReport(selected)}
                      disabled={reportLoading}
                    >
                      {reportLoading ? 'Loading…' : 'Generate Report'}
                    </button>
                    <button
                      className="opActionBtn"
                      onClick={() => generateEquipmentHistory(selected)}
                      disabled={reportLoading}
                    >
                      Equipment History
                    </button>
                  </div>
                </section>

                {/* Operations actions */}
                <section className={styles.eqModalSection}>
                  <div className="opActionRow">
                    <button
                      className="opActionBtn"
                      onClick={() => { handleScheduleService(selected); setSelected(null) }}
                    >
                      + Add to Operations Calendar
                    </button>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                      Reserves {selected.equipmentName} · adds maintenance event
                    </span>
                  </div>
                </section>

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
